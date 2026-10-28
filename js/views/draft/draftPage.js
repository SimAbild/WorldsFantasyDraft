// Ansvar: Draft-siden – henter spillerkort og gemte hold, husker sidens tilstand og tegner siden
import * as database from "../../database.js";
import { PHASE_NAME, emptyBox } from "../../shared/displayText.js";
import { phaseState, defaultDraftPhase, PHASE_STATE } from "../../domain/phase.js";
import { teamsFromSaved } from "../../domain/draftRules.js";
import { phaseTabsHtml, headingHtml, teamPickerHtml, myTeamsHtml, lockBarHtml, savedMessage } from "./draftPageSections.js";
import { howPointsWorkHtml } from "./howPointsWork.js";
import { bindDraftEvents } from "./pickPlayers.js";

// Huskes mellem besøg på fanen
let selectedPhaseId = null;
let isHowPointsWorkOpen = false;  // lukket, indtil brugeren selv åbner den
let currentDraftPage = null;      // bruges til at advare om ændringer, der ikke er gemt

export const hasUnsavedChanges = () => Boolean(currentDraftPage?.hasUnsavedChanges);

export async function render(pageElement, appData) {
  const phase = selectPhase(appData.phases);
  const [playerCards, savedTeams] = await Promise.all([
    database.fetchPlayerCards(phase.id), database.fetchMyTeams(phase.id, appData.user.id),
  ]);
  const draftPage = createDraftPage(phase, playerCards, savedTeams);
  currentDraftPage = draftPage;
  // pickPlayers.js ændrer kun sidens tilstand gennem disse funktioner, så den aldrig skal importere denne fil
  const handlers = {
    redrawPage: () => drawPage(pageElement, appData.phases, draftPage, handlers),
    onPhaseSelected: (phaseId) => switchPhase(pageElement, appData, draftPage, phaseId),
    onHowPointsWorkToggled: (isOpen) => { isHowPointsWorkOpen = isOpen; },
  };
  handlers.redrawPage();
}

function selectPhase(phases) {
  if (!phases.some((phase) => phase.id === selectedPhaseId)) selectedPhaseId = defaultDraftPhase(phases).id;
  return phases.find((phase) => phase.id === selectedPhaseId);
}

function switchPhase(pageElement, appData, draftPage, phaseId) {
  if (draftPage.hasUnsavedChanges && !confirm("Du har ændringer, der ikke er gemt. Vil du skifte fase alligevel?")) return;
  selectedPhaseId = phaseId;
  render(pageElement, appData);
}

// Alt draft-siden husker, mens brugeren vælger spillere
function createDraftPage(phase, playerCards, savedTeams) {
  const proTeams = proTeamsByPowerRank(playerCards);
  return {
    phase,
    playerCards,
    cardsById: new Map(playerCards.map((card) => [card.player_id, card])),
    proTeams,
    openProTeamId: proTeams[0]?.pro_team_id,
    teams: teamsFromSaved(savedTeams, phase),
    isEditable: phaseState(phase) === PHASE_STATE.OPEN,
    hasUnsavedChanges: false,
    message: savedTeams.length ? savedMessage(phase, "muted") : "",
  };
}

// Hvert prohold én gang, bedst placerede først; hold uden placering til sidst
function proTeamsByPowerRank(playerCards) {
  const oneCardPerProTeam = new Map(playerCards.map((card) => [card.pro_team_id, card])).values();
  return [...oneCardPerProTeam]
    .sort((a, b) => (a.power_rank ?? 99) - (b.power_rank ?? 99) || a.team_code.localeCompare(b.team_code));
}

function drawPage(pageElement, phases, draftPage, handlers) {
  const scrollAndFocus = rememberScrollAndFocus(pageElement);
  pageElement.innerHTML = [
    phaseTabsHtml(phases, draftPage.phase),
    headingHtml(draftPage),
    howPointsWorkHtml(draftPage.phase, isHowPointsWorkOpen),
    draftPage.playerCards.length
      ? teamPickerHtml(draftPage)
      : emptyBox(`Holdene til ${PHASE_NAME[draftPage.phase.kind]} er ikke kendt endnu.`),
    myTeamsHtml(draftPage),
    draftPage.isEditable ? lockBarHtml(draftPage) : "",
  ].join("");
  bindDraftEvents(pageElement, draftPage, handlers);
  restoreScrollAndFocus(pageElement, scrollAndFocus);
}

// Siden, rækken af prohold og tastaturfokus skal blive stående, når siden tegnes om efter et valg
function rememberScrollAndFocus(pageElement) {
  return {
    focusSelector: focusedElementSelector(pageElement),
    pageScroll: window.scrollY,
    proTeamButtonsScroll: pageElement.querySelector(".team-chips")?.scrollLeft ?? 0,
  };
}

function restoreScrollAndFocus(pageElement, { focusSelector, pageScroll, proTeamButtonsScroll }) {
  const proTeamButtons = pageElement.querySelector(".team-chips");
  if (proTeamButtons) proTeamButtons.scrollLeft = proTeamButtonsScroll;
  if (focusSelector) pageElement.querySelector(focusSelector)?.focus({ preventScroll: true });
  window.scrollTo(0, pageScroll);
}

// Elementerne bygges på ny ved hver tegning, så fokus findes igen via en CSS-selector
function focusedElementSelector(pageElement) {
  const focusedElement = document.activeElement;
  if (!pageElement.contains(focusedElement) || focusedElement === pageElement) return null;
  if (focusedElement.matches(".team-players .card")) return `.team-players .card[data-id="${focusedElement.dataset.id}"]`;
  if (focusedElement.matches(".team-chip")) return `.team-chip[data-pro-team-id="${focusedElement.dataset.proTeamId}"]`;
  if (focusedElement.matches(".remove-player")) return `.role-slot[data-slot="${focusedElement.dataset.slot}"][data-role="${focusedElement.dataset.role}"]`;
  return focusedElement.id ? `#${focusedElement.id}` : null;
}
