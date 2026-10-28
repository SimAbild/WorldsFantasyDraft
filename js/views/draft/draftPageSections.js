// Ansvar: HTML til draft-sidens afsnit – fasefaner, overskrift, valg af prohold, mine hold, budget og Lock in-bjælken
import { escapeHtml, formatDayTime, ROLE_NAME, PHASE_NAME, PHASE_STATE_NAME, priceTierOf } from "../../shared/displayText.js";
import { playerCard } from "../../shared/playerCard.js";
import { ROLES } from "../../domain/roles.js";
import { phaseState, isTwoTeamPhase, teamLetter } from "../../domain/phase.js";
import { usedPlayerIds, teamCost, draftProblems } from "../../domain/draftRules.js";

// cssClass er "muted", når siden åbnes, og "success" lige efter Lock in
export function savedMessage(phase, cssClass) {
  return `<span class="${cssClass}">Gemt. Du kan ændre indtil ${formatDayTime(phase.locks_at)}.</span>`;
}

export function phaseTabsHtml(phases, selectedPhase) {
  return `<div class="phase-tabs" role="group" aria-label="Faser">${phases.map((phase) => {
    const stateOfPhase = phaseState(phase);
    return `<button class="phase-tab" aria-pressed="${phase.id === selectedPhase.id}" data-phase-id="${phase.id}">
      <span class="phase-status ${stateOfPhase}">${PHASE_STATE_NAME[stateOfPhase]}</span><b>${PHASE_NAME[phase.kind]}</b>
      <span>Låser ${formatDayTime(phase.locks_at)} · ${phase.teams_per_user} hold</span></button>`;
  }).join("")}</div>`;
}

export function headingHtml({ phase, isEditable }) {
  const status = isEditable ? `låser ${formatDayTime(phase.locks_at)}` : PHASE_STATE_NAME[phaseState(phase)];
  return `<div><div class="stage">${PHASE_NAME[phase.kind]} · ${status}</div>
    <h2>${isTwoTeamPhase(phase) ? "Byg dine to hold" : "Byg dit hold"}</h2></div>`;
}

// ---------- Valg af prohold og spillere ----------
export function teamPickerHtml(draftPage) {
  const openTeam = draftPage.proTeams.find((team) => team.pro_team_id === draftPage.openProTeamId);
  return `<div class="panel"><h3>Hold efter power ranking</h3>
    <div class="team-chips" role="group" aria-label="Vælg hold">${proTeamButtonsHtml(draftPage)}</div>
    <div class="team-players"><header><div><h3 style="color:var(--fg)">${escapeHtml(openTeam?.team_name ?? "")} · ${priceTierText(openTeam, "Fri leg")}</h3>
      ${openTeam?.price_reason ? `<p class="price-reason">${escapeHtml(openTeam.price_reason)}</p>` : ""}</div>
      <span class="muted small">${draftHintText(draftPage)}</span></header>
      <div class="cards">${openTeamPlayersHtml(draftPage)}</div></div></div>`;
}

// Fx "Favorit · 26"; hold uden prisklasse viser textWhenFree
function priceTierText(team, textWhenFree) {
  return team?.tier_code ? `${priceTierOf(team.tier_code).label} · ${team.price}` : textWhenFree;
}

