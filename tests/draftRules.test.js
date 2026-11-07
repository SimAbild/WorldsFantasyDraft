// Ansvar: Tester draft-reglerne på klientsiden
import { test } from "node:test";
import assert from "node:assert/strict";
import { teamsFromSaved, teamCost, placePlayer, slotForCard, removePlayer, draftProblems, toSubmitPayload } from "../js/domain/draftRules.js";

const swissPhase = { teams_per_user: 2, budget: 100, max_per_team: 2 };
const playInPhase = { teams_per_user: 1, budget: 100, max_per_team: 2 };
const finalPhase = { teams_per_user: 1, budget: null, max_per_team: 3 };

const card = (player_id, role_code, team_code, price) => ({ player_id, role_code, team_code, price });
const cards = [
  card(1, "top", "KC", 26), card(2, "jungle", "KC", 26), card(3, "mid", "KC", 26),
  card(4, "adc", "C9", 22), card(5, "support", "C9", 22),
  card(6, "top", "MVK", 14), card(7, "jungle", "MVK", 14), card(8, "mid", "FUR", 18),
  card(9, "adc", "FUR", 18), card(10, "support", "MVK", 14),
];
const cardsById = new Map(cards.map((item) => [item.player_id, item]));
const byId = (id) => cardsById.get(id);

test("nye hold starter uden navn", () => {
  assert.deepEqual(teamsFromSaved([], swissPhase).map((team) => team.name), ["", ""]);
  assert.deepEqual(teamsFromSaved([], playInPhase).map((team) => team.name), [""]);
});

test("et hold uden navn kan ikke gemmes", () => {
  const teams = teamsFromSaved([], swissPhase);
  teams[0].name = "Baron Bandits";
  const texts = draftProblems(teams, cardsById, swissPhase).map((problem) => problem.text);
  assert.equal(texts[0], "Hold B mangler et navn");
});

test("et navn med kun mellemrum tæller som manglende navn", () => {
  const teams = teamsFromSaved([], playInPhase);
  teams[0].name = "   ";
  const texts = draftProblems(teams, cardsById, playInPhase).map((problem) => problem.text);
  assert.equal(texts[0], "Dit hold mangler et navn");
});

test("én manglende spiller skrives i ental", () => {
  const teams = teamsFromSaved([], playInPhase);
  teams[0].name = "Baron Bandits";
  [1, 7, 8, 4].forEach((id) => placePlayer(teams, byId(id), 1));
  const texts = draftProblems(teams, cardsById, playInPhase).map((problem) => problem.text);
  assert.deepEqual(texts, ["Dit hold mangler 1 spiller – vælg en spiller til hver rolle"]);
});

test("navn og antal spillere får hver sin besked", () => {
  const teams = teamsFromSaved([], swissPhase);
  teams[0].name = "Baron Bandits";
  const texts = draftProblems(teams, cardsById, swissPhase).map((problem) => problem.text);
  assert.deepEqual(texts, [
    "Hold B mangler et navn",
    "Hold A mangler 5 spillere – vælg en spiller til hver rolle",
    "Hold B mangler 5 spillere – vælg en spiller til hver rolle",
  ]);
});

test("gemte valg læses ind på rollerne", () => {
  const saved = [{ slot: 1, name: "Baron Bandits", fantasy_pick: [{ role_code: "top", player_id: 6 }] }];
  const [team] = teamsFromSaved(saved, playInPhase);
  assert.equal(team.name, "Baron Bandits");
  assert.deepEqual(team.picks, { top: 6 });
});

test("en spiller kan kun vælges én gang, også på tværs af Swiss-holdene", () => {
  const teams = teamsFromSaved([], swissPhase);
  assert.equal(placePlayer(teams, byId(1), 1), true);
  assert.equal(placePlayer(teams, byId(1), 2), false);
  assert.deepEqual(teams[1].picks, {});
});

test("en ny spiller på samme rolle erstatter den gamle", () => {
  const teams = teamsFromSaved([], playInPhase);
  placePlayer(teams, byId(1), 1);
  placePlayer(teams, byId(6), 1);
  assert.equal(teams[0].picks.top, 6);
});

test("pris lægges sammen, og fjernede spillere tæller ikke", () => {
  const teams = teamsFromSaved([], playInPhase);
  [1, 4].forEach((id) => placePlayer(teams, byId(id), 1));
  assert.equal(teamCost(teams[0], cardsById), 48);
  removePlayer(teams, 1, "top");
  assert.equal(teamCost(teams[0], cardsById), 22);
});

