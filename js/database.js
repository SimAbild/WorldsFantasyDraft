// Ansvar: Al kommunikation med databasen (Supabase). Siderne kender kun disse funktioner, aldrig databasen direkte.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY, EMAIL_DOMAIN } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Kaster databasens (danske) fejlbesked videre, så visningen kan vise den direkte
function dataOrThrow({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// ---------- Login ----------
const usernameToEmail = (username) => `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

export async function signIn(username, password) {
  dataOrThrow(await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password }));
}

export async function signUp(username, password) {
  const normalizedUsername = username.trim().toLowerCase();
  const result = dataOrThrow(await supabase.auth.signUp({
    email: usernameToEmail(normalizedUsername), password, options: { data: { username: normalizedUsername } },
  }));
  if (!result.session) throw new Error("Brugeren er oprettet, men e-mailbekræftelse er slået til i Supabase. Bed Simon slå den fra.");
}

export const signOut = () => supabase.auth.signOut();

export async function fetchCurrentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

export async function fetchProfile(userId) {
  return dataOrThrow(await supabase.from("profile").select("username").eq("user_id", userId).single());
}

// ---------- Turnering ----------
export async function fetchCurrentTournament() {
  return dataOrThrow(await supabase.from("tournament").select("id, year").eq("year", new Date().getFullYear()).single());
}

export async function fetchPhases(tournamentId) {
  return dataOrThrow(await supabase.from("phase").select("*").eq("tournament_id", tournamentId).order("opens_at"));
}

export async function fetchSeriesRows(phaseIds) {
  return dataOrThrow(await supabase.from("v_series").select("*").in("phase_id", phaseIds).order("starts_at"));
}

export async function fetchTeamStats(tournamentId) {
  return dataOrThrow(await supabase.from("v_team_stats").select("*").eq("tournament_id", tournamentId)
    .order("wins", { ascending: false }));
}

export async function fetchTopPlayers(tournamentId, limit = 10) {
  return dataOrThrow(await supabase.from("v_player_stats").select("*").eq("tournament_id", tournamentId)
    .order("avg_score", { ascending: false }).limit(limit));
}

// ---------- Draft ----------
export async function fetchPlayerCards(phaseId) {
  return dataOrThrow(await supabase.from("v_player_card").select("*").eq("phase_id", phaseId));
}

export async function fetchMyTeams(phaseId, userId) {
  return dataOrThrow(await supabase.from("fantasy_team").select("id, slot, name, fantasy_pick(role_code, player_id)")
    .eq("phase_id", phaseId).eq("user_id", userId).order("slot"));
}

export async function submitDraft(phaseId, teams) {
  dataOrThrow(await supabase.rpc("submit_draft", { p_phase_id: phaseId, p_teams: teams }));
}

// ---------- Leaderboard ----------
// Stillingen for alle brugere. Uden tidspunkt gives stillingen lige nu.
export async function fetchStandings(at) {
  return dataOrThrow(await supabase.rpc("standings", at ? { p_at: at } : {}));
}

// ---------- Hold og point ----------
// Andre brugeres hold kan kun læses, når fasen er låst (RLS)
export async function fetchPickPoints(userId) {
  return dataOrThrow(await supabase.from("v_fantasy_pick_points").select("*").eq("user_id", userId));
}

export async function fetchSeriesPoints(phaseId, playerIds) {
  if (!playerIds.length) return [];
  return dataOrThrow(await supabase.from("v_series_points").select("series_id, player_id, series_points, games, ended_at")
    .eq("phase_id", phaseId).in("player_id", playerIds).order("ended_at"));
}
