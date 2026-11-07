// Ansvar: Tester draft-reglerne på klientsiden
import { test } from "node:test";
import assert from "node:assert/strict";
import { teamsFromSaved, teamCost, placePlayer, slotForCard, removePlayer, draftRuleChecks, toSubmitPayload } from "../js/domain/draftRules.js";

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
// Teksterne på de røde punkter i tjeklisten
const unmetTexts = (teams, cardsByPlayerId, phase) =>
  draftRuleChecks(teams, cardsByPlayerId, phase).filter((check) => !check.isMet).map((check) => check.text);

test("nye hold starter uden navn", () => {
  assert.deepEqual(teamsFromSaved([], swissPhase).map((team) => team.name), ["", ""]);
  assert.deepEqual(teamsFromSaved([], playInPhase).map((team) => team.name), [""]);
});

test("et hold uden navn kan ikke gemmes", () => {
  const teams = teamsFromSaved([], swissPhase);
  teams[0].name = "Baron Bandits";
  assert.equal(unmetTexts(teams, cardsById, swissPhase)[0], "Hold B mangler et navn");
});

test("et navn med kun mellemrum tæller som manglende navn", () => {
  const teams = teamsFromSaved([], playInPhase);
  teams[0].name = "   ";
  assert.equal(unmetTexts(teams, cardsById, playInPhase)[0], "Dit hold mangler et navn");
});

test("spillerantallet vises som antal af 5", () => {
  const teams = teamsFromSaved([], playInPhase);
  teams[0].name = "Baron Bandits";
  [1, 7, 8, 4].forEach((id) => placePlayer(teams, byId(id), 1));
  assert.deepEqual(unmetTexts(teams, cardsById, playInPhase), ["4 af 5 spillere"]);
});

test("med to hold står holdets bogstav foran", () => {
  const teams = teamsFromSaved([], swissPhase);
  teams[0].name = "Baron Bandits";
  assert.deepEqual(unmetTexts(teams, cardsById, swissPhase), ["Hold B mangler et navn", "Hold A: 0 af 5 spillere", "Hold B: 0 af 5 spillere"]);
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

test("for få spillere er rødt", () => {
  const teams = teamsFromSaved([], playInPhase);
  teams[0].name = "Baron Bandits";
  placePlayer(teams, byId(6), 1);
  assert.deepEqual(unmetTexts(teams, cardsById, playInPhase), ["1 af 5 spillere"]);
});

test("over budget og for mange fra samme hold er regelbrud", () => {
  const teams = teamsFromSaved([], playInPhase);
  teams[0].name = "Baron Bandits";
  [1, 2, 3, 4, 5].forEach((id) => placePlayer(teams, byId(id), 1)); // 3 KC + 2 C9 = 122
  assert.deepEqual(unmetTexts(teams, cardsById, playInPhase), ["22 over budget", "3 fra KC (højst 2)"]);
});

test("et gyldigt hold viser hele regelsættet i grønt", () => {
  const teams = teamsFromSaved([], playInPhase);
  teams[0].name = "Baron Bandits";
  [1, 7, 8, 4, 10].forEach((id) => placePlayer(teams, byId(id), 1)); // 26+14+18+22+14 = 94
  assert.deepEqual(draftRuleChecks(teams, cardsById, playInPhase), [
    { isMet: true, text: "Dit hold har et navn" },
    { isMet: true, text: "5 af 5 spillere" },
    { isMet: true, text: "Budget 94 af 100" },
    { isMet: true, text: "Højst 2 fra samme prohold" },
  ]);
});

test("et nyt hold viser regelsættet med det manglende i rødt", () => {
  const semifinalPhase = { teams_per_user: 1, budget: null, max_per_team: 2 };
  assert.deepEqual(draftRuleChecks(teamsFromSaved([], semifinalPhase), cardsById, semifinalPhase), [
    { isMet: false, text: "Dit hold mangler et navn" },
    { isMet: false, text: "0 af 5 spillere" },
    { isMet: true, text: "Højst 2 fra samme prohold" },
  ]);
});

test("finalen har intet budget og tillader 3 fra samme prohold", () => {
  const teams = teamsFromSaved([], finalPhase);
  teams[0].name = "Baron Bandits";
  [1, 2, 3, 4, 5].forEach((id) => placePlayer(teams, byId(id), 1)); // 3 KC + 2 C9 = 122, men intet budget
  assert.deepEqual(unmetTexts(teams, cardsById, finalPhase), []);
});

test("finalen afviser 4 fra samme prohold", () => {
  const roles = ["top", "jungle", "mid", "adc", "support"];
  const cards = roles.map((role, index) => card(201 + index, role, ["T1", "T1", "T1", "T1", "GEN"][index], null));
  const cardsByPlayerId = new Map(cards.map((playerCard) => [playerCard.player_id, playerCard]));
  const teams = teamsFromSaved([], finalPhase);
  teams[0].name = "Baron Bandits";
  cards.forEach((playerCard) => placePlayer(teams, playerCard, 1));
  assert.deepEqual(unmetTexts(teams, cardsByPlayerId, finalPhase), ["4 fra T1 (højst 3)"]);
});

test("kvartfinalen har intet budget, men højst 1 fra samme prohold", () => {
  const quarterfinalPhase = { teams_per_user: 1, budget: null, max_per_team: 1 };
  const roles = ["top", "jungle", "mid", "adc", "support"];
  const cards = roles.map((role, index) => card(101 + index, role, ["T1", "T1", "GEN", "KC", "BLG"][index], null));
  const cardsByPlayerId = new Map(cards.map((playerCard) => [playerCard.player_id, playerCard]));
  const teams = teamsFromSaved([], quarterfinalPhase);
  teams[0].name = "Baron Bandits";
  cards.forEach((playerCard) => placePlayer(teams, playerCard, 1));
  assert.deepEqual(unmetTexts(teams, cardsByPlayerId, quarterfinalPhase), ["2 fra T1 (højst 1)"]);
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
