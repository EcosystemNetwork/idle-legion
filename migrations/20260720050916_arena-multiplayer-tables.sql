-- Reproducibility fix: the World Boss + PvP ladder tables were only ever
-- created by hand from functions/_sql/*.sql, so they existed in the current
-- project but would be MISSING on any fresh provision / branch / clone —
-- silently dropping both features back to the local offline simulation.
-- This migration puts that DDL under version control. All statements are
-- IF NOT EXISTS, so applying it to the existing project is a no-op.

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

-- Server-authoritative World Boss payouts. When a cycle closes, the world-boss
-- function snapshots every contributor's final rank and writes one reward row
-- here (claimed = false). Players redeem via the function's `claim` op, which
-- flips claimed → true, so rewards are computed and gated entirely server-side
-- (the client can only receive what the server already recorded).
CREATE TABLE IF NOT EXISTS world_boss_reward (
  week        integer     NOT NULL,
  player_key  text        NOT NULL,
  rank        integer     NOT NULL,
  field       integer     NOT NULL,
  gold        double precision NOT NULL DEFAULT 0,
  legion      double precision NOT NULL DEFAULT 0,
  lunchboxes  integer     NOT NULL DEFAULT 0,
  claimed     boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (week, player_key)
);
ALTER TABLE world_boss_reward ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS wbr_unclaimed_idx
  ON world_boss_reward (player_key) WHERE claimed = false;
