-- Per-screen dwell time: how long each player actively spends on each tab/screen
-- (stronghold, legion, arena, raids, market, codex). One row per (session, screen);
-- seconds accumulate. RLS-locked like the rest of telemetry — functions only.
create table if not exists public.analytics_screen_time (
  session_id text not null references public.analytics_sessions(session_id) on delete cascade,
  screen     text not null,
  seconds    double precision not null default 0,
  updated_at timestamptz not null default now(),
  primary key (session_id, screen)
);

create index if not exists idx_ast_screen on public.analytics_screen_time (screen);

alter table public.analytics_screen_time enable row level security;
revoke all on public.analytics_screen_time from anon, authenticated;
