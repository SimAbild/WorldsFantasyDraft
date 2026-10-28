// Ansvar: Finder vinderen af hver fase – den bruger, hvis hold tilsammen scorede flest point i fasen
import { phaseState, PHASE_STATE } from "./phase.js";

// Kun låste faser har en vinder: før fristen kan andres hold ikke ses, og der er ikke spillet endnu
const PHASE_STATES_WITH_WINNER = [PHASE_STATE.LIVE, PHASE_STATE.DONE];

// pickPoints: én række pr. valgt spiller { user_id, phase_id, points }.
// Returnerer én linje pr. låst fase: { phase, isDone, winnerIds, points }
export function phaseWinners(phases, pickPoints, now = Date.now()) {
  return phases
    .filter((phase) => PHASE_STATES_WITH_WINNER.includes(phaseState(phase, now)))
    .map((phase) => ({
      phase,
      isDone: phaseState(phase, now) === PHASE_STATE.DONE,
      ...bestUsers(userTotals(pickPoints, phase.id)),
    }));
}

// Swiss har to hold pr. bruger; begge tæller med, ligesom i den samlede stilling
function userTotals(pickPoints, phaseId) {
  const totalByUserId = new Map();
  for (const pick of pickPoints.filter((pick) => pick.phase_id === phaseId)) {
    totalByUserId.set(pick.user_id, (totalByUserId.get(pick.user_id) ?? 0) + Number(pick.points));
  }
  return totalByUserId;
}

// Point sammenlignes med én decimal, som de vises; står flere lige, vinder de alle
function bestUsers(totalByUserId) {
  const roundedTotals = [...totalByUserId].map(([userId, total]) => [userId, Math.round(total * 10) / 10]);
  const bestTotal = Math.max(0, ...roundedTotals.map(([, total]) => total));
  if (bestTotal === 0) return { winnerIds: [], points: 0 };
  const winnerIds = roundedTotals.filter(([, total]) => total === bestTotal).map(([userId]) => userId);
  return { winnerIds, points: bestTotal };
}