function proTeamButtonsHtml({ proTeams, openProTeamId }) {
  return proTeams.map((team) => `<button class="team-chip" aria-pressed="${team.pro_team_id === openProTeamId}" data-pro-team-id="${team.pro_team_id}">
      <span class="team-rank">${team.power_rank ? `#${team.power_rank}` : "–"} · ${escapeHtml(team.region ?? "")}</span>
      <span class="team-code">${escapeHtml(team.team_code)}</span><span class="team-price">${priceTierText(team, "Fri")}</span></button>`).join("");
}

// Spillerne på det åbne prohold; allerede valgte spillere kan ikke vælges igen
function openTeamPlayersHtml({ playerCards, openProTeamId, teams, isEditable }) {
  const pickedPlayerIds = usedPlayerIds(teams);
  const openTeamCards = playerCards.filter((card) => card.pro_team_id === openProTeamId)
    .sort((a, b) => a.role_order - b.role_order);
  return openTeamCards.map((card) => {
    const isPicked = pickedPlayerIds.has(card.player_id);
    const isAvailable = isEditable && !isPicked;
    const pickedAttribute = isPicked ? ' data-on-team="true"' : "";
    return playerCard(card, `draggable="${isAvailable}" aria-disabled="${!isAvailable}"${pickedAttribute}`, isPicked ? "Valgt" : "");
  }).join("");
}

function draftHintText({ phase, isEditable }) {
  if (!isEditable) return "Draften er ikke åben.";
  const whereCardGoes = isTwoTeamPhase(phase)
    ? "hold A. Er rollen optaget på A, kommer det på hold B. Shift+klik eller Shift+Enter sætter det altid på hold B"
    : "dit hold";
  return `Træk et kort til en rolle, eller tryk på det (Enter) for at sætte det på ${whereCardGoes}.`;
}

// ---------- Mine hold ----------
export function myTeamsHtml(draftPage) {
  const isSingleTeam = !isTwoTeamPhase(draftPage.phase);
  return `<div class="my-teams ${isSingleTeam ? "single" : ""}">${draftPage.teams.map((team) => myTeamHtml(draftPage, team)).join("")}</div>`;
}

function myTeamHtml(draftPage, team) {
  const { phase, cardsById, isEditable } = draftPage;
  const teamHeading = isTwoTeamPhase(phase) ? `${PHASE_NAME[phase.kind]}-hold ${teamLetter(team.slot)}` : `${PHASE_NAME[phase.kind]}-hold`;
  const roleSlots = ROLES.map((role) => roleSlotHtml(draftPage, team, role)).join("");
  return `<div class="my-team"><header>
      <label for="team-name-${team.slot}" style="gap:4px">${teamHeading}
        <input class="team-name-input" id="team-name-${team.slot}" data-slot="${team.slot}" maxlength="30" placeholder="Navngiv dit hold" required aria-required="true" value="${escapeHtml(team.name)}" ${isEditable ? "" : "disabled"}></label>
      ${budgetHtml(phase, teamCost(team, cardsById))}
    </header><div class="role-slots">${roleSlots}</div></div>`;
}

// Én rolleplads på holdet, fx Top: enten spillerkortet eller en tom plads
function roleSlotHtml({ cardsById, isEditable }, team, role) {
  const card = cardsById.get(team.picks[role]);
  return `<div class="role-slot" data-slot="${team.slot}" data-role="${role}" role="group" tabindex="-1" aria-label="${ROLE_NAME[role]}">${slotContentHtml(card, team, role, isEditable)}</div>`;
}

function slotContentHtml(card, team, role, isEditable) {
  if (!card) return `<span>${ROLE_NAME[role]}</span>${isEditable ? '<span class="slot-hint">træk spiller hertil</span>' : ""}`;
  const removeButton = isEditable
    ? `<button class="remove-player" data-slot="${team.slot}" data-role="${role}" aria-label="Fjern ${escapeHtml(card.handle)} fra ${ROLE_NAME[role]}">Fjern</button>`
    : "";
  return playerCard(card, 'tabindex="-1"') + removeButton;
}

function budgetHtml(phase, cost) {
  if (!phase.budget) return `<div class="budget">Fri leg · intet budget</div>`;
  const percent = Math.min(100, (cost / phase.budget) * 100);
  return `<div class="budget"><span><b class="number" style="color:var(--fg)">${cost}</b> / ${phase.budget} brugt</span>
    <div class="bar ${cost > phase.budget ? "over-budget" : ""}" role="progressbar" aria-valuemin="0" aria-valuemax="${phase.budget}" aria-valuenow="${cost}" aria-label="Budget brugt"><i style="width:${percent}%"></i></div></div>`;
}

// ---------- Lock in ----------
export function lockBarHtml(draftPage) {
  const problems = draftProblems(draftPage.teams, draftPage.cardsById, draftPage.phase);
  const problemsHtml = problems.length
    ? problems.map((problem) => `<span class="${problem.isRuleBroken ? "rule-broken" : ""}">${escapeHtml(problem.text)}</span>`).join("")
    : `<span class="rule-ok">Alt er klar</span>`;
  const buttonText = isTwoTeamPhase(draftPage.phase) ? "Lock in teams" : "Lock in team";
  return `<div class="lock-bar"><div class="draft-rules" aria-live="polite">${problemsHtml}</div>
    <div class="row"><span role="status">${draftPage.message}</span>
    <button class="btn" id="lock-in" ${problems.length ? 'disabled aria-describedby="lock-in-why"' : ""}>${buttonText}</button>
    ${problems.length ? '<span id="lock-in-why" class="visually-hidden">Holdet kan først gemmes, når alle roller er fyldt og reglerne er overholdt.</span>' : ""}</div></div>`;
}
