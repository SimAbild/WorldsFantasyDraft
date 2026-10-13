-- Ansvar: Opslagsdata og Worlds 2026-faser med draft-regler (tider i UTC)
insert into public.role (code, sort_order) values ('top',1),('jungle',2),('mid',3),('adc',4),('support',5);
insert into public.dragon_type (code, is_elder) values ('infernal',false),('ocean',false),('mountain',false),('cloud',false),('hextech',false),('chemtech',false),('elder',true);
insert into public.price_tier (code, price) values ('favorit',26),('staerk',22),('middel',18),('underdog',14),('ko_favorit',23),('ko_underdog',17);
insert into public.metric (code, label) values
 ('kills','Kills'),('deaths','Deaths'),('assists','Assists'),('cspm','CS pr. minut'),('dmg_share','Skadeandel'),
 ('kp','Kill participation'),('kill_share','Killandel'),('wards_placed','Wards placeret'),('wards_destroyed','Wards ødelagt');
insert into public.tournament (name, year) values ('Worlds', 2026);
-- Draften låser ved fasens første kamp. Budget NULL = fri leg.
insert into public.phase (tournament_id, kind, opens_at, locks_at, ends_at, budget, max_per_team, teams_per_user)
select t.id, v.kind, v.opens::timestamptz, v.locks::timestamptz, v.ends::timestamptz, v.budget, v.max_per_team, v.teams
from public.tournament t, (values
 ('play_in','2026-10-13T10:00Z','2026-10-15T18:00Z','2026-10-19T03:00Z',100,2,1),
 ('swiss',  '2026-10-19T03:00Z','2026-10-23T17:00Z','2026-11-01T04:00Z',100,2,2),
 ('qf',     '2026-11-01T04:00Z','2026-11-03T22:00Z','2026-11-07T04:00Z',100,2,1),
 ('sf',     '2026-11-07T04:00Z','2026-11-07T18:00Z','2026-11-09T04:00Z',100,3,1),
 ('final',  '2026-11-09T04:00Z','2026-11-14T18:00Z','2026-11-15T04:00Z',null,null,1)
) v(kind, opens, locks, ends, budget, max_per_team, teams)
where t.year = 2026;
