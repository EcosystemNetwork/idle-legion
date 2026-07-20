-- Backend hardening: move every read-modify-write that the edge functions were
-- doing in TypeScript into the database, where a transaction can make it atomic.
--
-- WHY: the functions run as concurrent, stateless Deno invocations. A SELECT
-- followed by an UPDATE from that layer is not a transaction — two overlapping
-- calls read the same "before" value and the second silently discards the
-- first's effect. That is a lost cloud save, lost world-boss damage, or a
-- double-paid reward, depending on the call. PostgREST cannot express a
-- conditional upsert, so each of these becomes a SECURITY DEFINER function the
-- edge layer invokes with the admin key (same pattern as claim_mirror).
--
-- Every statement is IF NOT EXISTS / CREATE OR REPLACE and non-destructive, so
-- this is safe to re-apply to the live project.

-- ---------------------------------------------------------------------------
-- 1. Cloud save: conditional, atomic last-write-wins.
-- ---------------------------------------------------------------------------
-- The old path did SELECT saved_at -> compare -> UPSERT. Two devices saving at
-- once both read the same prior value and the loser's state overwrote the
-- winner's. Folding the staleness test into the ON CONFLICT ... WHERE makes the
-- comparison and the write one statement: a stale save simply updates no row.
-- <= (not <) so a re-send of the same savedAt still lands, which keeps a retry
-- after a dropped response idempotent rather than reporting a false "stale".
CREATE OR REPLACE FUNCTION public.save_player_state(
  p_key      text,
  p_state    jsonb,
  p_saved_at bigint,
  p_email    text DEFAULT NULL,
  p_wallet   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saved bigint;
BEGIN
  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'stale', false, 'savedAt', 0, 'error', 'key required');
  END IF;

  INSERT INTO public.player_saves
    (player_key, state, saved_at, email, wallet_address, created_at, updated_at)
  VALUES
    (p_key, p_state, greatest(0, coalesce(p_saved_at, 0)),
     nullif(trim(coalesce(p_email, '')), ''),
     nullif(trim(coalesce(p_wallet, '')), ''),
     now(), now())
  ON CONFLICT (player_key) DO UPDATE
    SET state          = excluded.state,
        saved_at       = excluded.saved_at,
        -- Identity columns are additive: a device that has not signed in yet
        -- sends NULL and must not erase an address we already learned.
        email          = coalesce(excluded.email, player_saves.email),
        wallet_address = coalesce(excluded.wallet_address, player_saves.wallet_address),
        updated_at     = now()
    WHERE player_saves.saved_at <= excluded.saved_at
  RETURNING saved_at INTO v_saved;

  IF v_saved IS NULL THEN
    -- No row came back: the conflict target existed and the WHERE rejected it.
    SELECT saved_at INTO v_saved FROM public.player_saves WHERE player_key = p_key;
    RETURN jsonb_build_object('ok', false, 'stale', true, 'savedAt', coalesce(v_saved, 0));
  END IF;

  RETURN jsonb_build_object('ok', true, 'stale', false, 'savedAt', v_saved);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. World boss: one transaction per strike.
