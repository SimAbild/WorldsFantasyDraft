-- Ansvar: Pointberegning som views, ét trin pr. formel i pointsystemet. Intet afledt gemmes.
-- v_game_score blev senere omskrevet i 009 (samme formel, hurtigere plan).

-- 1) Rå stats beriget med rolle, hold, side, sejr, kamplængde og andele
create view public.v_game_player with (security_invoker = true) as
with b as (
  select g.id as game_id, g.series_id, s.phase_id, ph.tournament_id, g.ended_at,
         gp.player_id, r.role_code, r.pro_team_id, gt.side, gt.barons,
         coalesce(g.winner_team_id = r.pro_team_id, false) as win,
         greatest(extract(epoch from (g.ended_at - g.started_at)) - g.pause_seconds, 600) / 60.0 as minutes,
         gp.kills, gp.deaths, gp.assists, gp.creep_score, gp.damage_share, gp.wards_placed, gp.wards_destroyed
  from public.game g
  join public.series s on s.id = g.series_id
  join public.phase ph on ph.id = s.phase_id
  join public.game_player gp on gp.game_id = g.id
  join public.roster r on r.tournament_id = ph.tournament_id and r.player_id = gp.player_id
  join public.game_team gt on gt.game_id = g.id and gt.pro_team_id = r.pro_team_id
  where g.state = 'finished' and g.ended_at is not null and g.started_at is not null
)
select b.*,
       b.creep_score / b.minutes as cspm,
       b.damage_share * 100 as dmg_share,
       (b.kills + b.assists) * 100.0 / greatest(sum(b.kills) over w, 1) as kp,
       b.kills * 100.0 / greatest(sum(b.kills) over w, 1) as kill_share,
       (select count(*) from public.game_dragon d join public.dragon_type dt on dt.code = d.dragon_type
         where d.game_id = b.game_id and d.pro_team_id = b.pro_team_id and not dt.is_elder) as dragons,
       (select count(*) from public.game_dragon d join public.dragon_type dt on dt.code = d.dragon_type
         where d.game_id = b.game_id and d.pro_team_id = b.pro_team_id and dt.is_elder) as elders
from b
window w as (partition by b.game_id, b.pro_team_id);

-- 2) Kampscore: se 009_game_score_materialized_cte.sql

-- 3) Seriepoint = snit af kampene; 4) fasepoint = snit af serierne
create view public.v_series_points with (security_invoker = true) as
select series_id, phase_id, tournament_id, player_id, role_code, pro_team_id,
       round(avg(score), 2) as series_points, count(*) as games, max(ended_at) as ended_at
from public.v_game_score
group by series_id, phase_id, tournament_id, player_id, role_code, pro_team_id;

create view public.v_phase_points with (security_invoker = true) as
select phase_id, player_id, round(avg(series_points), 2) as phase_points, count(*) as series_played
from public.v_series_points
group by phase_id, player_id;

-- 5) Brugerens hold: pris og point pr. spiller og samlet
create view public.v_fantasy_pick_points with (security_invoker = true) as
select fp.fantasy_team_id, ft.user_id, ft.phase_id, ft.slot, ft.name as team_name,
       fp.role_code, fp.player_id, pl.handle, t.code as team_code, pt.price,
       coalesce(pp.phase_points, 0) as points, coalesce(pp.series_played, 0) as series_played
from public.fantasy_pick fp
join public.fantasy_team ft on ft.id = fp.fantasy_team_id
join public.phase ph on ph.id = ft.phase_id
join public.player pl on pl.id = fp.player_id
join public.roster r on r.tournament_id = ph.tournament_id and r.player_id = fp.player_id
join public.pro_team t on t.id = r.pro_team_id
left join public.team_price tp on tp.phase_id = ph.id and tp.pro_team_id = r.pro_team_id
left join public.price_tier pt on pt.code = tp.tier_code
left join public.v_phase_points pp on pp.phase_id = ft.phase_id and pp.player_id = fp.player_id;

create view public.v_fantasy_team with (security_invoker = true) as
select fantasy_team_id, user_id, phase_id, slot, team_name,
       sum(coalesce(price, 0)) as cost, round(sum(points), 2) as points
from public.v_fantasy_pick_points
group by fantasy_team_id, user_id, phase_id, slot, team_name;

-- 6) Stilling i en liga på et givet tidspunkt (bruges til "hvem førte efter hver kamp")
create function public.league_standings(p_league_id bigint, p_at timestamptz default now())
returns table (user_id uuid, username text, points numeric, rank bigint)
language sql stable security invoker set search_path = '' as $$
  with sp as (
    select phase_id, series_id, player_id, avg(score) as s
    from public.v_game_score where ended_at <= p_at
    group by phase_id, series_id, player_id
  ),
  pp as (select phase_id, player_id, avg(s) as p from sp group by phase_id, player_id),
  tot as (
    select ft.user_id, sum(coalesce(pp.p, 0)) as p
    from public.fantasy_team ft
    join public.phase ph on ph.id = ft.phase_id
    join public.league l on l.id = p_league_id and l.tournament_id = ph.tournament_id
    join public.fantasy_pick fp on fp.fantasy_team_id = ft.id
    left join pp on pp.phase_id = ft.phase_id and pp.player_id = fp.player_id
    group by ft.user_id
  )
  select m.user_id, pr.username, round(coalesce(tot.p, 0), 1),
         rank() over (order by coalesce(tot.p, 0) desc)
  from public.league_member m
  join public.profile pr on pr.user_id = m.user_id
  left join tot on tot.user_id = m.user_id
  where m.league_id = p_league_id;
$$;
revoke execute on function public.league_standings from public, anon;
grant execute on function public.league_standings to authenticated;

-- Serier med hold og vundne kampe, til kampprogram og leaderboardets tidslinje
create view public.v_series with (security_invoker = true) as
select s.id as series_id, s.phase_id, ph.kind as phase_kind, s.esports_match_id, s.best_of, s.starts_at,
       (select max(g.ended_at) from public.game g where g.series_id = s.id and g.state = 'finished') as last_game_ended_at,
       st.pro_team_id, t.code as team_code, t.name as team_name,
       (select count(*) from public.game g where g.series_id = s.id and g.winner_team_id = st.pro_team_id) as game_wins
from public.series s
join public.phase ph on ph.id = s.phase_id
join public.series_team st on st.series_id = s.id
join public.pro_team t on t.id = st.pro_team_id;
