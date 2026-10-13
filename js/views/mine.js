// Ansvar: Mine hold-siden – point pr. hold og pr. spiller, med seriepoint efter hver kamp
import * as api from "../api.js";
import { escapeHtml, ROLE_NAME, PHASE_NAME, PHASE_STATE_NAME, emptyBox } from "../ui.js";
import { ROLES } from "../domain/roles.js";
import { phaseState, slotLabel } from "../domain/phase.js";

const BAR_MINIMUM_SCALE = 30; // point, så søjlerne ikke fylder hele bredden ved lave tal

const sumPoints = (picks) => picks.reduce((sum, pick) => sum + Number(pick.points), 0);

export async function render(root, context) {
  const { phases, user } = context;
  const picks = await api.fetchMyPickPoints(user.id);
  if (!picks.length) {
    root.innerHTML = `<h2>Mine hold</h2>${emptyBox("Du har ingen hold endnu. Byg dem under Fantasy draft.")}`;
    return;
  }
  const phasesWithTeams = phases.filter((phase) => picks.some((pick) => pick.phase_id === phase.id));
  const seriesPointsByPhase = await fetchSeriesPointsByPhase(phasesWithTeams, picks);
  root.innerHTML = totalHeaderHtml(sumPoints(picks))
    + phasesWithTeams.map((phase) => phaseHtml(phase, picks.filter((pick) => pick.phase_id === phase.id), seriesPointsByPhase.get(phase.id))).join("");
}

async function fetchSeriesPointsByPhase(phases, picks) {
  const entries = await Promise.all(phases.map(async (phase) => {
    const playerIds = [...new Set(picks.filter((pick) => pick.phase_id === phase.id).map((pick) => pick.player_id))];
    return [phase.id, await api.fetchSeriesPoints(phase.id, playerIds)];
  }));
  return new Map(entries);
}

function totalHeaderHtml(total) {
  return `<div class="lb-head"><div><h2>Mine hold</h2><p class="muted">Point opdateres efter hver kamp</p></div>
    <div style="text-align:right"><div class="muted small" style="letter-spacing:.1em;text-transform:uppercase">I alt</div>
    <div class="score num">${total.toFixed(1)}</div></div></div>`;
}

function phaseHtml(phase, phasePicks, seriesPoints) {
  const slots = [...new Set(phasePicks.map((pick) => pick.slot))].sort();
  const teams = slots.map((slot) => teamHtml(slot, slots.length, phasePicks.filter((pick) => pick.slot === slot), seriesPoints)).join("");
  return `<div><div class="stage">${PHASE_NAME[phase.kind]} · ${PHASE_STATE_NAME[phaseState(phase)]}</div>
    <div class="myteams ${slots.length === 1 ? "one" : ""}">${teams}</div></div>`;
}

function teamHtml(slot, teamCount, teamPicks, seriesPoints) {
  const orderedPicks = [...teamPicks].sort((a, b) => ROLES.indexOf(a.role_code) - ROLES.indexOf(b.role_code));
  const barScale = Math.max(BAR_MINIMUM_SCALE, ...orderedPicks.map((pick) => Number(pick.points)));
  const players = orderedPicks.map((pick) => playerRowHtml(pick, barScale, seriesPoints.filter((item) => item.player_id === pick.player_id))).join("");
  return `<div class="myteam"><header><div><h3>${teamCount === 2 ? `Hold ${slotLabel(slot)}` : "Hold"}</h3>
      <div class="team" style="font-size:24px">${escapeHtml(orderedPicks[0].team_name)}</div></div>
      <div class="score num">${sumPoints(orderedPicks).toFixed(1)}</div></header>
    <div style="display:grid;gap:10px">${players}</div>
    <p class="muted small">Holdets point er summen af spillernes fasepoint: snittet af deres serier indtil nu.</p></div>`;
}

function playerRowHtml(pick, barScale, playerSeries) {
  const points = Number(pick.points);
  const width = Math.max(0, (points / barScale) * 100).toFixed(0);
  const series = playerSeries.length
    ? `<div class="series-pts">${playerSeries.map((item, index) => `<span title="${item.games} kampe">Serie ${index + 1}: ${item.series_points}</span>`).join("")}</div>`
    : "";
  return `<div class="pbar"><span><b>${escapeHtml(pick.handle)}</b> <span class="muted small">${ROLE_NAME[pick.role_code]} · ${escapeHtml(pick.team_code)}${pick.price ? ` · ${pick.price}` : ""}</span></span>
    <div class="bar"><i style="width:${width}%"></i></div><span class="num" style="text-align:right">${points.toFixed(1)}</span>${series}</div>`;
}
