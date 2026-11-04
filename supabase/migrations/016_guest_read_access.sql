-- Ansvar: Gæster uden login kan se leaderboardet: stillingen, brugernavne og hold i låste faser.
-- Gæster kan intet skrive. Ulåste hold er stadig kun synlige for ejeren.

grant execute on function public.standings to anon;

create policy "gaester kan laese brugernavne" on public.profile for select to anon using (true);

create policy "gaester ser laaste hold" on public.fantasy_team for select to anon
  using (exists (select 1 from public.phase p where p.id = phase_id and now() >= p.locks_at));

create policy "gaester ser valg paa laaste hold" on public.fantasy_pick for select to anon
  using (exists (select 1 from public.fantasy_team ft where ft.id = fantasy_team_id));
