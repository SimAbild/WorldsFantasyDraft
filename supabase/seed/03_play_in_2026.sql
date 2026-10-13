-- Ansvar: Play-In 2026 – hold, power ranking, prisklasser med begrundelse og startspillere.
-- Kan køres igen uden dubletter. Skabelon for de næste faser: ret holdene, priserne og begrundelserne.
-- Spillerbilleder sættes ikke her; dem henter ingest selv.

-- Holdene med power ranking, prisklasse og begrundelse
with play_in_team(esports_team_id, code, name, region, power_rank, tier_code, reason) as (values
  ('111692118851466302', 'KC',  'Karmine Corp', 'LEC',   1, 'favorit',
   'LEC''s 3. seed. Europa har de bedste internationale resultater af de fire regioner i Play-In.'),
  ('98767991877340524',  'C9',  'Cloud9 Kia',   'LCS',   2, 'staerk',
   'Fra LCS (Nordamerika). Nordamerika ligger internationalt under Europa, men over Brasilien og Stillehavsregionen.'),
  ('100205576309502431', 'FUR', 'FURIA',        'CBLOL', 3, 'middel',
   'Fra CBLOL (Brasilien). Brasilianske hold har sjældent vundet serier mod Europa og Nordamerika ved Worlds.'),
  ('107251245690956393', 'MVK', 'MVK Esports',  'LCP',   4, 'underdog',
   'LCP''s 3. seed, kvalificeret via championship points. Vurderet som det svageste af de fire hold på papiret.')
),
saved_team as (
  insert into public.pro_team (esports_team_id, code, name, region)
  select esports_team_id, code, name, region from play_in_team
  on conflict (esports_team_id) do update set code = excluded.code, name = excluded.name, region = excluded.region
  returning id, esports_team_id
),
tournament_2026 as (select id from public.tournament where year = 2026),
play_in_phase as (select phase.id from public.phase join tournament_2026 on tournament_2026.id = phase.tournament_id where phase.kind = 'play_in'),
saved_ranking as (
  insert into public.tournament_team (tournament_id, pro_team_id, power_rank)
  select tournament_2026.id, saved_team.id, play_in_team.power_rank
  from play_in_team join saved_team using (esports_team_id) cross join tournament_2026
  on conflict (tournament_id, pro_team_id) do update set power_rank = excluded.power_rank
)
insert into public.team_price (phase_id, pro_team_id, tier_code, reason)
select play_in_phase.id, saved_team.id, play_in_team.tier_code, play_in_team.reason
from play_in_team join saved_team using (esports_team_id) cross join play_in_phase
on conflict (phase_id, pro_team_id) do update set tier_code = excluded.tier_code, reason = excluded.reason;

-- Spillerne. is_starter = false er reserver, som ikke kan vælges i draften.
with play_in_player(esports_player_id, handle, team_esports_id, role_code, is_starter) as (values
  -- KC
  ('103495716771322725', 'Canna',    '111692118851466302', 'top',     true),
  ('105537190986692036', 'Yike',     '111692118851466302', 'jungle',  true),
  ('108205130709313212', 'kyeahoo',  '111692118851466302', 'mid',     true),
  ('109461265532592848', 'Caliste',  '111692118851466302', 'adc',     true),
  ('106625308523122120', 'Busio',    '111692118851466302', 'support', true),
  -- C9
  ('105501816646382923', 'Thanatos', '98767991877340524',  'top',     true),
  ('99101098218071815',  'Blaber',   '98767991877340524',  'jungle',  true),
  ('108567314915334762', 'Loki',     '98767991877340524',  'mid',     true),
  ('101383793877071109', 'Tactical', '98767991877340524',  'adc',     true),
  ('99101098208825497',  'Vulcan',   '98767991877340524',  'support', true),
  ('105957619949286329', 'APA',      '98767991877340524',  'mid',     false),
  ('98767991801635485',  'Zven',     '98767991877340524',  'adc',     false),
  -- FUR
  ('100131733430915231', 'Guigo',    '100205576309502431', 'top',     true),
  ('108494063372887027', 'Tatu',     '100205576309502431', 'jungle',  true),
  ('103478281329357326', 'Tutsz',    '100205576309502431', 'mid',     true),
  ('108613483446049530', 'Ayu',      '100205576309502431', 'adc',     true),
  ('99566408211536727',  'JoJo',     '100205576309502431', 'support', true),
  ('99566407782209288',  'Shini',    '100205576309502431', 'jungle',  false),
  -- MVK
  ('109828407662355333', 'Kratos',   '107251245690956393', 'top',     true),
  ('109828289393968653', 'Gury',     '107251245690956393', 'jungle',  true),
  ('113628612585554951', 'Chika',    '107251245690956393', 'mid',     true),
  ('109828431746365782', 'Harky',    '107251245690956393', 'adc',     true),
  ('112834609700454416', 'SiuLoong', '107251245690956393', 'support', true),
  ('113628612494074867', 'SanSan',   '107251245690956393', 'jungle',  false)
),
saved_player as (
  insert into public.player (esports_player_id, handle)
  select esports_player_id, handle from play_in_player
  on conflict (esports_player_id) do update set handle = excluded.handle
  returning id, esports_player_id
)
insert into public.roster (tournament_id, player_id, pro_team_id, role_code, is_starter)
select tournament.id, saved_player.id, pro_team.id, play_in_player.role_code, play_in_player.is_starter
from play_in_player
join saved_player using (esports_player_id)
join public.pro_team on pro_team.esports_team_id = play_in_player.team_esports_id
join public.tournament on tournament.year = 2026
on conflict (tournament_id, player_id) do update
  set pro_team_id = excluded.pro_team_id, role_code = excluded.role_code, is_starter = excluded.is_starter;
