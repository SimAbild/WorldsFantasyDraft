// Al kommunikation med Supabase samlet ét sted. Visningerne kender kun disse funktioner.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY, EMAIL_DOMAIN } from "./config.js";

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// Kaster en fejl med databasens danske besked, så visningen kan vise den direkte
function ok({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// ---------- Login ----------
const toEmail = (username) => `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

export async function signIn(username, password) {
  ok(await sb.auth.signInWithPassword({ email: toEmail(username), password }));
}

export async function signUp(username, password) {
  const name = username.trim().toLowerCase();
  const res = ok(await sb.auth.signUp({ email: toEmail(name), password, options: { data: { username: name } } }));
  if (!res.session) throw new Error("Brugeren er oprettet, men e-mailbekræftelse er slået til i Supabase. Bed Simon slå den fra.");
}

export const signOut = () => sb.auth.signOut();

export async function currentUser() {
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}

export async function myProfile(userId) {
  return ok(await sb.from("profile").select("username").eq("user_id", userId).single());
}

// ---------- Turnering ----------
export async function tournament() {
  return ok(await sb.from("tournament").select("id, year").eq("year", new Date().getFullYear()).single());
}

export async function phases(tournamentId) {
  return ok(await sb.from("phase").select("*").eq("tournament_id", tournamentId).order("opens_at"));
}

export async function series(phaseIds) {
  return ok(await sb.from("v_series").select("*").in("phase_id", phaseIds).order("starts_at"));
}

export async function teamStats(tournamentId) {
  return ok(await sb.from("v_team_stats").select("*").eq("tournament_id", tournamentId).order("wins", { ascending: false }));
}

export async function topPlayers(tournamentId, limit = 10) {
  return ok(await sb.from("v_player_stats").select("*").eq("tournament_id", tournamentId)
    .order("avg_score", { ascending: false }).limit(limit));
}

// ---------- Draft ----------
export async function playerCards(phaseId) {
  return ok(await sb.from("v_player_card").select("*").eq("phase_id", phaseId));
}

export async function myTeams(phaseId, userId) {
  return ok(await sb.from("fantasy_team").select("id, slot, name, fantasy_pick(role_code, player_id)")
    .eq("phase_id", phaseId).eq("user_id", userId).order("slot"));
}

export async function submitDraft(phaseId, teams) {
  ok(await sb.rpc("submit_draft", { p_phase_id: phaseId, p_teams: teams }));
}

// ---------- Ligaer og leaderboard ----------
export async function myLeagues() {
  return ok(await sb.from("league").select("id, name, invite_code, owner_id").order("id"));
}

export async function createLeague(name) {
  return ok(await sb.rpc("create_league", { p_name: name }));
}

export async function joinLeague(code) {
  return ok(await sb.rpc("join_league", { p_invite_code: code }));
}

export async function standings(leagueId, at) {
  const args = { p_league_id: leagueId };
  if (at) args.p_at = at;
  return ok(await sb.rpc("league_standings", args));
}

// ---------- Mine hold ----------
export async function myPickPoints(userId) {
  return ok(await sb.from("v_fantasy_pick_points").select("*").eq("user_id", userId));
}

export async function seriesPoints(phaseId, playerIds) {
  if (!playerIds.length) return [];
  return ok(await sb.from("v_series_points").select("series_id, player_id, series_points, games, ended_at")
    .eq("phase_id", phaseId).in("player_id", playerIds).order("ended_at"));
}
