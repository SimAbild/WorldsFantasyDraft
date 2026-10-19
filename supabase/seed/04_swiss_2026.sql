-- Ansvar: Swiss 2026 – hold, power ranking, prisklasser med begrundelse og startspillere.
-- Kan køres igen uden dubletter. Samme mønster som 03_play_in_2026.sql.
-- Spillerbilleder sættes ikke her; dem henter ingest selv.

-- Holdene med power ranking, prisklasse og begrundelse. Kilde: lolesports.com/gpr, 11. okt. 2026.
-- Prisklasser efter placering blandt de 16: top 4 favorit, næste 4 stærk, så 4 middel, sidste 4 underdog.
-- power_rank er placeringen blandt de 16; hold med samme GPR-nummer deler rang.
with swiss_team(esports_team_id, code, name, region, power_rank, tier_code, reason) as (values
  ('100205573496804586', 'HLE',  'Hanwha Life Esports',  'LCK',    1, 'favorit',
   'Nr. 1 i lolesports'' Global Power Rankings (11. okt.). Højest af de 16 hold i Swiss.'),
  ('100205573495116443', 'GEN',  'Gen.G Esports',        'LCK',    2, 'favorit',
   'Nr. 2 i lolesports'' Global Power Rankings (11. okt.). Blandt de fire højest placerede i Swiss.'),
  ('99566404853854212',  'BLG',  'Bilibili Gaming',      'LPL',    3, 'favorit',
   'Nr. 3 i lolesports'' Global Power Rankings (11. okt.). Blandt de fire højest placerede i Swiss.'),
  ('98767991926151025',  'G2',   'G2 Esports',           'LEC',    4, 'favorit',
   'Nr. 4 i lolesports'' Global Power Rankings (11. okt.). Blandt de fire højest placerede i Swiss.'),
  ('98767991853197861',  'T1',   'T1',                   'LCK',    5, 'staerk',
   'Nr. 5 i lolesports'' Global Power Rankings (11. okt.). Højest af de næste fire i Swiss.'),
  ('99566405941863385',  'LYON', 'LYON',                 'LCS',    6, 'staerk',
   'Nr. 6 i lolesports'' Global Power Rankings (11. okt.). Blandt nummer 5-8 i Swiss.'),
  ('100725845018863243', 'DK',   'Dplus KIA',            'LCK',    7, 'staerk',
   'Delt nr. 7 i lolesports'' Global Power Rankings (11. okt.) med AL. Blandt nummer 5-8 i Swiss.'),
  ('99566404856367466',  'AL',   'Anyone''s Legend',     'LPL',    7, 'staerk',
   'Delt nr. 7 i lolesports'' Global Power Rankings (11. okt.) med DK. Blandt nummer 5-8 i Swiss.'),
  ('111692118851466302', 'KC',   'Karmine Corp',         'LEC',    9, 'middel',
   'Nr. 10 i lolesports'' Global Power Rankings (11. okt.). Højest af de tre hold fra Play-In, men blandt nummer 9-12 i Swiss.'),
  ('113661839307879869', 'TSW',  'Team Secret Whales',   'LCP',   10, 'middel',
   'Nr. 11 i lolesports'' Global Power Rankings (11. okt.). Blandt nummer 9-12 i Swiss.'),
  ('98926509885559666',  'TLAW', 'Team Liquid Alienware','LCS',   11, 'middel',
   'Nr. 12 i lolesports'' Global Power Rankings (11. okt.). Blandt nummer 9-12 i Swiss.'),
  ('99566404854685458',  'TES',  'Top Esports',          'LPL',   12, 'middel',
   'Nr. 13 i lolesports'' Global Power Rankings (11. okt.). Blandt nummer 9-12 i Swiss.'),
  ('99566404848691211',  'IG',   'Invictus Gaming',      'LPL',   13, 'underdog',
   'Nr. 15 i lolesports'' Global Power Rankings (11. okt.). Højest af de fire laveste i Swiss.'),
  ('103461966965149786', 'MKOI', 'Movistar KOI',         'LEC',   14, 'underdog',
   'Delt nr. 18 i lolesports'' Global Power Rankings (11. okt.) med CFO. Blandt de fire laveste i Swiss.'),
  ('107700199633958891', 'CFO',  'CTBC Flying Oyster',   'LCP',   14, 'underdog',
   'Delt nr. 18 i lolesports'' Global Power Rankings (11. okt.) med MKOI. Blandt de fire laveste i Swiss.'),
  ('109480204628225868', 'LOS',  'LOS',                  'CBLOL', 16, 'underdog',
   'Nr. 40 i lolesports'' Global Power Rankings (11. okt.). Lavest af de 16 hold i Swiss.')
),
saved_team as (
  insert into public.pro_team (esports_team_id, code, name, region)
  select esports_team_id, code, name, region from swiss_team
  on conflict (esports_team_id) do update set code = excluded.code, name = excluded.name, region = excluded.region
  returning id, esports_team_id
),
tournament_2026 as (select id from public.tournament where year = 2026),
swiss_phase as (select phase.id from public.phase join tournament_2026 on tournament_2026.id = phase.tournament_id where phase.kind = 'swiss'),
saved_ranking as (
  insert into public.tournament_team (tournament_id, pro_team_id, power_rank)
  select tournament_2026.id, saved_team.id, swiss_team.power_rank
  from swiss_team join saved_team using (esports_team_id) cross join tournament_2026
  on conflict (tournament_id, pro_team_id) do update set power_rank = excluded.power_rank
)
insert into public.team_price (phase_id, pro_team_id, tier_code, reason)
select swiss_phase.id, saved_team.id, swiss_team.tier_code, swiss_team.reason
from swiss_team join saved_team using (esports_team_id) cross join swiss_phase
on conflict (phase_id, pro_team_id) do update set tier_code = excluded.tier_code, reason = excluded.reason;

