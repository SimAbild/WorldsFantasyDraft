// Ansvar: Tester draft-reglerne på klientsiden
import { test } from "node:test";
import assert from "node:assert/strict";
import { teamsFromSaved, teamCost, placePlayer, removePlayer, draftProblems, toSubmitPayload } from "../js/domain/draftRules.js";

const swissPhase = { teams_per_user: 2, budget: 100, max_per_team: 2 };
const playInPhase = { teams_per_user: 1, budget: 100, max_per_team: 2 };
const finalPhase = { teams_per_user: 1, budget: null, max_per_team: null };

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

test("manglende roller er info, ikke et regelbrud", () => {
  const teams = teamsFromSaved([], playInPhase);
  teams[0].name = "Baron Bandits";
  placePlayer(teams, byId(6), 1);
  const problems = draftProblems(teams, cardsById, playInPhase);
  assert.deepEqual(problems, [{ isRuleBroken: false, text: "Dit hold: 4 roller mangler" }]);
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

test("finalen har hverken budget eller holdgrænse", () => {
  const teams = teamsFromSaved([], finalPhase);
  teams[0].name = "Baron Bandits";
  [1, 2, 3, 4, 5].forEach((id) => placePlayer(teams, byId(id), 1));
  assert.deepEqual(draftProblems(teams, cardsById, finalPhase), []);
});

test("payload har alle fem roller i fast rækkefølge", () => {
  const teams = teamsFromSaved([], playInPhase);
  [1, 7, 8, 4, 10].forEach((id) => placePlayer(teams, byId(id), 1));
  assert.deepEqual(toSubmitPayload(teams)[0].picks.map((pick) => pick.role), ["top", "jungle", "mid", "adc", "support"]);
});
