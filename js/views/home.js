// Ansvar: Forsiden – Worlds-status med kampprogram, stilling, holdstats og bedste spillere
import * as api from "../api.js";
import { escapeHtml, formatDay, formatTime, PHASE_NAME, ROLE_NAME, emptyBox } from "../ui.js";
import { currentPhase } from "../domain/phase.js";
import { groupSeriesRows, phaseRecords, scheduleWindow, isSeriesWinner } from "../domain/series.js";

export async function render(root, context) {
  const { tournament, phases } = context;
  const [seriesRows, teamStats, topPlayers] = await Promise.all([
    api.fetchSeriesRows(phases.map((phase) => phase.id)),
    api.fetchTeamStats(tournament.id),
    api.fetchTopPlayers(tournament.id),
  ]);
  const allSeries = groupSeriesRows(seriesRows);
  const phase = currentPhase(phases);
  const standingsPhase = phaseWithResults(phases, allSeries, phase);
  const phaseNameById = new Map(phases.map((item) => [item.id, PHASE_NAME[item.kind]]));

  root.innerHTML = [
    heroHtml(tournament, phase, allSeries.find((series) => !series.isDecided)),
    scheduleHtml(scheduleWindow(allSeries), phaseNameById),
    `<div class="cols">${standingsHtml(standingsPhase, allSeries)}${teamStatsHtml(teamStats)}</div>`,
    topPlayersHtml(topPlayers),
  ].join("");
}

// Stillingen vises for den aktuelle fase, når den har resultater; ellers for den seneste fase med resultater
function phaseWithResults(phases, allSeries, phase) {
  const hasResults = (candidate) => allSeries.some((series) => series.phaseId === candidate.id && series.isDecided);
  return hasResults(phase) ? phase : phases.findLast(hasResults) ?? phase;
}

function heroHtml(tournament, phase, nextSeries) {
  const nextText = nextSeries
    ? `Næste kamp: ${escapeHtml(nextSeries.teams.map((team) => team.code).join(" mod "))} ${formatDay(nextSeries.startsAt)} kl. ${formatTime(nextSeries.startsAt)}`
    : "Ingen kommende kampe med kendte hold.";
  return `<div class="hero">
    <div class="stage">Worlds ${tournament.year} · ${PHASE_NAME[phase.kind]}</div>
    <h1>${PHASE_NAME[phase.kind]}</h1>
    <p class="muted">${nextText}</p>
  </div>`;
}

function scheduleHtml(seriesList, phaseNameById) {
  const body = seriesList.length
    ? `<div class="matches">${seriesList.map((series) => matchCardHtml(series, phaseNameById.get(series.phaseId))).join("")}</div>`
    : emptyBox("Kampene vises her, når holdene er kendt.");
  return `<div class="panel"><h3>Kampprogram · dansk tid</h3>${body}</div>`;
}

function matchCardHtml(series, phaseName) {
  const status = series.isDecided ? `Færdig · Bo${series.bestOf}`
    : series.isLive ? `● Live · Bo${series.bestOf}`
    : `${formatTime(series.startsAt)} · Bo${series.bestOf}`;
  const showScore = series.isDecided || series.isLive;
  const teamRow = (team) => `<div class="row2 ${series.isDecided && !isSeriesWinner(series, team) ? "l" : ""}">
    <span>${escapeHtml(team.code)}</span><span class="num">${showScore ? team.wins : "–"}</span></div>`;
  return `<div class="match">
    <small>${formatDay(series.startsAt)} · ${phaseName}</small>
    <small class="${series.isLive ? "live" : ""}">${status}</small>
    ${series.teams.map(teamRow).join("")}
  </div>`;
}

function standingsHtml(phase, allSeries) {
  const records = phaseRecords(allSeries.filter((series) => series.phaseId === phase.id));
  // I Swiss går man videre ved 3 sejre og ryger ud ved 3 nederlag
  const recordClass = (record) => phase.kind !== "swiss" ? "" : record.wins === 3 ? "q" : record.losses === 3 ? "o" : "";
  const body = records.length
    ? `<div class="tbl"><table><tr><th>Hold</th><th class="r">Record</th></tr>${records.map((record) =>
        `<tr><td class="team">${escapeHtml(record.name)}</td><td class="r"><span class="rec ${recordClass(record)}">${record.wins}-${record.losses}</span></td></tr>`).join("")}</table></div>`
    : emptyBox("Ingen afgjorte serier endnu.");
  return `<div class="panel"><h3>Stilling · ${PHASE_NAME[phase.kind]}</h3>${body}</div>`;
}

function teamStatsHtml(teamStats) {
  const body = teamStats.length
    ? `<div class="tbl"><table><tr><th>Hold</th><th class="r">Kampe</th><th class="r">Sejre</th><th class="r">Kills</th><th class="r">Drager</th><th class="r">Baroner</th><th class="r">Tårne</th></tr>${teamStats.map((team) =>
        `<tr><td class="team">${escapeHtml(team.team_code)}</td><td class="r num">${team.games}</td><td class="r num">${team.wins}</td><td class="r num">${team.kills}</td><td class="r num">${team.dragons}</td><td class="r num">${team.barons}</td><td class="r num">${team.towers}</td></tr>`).join("")}</table></div>`
    : emptyBox("Stats kommer efter første kamp.");
  return `<div class="panel"><h3>Holdstats pr. kamp</h3>${body}</div>`;
}

function topPlayersHtml(players) {
  const body = players.length
    ? `<div class="tbl"><table><tr><th>Spiller</th><th>Hold</th><th>Rolle</th><th class="r">Kampe</th><th class="r">KDA</th><th class="r">MVP/ACE</th><th class="r">Point/kamp</th></tr>${players.map((player) =>
        `<tr><td class="team">${escapeHtml(player.handle)}</td><td>${escapeHtml(player.team_code)}</td><td class="muted">${ROLE_NAME[player.role_code]}</td><td class="r num">${player.games}</td><td class="r num">${player.kills}/${player.deaths}/${player.assists}</td><td class="r num">${player.titles}</td><td class="r num">${player.avg_score}</td></tr>`).join("")}</table></div>`
    : emptyBox("Point kommer efter første kamp.");
  return `<div class="panel"><h3>Bedste spillere (fantasy-point pr. kamp)</h3>${body}</div>`;
}
