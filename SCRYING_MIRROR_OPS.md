# Scrying Mirror & Operator Missions — Ops Runbook

Live tuning for the day-8 **Scrying Mirror** (limited relic) and the **Operator**
secret-mission board. Everything here is a data change — **no redeploy, no code
change** unless noted. Run commands from the repo root (InsForge project `Idle`
is already linked via `.insforge/project.json`).

Backend design lives in `migrations/2026071906*.sql` + `migrations/20260719071056_*.sql`
and the edge functions in `functions/{claim-mirror,operator-feed,complete-mission}.ts`.
Scarcity is authoritative in Postgres (`claim_mirror()`, advisory-locked) — the cap
can never be oversold. One mirror per verified identity (wallet/Magic).

---

## Check status

```bash
npx @insforge/cli db query "SELECT (SELECT total FROM public.scrying_mirror_supply) AS supply, (SELECT count(*) FROM public.scrying_mirrors) AS minted" --json
```

Recent mints:

```bash
npx @insforge/cli db query "SELECT serial, claim_identity, claim_day, claimed_at FROM public.scrying_mirrors ORDER BY serial DESC LIMIT 20" --json
```

Mission completion volume:

```bash
npx @insforge/cli db query "SELECT m.code, count(l.*) AS completions FROM public.operator_missions m LEFT JOIN public.operator_mission_log l ON l.mission_id = m.id GROUP BY m.code ORDER BY completions DESC" --json
```

---

## Change the mirror supply (the "certain number")

Currently **888**. Raise or lower it live (lowering below current `minted` just
means no more can be claimed — already-issued mirrors are safe):

```bash
npx @insforge/cli db query "UPDATE public.scrying_mirror_supply SET total = 1000 WHERE id = true"
```

**Emergency stop** (halt all new claims immediately — sets supply to what's already out):

```bash
npx @insforge/cli db query "UPDATE public.scrying_mirror_supply SET total = (SELECT count(*) FROM public.scrying_mirrors) WHERE id = true"
```

---

## Add / edit / retire Operator missions

Missions are rows in `public.operator_missions`. `kind` is `vision` (claim instantly)
or `cipher` (requires an answer). **Cipher answers must be stored normalized:
lowercase, letters+digits only** (the server normalizes the player's guess the same
way, so `"WE'RE SO BACK"` is stored as `weresoback`).

Add a vision (instant reward):

```bash
npx @insforge/cli db query "INSERT INTO public.operator_missions (code, kind, title, brief, reward_gold, reward_boxes, reward_gear, sort) VALUES ('new-vision', 'vision', 'Title', 'The mirror shows...', 4000, 1, NULL, 25)"
```

Add a cipher (answer required — note the normalized `answer`):

```bash
npx @insforge/cli db query "INSERT INTO public.operator_missions (code, kind, title, brief, answer, reward_gold, reward_boxes, sort) VALUES ('new-cipher', 'cipher', 'Title', 'Riddle text...', 'theanswer', 2000, 1, 45)"
```

Grant gear on completion: set `reward_gear` to a gear `defId` (e.g. `'a_kekius'`,
`'w_blades'` — see `src/game/config.ts` `CORE_GEAR`).

Retire a mission (hides it from the feed; keeps completion history):

```bash
npx @insforge/cli db query "UPDATE public.operator_missions SET active = false WHERE code = 'so-back'"
```

The feed refreshes for players on their next Operator-tab load — no redeploy.

---

## Adjust the anti-farming cap (per IP / day)

Default is **5 claims per IP per day** (`p_max_per_ip` in `claim_mirror`). The edge
function calls with the default, so change it in one place — the function default:

```sql
-- put in a new migration: npx @insforge/cli db migrations new mirror-ip-cap
CREATE OR REPLACE FUNCTION public.claim_mirror(
  p_operator_id text, p_ip text DEFAULT NULL,
  p_max_per_ip integer DEFAULT 8,   -- <-- new value
  p_identity text DEFAULT NULL
) RETURNS json ... ;                 -- copy body from 20260719071056_mirror-identity-binding.sql
```

Then `npx @insforge/cli db migrations up --all`. (Behind carrier-grade NAT many
users share an IP; keep this lenient. True per-user fairness comes from the identity
binding, not the IP cap.)

---

## Client tuning (needs a rebuild + deploy)

These are in code, not data:

- **Milestone days & jackpot** — `src/game/streak.ts` (`MIRROR_STREAK_DAY = 8`,
  `JACKPOT_STREAK_DAY = 69`, `DAY69_JACKPOT`, `MIRROR_SOLDOUT_CONSOLATION`).
- **Daily streak gold/lunchbox curve** — `DAILY_*` in `src/game/config.ts`.
- **Function base URL override** — `VITE_INSFORGE_FN_URL` (defaults to the live host).

---

## Reset test data (staging only — never on prod with real players)

```bash
npx @insforge/cli db query "DELETE FROM public.operator_mission_log; DELETE FROM public.scrying_mirrors;"
```
