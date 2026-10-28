// Ansvar: Leaderboard-siden – stilling for alle brugere, tidslinje over hvem der førte, fasevindere og visning af andres hold
import * as database from "../database.js";
import { escapeHtml, formatDay, formatTime, errorBox, emptyBox, PHASE_NAME } from "../shared/displayText.js";
import { groupSeriesRows, finishedSeriesInOrder } from "../domain/series.js";
import { phaseWinners } from "../domain/phaseWinners.js";
import { phaseTeamsHtml, picksInPhase, sumPoints } from "../shared/teamSummary.js";

const LEADER_HISTORY_LENGTH = 20;   // antal serier i "hvem førte"-rækken
const BEFORE_FIRST_GAME = "1970-01-01T00:00:00Z";

export async function render(pageElement, appData) {
  const phaseIds = appData.phases.map((phase) => phase.id);
  const [seriesRows, phasePoints] = await Promise.all([database.fetchSeriesRows(phaseIds), database.fetchPhasePoints(phaseIds)]);
  const timeline = finishedSeriesInOrder(groupSeriesRows(seriesRows));
  const standingsHistory = { timeline, position: timeline.length, loadStandingsAt: createStandingsLoader(timeline) };
  // Stillingen lige nu indeholder alle brugere, så den giver navnene til fasevinderne
  const standingsNow = await standingsHistory.loadStandingsAt(timeline.length);
  const usernameById = new Map(standingsNow.map((standing) => [standing.user_id, standing.username]));
  const phaseWinnersPanel = phaseWinnersHtml(phaseWinners(appData.phases, phasePoints), usernameById, appData.user.id);
  await drawPage(pageElement, appData, standingsHistory, phaseWinnersPanel);
}

// Position 0 = før første kamp, position timeline.length = nu. Hver stilling hentes kun én gang.
function createStandingsLoader(timeline) {
  const cache = new Map();
  return (position) => {
    if (!cache.has(position)) cache.set(position, database.fetchStandings(standingsTimeAt(timeline, position)));
    return cache.get(position);
  };
}

// Uden tidspunkt giver databasen stillingen lige nu
function standingsTimeAt(timeline, position) {
  if (position >= timeline.length) return undefined;
  if (position === 0) return BEFORE_FIRST_GAME;
  return timeline[position - 1].at;
}

// phaseWinnersPanel følger ikke slideren; den viser altid fasevinderne lige nu
async function drawPage(pageElement, appData, standingsHistory, phaseWinnersPanel) {
  const { position, loadStandingsAt } = standingsHistory;
  const [standings, previousStandings] = await Promise.all([
    loadStandingsAt(position), loadStandingsAt(Math.max(0, position - 1)),
  ]);
  pageElement.innerHTML = headerHtml(standingsHistory, standings.length)
    + standingsTableHtml(standings, previousStandings, appData.user.id)
    + phaseWinnersPanel
    + `<dialog id="user-teams" aria-labelledby="user-teams-title"></dialog>`;
  bindPageEvents(pageElement, appData, standingsHistory, phaseWinnersPanel);
  drawLeaderHistory(pageElement, standingsHistory);
}

function headerHtml({ timeline, position }, userCount) {
  const seriesAtPosition = timeline[position - 1];
  const positionText = seriesAtPosition
    ? `${escapeHtml(seriesAtPosition.label)} · ${formatDay(seriesAtPosition.at)} ${formatTime(seriesAtPosition.at)}`
    : "før første kamp";
  const slider = timeline.length ? `<div class="slider">
      <label for="standings-after">Stilling efter: <span>${positionText}</span></label>
      <input type="range" id="standings-after" min="0" max="${timeline.length}" value="${position}">
      <div class="leaders" id="leader-history" aria-label="Hvem førte efter hver serie"></div></div>` : "";
  return `<div class="page-header"><div><h2>Leaderboard</h2>
    <p class="muted">${userCount} spillere · tryk på et navn for at se holdene</p></div>${slider}</div>`;
}

