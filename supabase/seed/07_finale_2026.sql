-- Ansvar: Finalen 2026 – de to hold. Kan køres igen uden dubletter.
-- Finalens regler (intet budget, højst 3 pr. prohold, 1 hold pr. bruger) er sat i 06_semifinale_2026.sql,
-- og holdene og deres spillere findes allerede fra Swiss, så her vælges kun holdene.

-- En række i team_price afgør, hvilke hold der er med i fasen. Uden priser er prisklassen tom.
with final_team(esports_team_id) as (values
  ('100205573495116443'),  -- GEN (3-0 mod IG)
  ('99566404853854212')    -- BLG (3-1 mod T1)
)
insert into public.team_price (phase_id, pro_team_id, tier_code, reason)
select phase.id, pro_team.id, null, null
from final_team
join public.pro_team using (esports_team_id)
join public.tournament on tournament.year = 2026
join public.phase on phase.tournament_id = tournament.id and phase.kind = 'final'
on conflict (phase_id, pro_team_id) do update set tier_code = excluded.tier_code, reason = excluded.reason;
