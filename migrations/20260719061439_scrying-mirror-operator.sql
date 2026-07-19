-- Scrying Mirror (limited-supply day-8 relic) + Operator secret-mission board.
-- Scarcity is authoritative here in Postgres: an advisory-locked claim function
-- guarantees the global cap can never be oversold, no matter how many clients
-- race for the last mirror. All tables are RLS-locked; only the admin key (used
-- by the public edge functions) touches them.

-- ---------------------------------------------------------------- supply cap
CREATE TABLE public.scrying_mirror_supply (
  id    boolean PRIMARY KEY DEFAULT true CHECK (id),   -- single-row table
  total integer NOT NULL CHECK (total > 0)
);
INSERT INTO public.scrying_mirror_supply (id, total) VALUES (true, 888);

-- ------------------------------------------------------------- minted mirrors
CREATE TABLE public.scrying_mirrors (
  serial      integer PRIMARY KEY,                     -- 1..total, the mirror's number
  operator_id text NOT NULL UNIQUE,                    -- claimant identity (client device id)
  claimed_at  timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------- operator missions
CREATE TABLE public.operator_missions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text UNIQUE NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('vision', 'cipher')),
  title        text NOT NULL,
  brief        text NOT NULL,
  answer       text,                                   -- normalized answer for ciphers (NULL for visions)
  reward_gold  integer NOT NULL DEFAULT 0,
  reward_boxes integer NOT NULL DEFAULT 0,
  reward_gear  text,                                   -- gear defId granted on completion (optional)
  sort         integer NOT NULL DEFAULT 0,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.operator_mission_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id  text NOT NULL,
  mission_id   uuid NOT NULL REFERENCES public.operator_missions(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_id, mission_id)
);
CREATE INDEX operator_mission_log_operator_idx ON public.operator_mission_log (operator_id);

-- ---------------------------------------------------- atomic, capped claim
-- Returns JSON: { status: 'claimed'|'already'|'sold_out', serial, remaining, total }.
-- The transaction-scoped advisory lock serializes concurrent claims so the
-- Nth+1 claimant can never slip past the cap.
CREATE OR REPLACE FUNCTION public.claim_mirror(p_operator_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total     integer;
  v_minted    integer;
  v_serial    integer;
  v_existing  integer;
BEGIN
  IF p_operator_id IS NULL OR length(trim(p_operator_id)) = 0 THEN
    RETURN json_build_object('status', 'error', 'message', 'operator_id required');
  END IF;

  PERFORM pg_advisory_xact_lock(778811);

  SELECT total INTO v_total FROM public.scrying_mirror_supply WHERE id = true;

  -- Idempotent: an operator who already holds a mirror just gets it back.
  SELECT serial INTO v_existing FROM public.scrying_mirrors WHERE operator_id = p_operator_id;
  IF v_existing IS NOT NULL THEN
    SELECT count(*) INTO v_minted FROM public.scrying_mirrors;
    RETURN json_build_object('status', 'already', 'serial', v_existing,
                             'remaining', v_total - v_minted, 'total', v_total);
  END IF;

  SELECT count(*) INTO v_minted FROM public.scrying_mirrors;
  IF v_minted >= v_total THEN
    RETURN json_build_object('status', 'sold_out', 'serial', NULL,
                             'remaining', 0, 'total', v_total);
  END IF;

  v_serial := v_minted + 1;
  INSERT INTO public.scrying_mirrors (serial, operator_id) VALUES (v_serial, p_operator_id);

  RETURN json_build_object('status', 'claimed', 'serial', v_serial,
                           'remaining', v_total - v_serial, 'total', v_total);
END;
$$;

-- ------------------------------------------------------------------- RLS lock
-- Enable RLS with no policies → anon/authenticated clients are denied all direct
-- access. The edge functions use the admin key, which bypasses RLS.
ALTER TABLE public.scrying_mirror_supply ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrying_mirrors       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_missions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_mission_log  ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------ seed feed
INSERT INTO public.operator_missions (code, kind, title, brief, answer, reward_gold, reward_boxes, reward_gear, sort) VALUES
  ('ninth-gate',   'vision', 'The Ninth Gate',
   'The mirror shows a gate that opens only for those who never sold. Step through and take what the Ninth Chain left behind.',
   NULL, 5000, 2, NULL, 10),
  ('tyrant-blade', 'vision', 'The Tyrant''s Whisper',
   'The dark Kekius speaks your name from the deep. Do not answer him — just take the blade off his back.',
   NULL, 4000, 0, 'w_blades', 20),
  ('mempool-vigil','vision', 'Vigil in the Mempool',
   'Keep watch over three unconfirmed blocks. Claim whatever finally surfaces.',
   NULL, 3000, 1, NULL, 30),
  ('so-back',      'cipher', 'Two Honest Words',
   'The champion''s last words as the Ninth Chain fell out from under him. Speak them. (two words)',
   'weresoback', 2500, 1, NULL, 40),
  ('the-patron',   'cipher', 'The Face on Every Emblem',
   'Name the meme-messiah the whole legion prays to. (one word)',
   'kekius', 1500, 1, NULL, 50),
  ('last-chain',   'cipher', 'The Last Honest Chain',
   'Where does the Treasury Vault land its value, cross-chain, with no bridge? (one word)',
   'arbitrum', 2500, 1, NULL, 60);
