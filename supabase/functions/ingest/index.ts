// Edge Function "ingest": henter Worlds-kampe fra lolesports og gemmer rå stats i databasen.
// Idempotent: alt gemmes på Riots id'er, så funktionen kan køres igen og igen uden dubletter.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const API = "https://esports-api.lolesports.com/persisted/gw";
const FEED = "https://feed.lolesports.com/livestats/v1";
// lolesports.com's egen offentlige webnøgle; kan overskrives med en secret
const KEY = Deno.env.get("LOLESPORTS_API_KEY") ?? "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z";
const WORLDS_LEAGUE = "98767975604431411";
const PHASE: Record<string, string> = {
  "Play-Ins": "play_in", "Swiss": "swiss", "Quarterfinals": "qf", "Semifinals": "sf", "Finals": "final",
};
const ROLE: Record<string, string> = { top: "top", jungle: "jungle", mid: "mid", bottom: "adc", support: "support" };

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const log: string[] = [];

// ---------- HTTP-hjælpere ----------
async function api(path: string) {
  const r = await fetch(`${API}/${path}`, { headers: { "x-api-key": KEY } });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return (await r.json()).data;
}

async function feed(path: string) {
  const r = await fetch(`${FEED}/${path}`);
  if (!r.ok) return null;
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

// Feedet vil have et tidspunkt rundet ned til 10 sekunder
function feedTime(d: Date): string {
  return new Date(Math.floor(d.getTime() / 10000) * 10000).toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

function must<T>(res: { data: T | null; error: unknown }, what: string): T {
  if (res.error) throw new Error(`${what}: ${JSON.stringify(res.error)}`);
  return res.data as T;
}

// ---------- Opslag og oprettelse ----------
async function proTeamId(tournamentId: number, t: { id: string; code: string; name: string }) {
  const row = must(await db.from("pro_team").upsert(
    { esports_team_id: t.id, code: t.code, name: t.name }, { onConflict: "esports_team_id" },
  ).select("id").single(), "pro_team") as { id: number };
  // Holdet skal være med i turneringen; power rank sættes manuelt
  must(await db.from("tournament_team").upsert(
    { tournament_id: tournamentId, pro_team_id: row.id }, { onConflict: "tournament_id,pro_team_id", ignoreDuplicates: true },
  ), "tournament_team");
  return row.id;
}

// Ukendte spillere oprettes som reserver, så deres kampe kan regnes, men de kan ikke vælges i draften
async function playerId(tournamentId: number, teamId: number, meta: { esportsPlayerId: string; summonerName: string; role: string }) {
  // Feedet skriver "C9 Blaber"; holdkoden foran fjernes kun for nye spillere
  const handle = meta.summonerName.trim().split(/\s+/).slice(1).join(" ") || meta.summonerName.trim();
  let row = must(await db.from("player").select("id").eq("esports_player_id", meta.esportsPlayerId)
    .maybeSingle(), "player opslag") as { id: number } | null;
  if (!row) {
    row = must(await db.from("player").insert({ esports_player_id: meta.esportsPlayerId, handle })
      .select("id").single(), "player") as { id: number };
  }
  const existing = must(await db.from("roster").select("player_id").eq("tournament_id", tournamentId)
    .eq("player_id", row.id).maybeSingle(), "roster opslag");
  if (!existing) {
    must(await db.from("roster").insert({
      tournament_id: tournamentId, player_id: row.id, pro_team_id: teamId,
      role_code: ROLE[meta.role] ?? "mid", is_starter: false,
    }), "roster");
    log.push(`Ny spiller oprettet som reserve: ${handle}`);
  }
  return row.id;
}

// ---------- Hent alle events for årets Worlds ----------
async function scheduleEvents(year: number) {
  const events = new Map<string, any>();
  const first = (await api(`getSchedule?hl=en-US&leagueId=${WORLDS_LEAGUE}`)).schedule;
  const add = (evs: any[]) => evs.forEach((e) =>
    e.type === "match" && e.startTime >= `${year}-01-01` && e.startTime < `${year + 1}-01-01` && events.set(e.match.id, e));
  add(first.events);
  for (const dir of ["newer", "older"] as const) {
    let token = first.pages?.[dir];
    while (token) {
      const page = (await api(`getSchedule?hl=en-US&leagueId=${WORLDS_LEAGUE}&pageToken=${token}`)).schedule;
      add(page.events);
      // Ældre sider før årets start er ikke interessante
      if (dir === "older" && page.events.every((e: any) => e.startTime < `${year}-01-01`)) break;
      token = page.pages?.[dir];
    }
  }
  return [...events.values()];
}

// ---------- Slutstats for én kamp fra livestats-feedet ----------
async function ingestGameStats(tournamentId: number, gameRowId: number, esportsGameId: string) {
  const w0 = await feed(`window/${esportsGameId}`);
  if (!w0?.frames?.length) return false;
  const start = new Date(w0.frames[0].rfc460Timestamp);
  const late = new Date(Math.min(start.getTime() + 90 * 60000, Date.now() - 30000));
  const wl = await feed(`window/${esportsGameId}?startingTime=${feedTime(late)}`);
  const dl = await feed(`details/${esportsGameId}?startingTime=${feedTime(late)}`);
  const fw = wl?.frames?.at(-1), fd = dl?.frames?.at(-1);
  if (!fw || !fd || fw.gameState !== "finished") return false;

  const meta = w0.gameMetadata;
  const parts = new Map<number, any>(fd.participants.map((p: any) => [p.participantId, p]));
  for (const side of ["blue", "red"] as const) {
    const tm = meta[`${side}TeamMetadata`];
    const team = fw[`${side}Team`];
    const { data: pt } = await db.from("pro_team").select("id").eq("esports_team_id", tm.esportsTeamId).single();
    if (!pt) { log.push(`Ukendt hold i kamp ${esportsGameId}`); return false; }
    must(await db.from("game_team").upsert({
      game_id: gameRowId, pro_team_id: pt.id, side,
      barons: team.barons, towers: team.towers, inhibitors: team.inhibitors,
    }, { onConflict: "game_id,pro_team_id" }), "game_team");
    // Drager: én række pr. drage, nummereret pr. kamp
    const offset = side === "blue" ? 0 : 50;
    const dragons = (team.dragons as string[]).map((d, i) => ({
      game_id: gameRowId, seq: offset + i + 1, pro_team_id: pt.id, dragon_type: d,
    }));
    if (dragons.length) must(await db.from("game_dragon").upsert(dragons, { onConflict: "game_id,seq" }), "game_dragon");

    for (const pm of tm.participantMetadata) {
      const p = parts.get(pm.participantId);
      const pid = await playerId(tournamentId, pt.id, pm);
      must(await db.from("game_player").upsert({
        game_id: gameRowId, player_id: pid,
        kills: p.kills, deaths: p.deaths, assists: p.assists, creep_score: p.creepScore,
        damage_share: p.championDamageShare, wards_placed: p.wardsPlaced, wards_destroyed: p.wardsDestroyed,
      }, { onConflict: "game_id,player_id" }), "game_player");
    }
  }
  must(await db.from("game").update({
    state: "finished", started_at: start.toISOString(), ended_at: new Date(fw.rfc460Timestamp).toISOString(),
  }).eq("id", gameRowId), "game slut");
  return true;
}

// ---------- Vinder: ud fra seriens gameWins, ikke tårne og guld ----------
async function assignWinners(seriesId: number, wins: Map<number, number>) {
  const games = must(await db.from("game").select("id, game_number, winner_team_id")
    .eq("series_id", seriesId).eq("state", "finished").order("game_number"), "games") as any[];
  const known = new Map<number, number>();
  games.forEach((g) => g.winner_team_id && known.set(g.winner_team_id, (known.get(g.winner_team_id) ?? 0) + 1));
  const open = games.filter((g) => !g.winner_team_id);
  if (!open.length) return;
  const deficit = [...wins].map(([team, w]) => [team, w - (known.get(team) ?? 0)] as const).filter(([, d]) => d > 0);
  // Kun når fordelingen er entydig: én åben kamp, eller alle åbne kampe tilhører samme hold
  if (deficit.length === 1 && deficit[0][1] === open.length) {
    for (const g of open) {
      must(await db.from("game").update({ winner_team_id: deficit[0][0] }).eq("id", g.id), "vinder");
    }
  } else if (deficit.length) {
    // Nødløsning ved flere åbne kampe (fx efter nedetid): flest inhibitors, så flest tårne,
    // men aldrig flere sejre til et hold end seriestillingen tillader
    const left = new Map(deficit);
    for (const g of open) {
      const sides = must(await db.from("game_team").select("pro_team_id, towers, inhibitors").eq("game_id", g.id), "sider") as any[];
      sides.sort((x, y) => (y.inhibitors - x.inhibitors) || (y.towers - x.towers));
      const pick = sides.find((s) => (left.get(s.pro_team_id) ?? 0) > 0);
      if (!pick) continue;
      left.set(pick.pro_team_id, left.get(pick.pro_team_id)! - 1);
      must(await db.from("game").update({ winner_team_id: pick.pro_team_id }).eq("id", g.id), "vinder");
    }
    log.push(`Vinder i serie ${seriesId} sat ud fra tårne og inhibitors`);
  }
}

// ---------- Hovedløb ----------
Deno.serve(async (req) => {
  try {
    // ?year=2025 bruges til at teste mod sidste års data
    const year = Number(new URL(req.url).searchParams.get("year")) || new Date().getUTCFullYear();
    const started = Date.now();
    log.length = 0;
    const tour = must(await db.from("tournament").select("id").eq("year", year).single(), "tournament") as { id: number };
    const phases = must(await db.from("phase").select("id, kind").eq("tournament_id", tour.id), "phases") as any[];
    const phaseId = new Map(phases.map((p) => [p.kind, p.id]));

    const events = await scheduleEvents(year);
    let statsAdded = 0;
    for (const ev of events) {
      // Stop i god tid før funktionens tidsgrænse; næste kørsel tager resten
      if (Date.now() - started > 100000) { log.push("Stoppede efter 100 s, resten tages næste gang"); break; }
      const kind = PHASE[ev.blockName];
      if (!kind || !phaseId.has(kind)) continue;
      const series = must(await db.from("series").upsert({
        phase_id: phaseId.get(kind), esports_match_id: ev.match.id,
        best_of: ev.match.strategy?.count ?? 1, starts_at: ev.startTime,
      }, { onConflict: "esports_match_id" }).select("id").single(), "series") as { id: number };

      const teamsKnown = ev.match.teams.every((t: any) => t.code !== "TBD");
      if (!teamsKnown) continue;
      // Kommende serier: hent kun holdene én gang, så kampprogrammet kan vise dem
      if (ev.state === "unstarted") {
        const { count } = await db.from("series_team").select("series_id", { count: "exact", head: true }).eq("series_id", series.id);
        if (count === 2) continue;
      }

      // Spring færdige serier over, hvor alle vundne kampe allerede har stats og vinder
      if (ev.state === "completed") {
        const total = ev.match.teams.reduce((s: number, t: any) => s + (t.result?.gameWins ?? 0), 0);
        const { count } = await db.from("game").select("id", { count: "exact", head: true })
          .eq("series_id", series.id).eq("state", "finished").not("winner_team_id", "is", null);
        if (count === total && total > 0) continue;
      }

      const det = (await api(`getEventDetails?hl=en-US&id=${ev.match.id}`)).event.match;
      const wins = new Map<number, number>();
      for (const t of det.teams) {
        const tid = await proTeamId(tour.id, t);
        must(await db.from("series_team").upsert({ series_id: series.id, pro_team_id: tid },
          { onConflict: "series_id,pro_team_id", ignoreDuplicates: true }), "series_team");
        wins.set(tid, t.result?.gameWins ?? 0);
      }

      for (const g of det.games) {
        if (g.state !== "completed" && g.state !== "inProgress") continue;
        const row = must(await db.from("game").upsert({
          series_id: series.id, esports_game_id: g.id, game_number: g.number,
        }, { onConflict: "esports_game_id" }).select("id, state").single(), "game") as { id: number; state: string };
        if (row.state === "finished") continue;
        if (g.state === "inProgress") {
          await db.from("game").update({ state: "in_game" }).eq("id", row.id);
          continue;
        }
        if (await ingestGameStats(tour.id, row.id, g.id)) statsAdded++;
      }
      await assignWinners(series.id, wins);
    }
    return Response.json({ ok: true, events: events.length, statsAdded, log });
  } catch (e) {
    return Response.json({ ok: false, error: String(e), log }, { status: 500 });
  }
});
