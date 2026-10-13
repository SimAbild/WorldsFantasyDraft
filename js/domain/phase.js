// Ansvar: Regler om faser – hvilken tilstand en fase er i, og hvilken fase der er aktuel

export const PHASE_STATE = { SOON: "soon", OPEN: "open", LIVE: "live", DONE: "done" };

// Tilstanden udledes af fasens tidspunkter, så den aldrig skal gemmes
export function phaseState(phase, now = Date.now()) {
  if (now < Date.parse(phase.opens_at)) return PHASE_STATE.SOON;
  if (now < Date.parse(phase.locks_at)) return PHASE_STATE.OPEN;
  if (phase.ends_at && now >= Date.parse(phase.ends_at)) return PHASE_STATE.DONE;
  return PHASE_STATE.LIVE;
}

// Den fase der er åben eller spilles nu; ellers den næste; ellers den sidste
export function currentPhase(phases, now = Date.now()) {
  const active = phases.find((phase) => [PHASE_STATE.OPEN, PHASE_STATE.LIVE].includes(phaseState(phase, now)));
  const upcoming = phases.find((phase) => phaseState(phase, now) === PHASE_STATE.SOON);
  return active ?? upcoming ?? phases.at(-1);
}

// Den fase draft-siden skal vise, når brugeren ikke selv har valgt en
export function defaultDraftPhase(phases, now = Date.now()) {
  const open = phases.find((phase) => phaseState(phase, now) === PHASE_STATE.OPEN);
  const notDone = phases.find((phase) => phaseState(phase, now) !== PHASE_STATE.DONE);
  return open ?? notDone ?? phases.at(-1);
}

export const isTwoTeamPhase = (phase) => phase.teams_per_user === 2;

// Swiss-holdene hedder A og B
export const teamLetter = (slot) => "AB"[slot - 1];
