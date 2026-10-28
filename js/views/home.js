// Ansvar: Forsiden – Worlds-status med kampprogram, stilling, holdstats og bedste spillere
import * as database from "../database.js";
import { escapeHtml, formatDay, formatTime, PHASE_NAME, ROLE_NAME, emptyBox } from "../shared/displayText.js";
import { avatar } from "../shared/playerCard.js";
import { currentPhase } from "../domain/phase.js";
import { groupSeriesRows, phaseRecords, recentAndUpcomingSeries, isSeriesWinner } from "../domain/series.js";

export async function render(pageElement, appData) {
  const { tournament, phases } = appData;
  const [seriesRows, teamStats, topPlayers] = await Promise.all([
    database.fetchSeriesRows(phases.map((phase) => phase.id)),
    database.fetchTeamStats(tournament.id),
    database.fetchTopPlayers(tournament.id),
  ]);
  const allSeries = groupSeriesRows(seriesRows);
  const activePhase = currentPhase(phases);
  const standingsPhase = phaseWithResults(phases, allSeries, activePhase);
  const phaseNameById = new Map(phases.map((phase) => [phase.id, PHASE_NAME[phase.kind]]));

  pageElement.innerHTML = [
    pageTitleHtml(tournament, activePhase, allSeries.find((series) => !series.isDecided)),
    scheduleHtml(recentAndUpcomingSeries(allSeries), phaseNameById),
    `<div class="two-columns">${standingsHtml(standingsPhase, allSeries)}${teamStatsHtml(teamStats)}</div>`,
    topPlayersHtml(topPlayers),
  ].join("");
}

// Stillingen vises for den aktuelle fase, når den har resultater; ellers for den seneste fase med resultater
function phaseWithResults(phases, allSeries, activePhase) {
  const hasResults = (candidate) => allSeries.some((series) => series.phaseId === candidate.id && series.isDecided);
  return hasResults(activePhase) ? activePhase : phases.findLast(hasResults) ?? activePhase;
}

function pageTitleHtml(tournament, activePhase, nextSeries) {
  const nextText = nextSeries
    ? `Næste kamp: ${escapeHtml(nextSeries.teams.map((team) => team.code).join(" mod "))} ${formatDay(nextSeries.startsAt)} kl. ${formatTime(nextSeries.startsAt)}`
    : "Ingen kommende kampe med kendte hold.";
  return `<div class="hero">
    <div class="stage">Worlds ${tournament.year} · ${PHASE_NAME[activePhase.kind]}</div>
    <h1>${PHASE_NAME[activePhase.kind]}</h1>
    <p class="muted">${nextText}</p>
  </div>`;
}

// ---------- Kampprogram ----------
function scheduleHtml(seriesList, phaseNameById) {
  const matchesOrEmptyHtml = seriesList.length
    ? `<div class="matches">${seriesList.map((series) => matchCardHtml(series, phaseNameById.get(series.phaseId))).join("")}</div>`
    : emptyBox("Kampene vises her, når holdene er kendt.");
  return `<div class="panel"><h3>Kampprogram · dansk tid</h3>${matchesOrEmptyHtml}</div>`;
}

function matchCardHtml(series, phaseName) {
  const showScore = series.isDecided || series.isLive;
  const teamRowHtml = (team) => `<div class="match-team ${series.isDecided && !isSeriesWinner(series, team) ? "loser" : ""}">
    <span>${escapeHtml(team.code)}</span><span class="number">${showScore ? team.wins : "–"}</span></div>`;
  return `<div class="match">
    <small>${formatDay(series.startsAt)} · ${phaseName}</small>
    <small class="${series.isLive ? "live" : ""}">${seriesStatusText(series)}</small>
    ${series.teams.map(teamRowHtml).join("")}
  </div>`;
}

// Fx "Færdig · Bo3", "● Live · Bo3" eller "18:00 · Bo3"
function seriesStatusText(series) {
  if (series.isDecided) return `Færdig · Bo${series.bestOf}`;
  if (series.isLive) return `● Live · Bo${series.bestOf}`;
  return `${formatTime(series.startsAt)} · Bo${series.bestOf}`;
}

// ---------- Stilling ----------
function standingsHtml(phase, allSeries) {
  const records = phaseRecords(allSeries.filter((series) => series.phaseId === phase.id));
  const tableOrEmptyHtml = records.length
    ? `<div class="table-scroll"><table><tr><th>Hold</th><th class="right">Record</th></tr>${records.map((record) => recordRowHtml(phase, record)).join("")}</table></div>`
    : emptyBox("Ingen afgjorte serier endnu.");
  return `<div class="panel"><h3>Stilling · ${PHASE_NAME[phase.kind]}</h3>${tableOrEmptyHtml}</div>`;
}

function recordRowHtml(phase, record) {
  return `<tr><td class="team">${escapeHtml(record.name)}</td><td class="right"><span class="record ${swissRecordClass(phase, record)}">${record.wins}-${record.losses}</span></td></tr>`;
}

// I Swiss går man videre ved 3 sejre og ryger ud ved 3 nederlag
function swissRecordClass(phase, record) {
  if (phase.kind !== "swiss") return "";
  if (record.wins === 3) return "qualified";
  if (record.losses === 3) return "eliminated";
  return "";
}

// ---------- Holdstats ----------
function teamStatsHtml(teamStats) {
  const tableOrEmptyHtml = teamStats.length
    ? `<div class="table-scroll"><table><tr><th>Hold</th><th class="right">Kampe</th><th class="right">Sejre</th><th class="right">Kills</th><th class="right">Drager</th><th class="right">Baroner</th><th class="right">Tårne</th></tr>${teamStats.map(teamStatsRowHtml).join("")}</table></div>`
    : emptyBox("Stats kommer efter første kamp.");
  return `<div class="panel"><h3>Holdstats pr. kamp</h3>${tableOrEmptyHtml}</div>`;
}

function teamStatsRowHtml(team) {
  return `<tr><td class="team">${escapeHtml(team.team_code)}</td><td class="right number">${team.games}</td><td class="right number">${team.wins}</td>`
    + `<td class="right number">${team.kills}</td><td class="right number">${team.dragons}</td><td class="right number">${team.barons}</td><td class="right number">${team.towers}</td></tr>`;
}

// ---------- Bedste spillere ----------
function topPlayersHtml(players) {
  const tableOrEmptyHtml = players.length
    ? `<div class="table-scroll"><table><tr><th>Spiller</th><th>Hold</th><th>Rolle</th><th class="right">Kampe</th><th class="right">KDA</th><th class="right">MVP/ACE</th><th class="right">Point/kamp</th></tr>${players.map(topPlayerRowHtml).join("")}</table></div>`
    : emptyBox("Point kommer efter første kamp.");
  return `<div class="panel"><h3>Bedste spillere (fantasy-point pr. kamp)</h3>${tableOrEmptyHtml}</div>`;
}

function topPlayerRowHtml(player) {
  return `<tr><td class="team"><span class="player-identity">${avatar(player.handle, player.image_url)}${escapeHtml(player.handle)}</span></td>`
    + `<td>${escapeHtml(player.team_code)}</td><td class="muted">${ROLE_NAME[player.role_code]}</td><td class="right number">${player.games}</td>`
    + `<td class="right number">${player.kills}/${player.deaths}/${player.assists}</td><td class="right number">${player.titles}</td><td class="right number">${player.avg_score}</td></tr>`;
}
