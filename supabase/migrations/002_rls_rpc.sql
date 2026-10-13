-- Worlds Fantasy: adgangsregler, profiloprettelse, draft-RPC og kort-view.

-- Finalen har ingen pris, men holdet skal stadig være med i fasen
alter table public.team_price alter column tier_code drop not null;

-- ---------- Offentlige data: alle må læse, kun service role skriver ----------
do $$
declare t text;
begin
  foreach t in array array['role','dragon_type','price_tier','metric','calibration','calibration_role',
    'calibration_metric','tournament','phase','pro_team','player','tournament_team','roster','team_price',
    'series','series_team','game','game_team','game_dragon','game_player']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "alle kan laese" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- ---------- Profil oprettes automatisk ved signup ----------
alter table public.profile enable row level security;
create policy "indloggede kan laese profiler" on public.profile for select to authenticated using (true);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Brugernavnet sendes med som metadata ved signup
  insert into public.profile (user_id, username)
  values (new.id, lower(new.raw_user_meta_data ->> 'username'));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Ligaer ----------
alter table public.league enable row level security;
alter table public.league_member enable row level security;

-- Hjælper uden RLS, så politikken på league_member ikke kalder sig selv
create function public.is_league_member(p_league_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.league_member
                 where league_id = p_league_id and user_id = auth.uid());
$$;

create policy "medlemmer ser ligaen" on public.league for select to authenticated
  using (public.is_league_member(id));
create policy "medlemmer ser hinanden" on public.league_member for select to authenticated
  using (public.is_league_member(league_id));
create policy "man kan forlade en liga" on public.league_member for delete to authenticated
  using (user_id = auth.uid());

create function public.create_league(p_name text) returns public.league
language plpgsql security definer set search_path = '' as $$
declare l public.league;
begin
  if auth.uid() is null then raise exception 'Du skal være logget ind'; end if;
  insert into public.league (tournament_id, name, owner_id)
  values ((select id from public.tournament order by year desc limit 1), p_name, auth.uid())
  returning * into l;
  insert into public.league_member (league_id, user_id) values (l.id, auth.uid());
  return l;
end $$;

create function public.join_league(p_invite_code text) returns public.league
language plpgsql security definer set search_path = '' as $$
declare l public.league;
begin
  if auth.uid() is null then raise exception 'Du skal være logget ind'; end if;
  select * into l from public.league where invite_code = lower(trim(p_invite_code));
  if l.id is null then raise exception 'Ukendt invitationskode'; end if;
  insert into public.league_member (league_id, user_id) values (l.id, auth.uid())
  on conflict do nothing;
  return l;
end $$;

-- ---------- Fantasy-hold ----------
alter table public.fantasy_team enable row level security;
alter table public.fantasy_pick enable row level security;

-- Egne hold altid; andres først når fasen er låst
create policy "egne eller laaste hold" on public.fantasy_team for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.phase p where p.id = phase_id and now() >= p.locks_at));
create policy "valg paa synlige hold" on public.fantasy_pick for select to authenticated
  using (exists (select 1 from public.fantasy_team ft where ft.id = fantasy_team_id));

