// Ansvar: Tester sammensætning af serier, stilling og tidslinje
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupSeriesRows, phaseRecords, finishedSeriesInOrder, recentAndUpcomingSeries } from "../js/domain/series.js";

const row = (series_id, team_code, game_wins, best_of = 3, last_game_ended_at = null) => ({
  series_id, phase_id: 1, best_of, starts_at: `2026-10-2${series_id}T17:00:00Z`, last_game_ended_at,
  pro_team_id: team_code.length, team_code, team_name: team_code, game_wins,
});

test("to rækker pr. serie bliver til én serie med to hold", () => {
  const [series] = groupSeriesRows([row(1, "KC", 2), row(1, "C9", 1)]);
  assert.equal(series.teams.length, 2);
  assert.equal(series.isDecided, true);
  assert.equal(series.isLive, false);
});

test("en serie i gang er live, en ikke-startet er ingen af delene", () => {
  const [live, upcoming] = groupSeriesRows([row(1, "KC", 1), row(1, "C9", 0), row(2, "FUR", 0), row(2, "MVK", 0)]);
  assert.equal(live.isLive, true);
  assert.equal(upcoming.isLive || upcoming.isDecided, false);
});

test("Bo5 kræver tre sejre", () => {
  const [series] = groupSeriesRows([row(1, "KC", 2, 5), row(1, "C9", 2, 5)]);
  assert.equal(series.isDecided, false);
});

test("stillingen tæller sejre og nederlag og sorterer efter sejre", () => {
  const all = groupSeriesRows([
    row(1, "KC", 1, 1), row(1, "C9", 0, 1),
    row(2, "KC", 1, 1), row(2, "FUR", 0, 1),
    row(3, "C9", 1, 1), row(3, "FUR", 0, 1),
  ]);
  assert.deepEqual(phaseRecords(all).map((record) => [record.code, record.wins, record.losses]),
    [["KC", 2, 0], ["C9", 1, 1], ["FUR", 0, 2]]);
});

test("tidslinjen har kun afsluttede serier i tidsorden", () => {
  const all = groupSeriesRows([
    row(1, "KC", 1, 1, "2026-10-15T20:00:00Z"), row(1, "C9", 0, 1, "2026-10-15T20:00:00Z"),
    row(2, "FUR", 1, 1, "2026-10-15T19:00:00Z"), row(2, "MVK", 0, 1, "2026-10-15T19:00:00Z"),
    row(3, "G2", 0, 1), row(3, "T1", 0, 1),
  ]);
  assert.deepEqual(finishedSeriesInOrder(all).map((step) => step.label), ["FUR–MVK", "KC–C9"]);
});

test("kampprogrammet viser kampe omkring den første uafgjorte", () => {
  const list = Array.from({ length: 20 }, (_, index) => ({ isDecided: index < 10 }));
  const window = recentAndUpcomingSeries(list, 4, 8);
  assert.equal(window.length, 12);
  assert.equal(list.indexOf(window[0]), 6);
});
