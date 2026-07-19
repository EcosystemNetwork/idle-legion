-- Production hardening: blunt scripted farming of the limited mirror supply.
-- The concurrency cap already can't be oversold; this stops one host from
-- draining the supply across many fake device ids. We record the claiming IP +
-- UTC day and cap distinct claims per IP per day. (True per-user fairness needs
-- authenticated identity — tracked as a follow-up; this is the no-auth guard.)

ALTER TABLE public.scrying_mirrors ADD COLUMN IF NOT EXISTS claim_ip  text;
ALTER TABLE public.scrying_mirrors ADD COLUMN IF NOT EXISTS claim_day integer;

CREATE INDEX IF NOT EXISTS scrying_mirrors_ip_day_idx
  ON public.scrying_mirrors (claim_ip, claim_day);

-- Replace the claim function: same atomic, advisory-locked cap logic, now with an
-- optional per-IP/day guard. Extra params default so the old 1-arg call still works.
CREATE OR REPLACE FUNCTION public.claim_mirror(
  p_operator_id  text,
  p_ip           text DEFAULT NULL,
  p_max_per_ip   integer DEFAULT 5
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total    integer;
  v_minted   integer;
  v_serial   integer;
  v_existing integer;
  v_today    integer := floor(extract(epoch FROM now()) / 86400)::integer;
  v_ip_count integer;
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

  -- Anti-farming: cap distinct claims from one IP per day (skip for private/empty IP).
  IF p_ip IS NOT NULL AND length(trim(p_ip)) > 0 THEN
    SELECT count(*) INTO v_ip_count
      FROM public.scrying_mirrors
      WHERE claim_ip = p_ip AND claim_day = v_today;
    IF v_ip_count >= p_max_per_ip THEN
      RETURN json_build_object('status', 'rate_limited', 'serial', NULL,
                               'remaining', NULL, 'total', v_total);
    END IF;
  END IF;

  SELECT count(*) INTO v_minted FROM public.scrying_mirrors;
  IF v_minted >= v_total THEN
    RETURN json_build_object('status', 'sold_out', 'serial', NULL,
                             'remaining', 0, 'total', v_total);
  END IF;

  v_serial := v_minted + 1;
  INSERT INTO public.scrying_mirrors (serial, operator_id, claim_ip, claim_day)
  VALUES (v_serial, p_operator_id, NULLIF(trim(coalesce(p_ip, '')), ''), v_today);

  RETURN json_build_object('status', 'claimed', 'serial', v_serial,
                           'remaining', v_total - v_serial, 'total', v_total);
END;
$$;
