// Ansvar: Leaderboard-siden – stilling for alle brugere, tidslinje over hvem der førte, og visning af andres hold
import * as api from "../api.js";
import { escapeHtml, formatDay, formatTime, errorBox, emptyBox } from "../ui.js";
import { groupSeriesRows, finishedSeriesInOrder } from "../domain/series.js";
import { phaseTeamsHtml, sumPoints } from "./teamSummary.js";

const LEADER_HISTORY_LENGTH = 20;   // antal serier i "hvem førte"-rækken
const BEFORE_FIRST_GAME = "1970-01-01T00:00:00Z";

export async function render(root, context) {
  const seriesRows = await api.fetchSeriesRows(context.phases.map((phase) => phase.id));
  const timeline = finishedSeriesInOrder(groupSeriesRows(seriesRows));
  const state = { timeline, position: timeline.length, loadStandingsAt: createStandingsLoader(timeline) };
  await draw(root, context, state);
}

// Position 0 = før første kamp, position timeline.length = nu. Hver stilling hentes kun én gang.
function createStandingsLoader(timeline) {
  const cache = new Map();
  const timeAt = (position) => position >= timeline.length ? undefined
    : position === 0 ? BEFORE_FIRST_GAME : timeline[position - 1].at;
  return (position) => {
    if (!cache.has(position)) cache.set(position, api.fetchStandings(timeAt(position)));
    return cache.get(position);
  };
}

async function draw(root, context, state) {
  const [standings, previousStandings] = await Promise.all([
    state.loadStandingsAt(state.position), state.loadStandingsAt(Math.max(0, state.position - 1)),
  ]);
  root.innerHTML = headerHtml(state, standings.length)
    + standingsTableHtml(standings, previousStandings, context.user.id)
    + `<dialog id="user-teams" aria-labelledby="user-teams-title"></dialog>`;
  bindEvents(root, context, state);
  drawLeaderHistory(root, state);
}

function headerHtml(state, playerCount) {
  const { timeline, position } = state;
  const step = timeline[position - 1];
  const stepText = step ? `${escapeHtml(step.label)} · ${formatDay(step.at)} ${formatTime(step.at)}` : "før første kamp";
  const slider = timeline.length ? `<div class="slider">
      <label for="standings-after">Stilling efter: <span>${stepText}</span></label>
      <input type="range" id="standings-after" min="0" max="${timeline.length}" value="${position}">
      <div class="leaders" id="leader-history" aria-label="Hvem førte efter hver serie"></div></div>` : "";
  return `<div class="page-header"><div><h2>Leaderboard</h2>
    <p class="muted">${playerCount} spillere · tryk på et navn for at se holdene</p></div>${slider}</div>`;
}

function standingsTableHtml(standings, previousStandings, currentUserId) {
  const rows = standings.map((entry) => {
    const previous = previousStandings.find((item) => item.user_id === entry.user_id);
    const rankChange = previous ? previous.rank - entry.rank : 0;
    const gain = previous ? (entry.points - previous.points).toFixed(1) : "0.0";
    const changeText = rankChange > 0 ? `▲ ${rankChange}` : rankChange < 0 ? `▼ ${-rankChange}` : "–";
    const changeLabel = rankChange > 0 ? `op ${rankChange}` : rankChange < 0 ? `ned ${-rankChange}` : "uændret";
    const changeClass = rankChange > 0 ? "up" : rankChange < 0 ? "down" : "";
    const isLeader = entry.rank === 1 && entry.points > 0;
    const youLabel = entry.user_id === currentUserId ? ' <span class="muted small">(dig)</span>' : "";
    return `<tr class="${isLeader ? "leader" : ""}"><td class="rank-number">${entry.rank}</td>
      <td><button class="user-link" data-user-id="${entry.user_id}" data-username="${escapeHtml(entry.username)}">${escapeHtml(entry.username)}</button>${youLabel}</td>
      <td class="right number">${entry.points}</td><td class="right number">+${gain}</td>
      <td class="right"><span class="rank-change ${changeClass}" aria-label="${changeLabel}">${changeText}</span></td></tr>`;
  }).join("");
  return `<div class="panel"><div class="table-scroll"><table>
    <caption class="visually-hidden">Stilling for alle brugere</caption>
    <tr><th scope="col">#</th><th scope="col">Bruger</th><th scope="col" class="right">Point</th><th scope="col" class="right">Siden sidst</th><th scope="col" class="right">Placering</th></tr>${rows}
    </table></div><p class="muted small">Andres hold kan ses, når en fase er låst. Point opdateres efter hver kamp.</p></div>`;
}

// Hvem førte efter hver af de seneste serier
async function drawLeaderHistory(root, state) {
  const container = root.querySelector("#leader-history");
  if (!container) return;
  const first = Math.max(1, state.timeline.length - LEADER_HISTORY_LENGTH + 1);
  const positions = Array.from({ length: state.timeline.length - first + 1 }, (_, index) => first + index);
  const allStandings = await Promise.all(positions.map(state.loadStandingsAt));
  container.innerHTML = positions.map((position, index) => {
    const leader = allStandings[index][0];
    const label = escapeHtml(state.timeline[position - 1].label);
    const leaderName = leader && leader.points > 0 ? escapeHtml(leader.username) : "–";
    return `<span class="${position === state.position ? "current" : ""}" title="${label}">${label}: ${leaderName}</span>`;
  }).join("");
}

function bindEvents(root, context, state) {
  const slider = root.querySelector("#standings-after");
  if (slider) slider.onchange = () => { state.position = Number(slider.value); draw(root, context, state); };
  root.querySelectorAll(".user-link").forEach((button) => {
    button.onclick = () => openUserTeams(root, context, button.dataset.userId, button.dataset.username);
  });
}

// ---------- Andres hold ----------
async function openUserTeams(root, context, userId, username) {
  const dialog = root.querySelector("#user-teams");
  dialog.innerHTML = userTeamsHtml(username, `<p class="muted">Henter…</p>`);
  dialog.showModal();
  try {
    const picks = await api.fetchPickPoints(userId);
    const phasesWithTeams = context.phases.filter((phase) => picks.some((pick) => pick.phase_id === phase.id));
    const body = phasesWithTeams.length
      ? `<p class="muted">I alt <b class="number">${sumPoints(picks).toFixed(1)}</b> point</p>`
        + phasesWithTeams.map((phase) => phaseTeamsHtml(phase, picks.filter((pick) => pick.phase_id === phase.id))).join("")
      : emptyBox(userId === context.user.id
          ? "Du har ingen hold endnu."
          : `${username}s hold vises her, når en fase er låst.`);
    dialog.innerHTML = userTeamsHtml(username, body);
  } catch (error) {
    dialog.innerHTML = userTeamsHtml(username, errorBox(error.message));
  }
  dialog.querySelector(".close-dialog").onclick = () => dialog.close();
}

function userTeamsHtml(username, body) {
  return `<header class="dialog-header"><h2 id="user-teams-title">${escapeHtml(username)}s hold</h2>
    <button class="btn ghost close-dialog" autofocus>Luk</button></header><div class="dialog-body">${body}</div>`;
}
