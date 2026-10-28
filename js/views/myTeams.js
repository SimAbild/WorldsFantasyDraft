// Ansvar: Mine hold-siden – point pr. hold og pr. spiller, med seriepoint efter hver kamp
import * as database from "../database.js";
import { emptyBox } from "../shared/displayText.js";
import { phaseTeamsHtml, picksInPhase, sumPoints } from "../shared/teamSummary.js";

export async function render(pageElement, appData) {
  const { phases, user } = appData;
  const picks = await database.fetchPickPoints(user.id);
  if (!picks.length) {
    pageElement.innerHTML = `<h2>Mine hold</h2>${emptyBox("Du har ingen hold endnu. Byg dem under Fantasy draft.")}`;
    return;
  }
  const phasesWithTeams = phases.filter((phase) => picksInPhase(picks, phase.id).length);
  const seriesPointsByPhase = await fetchSeriesPointsByPhase(phasesWithTeams, picks);
  pageElement.innerHTML = totalHeaderHtml(sumPoints(picks)) + phasesWithTeams.map((phase) =>
    phaseTeamsHtml(phase, picksInPhase(picks, phase.id), seriesPointsByPhase.get(phase.id))).join("");
}

async function fetchSeriesPointsByPhase(phases, picks) {
  const seriesPointsPerPhase = await Promise.all(phases.map(async (phase) => {
    const playerIds = [...new Set(picksInPhase(picks, phase.id).map((pick) => pick.player_id))];
    return [phase.id, await database.fetchSeriesPoints(phase.id, playerIds)];
  }));
  return new Map(seriesPointsPerPhase);
}

function totalHeaderHtml(total) {
  return `<div class="page-header"><div><h2>Mine hold</h2><p class="muted">Point opdateres efter hver kamp</p></div>
    <div style="text-align:right"><div class="muted small" style="letter-spacing:.1em;text-transform:uppercase">I alt</div>
    <div class="big-score number">${total.toFixed(1)}</div></div></div>`;
}
