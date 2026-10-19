// Ansvar: Viser et brugerhold med spillere og point. Bruges af Mine hold og af leaderboardets visning af andres hold.
import { escapeHtml, avatar, ROLE_NAME, PHASE_NAME, PHASE_STATE_NAME } from "../ui.js";
import { ROLES } from "../domain/roles.js";
import { phaseState, teamLetter } from "../domain/phase.js";

const BAR_MINIMUM_SCALE = 30; // point, så søjlerne ikke fylder hele bredden ved lave tal

export const sumPoints = (picks) => picks.reduce((sum, pick) => sum + Number(pick.points), 0);

// Alle brugerens hold i én fase, fx Swiss A og Swiss B side om side
export function phaseTeamsHtml(phase, phasePicks, seriesPoints = []) {
  const slots = [...new Set(phasePicks.map((pick) => pick.slot))].sort();
  const teams = slots.map((slot) =>
    teamHtml(slot, slots.length, phasePicks.filter((pick) => pick.slot === slot), seriesPoints)).join("");
  // Ved to hold (Swiss) vises A + B samlet, så man kan se fasens bidrag til totalen
  const phaseTotal = slots.length === 2 ? ` · ${sumPoints(phasePicks).toFixed(1)} point i alt` : "";
  return `<section aria-label="${PHASE_NAME[phase.kind]}">
    <div class="stage">${PHASE_NAME[phase.kind]} · ${PHASE_STATE_NAME[phaseState(phase)]}${phaseTotal}</div>
    <div class="my-teams ${slots.length === 1 ? "single" : ""}">${teams}</div></section>`;
}

function teamHtml(slot, teamCount, teamPicks, seriesPoints) {
  const orderedPicks = [...teamPicks].sort((a, b) => ROLES.indexOf(a.role_code) - ROLES.indexOf(b.role_code));
  const barScale = Math.max(BAR_MINIMUM_SCALE, ...orderedPicks.map((pick) => Number(pick.points)));
  const players = orderedPicks.map((pick) =>
    playerRowHtml(pick, barScale, seriesPoints.filter((item) => item.player_id === pick.player_id))).join("");
  return `<div class="my-team"><header><div><h3>${teamCount === 2 ? `Hold ${teamLetter(slot)}` : "Hold"}</h3>
      <div class="team" style="font-size:24px">${escapeHtml(orderedPicks[0].team_name)}</div></div>
      <div class="big-score number" aria-label="${sumPoints(orderedPicks).toFixed(1)} point">${sumPoints(orderedPicks).toFixed(1)}</div></header>
    <div class="player-list">${players}</div>
    <p class="muted small">Holdets point er summen af spillernes fasepoint: snittet af deres serier indtil nu.</p></div>`;
}

function playerRowHtml(pick, barScale, playerSeries) {
  const points = Number(pick.points);
  const width = Math.max(0, (points / barScale) * 100).toFixed(0);
  const series = playerSeries.length
    ? `<div class="series-points">${playerSeries.map((item, index) =>
        `<span title="${item.games} kampe i serien">Serie ${index + 1}: ${item.series_points}</span>`).join("")}</div>`
    : "";
  return `<div class="player-points">
    <span class="player-identity">${avatar(pick.handle, pick.image_url)}<span><b>${escapeHtml(pick.handle)}</b>
      <span class="muted small">${ROLE_NAME[pick.role_code]} · ${escapeHtml(pick.team_code)}${pick.price ? ` · ${pick.price}` : ""}</span></span></span>
    <div class="bar" aria-hidden="true"><i style="width:${width}%"></i></div>
    <span class="number" style="text-align:right">${points.toFixed(1)}</span>${series}</div>`;
}
