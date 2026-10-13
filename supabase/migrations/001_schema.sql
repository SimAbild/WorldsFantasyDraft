-- Worlds Fantasy: grundskema i 3. normalform.
-- Tabeller gemmer kun rå fakta; alt afledt (point, totaler, vindere af serier) ligger i views.

-- ---------- Opslagstabeller ----------
create table public.role (
  code text primary key check (code in ('top','jungle','mid','adc','support')),
  sort_order smallint not null unique
);

create table public.dragon_type (
  code text primary key,
  is_elder boolean not null default false
);

create table public.price_tier (
  code text primary key,
  price smallint not null check (price > 0)
);

create table public.metric (
  code text primary key,
  label text not null
);

-- ---------- Kalibrering (låses før turneringen) ----------
create table public.calibration (
  id bigint generated always as identity primary key,
  label text not null unique,
  locked_at timestamptz
);

-- Konstanter pr. rolle til Del A, Del B og blandingen
create table public.calibration_role (
  calibration_id bigint not null references public.calibration on delete cascade,
  role_code text not null references public.role,
  mult_a numeric not null,
  a_mean numeric not null,
  a_sd numeric not null check (a_sd > 0),
  b_mean numeric not null,
  b_sd numeric not null check (b_sd > 0),
  mix_mean numeric not null,
  mix_sd numeric not null check (mix_sd > 0),
  primary key (calibration_id, role_code)
);

-- Rollesnit og vægte pr. målepunkt
create table public.calibration_metric (
  calibration_id bigint not null references public.calibration on delete cascade,
  role_code text not null references public.role,
  metric_code text not null references public.metric,
  mean numeric not null,
  weight_a numeric not null default 0,
  weight_b numeric not null default 0,
  primary key (calibration_id, role_code, metric_code)
);

-- ---------- Turneringsdata ----------
create table public.tournament (
  id bigint generated always as identity primary key,
  name text not null,
  year smallint not null,
  calibration_id bigint references public.calibration,
  unique (year, name)
);

create table public.phase (
  id bigint generated always as identity primary key,
  tournament_id bigint not null references public.tournament on delete cascade,
  kind text not null check (kind in ('play_in','swiss','qf','sf','final')),
  opens_at timestamptz not null,
  locks_at timestamptz not null,
  ends_at timestamptz,
  budget smallint check (budget > 0),          -- NULL = fri leg
  max_per_team smallint check (max_per_team > 0), -- NULL = ingen grænse
  teams_per_user smallint not null default 1 check (teams_per_user in (1,2)),
  unique (tournament_id, kind),
  check (opens_at < locks_at)
);

create table public.pro_team (
  id bigint generated always as identity primary key,
  esports_team_id text not null unique,
  code text not null,
  name text not null,
  region text
);

create table public.player (
  id bigint generated always as identity primary key,
  esports_player_id text not null unique,
  handle text not null
);

-- Hold i en turnering; power ranking hører til holdet her
create table public.tournament_team (
  tournament_id bigint not null references public.tournament on delete cascade,
  pro_team_id bigint not null references public.pro_team,
  power_rank smallint check (power_rank > 0),
  primary key (tournament_id, pro_team_id)
);

-- Spillerens hold og rolle i turneringen (eneste sted de står)
create table public.roster (
  tournament_id bigint not null,
  player_id bigint not null references public.player,
  pro_team_id bigint not null,
  role_code text not null references public.role,
  primary key (tournament_id, player_id),
  foreign key (tournament_id, pro_team_id) references public.tournament_team on delete cascade
);
create index on public.roster (tournament_id, pro_team_id);

-- Prisklasse pr. hold pr. fase; selve prisen står kun i price_tier
create table public.team_price (
  phase_id bigint not null references public.phase on delete cascade,
  pro_team_id bigint not null references public.pro_team,
  tier_code text not null references public.price_tier,
  primary key (phase_id, pro_team_id)
);

create table public.series (
  id bigint generated always as identity primary key,
  phase_id bigint not null references public.phase on delete cascade,
  esports_match_id text not null unique,
  best_of smallint not null check (best_of in (1,3,5)),
  starts_at timestamptz not null
);
create index on public.series (phase_id);

create table public.series_team (
  series_id bigint not null references public.series on delete cascade,
  pro_team_id bigint not null references public.pro_team,
  primary key (series_id, pro_team_id)
);

create table public.game (
  id bigint generated always as identity primary key,
  series_id bigint not null references public.series on delete cascade,
  esports_game_id text not null unique,
  game_number smallint not null check (game_number between 1 and 5),
  state text not null default 'unstarted' check (state in ('unstarted','in_game','finished')),
  started_at timestamptz,
  ended_at timestamptz,
  pause_seconds integer not null default 0 check (pause_seconds >= 0),
  winner_team_id bigint,
  unique (series_id, game_number),
  foreign key (series_id, winner_team_id) references public.series_team (series_id, pro_team_id)
);

create table public.game_team (
  game_id bigint not null references public.game on delete cascade,
  pro_team_id bigint not null references public.pro_team,
  side text not null check (side in ('blue','red')),
  barons smallint not null default 0,
  towers smallint not null default 0,
  inhibitors smallint not null default 0,
  primary key (game_id, pro_team_id),
  unique (game_id, side)
);

-- Én række pr. drage (1NF: ingen lister i en celle)
create table public.game_dragon (
  game_id bigint not null,
  seq smallint not null,
  pro_team_id bigint not null,
  dragon_type text not null references public.dragon_type,
  primary key (game_id, seq),
  foreign key (game_id, pro_team_id) references public.game_team on delete cascade
);

create table public.game_player (
  game_id bigint not null references public.game on delete cascade,
  player_id bigint not null references public.player,
  kills smallint not null,
  deaths smallint not null,
  assists smallint not null,
  creep_score smallint not null,
  damage_share numeric not null check (damage_share between 0 and 1),
  wards_placed smallint not null,
  wards_destroyed smallint not null,
  primary key (game_id, player_id)
);
create index on public.game_player (player_id);

-- ---------- Brugerdata ----------
create table public.profile (
  user_id uuid primary key references auth.users on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$')
);

create table public.league (
  id bigint generated always as identity primary key,
  tournament_id bigint not null references public.tournament,
  name text not null,
  owner_id uuid not null references public.profile,
  invite_code text not null unique default substr(md5(gen_random_uuid()::text), 1, 8)
);

create table public.league_member (
  league_id bigint not null references public.league on delete cascade,
  user_id uuid not null references public.profile on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create index on public.league_member (user_id);

-- Ét hold pr. bruger pr. fase (Swiss: to slots); gælder i alle ligaer
create table public.fantasy_team (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profile on delete cascade,
  phase_id bigint not null references public.phase on delete cascade,
  slot smallint not null default 1 check (slot in (1,2)),
  name text not null check (length(name) between 1 and 30),
  submitted_at timestamptz not null default now(),
  unique (user_id, phase_id, slot)
);

create table public.fantasy_pick (
  fantasy_team_id bigint not null references public.fantasy_team on delete cascade,
  role_code text not null references public.role,
  player_id bigint not null references public.player,
  primary key (fantasy_team_id, role_code),
  unique (fantasy_team_id, player_id)
);
