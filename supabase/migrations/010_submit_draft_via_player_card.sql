-- Ansvar: Draft-validering og -gemning, opdelt i små funktioner med ét ansvar hver.
-- DRY: valgene slås op i v_player_card, som allerede kender rolle, startspiller, hold i fasen og pris.

-- Brugerens valg fladet ud og koblet til spillerkortet. Ukendte eller ugyldige spillere får tomme kortfelter.
create or replace function public.draft_choices(p_phase_id bigint, p_teams jsonb)
returns table (slot smallint, team_name text, chosen_role text, player_id bigint,
               card_role text, team_code text, price smallint, handle text)
language sql stable security definer set search_path = '' as $$
  select (team ->> 'slot')::smallint, team ->> 'name', pick ->> 'role', (pick ->> 'player_id')::bigint,
         card.role_code, card.team_code, card.price, player.handle
  from jsonb_array_elements(p_teams) as team
  cross join jsonb_array_elements(team -> 'picks') as pick
  left join public.v_player_card card
    on card.phase_id = p_phase_id and card.player_id = (pick ->> 'player_id')::bigint
  left join public.player player on player.id = (pick ->> 'player_id')::bigint;
$$;

-- Fasen skal findes og være åben, og antallet af hold skal passe
create or replace function public.assert_draft_open(p_phase public.phase, p_teams jsonb) returns void
language plpgsql stable set search_path = '' as $$
begin
  if p_phase.id is null then raise exception 'Ukendt fase'; end if;
  if now() < p_phase.opens_at then raise exception 'Draften er ikke åbnet endnu'; end if;
  if now() >= p_phase.locks_at then raise exception 'Draften er låst'; end if;
  if jsonb_typeof(p_teams) <> 'array' or jsonb_array_length(p_teams) <> p_phase.teams_per_user then
    raise exception 'Fasen kræver % hold', p_phase.teams_per_user;
  end if;
end $$;

-- Alle holdregler: én spiller pr. rolle, unikke spillere, gyldige startspillere, budget og holdgrænse
create or replace function public.assert_draft_valid(p_phase public.phase, p_teams jsonb) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  problem text;
begin
  if exists (select 1 from public.draft_choices(p_phase.id, p_teams) c where c.slot not between 1 and p_phase.teams_per_user)
     or (select count(distinct c.slot) from public.draft_choices(p_phase.id, p_teams) c) <> p_phase.teams_per_user
     or exists (select 1 from public.draft_choices(p_phase.id, p_teams) c
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

-- Gemmer holdene; hver rolle overskrives med den nye spiller
create or replace function public.save_draft(p_phase_id bigint, p_user_id uuid, p_teams jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  team jsonb;
  saved_team_id bigint;
begin
  for team in select * from jsonb_array_elements(p_teams) loop
    insert into public.fantasy_team (user_id, phase_id, slot, name, submitted_at)
    values (p_user_id, p_phase_id, (team ->> 'slot')::smallint,
            coalesce(nullif(trim(team ->> 'name'), ''), 'Mit hold'), now())
    on conflict (user_id, phase_id, slot)
      do update set name = excluded.name, submitted_at = excluded.submitted_at
    returning id into saved_team_id;

    insert into public.fantasy_pick (fantasy_team_id, role_code, player_id)
    select saved_team_id, pick ->> 'role', (pick ->> 'player_id')::bigint
    from jsonb_array_elements(team -> 'picks') as pick
    on conflict (fantasy_team_id, role_code) do update set player_id = excluded.player_id;
  end loop;
end $$;

-- Indgangen fra appen: læses som de tre trin, den består af
create or replace function public.submit_draft(p_phase_id bigint, p_teams jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  draft_phase public.phase;
begin
  if auth.uid() is null then raise exception 'Du skal være logget ind'; end if;
  select * into draft_phase from public.phase where id = p_phase_id;

  perform public.assert_draft_open(draft_phase, p_teams);
  perform public.assert_draft_valid(draft_phase, p_teams);
  perform public.save_draft(draft_phase.id, auth.uid(), p_teams);
end $$;

-- Hjælpefunktionerne er interne; kun submit_draft må kaldes udefra
revoke execute on function public.draft_choices, public.assert_draft_open, public.assert_draft_valid, public.save_draft
  from public, anon, authenticated;
