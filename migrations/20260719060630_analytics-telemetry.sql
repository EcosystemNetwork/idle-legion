-- Idle Legion — cross-user telemetry.
-- Two tables in public:
--   analytics_sessions : one row per browser/player (identity + geo + rollups)
--   analytics_events   : the raw click/action stream
-- Both are RLS-enabled with NO policies, so the anon/authenticated roles cannot
-- read or write them directly. All ingestion + reads go through edge functions
-- that use the admin (service) key, which bypasses RLS. This keeps the raw
-- customer data (emails, IPs, locations) unreadable from the public client.

create table if not exists public.analytics_sessions (
  session_id     text primary key,
  first_seen     timestamptz not null default now(),
  last_seen      timestamptz not null default now(),
  email          text,
  wallet_address text,
  ip             text,
  country        text,
  country_code   text,
  region         text,
  city           text,
  latitude       double precision,
  longitude      double precision,
  timezone       text,
  isp            text,
  user_agent     text,
  total_events   integer not null default 0,
  total_clicks   integer not null default 0
);

create table if not exists public.analytics_events (
  id          bigint generated always as identity primary key,
  session_id  text not null references public.analytics_sessions(session_id) on delete cascade,
  event_name  text not null,
  event_type  text not null default 'click',
  meta        jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_ae_session   on public.analytics_events (session_id);
create index if not exists idx_ae_name       on public.analytics_events (event_name);
create index if not exists idx_ae_type       on public.analytics_events (event_type);
create index if not exists idx_ae_created    on public.analytics_events (created_at desc);
create index if not exists idx_as_last_seen  on public.analytics_sessions (last_seen desc);
create index if not exists idx_as_email      on public.analytics_sessions (email);

-- Lock both tables: RLS on, zero policies => no anon/authenticated access.
alter table public.analytics_sessions enable row level security;
alter table public.analytics_events   enable row level security;

-- Belt-and-suspenders: strip direct DML grants from the public-facing roles so
-- even a misconfigured client can't touch raw telemetry. Functions use the
-- service key and are unaffected.
revoke all on public.analytics_sessions from anon, authenticated;
revoke all on public.analytics_events   from anon, authenticated;
