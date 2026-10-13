-- Ansvar: Fjerner ligaerne. Alle brugere er nu på samme leaderboard via standings().
-- Køres først, når frontenden uden ligaer er på main.

drop function if exists public.league_standings(bigint, timestamptz);
drop function if exists public.create_league(text);
drop function if exists public.join_league(text);

-- Politikkerne på league og league_member bruger is_league_member, så tabellerne fjernes før funktionen
drop table if exists public.league_member;
drop table if exists public.league;
drop function if exists public.is_league_member(bigint);
