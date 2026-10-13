-- Ansvar: Hold- og spillerstats pr. turnering til forsiden

create view public.v_team_stats with (security_invoker = true) as
select ph.tournament_id, gt.pro_team_id, t.code as team_code, t.name as team_name,
       count(*) as games,
       count(*) filter (where g.winner_team_id = gt.pro_team_id) as wins,
       round(avg((select sum(gp.kills) from public.game_player gp
                  join public.roster r on r.player_id = gp.player_id and r.tournament_id = ph.tournament_id
                  where gp.game_id = g.id and r.pro_team_id = gt.pro_team_id)), 1) as kills,
       round(avg((select count(*) from public.game_dragon d where d.game_id = g.id and d.pro_team_id = gt.pro_team_id)), 1) as dragons,
       round(avg(gt.barons), 1) as barons,
       round(avg(gt.towers), 1) as towers
from public.game_team gt
join public.game g on g.id = gt.game_id and g.state = 'finished'
join public.series s on s.id = g.series_id
join public.phase ph on ph.id = s.phase_id
join public.pro_team t on t.id = gt.pro_team_id
group by ph.tournament_id, gt.pro_team_id, t.code, t.name;

create view public.v_player_stats with (security_invoker = true) as
select gs.tournament_id, gs.player_id, pl.handle, gs.role_code, t.code as team_code,
       count(*) as games, round(avg(gs.score), 1) as avg_score,
       sum(gs.kills) as kills, sum(gs.deaths) as deaths, sum(gs.assists) as assists,
       count(*) filter (where gs.title is not null) as titles
from public.v_game_score gs
join public.player pl on pl.id = gs.player_id
join public.pro_team t on t.id = gs.pro_team_id
group by gs.tournament_id, gs.player_id, pl.handle, gs.role_code, t.code;
