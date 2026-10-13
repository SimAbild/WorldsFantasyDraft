// Ansvar: Draft-siden – viser faser, hold og spillerkort, og sender brugerens valg til databasen
import * as api from "../api.js";
import { escapeHtml, playerCard, formatDayTime, ROLE_NAME, PHASE_NAME, PHASE_STATE_NAME, priceTierOf, errorBox, emptyBox } from "../ui.js";
import { ROLES } from "../domain/roles.js";
import { phaseState, defaultDraftPhase, isTwoTeamPhase, teamLetter, PHASE_STATE } from "../domain/phase.js";
import { teamsFromSaved, usedPlayerIds, teamCost, placePlayer, removePlayer, draftProblems, toSubmitPayload } from "../domain/draftRules.js";

let selectedPhaseId = null; // huskes mellem besøg på fanen

export async function render(root, context) {
  const phase = selectPhase(context.phases);
  const [cards, savedTeams] = await Promise.all([
    api.fetchPlayerCards(phase.id), api.fetchMyTeams(phase.id, context.user.id),
  ]);
  const state = createState(phase, cards, savedTeams);
  const redraw = () => draw(root, context, state, redraw);
  redraw();
}

function selectPhase(phases) {
  if (!phases.some((phase) => phase.id === selectedPhaseId)) selectedPhaseId = defaultDraftPhase(phases).id;
  return phases.find((phase) => phase.id === selectedPhaseId);
}

function createState(phase, cards, savedTeams) {
  const proTeams = [...new Map(cards.map((card) => [card.pro_team_id, card])).values()]
    .sort((a, b) => (a.power_rank ?? 99) - (b.power_rank ?? 99) || a.team_code.localeCompare(b.team_code));
  return {
    phase,
    cards,
    cardsById: new Map(cards.map((card) => [card.player_id, card])),
    proTeams,
    openProTeamId: proTeams[0]?.pro_team_id,
    teams: teamsFromSaved(savedTeams, phase),
    isEditable: phaseState(phase) === PHASE_STATE.OPEN,
    message: savedTeams.length ? `<span class="muted">Gemt tidligere. Du kan ændre indtil ${formatDayTime(phase.locks_at)}.</span>` : "",
  };
}

// ---------- Tegning ----------
function draw(root, context, state, redraw) {
  root.innerHTML = [
    phaseTabsHtml(context.phases, state.phase),
    headingHtml(state),
    explanationHtml(state.phase),
    state.cards.length ? teamPickerHtml(state) : emptyBox(`Holdene til ${PHASE_NAME[state.phase.kind]} er ikke kendt endnu.`),
    myTeamsHtml(state),
    state.isEditable ? lockBarHtml(state) : "",
  ].join("");
  bindEvents(root, context, state, redraw);
}

function phaseTabsHtml(phases, selectedPhase) {
  return `<div class="phase-tabs" role="group" aria-label="Faser">${phases.map((phase) => {
    const stateOfPhase = phaseState(phase);
    return `<button class="phase-tab" aria-pressed="${phase.id === selectedPhase.id}" data-phase-id="${phase.id}">
      <span class="phase-status ${stateOfPhase}">${PHASE_STATE_NAME[stateOfPhase]}</span><b>${PHASE_NAME[phase.kind]}</b>
      <span>Låser ${formatDayTime(phase.locks_at)} · ${phase.teams_per_user} hold</span></button>`;
  }).join("")}</div>`;
}

function headingHtml({ phase, isEditable }) {
  const status = isEditable ? `låser ${formatDayTime(phase.locks_at)}` : PHASE_STATE_NAME[phaseState(phase)];
  return `<div><div class="stage">${PHASE_NAME[phase.kind]} · ${status}</div>
    <h2>${isTwoTeamPhase(phase) ? "Byg dine to hold" : "Byg dit hold"}</h2></div>`;
}

