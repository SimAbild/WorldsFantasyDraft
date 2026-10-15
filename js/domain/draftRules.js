// Ansvar: Draft-reglerne på klientsiden, så brugeren får besked med det samme.
// Databasens submit_draft håndhæver de samme regler endeligt og kan ikke omgås.
import { ROLES } from "./roles.js";
import { isTwoTeamPhase, teamLetter } from "./phase.js";

// Brugerens hold i fasen: gemte valg, ellers tomme pladser
export function teamsFromSaved(savedTeams, phase) {
  return Array.from({ length: phase.teams_per_user }, (_, index) => {
    const slot = index + 1;
    const saved = savedTeams.find((team) => team.slot === slot);
    const picks = {};
    saved?.fantasy_pick.forEach((pick) => { picks[pick.role_code] = pick.player_id; });
    return { slot, name: saved?.name ?? "", picks };   // nye hold starter uden navn – brugeren skal navngive dem
  });
}

// Holdets betegnelse i beskeder, uafhængigt af det navn brugeren skriver
function teamLabel(teams, team) {
  return teams.length === 2 ? `Hold ${teamLetter(team.slot)}` : "Dit hold";
}

export function usedPlayerIds(teams) {
  return new Set(teams.flatMap((team) => Object.values(team.picks)));
}

export function teamCost(team, cardsById) {
  return Object.values(team.picks).reduce((sum, playerId) => sum + (cardsById.get(playerId)?.price ?? 0), 0);
}

// Sætter en spiller på sin rolle. Returnerer false, hvis han allerede er valgt.
export function placePlayer(teams, card, slot) {
  if (usedPlayerIds(teams).has(card.player_id)) return false;
  teams[slot - 1].picks[card.role_code] = card.player_id;
  return true;
}

export function removePlayer(teams, slot, roleCode) {
  delete teams[slot - 1].picks[roleCode];
}

// Alle brud på reglerne. Holdet kan først gemmes, når listen er tom.
// isRuleBroken: false = noget mangler endnu, true = en regel er brudt (fx over budget).
export function draftProblems(teams, cardsById, phase) {
  return [
    ...missingNameProblems(teams),
    ...missingRoleProblems(teams),
    ...budgetProblems(teams, cardsById, phase),
    ...teamLimitProblems(teams, cardsById, phase),
  ];
}

function missingNameProblems(teams) {
  return teams
    .filter((team) => !team.name.trim())
    .map((team) => ({ isRuleBroken: false, text: `${teamLabel(teams, team)} mangler et navn` }));
}

function missingRoleProblems(teams) {
  return teams
    .map((team) => ({ team, missing: ROLES.filter((role) => !team.picks[role]).length }))
    .filter(({ missing }) => missing > 0)
    .map(({ team, missing }) => ({ isRuleBroken: false, text: `${teamLabel(teams, team)}: ${missing} roller mangler` }));
}

function budgetProblems(teams, cardsById, phase) {
  if (!phase.budget) return [];
  return teams
    .map((team) => ({ team, overBy: teamCost(team, cardsById) - phase.budget }))
    .filter(({ overBy }) => overBy > 0)
    .map(({ team, overBy }) => ({ isRuleBroken: true, text: `${teamLabel(teams, team)} er ${overBy} over budget` }));
}

function teamLimitProblems(teams, cardsById, phase) {
  if (!phase.max_per_team) return [];
  const countByTeam = new Map();
  for (const playerId of usedPlayerIds(teams)) {
    const card = cardsById.get(playerId);
    if (card) countByTeam.set(card.team_code, (countByTeam.get(card.team_code) ?? 0) + 1);
  }
  return [...countByTeam]
    .filter(([, count]) => count > phase.max_per_team)
    .map(([teamCode, count]) => ({ isRuleBroken: true, text: `${count} spillere fra ${teamCode} (højst ${phase.max_per_team})` }));
}

// Formatet databasens submit_draft forventer
export function toSubmitPayload(teams) {
  return teams.map((team) => ({
    slot: team.slot,
    name: team.name,
    picks: ROLES.map((role) => ({ role, player_id: team.picks[role] })),
  }));
}
