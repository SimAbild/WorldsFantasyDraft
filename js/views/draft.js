// Ansvar: Draft-siden – viser faser, hold og spillerkort, og sender brugerens valg til databasen
import * as database from "../database.js";
import { escapeHtml, playerCard, formatDayTime, ROLE_NAME, PHASE_NAME, PHASE_STATE_NAME, priceTierOf, errorBox, emptyBox } from "../ui.js";
import { ROLES } from "../domain/roles.js";
import { phaseState, defaultDraftPhase, isTwoTeamPhase, teamLetter, PHASE_STATE } from "../domain/phase.js";
import { teamsFromSaved, usedPlayerIds, teamCost, placePlayer, slotForCard, removePlayer, draftProblems, toSubmitPayload } from "../domain/draftRules.js";

// Huskes mellem besøg på fanen
let selectedPhaseId = null;
let isRulesOpen = false;          // "Sådan får du point" er lukket, indtil brugeren selv åbner den
let currentState = null;          // bruges til at advare om ændringer, der ikke er gemt

export const hasUnsavedChanges = () => Boolean(currentState?.hasUnsavedChanges);

export async function render(root, context) {
  const phase = selectPhase(context.phases);
  const [cards, savedTeams] = await Promise.all([
    database.fetchPlayerCards(phase.id), database.fetchMyTeams(phase.id, context.user.id),
  ]);
  const state = createState(phase, cards, savedTeams);
  currentState = state;
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
    hasUnsavedChanges: false,
    message: savedTeams.length ? `<span class="muted">Gemt. Du kan ændre indtil ${formatDayTime(phase.locks_at)}.</span>` : "",
  };
}

function markChanged(state) {
  state.hasUnsavedChanges = true;
  state.message = `<span class="unsaved">Ikke gemt endnu – tryk Lock in for at gemme.</span>`;
}

function showMessage(root, state) {
  const status = root.querySelector(".lock-bar [role=status]");
  if (status) status.innerHTML = state.message;
}

// ---------- Tegning ----------
function draw(root, context, state, redraw) {
  const focusSelector = focusedElementSelector(root);
  // Siden og holdrækken skal blive stående, hvor brugeren havde scrollet hen
  const pageScroll = window.scrollY;
  const chipsScroll = root.querySelector(".team-chips")?.scrollLeft ?? 0;
  root.innerHTML = [
    phaseTabsHtml(context.phases, state.phase),
    headingHtml(state),
    rulesHtml(state.phase),
    state.cards.length ? teamPickerHtml(state) : emptyBox(`Holdene til ${PHASE_NAME[state.phase.kind]} er ikke kendt endnu.`),
    myTeamsHtml(state),
    state.isEditable ? lockBarHtml(state) : "",
  ].join("");
  bindEvents(root, context, state, redraw);
  const chips = root.querySelector(".team-chips");
  if (chips) chips.scrollLeft = chipsScroll;
  if (focusSelector) root.querySelector(focusSelector)?.focus({ preventScroll: true });
  window.scrollTo(0, pageScroll);
}

