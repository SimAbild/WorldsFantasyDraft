// Ansvar: Henter Worlds-kampe fra lolesports og gemmer rå stats i databasen.
// Idempotent: alt gemmes på Riots id'er, så funktionen kan køres igen og igen uden dubletter.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// ---------- Konstanter ----------
const ESPORTS_API = "https://esports-api.lolesports.com/persisted/gw";
const LIVESTATS_FEED = "https://feed.lolesports.com/livestats/v1";
// lolesports.com's egen offentlige webnøgle; kan overskrives med en secret
const API_KEY = Deno.env.get("LOLESPORTS_API_KEY") ?? "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z";
const WORLDS_LEAGUE_ID = "98767975604431411";
const PHASE_BY_BLOCK: Record<string, string> = {
  "Play-Ins": "play_in", "Swiss": "swiss", "Quarterfinals": "qf", "Semifinals": "sf", "Finals": "final",
};
const ROLE_BY_FEED_ROLE: Record<string, string> = { top: "top", jungle: "jungle", mid: "mid", bottom: "adc", support: "support" };
const FINAL_FRAME_OFFSET_MINUTES = 90;   // sidste frame hentes 90 min efter kampstart (eller nu, hvis det er tidligere)
const FEED_SAFETY_MARGIN_MS = 30_000;    // feedet har ikke data helt op til "nu"
const FEED_TIME_ROUNDING_MS = 10_000;        // feedet vil have tider rundet ned til 10 sekunder
const RUN_TIME_BUDGET_MS = 100_000;      // stop i god tid før Edge Functions' tidsgrænse
const RED_SIDE_DRAGON_OFFSET = 50;       // drager nummereres pr. kamp: blå 1.., rød 51..

const database = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const runLog: string[] = [];

type SeriesTeamWins = Map<number, number>;

// ---------- HTTP og database ----------
async function fetchEsportsApi(path: string) {
  const response = await fetch(`${ESPORTS_API}/${path}`, { headers: { "x-api-key": API_KEY } });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return (await response.json()).data;
}