-- Spillerne fra lolesports' getTeams. is_starter = false er reserver, som ikke kan vælges i draften.
with swiss_player(esports_player_id, handle, team_esports_id, role_code, is_starter) as (values
  -- GEN
  ('99566404532924465',  'Kiin',        '100205573495116443', 'top',     true),
  ('100725844994345151', 'Canyon',      '100205573495116443', 'jungle',  true),
  ('99871276342168416',  'Chovy',       '100205573495116443', 'mid',     true),
  ('98767975906852059',  'Ruler',       '100205573495116443', 'adc',     true),
  ('107454956790371682', 'Duro',        '100205573495116443', 'support', true),
  ('115740909072304963', 'Ripple',      '100205573495116443', 'top',     false),
  ('108366460978884097', 'Courage',     '100205573495116443', 'jungle',  false),
  ('113560610683314243', 'Kemish',      '100205573495116443', 'mid',     false),
  ('115740899235923933', 'MUDAI',       '100205573495116443', 'adc',     false),
  ('113740943728096233', 'SIRIUSS',     '100205573495116443', 'support', false),
  ('115740899326939236', 'Lumos',       '100205573495116443', 'support', false),
  -- IG
  ('99566404810113891',  'TheShy',      '99566404848691211',  'top',     true),
  ('103461966880868232', 'Wei',         '99566404848691211',  'jungle',  true),
  ('99566404811346612',  'Rookie',      '99566404848691211',  'mid',     true),
  ('113662801804437510', 'JiaQi',       '99566404848691211',  'adc',     true),
  ('98767991785832912',  'Meiko',       '99566404848691211',  'support', true),
  ('106368497875598272', 'Assum',       '99566404848691211',  'adc',     false),
  -- TLAW
  ('103103696693473944', 'Morgan',      '98926509885559666',  'top',     true),
  ('99566408350815597',  'Josedeodo',   '98926509885559666',  'jungle',  true),
  ('107492071007218117', 'Quid',        '98926509885559666',  'mid',     true),
  ('105510944671654183', 'Yeon',        '98926509885559666',  'adc',     true),
  ('98767991789638893',  'CoreJJ',      '98926509885559666',  'support', true),
  -- CFO
  ('99566406483009320',  'Rest',        '107700199633958891', 'top',     true),
  ('102808727762706248', 'Shad0w',      '107700199633958891', 'jungle',  true),
  ('108443043135317375', 'POUT',        '107700199633958891', 'mid',     true),
  ('104573129055417270', 'Doggo',       '107700199633958891', 'adc',     true),
  ('100668757020706361', 'Kino',        '107700199633958891', 'support', true),
  -- AL
  ('105516622825169657', 'Breathe',     '99566404856367466',  'top',     true),
  ('99871276342823057',  'Tarzan',      '99566404856367466',  'jungle',  true),
  ('104287400430814502', 'Shanks',      '99566404856367466',  'mid',     true),
  ('99566404819916503',  'Hope',        '99566404856367466',  'adc',     true),
  ('105530584812980593', 'Kael',        '99566404856367466',  'support', true),
  -- KC
  ('103495716771322725', 'Canna',       '111692118851466302', 'top',     true),
  ('105537190986692036', 'Yike',        '111692118851466302', 'jungle',  true),
  ('108205130709313212', 'kyeahoo',     '111692118851466302', 'mid',     true),
  ('109461265532592848', 'Caliste',     '111692118851466302', 'adc',     true),
  ('106625308523122120', 'Busio',       '111692118851466302', 'support', true),
  -- G2
  ('99566406047571736',  'BrokenBlade', '98767991926151025',  'top',     true),
  ('107128052280762804', 'SkewMond',    '98767991926151025',  'jungle',  true),
  ('98767975968177297',  'Caps',        '98767991926151025',  'mid',     true),
  ('98767975961872793',  'Hans Sama',   '98767991926151025',  'adc',     true),
  ('102787200059605684', 'Labrov',      '98767991926151025',  'support', true),
  -- DK
  ('111658292064356964', 'Siwoo',       '100725845018863243', 'top',     true),
  ('106267599829820917', 'Lucid',       '100725845018863243', 'jungle',  true),
  ('100725844988653773', 'ShowMaker',   '100725845018863243', 'mid',     true),
  ('108205129774185945', 'Smash',       '100725845018863243', 'adc',     true),
  ('108284721867904137', 'Career',      '100725845018863243', 'support', true),
  ('113543956179181753', 'Jaehyuk',     '100725845018863243', 'top',     false),
  ('114697949393287385', 'Nevid',       '100725845018863243', 'top',     false),
  ('116907472040667554', 'Solid',       '100725845018863243', 'jungle',  false),
  ('112822770322732675', 'Garden',      '100725845018863243', 'mid',     false),
  ('105501707243664614', 'Wayne',       '100725845018863243', 'adc',     false),
  ('107492028745476512', 'Loopy',       '100725845018863243', 'support', false),
  -- HLE
  ('105320680474347057', 'Zeus',        '100205573496804586', 'top',     true),
  ('101671284628761661', 'Kanavi',      '100205573496804586', 'jungle',  true),
  ('103478281361900912', 'Zeka',        '100205573496804586', 'mid',     true),
  ('103495716775975785', 'Gumayusi',    '100205573496804586', 'adc',     true),
  ('105501709748188393', 'Delight',     '100205573496804586', 'support', true),
  ('115807595873361833', 'Panther',     '100205573496804586', 'top',     false),
  ('113740953522201854', 'Jackal',      '100205573496804586', 'jungle',  false),
  ('115740899104327635', 'Cracker',     '100205573496804586', 'mid',     false),
  ('115740899171305432', 'Valiant',     '100205573496804586', 'mid',     false),
  ('113740949736514801', 'Pyeonsik',    '100205573496804586', 'adc',     false),
  ('113740952132760566', 'Bluffing',    '100205573496804586', 'support', false),
  -- TES
  ('101388912796120370', '369',         '99566404854685458',  'top',     true),
  ('99566404820654675',  'Tian',        '99566404854685458',  'jungle',  true),
  ('106368556422916908', 'Creme',       '99566404854685458',  'mid',     true),
  ('99566404823220763',  'JackeyLove',  '99566404854685458',  'adc',     true),
  ('105516599464787723', 'Zhuo',        '99566404854685458',  'support', true),
  ('112540645110902751', 'ZUIAN',       '99566404854685458',  'top',     false),
  -- LOS
  ('107492099069012459', 'Zest',        '109480204628225868', 'top',     true),
  ('110434822594728434', 'Curse',       '109480204628225868', 'jungle',  true),
  ('107492030596737445', 'Feisty',      '109480204628225868', 'mid',     true),
  ('112462169706118570', 'Duduhh',      '109480204628225868', 'adc',     true),
  ('105506922297942200', 'Ackerman',    '109480204628225868', 'support', true),
  -- T1
  ('102186485482484390', 'Doran',       '98767991853197861',  'top',     true),
  ('105320682452092471', 'Oner',        '98767991853197861',  'jungle',  true),
  ('98767991747728851',  'Faker',       '98767991853197861',  'mid',     true),
  ('107492068702410338', 'Peyz',        '98767991853197861',  'adc',     true),
  ('103495716561790834', 'Keria',       '98767991853197861',  'support', true),
  ('115643633313408264', 'Guardian',    '98767991853197861',  'top',     false),
  ('113560604011392262', 'Haetae',      '98767991853197861',  'top',     false),
  ('108205131230834705', 'Carim',       '98767991853197861',  'jungle',  false),
  ('115643633228772231', 'Painter',     '98767991853197861',  'jungle',  false),
  ('109523134874809981', 'Guti',        '98767991853197861',  'mid',     false),
  ('108205155000821521', 'Cypher',      '98767991853197861',  'adc',     false),
  ('116884197729505782', 'Eclipse',     '98767991853197861',  'adc',     false),
  ('111658292000001586', 'Jinbeom',     '98767991853197861',  'adc',     false),
  ('111658337799244461', 'Cloud',       '98767991853197861',  'support', false),
  -- TSW
  ('107251636998679351', 'Pun',         '113661839307879869', 'top',     true),
  ('113662600335177587', 'Hizto',       '113661839307879869', 'jungle',  true),
  ('113661875306288886', 'Dire',        '113661839307879869', 'mid',     true),
  ('107251694749147163', 'Eddie',       '113661839307879869', 'adc',     true),
  ('107251574398720447', 'Bie',         '113661839307879869', 'support', true),
  -- LYON
  ('99322408701435122',  'Dhokla',      '99566405941863385',  'top',     true),
  ('101389713966873995', 'Inspired',    '99566405941863385',  'jungle',  true),
  ('107492059066783320', 'Saint',       '99566405941863385',  'mid',     true),
  ('105388936922706146', 'Berserker',   '99566405941863385',  'adc',     true),
  ('103103578076943629', 'Isles',       '99566405941863385',  'support', true),
  -- BLG
  ('103478281356330346', 'Bin',         '99566404853854212',  'top',     true),
  ('105516152837078491', 'Xun',         '99566404853854212',  'jungle',  true),
  ('99566404803543690',  'Knight',      '99566404853854212',  'mid',     true),
  ('99871276340698623',  'Viper',       '99566404853854212',  'adc',     true),
  ('110547957837987327', 'ON',          '99566404853854212',  'support', true),
  ('99566404805093717',  'Wenbo',       '99566404853854212',  'top',     false),
  ('99566404812254466',  'Flandre',     '99566404853854212',  'top',     false),
  -- MKOI
  ('110350224593953686', 'Myrwn',       '103461966965149786', 'top',     true),
  ('103877629120745120', 'Elyoya',      '103461966965149786', 'jungle',  true),
  ('105504920899018806', 'Jojopyun',    '103461966965149786', 'mid',     true),
  ('103536968833612789', 'Supa',        '103461966965149786', 'adc',     true),
  ('107564404490889053', 'Alvaro',      '103461966965149786', 'support', true),
  ('112455030195807491', 'NightSlayer', '103461966965149786', 'top',     false)
),
saved_player as (
  insert into public.player (esports_player_id, handle)
  select esports_player_id, handle from swiss_player
  on conflict (esports_player_id) do update set handle = excluded.handle
  returning id, esports_player_id
)
insert into public.roster (tournament_id, player_id, pro_team_id, role_code, is_starter)
select tournament.id, saved_player.id, pro_team.id, swiss_player.role_code, swiss_player.is_starter
from swiss_player
join saved_player using (esports_player_id)
join public.pro_team on pro_team.esports_team_id = swiss_player.team_esports_id
join public.tournament on tournament.year = 2026
on conflict (tournament_id, player_id) do update
  set pro_team_id = excluded.pro_team_id, role_code = excluded.role_code, is_starter = excluded.is_starter;