// Tastaturbrugere skal blive, hvor de var, når siden tegnes om efter et valg
function focusedElementSelector(root) {
  const element = document.activeElement;
  if (!root.contains(element) || element === root) return null;
  if (element.matches(".team-players .card")) return `.team-players .card[data-id="${element.dataset.id}"]`;
  if (element.matches(".team-chip")) return `.team-chip[data-pro-team-id="${element.dataset.proTeamId}"]`;
  if (element.matches(".remove-player")) return `.role-slot[data-slot="${element.dataset.slot}"][data-role="${element.dataset.role}"]`;
  return element.id ? `#${element.id}` : null;
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

// Valgfri forklaring: lukket som standard, og den forbliver som brugeren efterlod den
function rulesHtml(phase) {
  const teamRules = phase.budget
    ? `Budget <b>${phase.budget}</b> pr. hold. Én spiller pr. rolle. Højst <b>${phase.max_per_team} spillere fra samme prohold</b>${isTwoTeamPhase(phase) ? " på tværs af begge hold. En spiller kan ikke være på begge hold" : ""}.`
    : "Fri leg: intet budget og ingen grænse pr. prohold. Én spiller pr. rolle.";
  return `<details class="rules-toggle" ${isRulesOpen ? "open" : ""}><summary>Sådan får du point (valgfrit at læse)</summary><div class="rules-explained">
    <div><h3>Point pr. kamp</h3>
      <p>En spiller får <b>omkring 20 point</b> i en gennemsnitlig kamp for sin rolle. Bedre end rollens snit giver flere, dårligere giver færre.</p>
      <p>Rollens snit er regnet ud fra <b>Worlds 2025</b> og ændrer sig ikke under turneringen. En kamp giver derfor de samme point i dag som efter finalen.</p>
      <p class="formula">20 + 10 × præstation + MVP/ACE</p>
      <p>Bedste spiller på vinderholdet og bedste på taberholdet får <b>+3</b>. En stærk spiller på et tabende hold kan slå en svag spiller på vinderholdet.</p></div>
    <div><h3>Fra kamp til fase</h3>
      <p>Seriepoint er <b>snittet</b> af spillerens kampe i serien. Fasepoint er <b>snittet</b> af hans serier i fasen.</p>
      <p>Flere spillede kampe giver ikke flere point. Et hold, der ryger ud tidligt, kan stadig give mange point.</p>
      <p>Din score er summen af alle dine hold: Play-In, Swiss A, Swiss B, kvartfinale, semifinale og finale.</p></div>
    <div><h3>Priser og regler</h3>
      <p>Swiss: Favorit <b>26</b> · Stærk <b>22</b> · Middel <b>18</b> · Underdog <b>14</b>. Kvartfinale og semifinale: <b>23</b> / <b>17</b>. Finalen er fri.</p>
      <p>${teamRules}</p>
      <p>Kun startspillere kan vælges. "Lock in" gemmer; du kan ændre indtil fristen.</p></div>
    <div><h3>Hvorfor har holdene forskellige priser?</h3>
      <p>Prisen er en vurdering af holdets styrke <b>før</b> fasen, ikke af den enkelte spiller.</p>
      <p>Prisklassen følger holdets placering i <b>lolesports' Global Power Rankings</b>, når draften åbner. Højest placeret er dyrest.</p>
      <p>Hvert holds begrundelse står, når du vælger holdet. Underdogs er billige, men kan score lige så mange point.</p></div>
    <div class="roles-explained"><h3>Point pr. rolle</h3>
      <p>Alle roller giver <b>i snit lige mange point</b>. Forskellen er, hvad de får point for.</p>
      <p><b>Top:</b> kills og CS/min vejer tungest, plus skade og en stor andel af holdets kills.</p>
      <p><b>Jungle:</b> kills, assists, kill participation og ødelagte wards. Tillæg når holdet tager drage (<b>+0,5</b>), elder (<b>+1</b>) og baron (<b>+1</b>). CS og skade tæller ikke.</p>
      <p><b>Mid:</b> kills, CS/min og skade, plus andel af holdets kills.</p>
      <p><b>ADC:</b> kills, CS/min, skade og killandel vejer tungest. Deaths koster mest af alle roller.</p>
      <p><b>Support:</b> assists, kills, kill participation og wards (placeret og ødelagt). Deaths koster mindst. CS og skade tæller ikke.</p>
      <p>Alle undtagen support får <b>+2</b> for 10+ kills eller assists i en kamp. En sejr giver lidt ekstra.</p></div>
  </div></details>`;
}

function teamPickerHtml(state) {
  const used = usedPlayerIds(state.teams);
  const openTeam = state.proTeams.find((team) => team.pro_team_id === state.openProTeamId);
  const cardsOfTeam = state.cards.filter((card) => card.pro_team_id === state.openProTeamId)
    .sort((a, b) => a.role_order - b.role_order);
  const hint = state.isEditable
    ? `Træk et kort til en rolle, eller tryk på det (Enter) for at sætte det på ${isTwoTeamPhase(state.phase) ? "hold A. Er rollen optaget på A, kommer det på hold B. Shift+klik eller Shift+Enter sætter det altid på hold B" : "dit hold"}.`
    : "Draften er ikke åben.";
  const chips = state.proTeams.map((team) => {
    const tier = team.tier_code ? `${priceTierOf(team.tier_code).label} · ${team.price}` : "Fri";
    return `<button class="team-chip" aria-pressed="${team.pro_team_id === state.openProTeamId}" data-pro-team-id="${team.pro_team_id}">
      <span class="team-rank">${team.power_rank ? `#${team.power_rank}` : "–"} · ${escapeHtml(team.region ?? "")}</span>
      <span class="team-code">${escapeHtml(team.team_code)}</span><span class="team-price">${tier}</span></button>`;
  }).join("");
  const cards = cardsOfTeam.map((card) => {
    const isOnTeam = used.has(card.player_id);
    const isAvailable = state.isEditable && !isOnTeam;
    const onTeamAttribute = isOnTeam ? ' data-on-team="true"' : "";
    return playerCard(card, `draggable="${isAvailable}" aria-disabled="${!isAvailable}"${onTeamAttribute}`, isOnTeam ? "Valgt" : "");
  }).join("");
  const tierLabel = openTeam?.tier_code ? `${priceTierOf(openTeam.tier_code).label} · ${openTeam.price}` : "Fri leg";
  return `<div class="panel"><h3>Hold efter power ranking</h3>
    <div class="team-chips" role="group" aria-label="Vælg hold">${chips}</div>
    <div class="team-players"><header><div><h3 style="color:var(--fg)">${escapeHtml(openTeam?.team_name ?? "")} · ${tierLabel}</h3>
      ${openTeam?.price_reason ? `<p class="price-reason">${escapeHtml(openTeam.price_reason)}</p>` : ""}</div>
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
      ? playerCard(card, 'tabindex="-1"')
        + (isEditable ? `<button class="remove-player" data-slot="${team.slot}" data-role="${role}" aria-label="Fjern ${escapeHtml(card.handle)} fra ${ROLE_NAME[role]}">Fjern</button>` : "")
      : `<span>${ROLE_NAME[role]}</span>${isEditable ? '<span class="slot-hint">træk spiller hertil</span>' : ""}`;
    return `<div class="role-slot" data-slot="${team.slot}" data-role="${role}" role="group" tabindex="-1" aria-label="${ROLE_NAME[role]}">${content}</div>`;
  }).join("");
  return `<div class="my-team"><header>
      <label for="team-name-${team.slot}" style="gap:4px">${label}
        <input class="team-name-input" id="team-name-${team.slot}" data-slot="${team.slot}" maxlength="30" placeholder="Navngiv dit hold" required aria-required="true" value="${escapeHtml(team.name)}" ${isEditable ? "" : "disabled"}></label>
      ${budgetHtml(phase, teamCost(team, cardsById))}
    </header><div class="role-slots">${slots}</div></div>`;
}

function budgetHtml(phase, cost) {
  if (!phase.budget) return `<div class="budget">Fri leg · intet budget</div>`;
  const percent = Math.min(100, (cost / phase.budget) * 100);
  return `<div class="budget"><span><b class="number" style="color:var(--fg)">${cost}</b> / ${phase.budget} brugt</span>
    <div class="bar ${cost > phase.budget ? "over-budget" : ""}" role="progressbar" aria-valuemin="0" aria-valuemax="${phase.budget}" aria-valuenow="${cost}" aria-label="Budget brugt"><i style="width:${percent}%"></i></div></div>`;
}

function lockBarHtml(state) {
  const problems = draftProblems(state.teams, state.cardsById, state.phase);
  const rules = problems.length
    ? problems.map((problem) => `<span class="${problem.isRuleBroken ? "rule-broken" : ""}">${escapeHtml(problem.text)}</span>`).join("")
    : `<span class="rule-ok">Alt er klar</span>`;
  const buttonText = isTwoTeamPhase(state.phase) ? "Lock in teams" : "Lock in team";
  return `<div class="lock-bar"><div class="draft-rules" aria-live="polite">${rules}</div>
    <div class="row"><span role="status">${state.message}</span>
    <button class="btn" id="lock-in" ${problems.length ? 'disabled aria-describedby="lock-in-why"' : ""}>${buttonText}</button>
    ${problems.length ? '<span id="lock-in-why" class="visually-hidden">Holdet kan først gemmes, når alle roller er fyldt og reglerne er overholdt.</span>' : ""}</div></div>`;
}

// ---------- Hændelser ----------
function bindEvents(root, context, state, redraw) {
  root.querySelector(".rules-toggle").addEventListener("toggle", (event) => { isRulesOpen = event.target.open; });
  root.querySelectorAll(".phase-tab").forEach((button) => {
    button.onclick = () => {
      if (state.hasUnsavedChanges && !confirm("Du har ændringer, der ikke er gemt. Vil du skifte fase alligevel?")) return;
      selectedPhaseId = Number(button.dataset.phaseId);
      render(root, context);
    };
  });
  root.querySelectorAll(".team-chip").forEach((button) => {
    button.onclick = () => { state.openProTeamId = Number(button.dataset.proTeamId); redraw(); };
  });
  root.querySelectorAll("input.team-name-input").forEach((input) => {
    input.oninput = () => {
      state.teams[input.dataset.slot - 1].name = input.value;
      markChanged(state);
      showMessage(root, state);   // uden at tegne om, så markøren bliver i feltet
    };
  });
  if (!state.isEditable) return;
  bindCardEvents(root, state, redraw);
  bindSlotEvents(root, state, redraw);
  bindLockIn(root, state, redraw);
}

// Klik sætter kortet på hold A, eller B hvis rollen er optaget på A; shift+klik altid på hold B (kun i Swiss)
function targetSlot(state, event, playerId) {
  if (event.shiftKey && isTwoTeamPhase(state.phase)) return 2;
  return slotForCard(state.teams, state.cardsById.get(playerId));
}

function addToTeam(state, playerId, slot, redraw) {
  if (placePlayer(state.teams, state.cardsById.get(playerId), slot)) {
    markChanged(state);
    redraw();
  }
}

function bindCardEvents(root, state, redraw) {
  root.querySelectorAll(".team-players .card").forEach((element) => {
    const playerId = Number(element.dataset.id);
    element.addEventListener("dragstart", (event) => event.dataTransfer.setData("text/plain", String(playerId)));
    element.addEventListener("click", (event) => addToTeam(state, playerId, targetSlot(state, event, playerId), redraw));
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        addToTeam(state, playerId, targetSlot(state, event, playerId), redraw);
      }
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
  });
  root.querySelectorAll(".remove-player").forEach((button) => {
    button.onclick = () => {
      removePlayer(state.teams, Number(button.dataset.slot), button.dataset.role);
      markChanged(state);
      redraw();
    };
  });
}

function bindLockIn(root, state, redraw) {
  const button = root.querySelector("#lock-in");
  if (!button) return;
  button.onclick = async () => {
    button.disabled = true;
    button.textContent = "Gemmer…";
    try {
      await database.submitDraft(state.phase.id, toSubmitPayload(state.teams));
      state.hasUnsavedChanges = false;
      state.message = `<span class="success">Gemt. Du kan ændre indtil ${formatDayTime(state.phase.locks_at)}.</span>`;
    } catch (error) {
      state.message = errorBox(error.message);
    }
    redraw();
  };
}