async function fetchFeed(path: string) {
  const response = await fetch(`${LIVESTATS_FEED}/${path}`);
  if (!response.ok) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function feedTimestamp(date: Date): string {
  const rounded = Math.floor(date.getTime() / FEED_TIME_ROUNDING_MS) * FEED_TIME_ROUNDING_MS;
  return new Date(rounded).toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

// Kaster databasens fejl videre med en beskrivelse af, hvad der blev forsøgt
function dataOrThrow<T>(result: { data: T | null; error: unknown }, action: string): T {
  if (result.error) throw new Error(`${action}: ${JSON.stringify(result.error)}`);
  return result.data as T;
}

// ---------- Hold og spillere ----------
async function upsertProTeam(tournamentId: number, team: { id: string; code: string; name: string }) {
  const row = dataOrThrow(await database.from("pro_team").upsert(
    { esports_team_id: team.id, code: team.code, name: team.name }, { onConflict: "esports_team_id" },
  ).select("id").single(), "pro_team") as { id: number };
  // Holdet skal være med i turneringen; power rank sættes manuelt
  dataOrThrow(await database.from("tournament_team").upsert(
    { tournament_id: tournamentId, pro_team_id: row.id },
    { onConflict: "tournament_id,pro_team_id", ignoreDuplicates: true },
  ), "tournament_team");
  return row.id;
}

// Ukendte spillere oprettes som reserver, så deres kampe kan regnes, men de kan ikke vælges i draften
async function findOrCreatePlayer(tournamentId: number, proTeamId: number, metadata: { esportsPlayerId: string; summonerName: string; role: string }) {
  const handle = handleWithoutTeamCode(metadata.summonerName);
  let player = dataOrThrow(await database.from("player").select("id").eq("esports_player_id", metadata.esportsPlayerId)
    .maybeSingle(), "player opslag") as { id: number } | null;
  if (!player) {
    player = dataOrThrow(await database.from("player").insert({ esports_player_id: metadata.esportsPlayerId, handle })
      .select("id").single(), "player") as { id: number };
  }
  const rosterEntry = dataOrThrow(await database.from("roster").select("player_id").eq("tournament_id", tournamentId)
    .eq("player_id", player.id).maybeSingle(), "roster opslag");
  if (!rosterEntry) {
    dataOrThrow(await database.from("roster").insert({
      tournament_id: tournamentId, player_id: player.id, pro_team_id: proTeamId,
      role_code: ROLE_BY_FEED_ROLE[metadata.role] ?? "mid", is_starter: false,
    }), "roster");
    runLog.push(`Ny spiller oprettet som reserve: ${handle}`);
  }
  return player.id;
}

// Feedet skriver "C9 Blaber"; holdkoden foran fjernes
function handleWithoutTeamCode(summonerName: string) {
  const words = summonerName.trim().split(/\s+/);
  return words.length > 1 ? words.slice(1).join(" ") : words[0];
}

// ---------- Kampprogram ----------
async function fetchScheduleEvents(year: number) {
  const eventsById = new Map<string, any>();
  const isMatchInYear = (event: any) =>
    event.type === "match" && event.startTime >= `${year}-01-01` && event.startTime < `${year + 1}-01-01`;
  const addEvents = (events: any[]) => events.filter(isMatchInYear).forEach((event) => eventsById.set(event.match.id, event));

  const firstPage = (await fetchEsportsApi(`getSchedule?hl=en-US&leagueId=${WORLDS_LEAGUE_ID}`)).schedule;
  addEvents(firstPage.events);
  for (const direction of ["newer", "older"] as const) {
    let pageToken = firstPage.pages?.[direction];
    while (pageToken) {
      const page = (await fetchEsportsApi(`getSchedule?hl=en-US&leagueId=${WORLDS_LEAGUE_ID}&pageToken=${pageToken}`)).schedule;
      addEvents(page.events);
      // Ældre sider før årets start er ikke interessante
      if (direction === "older" && page.events.every((event: any) => event.startTime < `${year}-01-01`)) break;
      pageToken = page.pages?.[direction];
    }
  }
  return [...eventsById.values()];
}

async function upsertSeries(phaseId: number, event: any) {
  return dataOrThrow(await database.from("series").upsert({
    phase_id: phaseId, esports_match_id: event.match.id,
    best_of: event.match.strategy?.count ?? 1, starts_at: event.startTime,
  }, { onConflict: "esports_match_id" }).select("id").single(), "series") as { id: number };
}

// Detaljer hentes kun, når der er noget nyt: hold mangler, kampe er i gang, eller stats/vinder mangler
async function hasNewInformation(event: any, seriesId: number) {
  if (event.match.teams.some((team: any) => team.code === "TBD")) return false;
  if (event.state === "unstarted") {
    const { count } = await database.from("series_team").select("series_id", { count: "exact", head: true }).eq("series_id", seriesId);
    return count !== 2;
  }
  if (event.state === "completed") {
    const playedGames = event.match.teams.reduce((sum: number, team: any) => sum + (team.result?.gameWins ?? 0), 0);
    const { count } = await database.from("game").select("id", { count: "exact", head: true })
      .eq("series_id", seriesId).eq("state", "finished").not("winner_team_id", "is", null);
    return !(playedGames > 0 && count === playedGames);
  }
  return true;
}

async function syncSeriesTeams(tournamentId: number, seriesId: number, teams: any[]): Promise<SeriesTeamWins> {
  const winsByTeam: SeriesTeamWins = new Map();
  for (const team of teams) {
    const proTeamId = await upsertProTeam(tournamentId, team);
    dataOrThrow(await database.from("series_team").upsert({ series_id: seriesId, pro_team_id: proTeamId },
      { onConflict: "series_id,pro_team_id", ignoreDuplicates: true }), "series_team");
    winsByTeam.set(proTeamId, team.result?.gameWins ?? 0);
  }
  return winsByTeam;
}

// Returnerer antallet af kampe, der fik stats i denne kørsel
async function syncGames(tournamentId: number, seriesId: number, games: any[]) {
  let statsAdded = 0;
  for (const game of games.filter((item) => item.state === "completed" || item.state === "inProgress")) {
    const row = dataOrThrow(await database.from("game").upsert({
      series_id: seriesId, esports_game_id: game.id, game_number: game.number,
    }, { onConflict: "esports_game_id" }).select("id, state").single(), "game") as { id: number; state: string };
    if (row.state === "finished") continue;
    if (game.state === "inProgress") {
      await database.from("game").update({ state: "in_game" }).eq("id", row.id);
    } else if (await saveFinalStats(tournamentId, row.id, game.id)) {
      statsAdded++;
    }
  }
  return statsAdded;
}

// ---------- Slutstats fra livestats-feedet ----------
async function fetchFinalFrames(esportsGameId: string) {
  const firstWindow = await fetchFeed(`window/${esportsGameId}`);
  if (!firstWindow?.frames?.length) return null;
  const startedAt = new Date(firstWindow.frames[0].rfc460Timestamp);
  const finalTime = new Date(Math.min(startedAt.getTime() + FINAL_FRAME_OFFSET_MINUTES * 60_000, Date.now() - FEED_SAFETY_MARGIN_MS));
  const [lastWindow, lastDetails] = await Promise.all([
    fetchFeed(`window/${esportsGameId}?startingTime=${feedTimestamp(finalTime)}`),
    fetchFeed(`details/${esportsGameId}?startingTime=${feedTimestamp(finalTime)}`),
  ]);
  const windowFrame = lastWindow?.frames?.at(-1);
  const detailsFrame = lastDetails?.frames?.at(-1);
  if (!windowFrame || !detailsFrame || windowFrame.gameState !== "finished") return null;
  return { metadata: firstWindow.gameMetadata, startedAt, windowFrame, detailsFrame };
}

async function saveFinalStats(tournamentId: number, gameRowId: number, esportsGameId: string) {
  const frames = await fetchFinalFrames(esportsGameId);
  if (!frames) return false;
  const participants = new Map<number, any>(frames.detailsFrame.participants.map((participant: any) => [participant.participantId, participant]));
  for (const side of ["blue", "red"] as const) {
    const saved = await saveTeamSide(tournamentId, gameRowId, side, frames.metadata[`${side}TeamMetadata`], frames.windowFrame[`${side}Team`], participants);
    if (!saved) {
      runLog.push(`Ukendt hold i kamp ${esportsGameId}`);
      return false;
    }
  }
  dataOrThrow(await database.from("game").update({
    state: "finished", started_at: frames.startedAt.toISOString(), ended_at: new Date(frames.windowFrame.rfc460Timestamp).toISOString(),
  }).eq("id", gameRowId), "game slut");
  return true;
}

async function saveTeamSide(tournamentId: number, gameRowId: number, side: "blue" | "red", teamMetadata: any, teamFrame: any, participants: Map<number, any>) {
  const { data: proTeam } = await database.from("pro_team").select("id").eq("esports_team_id", teamMetadata.esportsTeamId).single();
  if (!proTeam) return false;
  dataOrThrow(await database.from("game_team").upsert({
    game_id: gameRowId, pro_team_id: proTeam.id, side,
    barons: teamFrame.barons, towers: teamFrame.towers, inhibitors: teamFrame.inhibitors,
  }, { onConflict: "game_id,pro_team_id" }), "game_team");
  await saveDragons(gameRowId, proTeam.id, side, teamFrame.dragons);
  for (const playerMetadata of teamMetadata.participantMetadata) {
    await savePlayerStats(tournamentId, gameRowId, proTeam.id, playerMetadata, participants.get(playerMetadata.participantId));
  }
  return true;
}

// Én række pr. drage (1NF), nummereret pr. kamp
async function saveDragons(gameRowId: number, proTeamId: number, side: "blue" | "red", dragonTypes: string[]) {
  if (!dragonTypes.length) return;
  const offset = side === "blue" ? 0 : RED_SIDE_DRAGON_OFFSET;
  const rows = dragonTypes.map((dragonType, index) => ({
    game_id: gameRowId, seq: offset + index + 1, pro_team_id: proTeamId, dragon_type: dragonType,
  }));
  dataOrThrow(await database.from("game_dragon").upsert(rows, { onConflict: "game_id,seq" }), "game_dragon");
}

async function savePlayerStats(tournamentId: number, gameRowId: number, proTeamId: number, playerMetadata: any, stats: any) {
  const playerId = await findOrCreatePlayer(tournamentId, proTeamId, playerMetadata);
  dataOrThrow(await database.from("game_player").upsert({
    game_id: gameRowId, player_id: playerId,
    kills: stats.kills, deaths: stats.deaths, assists: stats.assists, creep_score: stats.creepScore,
    damage_share: stats.championDamageShare, wards_placed: stats.wardsPlaced, wards_destroyed: stats.wardsDestroyed,
  }, { onConflict: "game_id,player_id" }), "game_player");
}

// ---------- Vinder ----------
// Vinderen udledes af seriens stilling (gameWins), ikke af tårne og guld
async function assignWinners(seriesId: number, winsByTeam: SeriesTeamWins) {
  const games = dataOrThrow(await database.from("game").select("id, winner_team_id")
    .eq("series_id", seriesId).eq("state", "finished").order("game_number"), "games") as any[];
  const openGames = games.filter((game) => !game.winner_team_id);
  if (!openGames.length) return;
  const missingWins = missingWinsByTeam(games, winsByTeam);
  if (!missingWins.size) return;
  const [onlyTeam] = [...missingWins.keys()];
  if (missingWins.size === 1 && missingWins.get(onlyTeam) === openGames.length) {
    for (const game of openGames) await setWinner(game.id, onlyTeam);
  } else {
    await assignByObjectives(openGames, missingWins);
    runLog.push(`Vinder i serie ${seriesId} sat ud fra tårne og inhibitors`);
  }
}

// Hvor mange sejre hvert hold mangler i databasen i forhold til seriestillingen
function missingWinsByTeam(games: any[], winsByTeam: SeriesTeamWins) {
  const recorded = new Map<number, number>();
  games.forEach((game) => game.winner_team_id && recorded.set(game.winner_team_id, (recorded.get(game.winner_team_id) ?? 0) + 1));
  const missing = new Map<number, number>();
  winsByTeam.forEach((wins, teamId) => {
    const gap = wins - (recorded.get(teamId) ?? 0);
    if (gap > 0) missing.set(teamId, gap);
  });
  return missing;
}

// Nødløsning ved flere åbne kampe (fx efter nedetid): flest inhibitors, så flest tårne,
// men aldrig flere sejre til et hold end seriestillingen tillader
async function assignByObjectives(openGames: any[], missingWins: Map<number, number>) {
  for (const game of openGames) {
    const sides = dataOrThrow(await database.from("game_team").select("pro_team_id, towers, inhibitors").eq("game_id", game.id), "sider") as any[];
    sides.sort((a, b) => (b.inhibitors - a.inhibitors) || (b.towers - a.towers));
    const winner = sides.find((side) => (missingWins.get(side.pro_team_id) ?? 0) > 0);
    if (!winner) continue;
    missingWins.set(winner.pro_team_id, missingWins.get(winner.pro_team_id)! - 1);
    await setWinner(game.id, winner.pro_team_id);
  }
}

async function setWinner(gameId: number, proTeamId: number) {
  dataOrThrow(await database.from("game").update({ winner_team_id: proTeamId }).eq("id", gameId), "vinder");
}

// ---------- Hovedløb ----------
async function ingestEvent(tournamentId: number, phaseIdByKind: Map<string, number>, event: any) {
  const phaseKind = PHASE_BY_BLOCK[event.blockName];
  if (!phaseKind || !phaseIdByKind.has(phaseKind)) return 0;
  const series = await upsertSeries(phaseIdByKind.get(phaseKind)!, event);
  if (!(await hasNewInformation(event, series.id))) return 0;
  const details = (await fetchEsportsApi(`getEventDetails?hl=en-US&id=${event.match.id}`)).event.match;
  const winsByTeam = await syncSeriesTeams(tournamentId, series.id, details.teams);
  const statsAdded = await syncGames(tournamentId, series.id, details.games);
  await assignWinners(series.id, winsByTeam);
  return statsAdded;
}

async function loadTournament(year: number) {
  const tournament = dataOrThrow(await database.from("tournament").select("id").eq("year", year).single(), "tournament") as { id: number };
  const phases = dataOrThrow(await database.from("phase").select("id, kind").eq("tournament_id", tournament.id), "phases") as any[];
  return { tournamentId: tournament.id, phaseIdByKind: new Map(phases.map((phase) => [phase.kind, phase.id])) };
}

Deno.serve(async (request) => {
  const startedAt = Date.now();
  runLog.length = 0;
  try {
    // ?year=2025 bruges til at teste mod sidste års data
    const year = Number(new URL(request.url).searchParams.get("year")) || new Date().getUTCFullYear();
    const { tournamentId, phaseIdByKind } = await loadTournament(year);
    const events = await fetchScheduleEvents(year);
    let statsAdded = 0;
    for (const event of events) {
      if (Date.now() - startedAt > RUN_TIME_BUDGET_MS) {
        runLog.push("Stoppede for at holde tidsgrænsen; resten tages næste gang");
        break;
      }
      statsAdded += await ingestEvent(tournamentId, phaseIdByKind, event);
    }
    return Response.json({ ok: true, events: events.length, statsAdded, log: runLog });
  } catch (error) {
    return Response.json({ ok: false, error: String(error), log: runLog }, { status: 500 });
  }
});