-- Gemmer alle brugerens hold i en fase på én gang og håndhæver reglerne.
-- p_teams: [{"slot":1,"name":"Baron Bandits","picks":[{"role":"top","player_id":12}, ...]}, ...]
create function public.submit_draft(p_phase_id bigint, p_teams jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ph public.phase;
  uid uuid := auth.uid();
  t jsonb;
  team_id bigint;
  bad text;
begin
  if uid is null then raise exception 'Du skal være logget ind'; end if;
  select * into ph from public.phase where id = p_phase_id;
  if ph.id is null then raise exception 'Ukendt fase'; end if;
  if now() < ph.opens_at then raise exception 'Draften er ikke åbnet endnu'; end if;
  if now() >= ph.locks_at then raise exception 'Draften er låst'; end if;
  if jsonb_typeof(p_teams) <> 'array' or jsonb_array_length(p_teams) <> ph.teams_per_user then
    raise exception 'Fasen kræver % hold', ph.teams_per_user;
  end if;

  -- Alle valg fladet ud til én midlertidig tabel
  create temp table _pick on commit drop as
  select (tm ->> 'slot')::smallint as slot, tm ->> 'name' as name,
         pk ->> 'role' as role_code, (pk ->> 'player_id')::bigint as player_id
  from jsonb_array_elements(p_teams) tm, jsonb_array_elements(tm -> 'picks') pk;

  -- Slots skal være 1..teams_per_user, hver med præcis én spiller pr. rolle
  if exists (select 1 from _pick where slot not between 1 and ph.teams_per_user) then
    raise exception 'Ugyldigt holdnummer';
  end if;
  if (select count(distinct slot) from _pick) <> ph.teams_per_user
     or exists (select 1 from _pick group by slot having count(*) <> 5 or count(distinct role_code) <> 5) then
    raise exception 'Hvert hold skal have præcis én spiller pr. rolle';
  end if;

  -- Samme spiller må ikke gå igen, heller ikke på tværs af Swiss-holdene
  if (select count(*) from _pick) <> (select count(distinct player_id) from _pick) then
    raise exception 'En spiller kan kun vælges én gang';
  end if;

  -- Spilleren skal stå i roster med den rolle og hans hold skal være med i fasen
  select string_agg(coalesce(pl.handle, p.player_id::text), ', ') into bad
  from _pick p
  left join public.roster r on r.player_id = p.player_id and r.tournament_id = ph.tournament_id
  left join public.team_price tp on tp.phase_id = ph.id and tp.pro_team_id = r.pro_team_id
  left join public.player pl on pl.id = p.player_id
  where r.player_id is null or r.role_code <> p.role_code or tp.phase_id is null;
  if bad is not null then raise exception 'Ugyldige valg: %', bad; end if;

  -- Budget pr. hold
  if ph.budget is not null then
    select string_agg(slot::text, ', ') into bad from (
      select p.slot from _pick p
      join public.roster r on r.player_id = p.player_id and r.tournament_id = ph.tournament_id
      join public.team_price tp on tp.phase_id = ph.id and tp.pro_team_id = r.pro_team_id
      join public.price_tier pt on pt.code = tp.tier_code
      group by p.slot having sum(pt.price) > ph.budget) x;
    if bad is not null then raise exception 'Hold % er over budget på %', bad, ph.budget; end if;
  end if;

  -- Højst max_per_team fra samme prohold, talt på tværs af alle brugerens hold i fasen
  if ph.max_per_team is not null then
    select string_agg(pt.code, ', ') into bad from (
      select r.pro_team_id from _pick p
      join public.roster r on r.player_id = p.player_id and r.tournament_id = ph.tournament_id
      group by r.pro_team_id having count(*) > ph.max_per_team) x
    join public.pro_team pt on pt.id = x.pro_team_id;
    if bad is not null then
      raise exception 'Højst % spillere fra samme hold: %', ph.max_per_team, bad;
    end if;
  end if;

  -- Gem: holdet opdateres, valgene erstattes
  for t in select * from jsonb_array_elements(p_teams) loop
    insert into public.fantasy_team (user_id, phase_id, slot, name, submitted_at)
    values (uid, ph.id, (t ->> 'slot')::smallint, coalesce(nullif(trim(t ->> 'name'), ''), 'Mit hold'), now())
    on conflict (user_id, phase_id, slot)
      do update set name = excluded.name, submitted_at = excluded.submitted_at
    returning id into team_id;
    insert into public.fantasy_pick (fantasy_team_id, role_code, player_id)
    select team_id, role_code, player_id from _pick where slot = (t ->> 'slot')::smallint
    on conflict (fantasy_team_id, role_code) do update set player_id = excluded.player_id;
  end loop;
end $$;

-- Kun indloggede må kalde RPC'erne
revoke execute on function public.submit_draft, public.create_league, public.join_league from public, anon;
grant execute on function public.submit_draft, public.create_league, public.join_league to authenticated;
revoke execute on function public.handle_new_user from public, anon, authenticated;
-- RLS-politikkerne kalder is_league_member som den indloggede bruger
revoke execute on function public.is_league_member from public, anon;
grant execute on function public.is_league_member to authenticated;

-- ---------- Kort til draften: én række pr. spiller pr. fase ----------
create view public.v_player_card with (security_invoker = true) as
select ph.id as phase_id, ph.kind as phase_kind,
       pl.id as player_id, pl.handle, r.role_code, ro.sort_order as role_order,
       t.id as pro_team_id, t.code as team_code, t.name as team_name, t.region,
       tt.power_rank, tp.tier_code, pt.price
from public.phase ph
join public.team_price tp on tp.phase_id = ph.id
join public.pro_team t on t.id = tp.pro_team_id
join public.tournament_team tt on tt.tournament_id = ph.tournament_id and tt.pro_team_id = t.id
join public.roster r on r.tournament_id = ph.tournament_id and r.pro_team_id = t.id
join public.player pl on pl.id = r.player_id
join public.role ro on ro.code = r.role_code
left join public.price_tier pt on pt.code = tp.tier_code;
