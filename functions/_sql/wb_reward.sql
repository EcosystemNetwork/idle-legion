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
