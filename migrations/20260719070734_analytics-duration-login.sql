-- Engagement + login metrics on top of the session row.
--   active_seconds      : lifetime active (tab-focused) time, accumulated client-side
--   visits              : count of page loads / new visits
--   last_visit_seconds  : active time in the most recent visit
--   last_login          : timestamp the player last authenticated (wallet connect)
alter table public.analytics_sessions
  add column if not exists active_seconds     double precision not null default 0,
  add column if not exists visits             integer not null default 0,
  add column if not exists last_visit_seconds double precision not null default 0,
  add column if not exists last_login         timestamptz;
