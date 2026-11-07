-- Ansvar: Semifinalen 2026 – de fire hold, samt finalens regler. Kan køres igen uden dubletter.
-- Semifinalens regler (intet budget, højst 2 pr. prohold, 1 hold pr. bruger) er sat i 05_kvartfinale_2026.sql,
-- og holdene og deres spillere findes allerede fra Swiss, så for semifinalen vælges her kun holdene.

-- En række i team_price afgør, hvilke hold der er med i fasen. Uden priser er prisklassen tom.
with semifinal_team(esports_team_id) as (values
  ('99566404848691211'),   -- IG  (3-1 mod TES)
  ('100205573495116443'),  -- GEN (3-0 mod LYON)
  ('99566404853854212'),   -- BLG (3-0 mod DK)
  ('98767991853197861')    -- T1  (3-1 mod KC)
)
insert into public.team_price (phase_id, pro_team_id, tier_code, reason)
select phase.id, pro_team.id, null, null
from semifinal_team
join public.pro_team using (esports_team_id)
join public.tournament on tournament.year = 2026
join public.phase on phase.tournament_id = tournament.id and phase.kind = 'sf'
on conflict (phase_id, pro_team_id) do update set tier_code = excluded.tier_code, reason = excluded.reason;

-- Finalen har kun to prohold og intet budget. Højst 3 fra samme prohold betyder mindst 2 fra hvert hold.
update public.phase
set budget = null, max_per_team = 3, teams_per_user = 1
from public.tournament
where tournament.id = phase.tournament_id and tournament.year = 2026 and phase.kind = 'final';
