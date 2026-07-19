-- Launch-grade anti-sybil: bind a mirror to a verified identity (wallet address
-- or Magic email), enforced as ONE mirror per identity. Combined with the edge
-- function requiring an identity to claim, this stops a scripted actor from
-- draining the supply with throwaway device ids / IPs — they'd need real accounts.
-- Also enables cross-device ownership: the same account sees its mirror anywhere.

ALTER TABLE public.scrying_mirrors ADD COLUMN IF NOT EXISTS claim_identity text;

-- One mirror per identity (NULL allowed for legacy anonymous rows).
CREATE UNIQUE INDEX IF NOT EXISTS scrying_mirrors_identity_uidx
  ON public.scrying_mirrors (claim_identity) WHERE claim_identity IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_mirror(
  p_operator_id  text,
  p_ip           text DEFAULT NULL,
  p_max_per_ip   integer DEFAULT 5,
  p_identity     text DEFAULT NULL
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
  v_identity text := NULLIF(trim(coalesce(p_identity, '')), '');
BEGIN
  IF p_operator_id IS NULL OR length(trim(p_operator_id)) = 0 THEN
    RETURN json_build_object('status', 'error', 'message', 'operator_id required');
  END IF;

  PERFORM pg_advisory_xact_lock(778811);

  SELECT total INTO v_total FROM public.scrying_mirror_supply WHERE id = true;

  -- Idempotent: identity wins (one mirror per account, cross-device); otherwise
  -- fall back to the device operator id.
  IF v_identity IS NOT NULL THEN
    SELECT serial INTO v_existing FROM public.scrying_mirrors WHERE claim_identity = v_identity;
  END IF;
  IF v_existing IS NULL THEN
    SELECT serial INTO v_existing FROM public.scrying_mirrors WHERE operator_id = p_operator_id;
  END IF;
  IF v_existing IS NOT NULL THEN
    SELECT count(*) INTO v_minted FROM public.scrying_mirrors;
    RETURN json_build_object('status', 'already', 'serial', v_existing,
                             'remaining', v_total - v_minted, 'total', v_total);
  END IF;

  -- Per-IP/day guard (skip for private/empty IP).
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
  INSERT INTO public.scrying_mirrors (serial, operator_id, claim_ip, claim_day, claim_identity)
  VALUES (v_serial, p_operator_id, NULLIF(trim(coalesce(p_ip, '')), ''), v_today, v_identity);

  RETURN json_build_object('status', 'claimed', 'serial', v_serial,
                           'remaining', v_total - v_serial, 'total', v_total);
END;
$$;
