-- Ansvar: Fælles stilling for alle brugere (ingen ligaer), spillerbilleder og begrundelse for prisklasser.
-- Bagudkompatibel: ligatabellerne fjernes først i 013, når frontenden på main ikke længere bruger dem.

-- Spillerens portræt fra lolesports. Afhænger kun af spilleren (3NF).
alter table public.player add column image_url text;

-- Hvorfor holdet har sin prisklasse i fasen. Afhænger af (fase, hold) ligesom prisklassen.
alter table public.team_price add column reason text;

-- Kortene får billede og prisbegrundelse med; nye kolonner står sidst, så eksisterende kolonner er uændrede
create or replace view public.v_player_card with (security_invoker = true) as
select ph.id as phase_id, ph.kind as phase_kind,
       pl.id as player_id, pl.handle, r.role_code, ro.sort_order as role_order,
       t.id as pro_team_id, t.code as team_code, t.name as team_name, t.region,
       tt.power_rank, tp.tier_code, pt.price,
       pl.image_url, tp.reason as price_reason
from public.phase ph
join public.team_price tp on tp.phase_id = ph.id
join public.pro_team t on t.id = tp.pro_team_id
join public.tournament_team tt on tt.tournament_id = ph.tournament_id and tt.pro_team_id = t.id
join public.roster r on r.tournament_id = ph.tournament_id and r.pro_team_id = t.id and r.is_starter
join public.player pl on pl.id = r.player_id
join public.role ro on ro.code = r.role_code
left join public.price_tier pt on pt.code = tp.tier_code;

create or replace view public.v_fantasy_pick_points with (security_invoker = true) as
select fp.fantasy_team_id, ft.user_id, ft.phase_id, ft.slot, ft.name as team_name,
       fp.role_code, fp.player_id, pl.handle, t.code as team_code, pt.price,
       coalesce(pp.phase_points, 0) as points, coalesce(pp.series_played, 0) as series_played,
       pl.image_url
from public.fantasy_pick fp
join public.fantasy_team ft on ft.id = fp.fantasy_team_id
join public.phase ph on ph.id = ft.phase_id
join public.player pl on pl.id = fp.player_id
join public.roster r on r.tournament_id = ph.tournament_id and r.player_id = fp.player_id
join public.pro_team t on t.id = r.pro_team_id
left join public.team_price tp on tp.phase_id = ph.id and tp.pro_team_id = r.pro_team_id
left join public.price_tier pt on pt.code = tp.tier_code
left join public.v_phase_points pp on pp.phase_id = ft.phase_id and pp.player_id = fp.player_id;

-- Stillingen for alle brugere på et givet tidspunkt. Andres hold tæller først, når fasen er låst (RLS).
create function public.standings(p_at timestamptz default now())
returns table (user_id uuid, username text, points numeric, rank bigint)
language sql stable security invoker set search_path = '' as $$
  with series_points as (
    select phase_id, series_id, player_id, avg(score) as points
    from public.v_game_score where ended_at <= p_at
    group by phase_id, series_id, player_id
  ),
  phase_points as (
    select phase_id, player_id, avg(points) as points from series_points group by phase_id, player_id
  ),
  user_points as (
    select team.user_id, sum(coalesce(phase_points.points, 0)) as points
    from public.fantasy_team team
    join public.phase on phase.id = team.phase_id
    join public.tournament on tournament.id = phase.tournament_id and tournament.year = extract(year from now())
    join public.fantasy_pick pick on pick.fantasy_team_id = team.id
    left join phase_points on phase_points.phase_id = team.phase_id and phase_points.player_id = pick.player_id
    group by team.user_id
  )
  select profile.user_id, profile.username, round(coalesce(user_points.points, 0), 1),
         rank() over (order by coalesce(user_points.points, 0) desc)
  from public.profile
  left join user_points on user_points.user_id = profile.user_id;
$$;
revoke execute on function public.standings from public, anon;
grant execute on function public.standings to authenticated;

-- (012b) Spillerstats til forsiden med billede
create or replace view public.v_player_stats with (security_invoker = true) as
select gs.tournament_id, gs.player_id, pl.handle, gs.role_code, t.code as team_code,
       count(*) as games, round(avg(gs.score), 1) as avg_score,
       sum(gs.kills) as kills, sum(gs.deaths) as deaths, sum(gs.assists) as assists,
       count(*) filter (where gs.title is not null) as titles,
       pl.image_url
from public.v_game_score gs
join public.player pl on pl.id = gs.player_id
join public.pro_team t on t.id = gs.pro_team_id
group by gs.tournament_id, gs.player_id, pl.handle, gs.role_code, t.code, pl.image_url;
