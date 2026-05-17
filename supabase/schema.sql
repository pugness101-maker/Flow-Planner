create extension if not exists pgcrypto;

create table if not exists public.planner_blocks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  local_id text not null,
  title text not null default '',
  date date,
  start_time time,
  end_time time,
  category text not null default 'Personal',
  notes text not null default '',
  completed boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, local_id)
);

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  local_id text not null,
  name text not null default '',
  category text not null default '',
  frequency text not null default 'Daily',
  target text not null default '',
  notes text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, local_id)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  local_id text not null,
  name text not null default '',
  category text not null default 'Custom',
  deadline date,
  status text not null default '',
  notes text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, local_id)
);

create table if not exists public.friends (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  local_id text not null,
  name text not null default '',
  relationship_type text not null default 'Friend',
  priority text not null default 'Medium',
  birthday date,
  phone_handle text not null default '',
  last_contacted date,
  last_seen date,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, local_id)
);

create table if not exists public.hangouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  local_id text not null,
  activity text not null default '',
  date date,
  time time,
  location text not null default '',
  people text[] not null default '{}',
  cost text not null default '',
  completed boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, local_id)
);

create table if not exists public.social_ideas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  local_id text not null,
  title text not null default '',
  category text not null default 'Cheap',
  cost text not null default '',
  favorite boolean not null default false,
  notes text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, local_id)
);

create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  local_id text not null,
  title text not null default '',
  type text not null default 'Custom',
  value text not null default '',
  date date,
  notes text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, local_id)
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, key)
);

alter table public.planner_blocks enable row level security;
alter table public.habits enable row level security;
alter table public.goals enable row level security;
alter table public.friends enable row level security;
alter table public.hangouts enable row level security;
alter table public.social_ideas enable row level security;
alter table public.logs enable row level security;
alter table public.settings enable row level security;

create policy "owner access planner_blocks" on public.planner_blocks for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner access habits" on public.habits for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner access goals" on public.goals for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner access friends" on public.friends for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner access hangouts" on public.hangouts for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner access social_ideas" on public.social_ideas for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner access logs" on public.logs for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner access settings" on public.settings for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Unified sync table for Flow Planner
create table if not exists public.flow_planner_sync (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(user_id)
);

alter table public.flow_planner_sync enable row level security;

create policy "user access flow_planner_sync" on public.flow_planner_sync for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
