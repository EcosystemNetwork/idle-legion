-- Real-multiplayer backend for Idle Legion's shared World Boss + PvP ladder.
-- All access is through the world-boss / duel-ladder edge functions using the
-- admin key, so RLS is enabled with NO policies (anon/PostgREST is locked out;
-- the admin service role bypasses RLS). Mirrors the cloud-save table pattern.

-- ---- Shared World Boss (a single authoritative row, id = 1) ----
CREATE TABLE IF NOT EXISTS world_boss (
  id          integer PRIMARY KEY,
  tier        integer      NOT NULL DEFAULT 1,
  hp          double precision NOT NULL,
  max_hp      double precision NOT NULL,
  ends_at     bigint       NOT NULL,   -- epoch ms the weekly cycle closes
  week        integer      NOT NULL DEFAULT 1,
  updated_at  timestamptz  NOT NULL DEFAULT now()
);
ALTER TABLE world_boss ENABLE ROW LEVEL SECURITY;

-- ---- Per-player contribution for the current cycle ----
CREATE TABLE IF NOT EXISTS world_boss_contrib (
  week         integer     NOT NULL,
  player_key   text        NOT NULL,
  name         text        NOT NULL DEFAULT 'Legion',
  contributed  double precision NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (week, player_key)
);
ALTER TABLE world_boss_contrib ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS wbc_week_contrib_idx
  ON world_boss_contrib (week, contributed DESC);

-- ---- Asynchronous PvP ladder: each player's last-synced fighting snapshot ----
CREATE TABLE IF NOT EXISTS duel_ladder (
  player_key   text PRIMARY KEY,
  name         text        NOT NULL DEFAULT 'Legion',
  rating       integer     NOT NULL DEFAULT 1000,
  power        integer     NOT NULL DEFAULT 20,
  combat_class text        NOT NULL DEFAULT 'melee',
  wins         integer     NOT NULL DEFAULT 0,
  losses       integer     NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE duel_ladder ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS duel_rating_idx ON duel_ladder (rating DESC);
