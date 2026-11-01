-- Ansvar: Tydelige fejlbeskeder ved Lock in. Ugyldigt navn og forkert antal spillere får hver sin besked.

-- Ét hold fra brugerens valg: betegnelse i beskeder, navn uden mellemrum omkring og antal valgte spillere
create function public.draft_teams(p_phase public.phase, p_teams jsonb)
returns table (label text, team_name text, picked_count bigint)
language sql stable set search_path = '' as $$
  select case when p_phase.teams_per_user = 2 then 'Hold ' || chr(64 + (team ->> 'slot')::int) else 'Dit hold' end,
         coalesce(trim(team ->> 'name'), ''),
         (select count(*) from jsonb_array_elements(team -> 'picks') as pick where pick ->> 'player_id' is not null)
  from jsonb_array_elements(p_teams) as team;
$$;

-- Alle holdregler: navn, antal spillere, én spiller pr. rolle, unikke spillere, gyldige startspillere, budget og holdgrænse
create or replace function public.assert_draft_valid(p_phase public.phase, p_teams jsonb) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  problem text;
begin
  if exists (select 1 from jsonb_array_elements(p_teams) as team
             where coalesce((team ->> 'slot')::smallint, 0) not between 1 and p_phase.teams_per_user)
     or (select count(distinct (team ->> 'slot')::smallint) from jsonb_array_elements(p_teams) as team) <> p_phase.teams_per_user then
    raise exception 'Holdene er ikke sat rigtigt op. Genindlæs siden, og prøv igen.';
  end if;

  select string_agg(t.label || ' mangler et navn', '. ') into problem
  from public.draft_teams(p_phase, p_teams) t where t.team_name = '';
  if problem is not null then raise exception '%', problem; end if;

  select string_agg(t.label || ' mangler ' || (5 - t.picked_count) || case when t.picked_count = 4 then ' spiller' else ' spillere' end
                    || ' – vælg en spiller til hver rolle', '. ') into problem
  from public.draft_teams(p_phase, p_teams) t where t.picked_count < 5;
  if problem is not null then raise exception '%', problem; end if;

  if exists (select 1 from public.draft_choices(p_phase.id, p_teams) c
             group by c.slot having count(*) <> 5 or count(distinct c.chosen_role) <> 5) then
    raise exception 'Hvert hold skal have præcis én spiller pr. rolle';
  end if;

  if (select count(*) <> count(distinct c.player_id) from public.draft_choices(p_phase.id, p_teams) c) then
    raise exception 'En spiller kan kun vælges én gang';
  end if;

  -- Uden kort er spilleren ikke en startspiller på et hold i fasen; rollen skal også passe
  select string_agg(coalesce(c.handle, c.player_id::text), ', ') into problem
  from public.draft_choices(p_phase.id, p_teams) c
  where c.card_role is null or c.card_role <> c.chosen_role;
  if problem is not null then raise exception 'Ugyldige valg: %', problem; end if;

  if p_phase.budget is not null then
    select string_agg(x.slot::text, ', ') into problem from (
      select c.slot from public.draft_choices(p_phase.id, p_teams) c
      group by c.slot having sum(c.price) > p_phase.budget) x;
    if problem is not null then raise exception 'Hold % er over budget på %', problem, p_phase.budget; end if;
  end if;

  if p_phase.max_per_team is not null then
    select string_agg(x.team_code, ', ') into problem from (
      select c.team_code from public.draft_choices(p_phase.id, p_teams) c
      group by c.team_code having count(*) > p_phase.max_per_team) x;
    if problem is not null then
      raise exception 'Højst % spillere fra samme hold: %', p_phase.max_per_team, problem;
    end if;
  end if;
end $$;

-- Hjælpefunktionen er intern; kun submit_draft må kaldes udefra
revoke execute on function public.draft_teams from public, anon, authenticated;
