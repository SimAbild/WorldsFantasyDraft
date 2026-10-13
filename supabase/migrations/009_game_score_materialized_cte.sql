-- Ansvar: Kampscore pr. spiller pr. kamp (Del A, Del B, z-scores, MVP/ACE).
-- v_game_player beregnes kun én gang (MATERIALIZED); uden det gentog planen den pr. række (17 s → 40 ms).
create or replace view public.v_game_score with (security_invoker = true) as
with gp as materialized (
  select * from public.v_game_player
),
raw as (
  -- Del A: kills, assists og deaths tæller råt; resten som afvigelse fra rollesnittet. Del B: alt som afvigelse
  select gp.game_id, gp.player_id,
         sum(cm.weight_a * (v.val - case when v.metric_code in ('kills','assists','deaths') then 0 else cm.mean end)) as raw_a,
         sum(cm.weight_b * (v.val - cm.mean)) as raw_b
  from gp
  join public.tournament t on t.id = gp.tournament_id
  cross join lateral (values
    ('kills', gp.kills::numeric), ('assists', gp.assists::numeric), ('deaths', gp.deaths::numeric),
    ('cspm', gp.cspm), ('dmg_share', gp.dmg_share), ('kp', gp.kp), ('kill_share', gp.kill_share),
    ('wards_placed', gp.wards_placed::numeric), ('wards_destroyed', gp.wards_destroyed::numeric)) v(metric_code, val)
  join public.calibration_metric cm
    on cm.calibration_id = t.calibration_id and cm.role_code = gp.role_code and cm.metric_code = v.metric_code
  group by gp.game_id, gp.player_id
),
parts as (
  select gp.*, cr.mult_a, cr.a_mean, cr.a_sd, cr.b_mean, cr.b_sd, cr.mix_mean, cr.mix_sd,
         -- Jungleren får et lille tillæg pr. objective holdet tager
         case when gp.role_code = 'jungle' then 0.5 * gp.dragons + gp.elders + gp.barons else 0 end as obj,
         r.raw_a, r.raw_b
  from gp
  join raw r on r.game_id = gp.game_id and r.player_id = gp.player_id
  join public.tournament t on t.id = gp.tournament_id
  join public.calibration_role cr on cr.calibration_id = t.calibration_id and cr.role_code = gp.role_code
),
a as (
  select p.*, greatest(-5, (p.raw_a + p.obj) * p.mult_a) as a_floor, p.raw_b + p.obj as b_raw
  from parts p
),
z as (
  select a.*,
         a.a_floor
           + case when a.win and a.a_floor > 0 then 0.05 * a.a_floor else 0 end
           + case when a.role_code <> 'support' and (a.kills >= 10 or a.assists >= 10) then 2 else 0 end as part_a
  from a
),
m as (
  select z.*,
         0.5 * (z.part_a - z.a_mean) / z.a_sd + 0.5 * (z.b_raw - z.b_mean) / z.b_sd as mix
  from z
),
s as (
  select m.*, 20 + 10 * (m.mix - m.mix_mean) / m.mix_sd as base,
         row_number() over (partition by m.game_id, m.side order by m.mix desc) as team_rank
  from m
)
select s.game_id, s.series_id, s.phase_id, s.tournament_id, s.ended_at, s.player_id, s.role_code, s.pro_team_id,
       s.side, s.win, s.kills, s.deaths, s.assists,
       round(s.part_a, 2) as part_a, round(s.b_raw, 2) as part_b, round(s.base, 2) as base,
       case when s.team_rank = 1 then case when s.win then 'MVP' else 'ACE' end end as title,
       round(s.base + case when s.team_rank = 1 then 3 else 0 end, 2) as score
from s;

analyze;
