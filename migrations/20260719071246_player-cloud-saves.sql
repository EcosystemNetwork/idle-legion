-- Idle Legion — per-player cloud save.
-- One row per player identity holds the full game state as jsonb so progress
-- survives a cleared cache and roams across devices for a signed-in player.
--
-- player_key is the most-portable identity available on the client, chosen in
-- this precedence: "email:<addr>" > "wallet:<addr>" > "device:<operatorId>".
-- An anonymous player therefore keeps a per-device save; signing in promotes
-- their progress to an identity-scoped save that follows them anywhere.
--
-- Like the analytics tables, this is RLS-locked with NO policies: the anon /
-- authenticated roles cannot touch it. All reads/writes go through the
-- `cloud-save` edge function using the admin (service) key, which bypasses RLS.
-- That keeps one player from reading or clobbering another player's save.

create table if not exists public.player_saves (
  player_key     text primary key,
  email          text,
  wallet_address text,
  state          jsonb       not null,
  -- Client wall-clock (ms) of the write. Used for last-write-wins ordering so a
  -- device that has been offline longer never overwrites fresher cloud progress.
  saved_at       bigint      not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_ps_email   on public.player_saves (email);
create index if not exists idx_ps_updated on public.player_saves (updated_at desc);

-- Lock the table: RLS on, zero policies => no anon/authenticated access.
alter table public.player_saves enable row level security;
revoke all on public.player_saves from anon, authenticated;
