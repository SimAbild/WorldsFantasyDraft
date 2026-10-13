// Ansvar: Tester fasernes tilstand og valg af aktuel fase
import { test } from "node:test";
import assert from "node:assert/strict";
import { phaseState, currentPhase, defaultDraftPhase, PHASE_STATE } from "../js/domain/phase.js";

const phase = (id, opens, locks, ends) => ({ id, opens_at: opens, locks_at: locks, ends_at: ends });
const playIn = phase(1, "2026-10-13T10:00Z", "2026-10-15T18:00Z", "2026-10-19T03:00Z");
const swiss = phase(2, "2026-10-19T03:00Z", "2026-10-23T17:00Z", "2026-11-01T04:00Z");
const at = (iso) => Date.parse(iso);

test("tilstanden følger fasens tidspunkter", () => {
  assert.equal(phaseState(swiss, at("2026-10-14T12:00Z")), PHASE_STATE.SOON);
  assert.equal(phaseState(playIn, at("2026-10-14T12:00Z")), PHASE_STATE.OPEN);
  assert.equal(phaseState(playIn, at("2026-10-16T12:00Z")), PHASE_STATE.LIVE);
  assert.equal(phaseState(playIn, at("2026-10-20T12:00Z")), PHASE_STATE.DONE);
});

test("fristen er den første kamp: præcis på tidspunktet er fasen låst", () => {
  assert.equal(phaseState(playIn, at("2026-10-15T18:00Z")), PHASE_STATE.LIVE);
});

test("aktuel fase er den åbne eller spillende, ellers den næste", () => {
  assert.equal(currentPhase([playIn, swiss], at("2026-10-16T12:00Z")).id, 1);
  assert.equal(currentPhase([playIn, swiss], at("2026-10-19T12:00Z")).id, 2);
});

test("draften viser den åbne fase først", () => {
  assert.equal(defaultDraftPhase([playIn, swiss], at("2026-10-20T12:00Z")).id, 2);
  assert.equal(defaultDraftPhase([playIn, swiss], at("2026-10-16T12:00Z")).id, 1);
});