-- ---------------------------------------------------------------------------
-- Damage previously went through hp = <value read a moment ago> - damage, so
-- simultaneous strikes overwrote each other and the boss healed. Worse, the
-- write was not week-guarded: a request that started before a cycle rolled
-- landed its damage on the brand-new boss. Both the contribution row and the
-- boss HP now move inside one statement pair guarded by the caller's week, so a
-- late strike is dropped whole instead of half-applied.
--
-- The contribution cap is enforced here too — it is the value the payout table
-- is ranked on, so it cannot be checked in a layer that races itself.
CREATE OR REPLACE FUNCTION public.world_boss_strike(
  p_week        integer,
  p_key         text,
  p_name        text,
  p_damage      double precision,
  p_cooldown_ms integer,
  p_max_total   double precision
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev  double precision;
  v_last  timestamptz;
  v_ready timestamptz;
  v_apply double precision;
  v_hp    double precision;
  v_total double precision;
BEGIN
  IF p_damage IS NULL OR p_damage <= 0 THEN
    RETURN jsonb_build_object('applied', 0, 'reason', 'no-damage');
  END IF;

  -- Lock this player's row so a double-fired click cannot spend the same
  -- allowance twice. (A player's very first strike has no row to lock; the
  -- ON CONFLICT below still sums correctly, only the cooldown can be dodged
  -- once, which costs nothing.)
  SELECT contributed, updated_at INTO v_prev, v_last
    FROM public.world_boss_contrib
   WHERE week = p_week AND player_key = p_key
     FOR UPDATE;

  IF v_last IS NOT NULL AND coalesce(p_cooldown_ms, 0) > 0 THEN
    v_ready := v_last + (p_cooldown_ms::text || ' milliseconds')::interval;
    IF now() < v_ready THEN
      RETURN jsonb_build_object(
        'applied', 0, 'reason', 'cooldown',
        'retryInMs', ceil(extract(epoch FROM (v_ready - now())) * 1000));
    END IF;
  END IF;

  v_apply := least(p_damage, greatest(0, p_max_total - coalesce(v_prev, 0)));
  IF v_apply <= 0 THEN
    RETURN jsonb_build_object('applied', 0, 'reason', 'capped');
  END IF;

  UPDATE public.world_boss
     SET hp = greatest(0, hp - v_apply), updated_at = now()
   WHERE id = 1 AND week = p_week
  RETURNING hp INTO v_hp;

  IF NOT FOUND THEN
    -- The cycle rolled between the caller's read and this write. Drop the hit
    -- entirely rather than deleting HP from a boss the player never fought.
    RETURN jsonb_build_object('applied', 0, 'reason', 'stale-week');
  END IF;

  INSERT INTO public.world_boss_contrib (week, player_key, name, contributed, updated_at)
  VALUES (p_week, p_key, coalesce(nullif(trim(coalesce(p_name, '')), ''), 'Legion'), v_apply, now())
  ON CONFLICT (week, player_key) DO UPDATE
    SET contributed = public.world_boss_contrib.contributed + excluded.contributed,
        name        = excluded.name,
        updated_at  = now()
  RETURNING contributed INTO v_total;

  RETURN jsonb_build_object('applied', v_apply, 'total', v_total, 'hp', v_hp, 'week', p_week);
END;
$$;

-- Record the end-of-cycle payout table. DO NOTHING (not upsert) because the
-- resolver can run again for the same week after rewards were already paid —
-- an upsert would rewrite claimed back to false and mint the payout twice.
CREATE OR REPLACE FUNCTION public.world_boss_record_rewards(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN 0;
  END IF;

  WITH ins AS (
    INSERT INTO public.world_boss_reward (week, player_key, rank, field, gold, legion, lunchboxes)
    SELECT (r->>'week')::integer,
           r->>'player_key',
           (r->>'rank')::integer,
           (r->>'field')::integer,
           coalesce((r->>'gold')::double precision, 0),
           coalesce((r->>'legion')::double precision, 0),
           coalesce((r->>'lunchboxes')::integer, 0)
      FROM jsonb_array_elements(p_rows) AS e(r)
    ON CONFLICT (week, player_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;

  RETURN v_count;
END;
$$;

-- Pay out exactly what this UPDATE claimed. The old path summed a SELECT and
-- then flipped the rows, so two clicks landing together both saw the same
-- unclaimed rows and both were paid. Here the sum is derived from the rows the
-- UPDATE actually transitioned, so the loser of the race is paid zero.
CREATE OR REPLACE FUNCTION public.world_boss_claim(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  WITH paid AS (
    UPDATE public.world_boss_reward
       SET claimed = true
     WHERE player_key = p_key AND claimed = false
    RETURNING gold, legion, lunchboxes
  )
  SELECT jsonb_build_object(
           'gold',       coalesce(sum(gold), 0),
           'legion',     coalesce(sum(legion), 0),
           'lunchboxes', coalesce(sum(lunchboxes), 0),
           'cycles',     count(*)
         )
    INTO v
    FROM paid;

  RETURN v;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Duel ladder: an anti-cheat budget that is denominated in TIME.
-- ---------------------------------------------------------------------------
-- updated_at is stamped on every sync, so measuring the rating/power allowance
-- from it meant a client that synced in a loop measured ~0 elapsed time and
-- collected the per-request floor each pass — the budget was per-request, which
-- is exactly what it was meant not to be.
--
-- budget_at is a *spend* clock instead: allowance accrues from it in real time
-- and it only advances by the amount actually consumed. Syncing more often
-- therefore buys nothing; only the wall clock does.
ALTER TABLE public.duel_ladder ADD COLUMN IF NOT EXISTS budget_at timestamptz;

-- Seed existing rows one day behind their last sync: enough credit for the
-- day's allowance the client already grants them, so nobody is frozen out of
-- duelling on the first sync after this migration, and no windfall either.
UPDATE public.duel_ladder
   SET budget_at = updated_at - interval '1 day'
 WHERE budget_at IS NULL;