function explanationHtml(phase) {
  const rules = phase.budget
    ? `Budget <b>${phase.budget}</b> pr. hold. Én spiller pr. rolle. Højst <b>${phase.max_per_team} spillere fra samme prohold</b>${isTwoTeamPhase(phase) ? " på tværs af begge hold. En spiller kan ikke være på begge hold" : ""}.`
    : "Fri leg: intet budget og ingen grænse pr. prohold. Én spiller pr. rolle.";
  return `<details class="rules-toggle" open><summary>Sådan får du point</summary><div class="rules-explained">
    <div><h3>Point pr. kamp</h3>
      <p>En spiller får <b>omkring 20 point</b> i en gennemsnitlig kamp for sin rolle. Bedre end rollens snit giver flere, dårligere giver færre.</p>
      <p class="formula">20 + 10 × præstation + MVP/ACE</p>
      <p>Bedste spiller på vinderholdet og bedste på taberholdet får <b>+3</b>. En stærk spiller på et tabende hold kan slå en svag spiller på vinderholdet.</p></div>
    <div><h3>Fra kamp til fase</h3>
      <p>Seriepoint er <b>snittet</b> af spillerens kampe i serien. Fasepoint er <b>snittet</b> af hans serier i fasen.</p>
      <p>Flere spillede kampe giver ikke flere point. Et hold, der ryger ud tidligt, kan stadig give mange point.</p>
      <p>Din score er summen af alle dine hold: Play-In, Swiss A, Swiss B, kvartfinale, semifinale og finale.</p></div>
    <div><h3>Priser og regler</h3>
      <p>Swiss: Favorit <b>26</b> · Stærk <b>22</b> · Middel <b>18</b> · Underdog <b>14</b>. Kvartfinale og semifinale: <b>23</b> / <b>17</b>. Finalen er fri.</p>
      <p>${rules}</p>
      <p>Kun startspillere kan vælges. "Lock in" gemmer; du kan ændre indtil fristen.</p></div>
  </div></details>`;
}

