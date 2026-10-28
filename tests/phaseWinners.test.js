// Ansvar: Tester at hver fases vinder findes ud fra brugernes samlede point i fasen
import { test } from "node:test";
import assert from "node:assert/strict";
import { phaseWinners } from "../js/domain/phaseWinners.js";

const phase = (id, opens, locks, ends) => ({ id, opens_at: opens, locks_at: locks, ends_at: ends });
const playIn = phase(1, "2026-10-13T10:00Z", "2026-10-15T18:00Z", "2026-10-19T03:00Z");
const swiss = phase(2, "2026-10-19T03:00Z", "2026-10-23T17:00Z", "2026-11-01T04:00Z");
const quarterfinal = phase(3, "2026-11-01T04:00Z", "2026-11-05T09:00Z", "2026-11-09T04:00Z");
const phases = [playIn, swiss, quarterfinal];
const duringSwiss = Date.parse("2026-10-28T12:00Z");
const pick = (userId, phaseId, points) => ({ user_id: userId, phase_id: phaseId, points: String(points) });

test("kun låste faser får en vinder, og afsluttede er markeret som færdige", () => {
  const winners = phaseWinners(phases, [], duringSwiss);
  assert.deepEqual(winners.map((winner) => [winner.phase.id, winner.isDone]), [[1, true], [2, false]]);
});

test("vinderen er brugeren med flest point i fasen, ikke i hele turneringen", () => {
  const pickPoints = [pick("anna", 1, 50), pick("anna", 1, 30), pick("bo", 1, 70), pick("bo", 2, 200), pick("anna", 2, 10)];
  const [playInWinner, swissWinner] = phaseWinners(phases, pickPoints, duringSwiss);
  assert.deepEqual(playInWinner.winnerIds, ["anna"]);
  assert.equal(playInWinner.points, 80);
  assert.deepEqual(swissWinner.winnerIds, ["bo"]);
});

test("i Swiss tæller begge brugerens hold med", () => {
  const pickPoints = [pick("anna", 2, 60), pick("anna", 2, 60), pick("bo", 2, 100)];
  const swissWinner = phaseWinners(phases, pickPoints, duringSwiss)[1];
  assert.deepEqual(swissWinner.winnerIds, ["anna"]);
  assert.equal(swissWinner.points, 120);
});

test("står to brugere lige, vinder de begge", () => {
  const pickPoints = [pick("anna", 1, 40.04), pick("bo", 1, 40)];
  assert.deepEqual(phaseWinners(phases, pickPoints, duringSwiss)[0].winnerIds, ["anna", "bo"]);
});

test("uden point er der ingen vinder endnu", () => {
  const pickPoints = [pick("anna", 2, 0), pick("bo", 2, 0)];
  assert.deepEqual(phaseWinners(phases, pickPoints, duringSwiss)[1].winnerIds, []);
});