// ---------- Stillingen ----------
function standingsTableHtml(standings, previousStandings, currentUserId) {
  const rows = standings.map((standing) => {
    const previousStanding = previousStandings.find((earlier) => earlier.user_id === standing.user_id);
    return standingRowHtml(standing, previousStanding, currentUserId);
  }).join("");
  return `<div class="panel"><div class="table-scroll"><table>
    <caption class="visually-hidden">Stilling for alle brugere</caption>
    <tr><th scope="col">#</th><th scope="col">Bruger</th><th scope="col" class="right">Point</th><th scope="col" class="right">Siden sidst</th><th scope="col" class="right">Placering</th></tr>${rows}
    </table></div><p class="muted small">Andres hold kan ses, når en fase er låst. Point opdateres efter hver kamp.</p></div>`;
}

function standingRowHtml(standing, previousStanding, currentUserId) {
  const rankChange = rankChangeOf(standing, previousStanding);
  const pointsChange = previousStanding ? standing.points - previousStanding.points : 0;
  const isLeader = standing.rank === 1 && standing.points > 0;
  const youLabel = standing.user_id === currentUserId ? ' <span class="muted small">(dig)</span>' : "";
  return `<tr class="${isLeader ? "leader" : ""}"><td class="rank-number">${standing.rank}</td>
    <td><button class="user-link" data-user-id="${standing.user_id}" data-username="${escapeHtml(standing.username)}">${escapeHtml(standing.username)}</button>${youLabel}</td>
    <td class="right number">${standing.points}</td><td class="right number">${signedPointsText(pointsChange)}</td>
    <td class="right"><span class="rank-change ${rankChange.cssClass}" aria-label="${rankChange.label}">${rankChange.text}</span></td></tr>`;
}

// Point kan både stige og falde mellem to serier, fx "+5.2" eller "−1.4"
function signedPointsText(pointsChange) {
  const rounded = Number(pointsChange.toFixed(1));
  return rounded < 0 ? `−${Math.abs(rounded).toFixed(1)}` : `+${rounded.toFixed(1)}`;
}

// Pladser rykket siden forrige serie: som pil-tekst, som tekst til skærmlæsere og som CSS-klasse
function rankChangeOf(standing, previousStanding) {
  const placesMoved = previousStanding ? previousStanding.rank - standing.rank : 0;
  if (placesMoved > 0) return { text: `▲ ${placesMoved}`, label: `op ${placesMoved}`, cssClass: "up" };
  if (placesMoved < 0) return { text: `▼ ${-placesMoved}`, label: `ned ${-placesMoved}`, cssClass: "down" };
  return { text: "–", label: "uændret", cssClass: "" };
}

// ---------- Fasevindere ----------
// Kun for at følge med: hvem scorede flest point i hver fase, uanset den samlede stilling
function phaseWinnersHtml(phaseWinnerList, usernameById, currentUserId) {
  const tableOrEmptyHtml = phaseWinnerList.length
    ? `<div class="table-scroll"><table><caption class="visually-hidden">Vinder af hver fase</caption>
      <tr><th scope="col">Fase</th><th scope="col">Vinder</th><th scope="col" class="right">Point</th></tr>
      ${phaseWinnerList.map((phaseWinner) => phaseWinnerRowHtml(phaseWinner, usernameById, currentUserId)).join("")}</table></div>`
    : emptyBox("Vinderne vises her, når den første fase er låst.");
  return `<div class="panel"><h3>Fasevindere</h3>${tableOrEmptyHtml}
    <p class="muted small">Flest point i fasen. I Swiss tæller begge hold.</p></div>`;
}