test("for få spillere er en fejl, der beder om at vælge en spiller", () => {
  const teams = teamsFromSaved([], playInPhase);
  teams[0].name = "Baron Bandits";
  placePlayer(teams, byId(6), 1);
  const problems = draftProblems(teams, cardsById, playInPhase);
  assert.deepEqual(problems, [{ isRuleBroken: true, text: "Dit hold mangler 4 spillere – vælg en spiller til hver rolle" }]);
});

test("over budget og for mange fra samme hold er regelbrud", () => {
  const teams = teamsFromSaved([], playInPhase);
  teams[0].name = "Baron Bandits";
  [1, 2, 3, 4, 5].forEach((id) => placePlayer(teams, byId(id), 1)); // 3 KC + 2 C9 = 122
  const texts = draftProblems(teams, cardsById, playInPhase).map((problem) => problem.text);
  assert.deepEqual(texts, ["Dit hold er 22 over budget", "3 spillere fra KC (højst 2)"]);
});

test("et gyldigt hold har ingen problemer", () => {
  const teams = teamsFromSaved([], playInPhase);
  teams[0].name = "Baron Bandits";
  [1, 7, 8, 4, 10].forEach((id) => placePlayer(teams, byId(id), 1)); // 26+14+18+22+14 = 94
  assert.deepEqual(draftProblems(teams, cardsById, playInPhase), []);
});

test("finalen har intet budget og tillader 3 fra samme prohold", () => {
  const teams = teamsFromSaved([], finalPhase);
  teams[0].name = "Baron Bandits";
  [1, 2, 3, 4, 5].forEach((id) => placePlayer(teams, byId(id), 1)); // 3 KC + 2 C9 = 122, men intet budget
  assert.deepEqual(draftProblems(teams, cardsById, finalPhase), []);
});

test("finalen afviser 4 fra samme prohold", () => {
  const roles = ["top", "jungle", "mid", "adc", "support"];
  const cards = roles.map((role, index) => card(201 + index, role, ["T1", "T1", "T1", "T1", "GEN"][index], null));
  const cardsByPlayerId = new Map(cards.map((playerCard) => [playerCard.player_id, playerCard]));
  const teams = teamsFromSaved([], finalPhase);
  teams[0].name = "Baron Bandits";
  cards.forEach((playerCard) => placePlayer(teams, playerCard, 1));
  const texts = draftProblems(teams, cardsByPlayerId, finalPhase).map((problem) => problem.text);
  assert.deepEqual(texts, ["4 spillere fra T1 (højst 3)"]);
});

test("kvartfinalen har intet budget, men højst 1 fra samme prohold", () => {
  const quarterfinalPhase = { teams_per_user: 1, budget: null, max_per_team: 1 };
  const roles = ["top", "jungle", "mid", "adc", "support"];
  const cards = roles.map((role, index) => card(101 + index, role, ["T1", "T1", "GEN", "KC", "BLG"][index], null));
  const cardsByPlayerId = new Map(cards.map((playerCard) => [playerCard.player_id, playerCard]));
  const teams = teamsFromSaved([], quarterfinalPhase);
  teams[0].name = "Baron Bandits";
  cards.forEach((playerCard) => placePlayer(teams, playerCard, 1));
  const texts = draftProblems(teams, cardsByPlayerId, quarterfinalPhase).map((problem) => problem.text);
  assert.deepEqual(texts, ["2 spillere fra T1 (højst 1)"]);
});

test("payload har alle fem roller i fast rækkefølge", () => {
  const teams = teamsFromSaved([], playInPhase);
  [1, 7, 8, 4, 10].forEach((id) => placePlayer(teams, byId(id), 1));
  assert.deepEqual(toSubmitPayload(teams)[0].picks.map((pick) => pick.role), ["top", "jungle", "mid", "adc", "support"]);
});

test("et klik går til hold A, når rollen er ledig dér", () => {
  const teams = teamsFromSaved([], swissPhase);
  assert.equal(slotForCard(teams, byId(1)), 1);
});

test("et klik går til hold B, når rollen er optaget på A", () => {
  const teams = teamsFromSaved([], swissPhase);
  placePlayer(teams, byId(1), 1);
  assert.equal(slotForCard(teams, byId(6)), 2);
});

test("med ét hold går et klik altid til holdet", () => {
  const teams = teamsFromSaved([], playInPhase);
  placePlayer(teams, byId(1), 1);
  assert.equal(slotForCard(teams, byId(6)), 1);
});

test("er rollen optaget på begge hold, går et klik til A", () => {
  const teams = teamsFromSaved([], swissPhase);
  placePlayer(teams, byId(1), 1);
  placePlayer(teams, byId(6), 2);
  assert.equal(slotForCard(teams, card(11, "top", "FUR", 18)), 1);
});