function teamPickerHtml(state) {
  const used = usedPlayerIds(state.teams);
  const openTeam = state.proTeams.find((team) => team.pro_team_id === state.openProTeamId);
  const cardsOfTeam = state.cards.filter((card) => card.pro_team_id === state.openProTeamId)
    .sort((a, b) => a.role_order - b.role_order);
  const hint = state.isEditable
    ? `Træk et kort til en rolle, eller klik for at sætte det på det første hold${isTwoTeamPhase(state.phase) ? " (shift+klik: andet hold)" : ""}`
    : "Draften er ikke åben";
  const chips = state.proTeams.map((team) => {
    const tier = team.tier_code ? `${priceTierOf(team.tier_code).label} · ${team.price}` : "Fri";
    return `<button class="team-chip" aria-pressed="${team.pro_team_id === state.openProTeamId}" data-pro-team-id="${team.pro_team_id}">
      <span class="team-rank">${team.power_rank ? `#${team.power_rank}` : "–"} · ${escapeHtml(team.region ?? "")}</span>
      <span class="team-code">${escapeHtml(team.team_code)}</span><span class="team-price">${tier}</span></button>`;
  }).join("");
  const cards = cardsOfTeam.map((card) => {
    const isAvailable = state.isEditable && !used.has(card.player_id);
    return playerCard(card, `draggable="${isAvailable}" aria-disabled="${!isAvailable}"`);
  }).join("");
  return `<div class="panel"><h3>Hold efter power ranking</h3>
    <div class="team-chips" role="group" aria-label="Vælg hold">${chips}</div>
    <div class="team-players"><header><h3 style="color:var(--fg)">${escapeHtml(openTeam?.team_name ?? "")}</h3>
      <span class="muted small">${hint}</span></header>
      <div class="cards">${cards}</div></div></div>`;
}

function myTeamsHtml(state) {
  const isSingle = !isTwoTeamPhase(state.phase);
  return `<div class="my-teams ${isSingle ? "single" : ""}">${state.teams.map((team) => myTeamHtml(state, team)).join("")}</div>`;
}

function myTeamHtml(state, team) {
  const { phase, cardsById, isEditable } = state;
  const label = isTwoTeamPhase(phase) ? `${PHASE_NAME[phase.kind]}-hold ${teamLetter(team.slot)}` : `${PHASE_NAME[phase.kind]}-hold`;
  const slots = ROLES.map((role) => {
    const card = cardsById.get(team.picks[role]);
    const content = card
      ? playerCard(card, isEditable ? 'title="Klik for at fjerne"' : "")
      : `<span>${ROLE_NAME[role]}</span>${isEditable ? '<span style="font-size:10px">træk spiller hertil</span>' : ""}`;
    return `<div class="role-slot" data-slot="${team.slot}" data-role="${role}">${content}</div>`;
  }).join("");
  return `<div class="my-team"><header>
      <label for="team-name-${team.slot}" style="gap:4px">${label}
        <input class="team-name-input" id="team-name-${team.slot}" data-slot="${team.slot}" maxlength="30" value="${escapeHtml(team.name)}" ${isEditable ? "" : "disabled"}></label>
      ${budgetHtml(phase, teamCost(team, cardsById))}
    </header><div class="role-slots">${slots}</div></div>`;
}

function budgetHtml(phase, cost) {
  if (!phase.budget) return `<div class="budget">Fri leg · intet budget</div>`;
  const percent = Math.min(100, (cost / phase.budget) * 100);
  return `<div class="budget"><span><b class="number" style="color:var(--fg)">${cost}</b> / ${phase.budget} brugt</span>
    <div class="bar ${cost > phase.budget ? "over-budget" : ""}"><i style="width:${percent}%"></i></div></div>`;
}

function lockBarHtml(state) {
  const problems = draftProblems(state.teams, state.cardsById, state.phase);
  const rules = problems.length
    ? problems.map((problem) => `<span class="${problem.isRuleBroken ? "rule-broken" : ""}">${escapeHtml(problem.text)}</span>`).join("")
    : `<span class="rule-ok">Alt er klar</span>`;
  const buttonText = isTwoTeamPhase(state.phase) ? "Lock in teams" : "Lock in team";
  return `<div class="lock-bar"><div class="draft-rules">${rules}</div>
    <div class="row"><span role="status">${state.message}</span>
    <button class="btn" id="lock-in" ${problems.length ? "disabled" : ""}>${buttonText}</button></div></div>`;
}

// ---------- Hændelser ----------
function bindEvents(root, context, state, redraw) {
  root.querySelectorAll(".phase-tab").forEach((button) => {
    button.onclick = () => { selectedPhaseId = Number(button.dataset.phaseId); render(root, context); };
  });
  root.querySelectorAll(".team-chip").forEach((button) => {
    button.onclick = () => { state.openProTeamId = Number(button.dataset.proTeamId); redraw(); };
  });
  root.querySelectorAll("input.team-name-input").forEach((input) => {
    input.oninput = () => { state.teams[input.dataset.slot - 1].name = input.value; };
  });
  if (!state.isEditable) return;
  bindCardEvents(root, state, redraw);
  bindSlotEvents(root, state, redraw);
  bindLockIn(root, state, redraw);
}

// Klik sætter kortet på hold A; shift+klik på hold B (kun i Swiss)
function targetSlot(state, event) {
  return event.shiftKey && isTwoTeamPhase(state.phase) ? 2 : 1;
}

function addToTeam(state, playerId, slot, redraw) {
  if (placePlayer(state.teams, state.cardsById.get(playerId), slot)) {
    state.message = "";
    redraw();
  }
}

function bindCardEvents(root, state, redraw) {
  root.querySelectorAll(".team-players .card").forEach((element) => {
    const playerId = Number(element.dataset.id);
    element.addEventListener("dragstart", (event) => event.dataTransfer.setData("text/plain", String(playerId)));
    element.addEventListener("click", (event) => addToTeam(state, playerId, targetSlot(state, event), redraw));
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter") addToTeam(state, playerId, targetSlot(state, event), redraw);
    });
  });
}

function bindSlotEvents(root, state, redraw) {
  root.querySelectorAll(".role-slot").forEach((slotElement) => {
    const slot = Number(slotElement.dataset.slot);
    const role = slotElement.dataset.role;
    slotElement.addEventListener("dragover", (event) => { event.preventDefault(); slotElement.classList.add("drag-over"); });
    slotElement.addEventListener("dragleave", () => slotElement.classList.remove("drag-over"));
    slotElement.addEventListener("drop", (event) => {
      event.preventDefault();
      slotElement.classList.remove("drag-over");
      const card = state.cardsById.get(Number(event.dataTransfer.getData("text/plain")));
      if (!card) return;
      if (card.role_code !== role) {
        state.message = `<span class="error">${escapeHtml(card.handle)} er ${ROLE_NAME[card.role_code]} og kan kun stå på ${ROLE_NAME[card.role_code]}.</span>`;
        redraw();
        return;
      }
      addToTeam(state, card.player_id, slot, redraw);
    });
    const placedCard = slotElement.querySelector(".card");
    if (placedCard) placedCard.onclick = () => { removePlayer(state.teams, slot, role); redraw(); };
  });
}

function bindLockIn(root, state, redraw) {
  const button = root.querySelector("#lock-in");
  if (!button) return;
  button.onclick = async () => {
    button.disabled = true;
    try {
      await api.submitDraft(state.phase.id, toSubmitPayload(state.teams));
      state.message = `<span class="success">Gemt. Du kan ændre indtil ${formatDayTime(state.phase.locks_at)}.</span>`;
    } catch (error) {
      state.message = errorBox(error.message);
    }
    redraw();
  };
}
