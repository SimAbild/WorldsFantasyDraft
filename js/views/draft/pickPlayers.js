// Ansvar: Det brugeren gør på draft-siden – vælge fase og prohold, sætte og fjerne spillere, navngive hold og gemme med Lock in
import * as database from "../../database.js";
import { escapeHtml, ROLE_NAME, errorBox } from "../../shared/displayText.js";
import { isTwoTeamPhase } from "../../domain/phase.js";
import { placePlayer, slotForCard, removePlayer, toSubmitPayload } from "../../domain/draftRules.js";
import { savedMessage } from "./draftPageSections.js";

// handlers kommer fra draftPage.js: { redrawPage, onPhaseSelected, onHowPointsWorkToggled }.
// Denne fil må ikke importere draftPage.js, da de to filer så ville importere hinanden.
export function bindDraftEvents(pageElement, draftPage, handlers) {
  bindHowPointsWorkToggle(pageElement, handlers);
  bindPhaseTabs(pageElement, handlers);
  bindProTeamButtons(pageElement, draftPage, handlers.redrawPage);
  bindTeamNameInputs(pageElement, draftPage);
  if (!draftPage.isEditable) return;
  bindPlayerCards(pageElement, draftPage, handlers.redrawPage);
  bindRoleSlots(pageElement, draftPage, handlers.redrawPage);
  bindRemoveButtons(pageElement, draftPage, handlers.redrawPage);
  bindLockIn(pageElement, draftPage, handlers.redrawPage);
}

function markChanged(draftPage) {
  draftPage.hasUnsavedChanges = true;
  draftPage.message = `<span class="unsaved">Ikke gemt endnu – tryk Lock in for at gemme.</span>`;
}

// ---------- Navigation på siden ----------
function bindHowPointsWorkToggle(pageElement, handlers) {
  pageElement.querySelector(".rules-toggle").addEventListener("toggle", (event) => handlers.onHowPointsWorkToggled(event.target.open));
}

function bindPhaseTabs(pageElement, handlers) {
  pageElement.querySelectorAll(".phase-tab").forEach((button) => {
    button.onclick = () => handlers.onPhaseSelected(Number(button.dataset.phaseId));
  });
}

function bindProTeamButtons(pageElement, draftPage, redrawPage) {
  pageElement.querySelectorAll(".team-chip").forEach((button) => {
    button.onclick = () => { draftPage.openProTeamId = Number(button.dataset.proTeamId); redrawPage(); };
  });
}

function bindTeamNameInputs(pageElement, draftPage) {
  pageElement.querySelectorAll("input.team-name-input").forEach((input) => {
    input.oninput = () => {
      draftPage.teams[input.dataset.slot - 1].name = input.value;
      markChanged(draftPage);
      // Kun beskeden opdateres, ikke hele siden, så markøren bliver i feltet
      const status = pageElement.querySelector(".lock-bar [role=status]");
      if (status) status.innerHTML = draftPage.message;
    };
  });
}

// ---------- Sæt spillere på holdet ----------
// Klik sætter kortet på hold A, eller B hvis rollen er optaget på A; shift+klik altid på hold B (kun i Swiss)
function targetSlot(draftPage, event, playerId) {
  if (event.shiftKey && isTwoTeamPhase(draftPage.phase)) return 2;
  return slotForCard(draftPage.teams, draftPage.cardsById.get(playerId));
}

function addToTeam(draftPage, playerId, slot, redrawPage) {
  if (placePlayer(draftPage.teams, draftPage.cardsById.get(playerId), slot)) {
    markChanged(draftPage);
    redrawPage();
  }
}

function bindPlayerCards(pageElement, draftPage, redrawPage) {
  pageElement.querySelectorAll(".team-players .card").forEach((cardElement) => {
    const playerId = Number(cardElement.dataset.id);
    const pickPlayer = (event) => addToTeam(draftPage, playerId, targetSlot(draftPage, event, playerId), redrawPage);
    cardElement.addEventListener("dragstart", (event) => event.dataTransfer.setData("text/plain", String(playerId)));
    cardElement.addEventListener("click", pickPlayer);
    cardElement.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      pickPlayer(event);
    });
  });
}

// Træk-og-slip på en rolleplads
function bindRoleSlots(pageElement, draftPage, redrawPage) {
  pageElement.querySelectorAll(".role-slot").forEach((slotElement) => {
    const slot = Number(slotElement.dataset.slot);
    const role = slotElement.dataset.role;
    slotElement.addEventListener("dragover", (event) => { event.preventDefault(); slotElement.classList.add("drag-over"); });
    slotElement.addEventListener("dragleave", () => slotElement.classList.remove("drag-over"));
    slotElement.addEventListener("drop", (event) => {
      event.preventDefault();
      slotElement.classList.remove("drag-over");
      dropCardOnSlot(draftPage, Number(event.dataTransfer.getData("text/plain")), slot, role, redrawPage);
    });
  });
}

function dropCardOnSlot(draftPage, playerId, slot, role, redrawPage) {
  const card = draftPage.cardsById.get(playerId);
  if (!card) return;
  if (card.role_code !== role) {
    draftPage.message = `<span class="error">${escapeHtml(card.handle)} er ${ROLE_NAME[card.role_code]} og kan kun stå på ${ROLE_NAME[card.role_code]}.</span>`;
    redrawPage();
    return;
  }
  addToTeam(draftPage, card.player_id, slot, redrawPage);
}

function bindRemoveButtons(pageElement, draftPage, redrawPage) {
  pageElement.querySelectorAll(".remove-player").forEach((button) => {
    button.onclick = () => {
      removePlayer(draftPage.teams, Number(button.dataset.slot), button.dataset.role);
      markChanged(draftPage);
      redrawPage();
    };
  });
}

// ---------- Gem ----------
function bindLockIn(pageElement, draftPage, redrawPage) {
  const button = pageElement.querySelector("#lock-in");
  if (!button) return;
  button.onclick = async () => {
    button.disabled = true;
    button.textContent = "Gemmer…";
    try {
      await database.submitDraft(draftPage.phase.id, toSubmitPayload(draftPage.teams));
      draftPage.hasUnsavedChanges = false;
      draftPage.message = savedMessage(draftPage.phase, "success");
    } catch (error) {
      draftPage.message = errorBox(error.message);
    }
    redrawPage();
  };
}
