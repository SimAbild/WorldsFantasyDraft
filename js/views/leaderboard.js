// Ansvar: Leaderboard-siden – stilling i ligaen, tidslinje over hvem der førte, og oprettelse af ligaer
import * as api from "../api.js";
import { escapeHtml, formatDay, formatTime, errorBox } from "../ui.js";
import { groupSeriesRows, seriesTimeline } from "../domain/series.js";

const LEADER_HISTORY_LENGTH = 20;   // antal serier i "hvem førte"-rækken
const BEFORE_FIRST_GAME = "1970-01-01T00:00:00Z";

let selectedLeagueId = null;

export async function render(root, context) {
  const leagues = await api.fetchMyLeagues();
  if (!leagues.length) {
    root.innerHTML = `<h2>Leaderboard</h2><p class="muted">Du er ikke med i en liga endnu. Join med en kode fra en ven, eller opret din egen.</p>${leagueFormsHtml()}`;
    bindLeagueForms(root, context);
    return;
  }
  if (!leagues.some((league) => league.id === selectedLeagueId)) selectedLeagueId = leagues[0].id;
  const league = leagues.find((item) => item.id === selectedLeagueId);
  const seriesRows = await api.fetchSeriesRows(context.phases.map((phase) => phase.id));
  const timeline = seriesTimeline(groupSeriesRows(seriesRows));
  const standingsAt = createStandingsCache(league.id, timeline);
  const state = { leagues, league, timeline, position: timeline.length, standingsAt };
  await draw(root, context, state);
}

// Position 0 = før første kamp, position timeline.length = nu. Hver stilling hentes kun én gang.
function createStandingsCache(leagueId, timeline) {
  const cache = new Map();
  const timeAt = (position) => position >= timeline.length ? undefined
    : position === 0 ? BEFORE_FIRST_GAME : timeline[position - 1].at;
  return (position) => {
    if (!cache.has(position)) cache.set(position, api.fetchStandings(leagueId, timeAt(position)));
    return cache.get(position);
  };
}

async function draw(root, context, state) {
  const [standings, previousStandings] = await Promise.all([
    state.standingsAt(state.position), state.standingsAt(Math.max(0, state.position - 1)),
  ]);
  root.innerHTML = headerHtml(state, standings.length) + standingsTableHtml(standings, previousStandings, context.user.id) + leagueFormsHtml();
  bindLeagueForms(root, context);
  bindControls(root, context, state);
  drawLeaderHistory(root, state);
}

function headerHtml(state, playerCount) {
  const { leagues, league, timeline, position } = state;
  const leagueName = leagues.length > 1
    ? `<select id="league-select">${leagues.map((item) => `<option value="${item.id}" ${item.id === league.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select>`
    : escapeHtml(league.name);
  const step = timeline[position - 1];
  const stepText = step ? `${escapeHtml(step.label)} · ${formatDay(step.at)} ${formatTime(step.at)}` : "før første kamp";
  const slider = timeline.length ? `<div class="slider">
      <label for="standings-after">Stilling efter: <span>${stepText}</span></label>
      <input type="range" id="standings-after" min="0" max="${timeline.length}" value="${position}">
      <div class="leaders" id="leader-history"></div></div>` : "";
  return `<div class="lb-head"><div><h2>Leaderboard</h2>
    <p class="muted">${leagueName} · ${playerCount} spillere · invitationskode <span class="code">${escapeHtml(league.invite_code)}</span></p></div>
    ${slider}</div>`;
}

function standingsTableHtml(standings, previousStandings, currentUserId) {
  const rows = standings.map((entry) => {
    const previous = previousStandings.find((item) => item.user_id === entry.user_id);
    const rankChange = previous ? previous.rank - entry.rank : 0;
    const gain = previous ? (entry.points - previous.points).toFixed(1) : "0.0";
    const changeText = rankChange > 0 ? `▲ ${rankChange}` : rankChange < 0 ? `▼ ${-rankChange}` : "–";
    const changeClass = rankChange > 0 ? "up" : rankChange < 0 ? "dn" : "";
    const isLeader = entry.rank === 1 && entry.points > 0;
    const youLabel = entry.user_id === currentUserId ? ' <span class="muted small">(dig)</span>' : "";
    return `<tr class="${isLeader ? "lead" : ""}"><td class="rank">${entry.rank}</td>
      <td class="team">${escapeHtml(entry.username)}${youLabel}</td>
      <td class="r num">${entry.points}</td><td class="r num">+${gain}</td>
      <td class="r"><span class="delta ${changeClass}">${changeText}</span></td></tr>`;
  }).join("");
  return `<div class="panel"><div class="tbl"><table>
    <tr><th>#</th><th>Bruger</th><th class="r">Point</th><th class="r">Siden sidst</th><th class="r">Placering</th></tr>${rows}
    </table></div><p class="muted small">Andres hold kan ses, når en fase er låst. Point opdateres efter hver kamp.</p></div>`;
}

// Hvem førte efter hver af de seneste serier
async function drawLeaderHistory(root, state) {
  const container = root.querySelector("#leader-history");
  if (!container) return;
  const first = Math.max(1, state.timeline.length - LEADER_HISTORY_LENGTH + 1);
  const positions = Array.from({ length: state.timeline.length - first + 1 }, (_, index) => first + index);
  const allStandings = await Promise.all(positions.map(state.standingsAt));
  container.innerHTML = positions.map((position, index) => {
    const leader = allStandings[index][0];
    const label = escapeHtml(state.timeline[position - 1].label);
    const leaderName = leader && leader.points > 0 ? escapeHtml(leader.username) : "–";
    return `<span class="${position === state.position ? "cur" : ""}" title="${label}">${label}: ${leaderName}</span>`;
  }).join("");
}

function bindControls(root, context, state) {
  const leagueSelect = root.querySelector("#league-select");
  if (leagueSelect) leagueSelect.onchange = () => { selectedLeagueId = Number(leagueSelect.value); render(root, context); };
  const slider = root.querySelector("#standings-after");
  if (slider) slider.onchange = () => { state.position = Number(slider.value); draw(root, context, state); };
}

// ---------- Opret og join ligaer ----------
function leagueFormsHtml(errorMessage = "") {
  return `<div class="panel" id="league-forms"><h3>Ligaer</h3>
    <div class="row">
      <label for="invite-code">Invitationskode<input id="invite-code" maxlength="8" placeholder="fx 3fa9c21b"></label>
      <button class="btn" id="join-league">Join liga</button>
    </div>
    <div class="row">
      <label for="league-name">Ny liga<input id="league-name" maxlength="40" placeholder="Vennerne"></label>
      <button class="btn ghost" id="create-league">Opret liga</button>
    </div>
    ${errorMessage ? errorBox(errorMessage) : ""}</div>`;
}

function bindLeagueForms(root, context) {
  const showError = (message) => {
    root.querySelector("#league-forms").outerHTML = leagueFormsHtml(message);
    bindLeagueForms(root, context);
  };
  const openLeague = async (action) => {
    try {
      selectedLeagueId = (await action()).id;
      render(root, context);
    } catch (error) {
      showError(error.message);
    }
  };
  root.querySelector("#join-league").onclick = () => openLeague(() => api.joinLeague(root.querySelector("#invite-code").value));
  root.querySelector("#create-league").onclick = () => {
    const name = root.querySelector("#league-name").value.trim();
    if (name) openLeague(() => api.createLeague(name));
  };
}
