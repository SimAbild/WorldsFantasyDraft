-- Ansvar: Kvartfinalen 2026 – regler og de otte hold, samt semifinalens regler. Kan køres igen uden dubletter.
-- Holdene og deres spillere findes allerede fra Swiss, så her sættes kun fasen op.

-- Ét hold pr. bruger uden budget. Højst 1 spiller fra samme prohold.
update public.phase
set budget = null, max_per_team = 1, teams_per_user = 1
from public.tournament
where tournament.id = phase.tournament_id and tournament.year = 2026 and phase.kind = 'qf';

-- Semifinalen har kun fire prohold. Højst 1 pr. prohold giver 4 spillere, og holdet skal have 5, så grænsen er 2.
update public.phase
set budget = null, max_per_team = 2, teams_per_user = 1
from public.tournament
where tournament.id = phase.tournament_id and tournament.year = 2026 and phase.kind = 'sf';

-- En række i team_price afgør, hvilke hold der er med i fasen. Uden priser er prisklassen tom.
with quarterfinal_team(esports_team_id) as (values
  ('99566404854685458'),   -- TES
  ('99566404848691211'),   -- IG
  ('100205573495116443'),  -- GEN
  ('99566405941863385'),   -- LYON
  ('100725845018863243'),  -- DK
  ('99566404853854212'),   -- BLG
  ('98767991853197861'),   -- T1
  ('111692118851466302')   -- KC
)
insert into public.team_price (phase_id, pro_team_id, tier_code, reason)
select phase.id, pro_team.id, null, null
from quarterfinal_team
join public.pro_team using (esports_team_id)
join public.tournament on tournament.year = 2026
join public.phase on phase.tournament_id = tournament.id and phase.kind = 'qf'
on conflict (phase_id, pro_team_id) do update set tier_code = excluded.tier_code, reason = excluded.reason;