function phaseWinnerRowHtml({ phase, isDone, winnerIds, points }, usernameById, currentUserId) {
  const status = isDone ? "Vinder" : "Fører nu";
  const winnerNames = winnerIds.map((userId) => {
    const youLabel = userId === currentUserId ? " (dig)" : "";
    return `${escapeHtml(usernameById.get(userId) ?? "Ukendt")}${youLabel}`;
  }).join(" og ");
  const winnerText = winnerIds.length ? `<span class="muted small">${status}:</span> ${winnerNames}` : `<span class="muted">Ingen point endnu</span>`;
  return `<tr><td>${PHASE_NAME[phase.kind]}</td><td>${winnerText}</td><td class="right number">${winnerIds.length ? points.toFixed(1) : "–"}</td></tr>`;
}

// Hvem førte efter hver af de seneste serier
async function drawLeaderHistory(pageElement, { timeline, position, loadStandingsAt }) {
  const leaderHistoryElement = pageElement.querySelector("#leader-history");
  if (!leaderHistoryElement) return;
  const firstShownPosition = Math.max(1, timeline.length - LEADER_HISTORY_LENGTH + 1);
  const shownPositions = Array.from({ length: timeline.length - firstShownPosition + 1 }, (_, index) => firstShownPosition + index);
  const standingsPerPosition = await Promise.all(shownPositions.map((shownPosition) => loadStandingsAt(shownPosition)));
  leaderHistoryElement.innerHTML = shownPositions.map((shownPosition, index) => {
    const leader = standingsPerPosition[index][0];
    const seriesLabel = escapeHtml(timeline[shownPosition - 1].label);
    const leaderName = leader && leader.points > 0 ? escapeHtml(leader.username) : "–";
    return `<span class="${shownPosition === position ? "current" : ""}" title="${seriesLabel}">${seriesLabel}: ${leaderName}</span>`;
  }).join("");
}

function bindPageEvents(pageElement, appData, standingsHistory, phaseWinnersPanel) {
  const slider = pageElement.querySelector("#standings-after");
  if (slider) {
    slider.onchange = () => {
      standingsHistory.position = Number(slider.value);
      drawPage(pageElement, appData, standingsHistory, phaseWinnersPanel);
    };
  }
  pageElement.querySelectorAll(".user-link").forEach((button) => {
    button.onclick = () => openUserTeams(pageElement, appData, button.dataset.userId, button.dataset.username);
  });
}

// ---------- Andres hold ----------
async function openUserTeams(pageElement, appData, userId, username) {
  const dialog = pageElement.querySelector("#user-teams");
  dialog.innerHTML = userTeamsHtml(username, `<p class="muted">Henter…</p>`);
  dialog.showModal();
  try {
    const picks = await database.fetchPickPoints(userId);
    dialog.innerHTML = userTeamsHtml(username, userTeamsBodyHtml(appData, picks, userId, username));
  } catch (error) {
    dialog.innerHTML = userTeamsHtml(username, errorBox(error.message));
  }
  dialog.querySelector(".close-dialog").onclick = () => dialog.close();
}

// Andres hold kan først læses, når fasen er låst (RLS), så listen kan være tom
function userTeamsBodyHtml(appData, picks, userId, username) {
  const phasesWithTeams = appData.phases.filter((phase) => picksInPhase(picks, phase.id).length);
  if (!phasesWithTeams.length) {
    return emptyBox(userId === appData.user.id ? "Du har ingen hold endnu." : `${username}s hold vises her, når en fase er låst.`);
  }
  return `<p class="muted">I alt <b class="number">${sumPoints(picks).toFixed(1)}</b> point</p>`
    + phasesWithTeams.map((phase) => phaseTeamsHtml(phase, picksInPhase(picks, phase.id))).join("");
}

function userTeamsHtml(username, body) {
  return `<header class="dialog-header"><h2 id="user-teams-title">${escapeHtml(username)}s hold</h2>
    <button class="btn ghost close-dialog" autofocus>Luk</button></header><div class="dialog-body">${body}</div>`;
}
