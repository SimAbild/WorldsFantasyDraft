// Ansvar: Forsiden – Worlds-status med kampprogram, stilling, holdstats og bedste spillere
import * as api from "../api.js";
import { escapeHtml, formatDay, formatTime, PHASE_NAME, ROLE_NAME, emptyBox } from "../ui.js";
import { currentPhase } from "../domain/phase.js";
import { groupSeriesRows, phaseRecords, recentAndUpcomingSeries, isSeriesWinner } from "../domain/series.js";

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
    pageTitleHtml(tournament, phase, allSeries.find((series) => !series.isDecided)),
    scheduleHtml(recentAndUpcomingSeries(allSeries), phaseNameById),
    `<div class="two-columns">${standingsHtml(standingsPhase, allSeries)}${teamStatsHtml(teamStats)}</div>`,
    topPlayersHtml(topPlayers),
  ].join("");
}

// Stillingen vises for den aktuelle fase, når den har resultater; ellers for den seneste fase med resultater
function phaseWithResults(phases, allSeries, phase) {
  const hasResults = (candidate) => allSeries.some((series) => series.phaseId === candidate.id && series.isDecided);
  return hasResults(phase) ? phase : phases.findLast(hasResults) ?? phase;
}

// Sidens overskrift: turnering, aktuel fase og næste kamp
function pageTitleHtml(tournament, phase, nextSeries) {
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
  const teamRow = (team) => `<div class="match-team ${series.isDecided && !isSeriesWinner(series, team) ? "loser" : ""}">
    <span>${escapeHtml(team.code)}</span><span class="number">${showScore ? team.wins : "–"}</span></div>`;
  return `<div class="match">
    <small>${formatDay(series.startsAt)} · ${phaseName}</small>
    <small class="${series.isLive ? "live" : ""}">${status}</small>
    ${series.teams.map(teamRow).join("")}
  </div>`;
}

function standingsHtml(phase, allSeries) {
  const records = phaseRecords(allSeries.filter((series) => series.phaseId === phase.id));
  // I Swiss går man videre ved 3 sejre og ryger ud ved 3 nederlag
  const recordClass = (record) => phase.kind !== "swiss" ? "" : record.wins === 3 ? "qualified" : record.losses === 3 ? "eliminated" : "";
  const body = records.length
    ? `<div class="table-scroll"><table><tr><th>Hold</th><th class="right">Record</th></tr>${records.map((record) =>
        `<tr><td class="team">${escapeHtml(record.name)}</td><td class="right"><span class="record ${recordClass(record)}">${record.wins}-${record.losses}</span></td></tr>`).join("")}</table></div>`
    : emptyBox("Ingen afgjorte serier endnu.");
  return `<div class="panel"><h3>Stilling · ${PHASE_NAME[phase.kind]}</h3>${body}</div>`;
}

function teamStatsHtml(teamStats) {
  const body = teamStats.length
    ? `<div class="table-scroll"><table><tr><th>Hold</th><th class="right">Kampe</th><th class="right">Sejre</th><th class="right">Kills</th><th class="right">Drager</th><th class="right">Baroner</th><th class="right">Tårne</th></tr>${teamStats.map((team) =>
        `<tr><td class="team">${escapeHtml(team.team_code)}</td><td class="right number">${team.games}</td><td class="right number">${team.wins}</td><td class="right number">${team.kills}</td><td class="right number">${team.dragons}</td><td class="right number">${team.barons}</td><td class="right number">${team.towers}</td></tr>`).join("")}</table></div>`
    : emptyBox("Stats kommer efter første kamp.");
  return `<div class="panel"><h3>Holdstats pr. kamp</h3>${body}</div>`;
}

function topPlayersHtml(players) {
  const body = players.length
    ? `<div class="table-scroll"><table><tr><th>Spiller</th><th>Hold</th><th>Rolle</th><th class="right">Kampe</th><th class="right">KDA</th><th class="right">MVP/ACE</th><th class="right">Point/kamp</th></tr>${players.map((player) =>
        `<tr><td class="team">${escapeHtml(player.handle)}</td><td>${escapeHtml(player.team_code)}</td><td class="muted">${ROLE_NAME[player.role_code]}</td><td class="right number">${player.games}</td><td class="right number">${player.kills}/${player.deaths}/${player.assists}</td><td class="right number">${player.titles}</td><td class="right number">${player.avg_score}</td></tr>`).join("")}</table></div>`
    : emptyBox("Point kommer efter første kamp.");
  return `<div class="panel"><h3>Bedste spillere (fantasy-point pr. kamp)</h3>${body}</div>`;
}
