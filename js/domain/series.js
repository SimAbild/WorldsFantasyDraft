// Ansvar: Samler databasens serie-rækker til kampe og udleder stilling og tidslinje

export const winsNeeded = (bestOf) => Math.ceil(bestOf / 2);

// v_series har én række pr. hold; her bliver det til én serie med to hold
export function groupSeriesRows(rows) {
  const seriesById = new Map();
  for (const row of rows) {
    const series = seriesById.get(row.series_id) ?? {
      seriesId: row.series_id,
      phaseId: row.phase_id,
      bestOf: row.best_of,
      startsAt: row.starts_at,
      lastGameEndedAt: row.last_game_ended_at,
      teams: [],
    };
    series.teams.push({ id: row.pro_team_id, code: row.team_code, name: row.team_name, wins: row.game_wins });
    seriesById.set(row.series_id, series);
  }
  return [...seriesById.values()].map(addResult);
}

function addResult(series) {
  const needed = winsNeeded(series.bestOf);
  const isDecided = series.teams.some((team) => team.wins >= needed);
  const isLive = !isDecided && series.teams.some((team) => team.wins > 0);
  return { ...series, isDecided, isLive };
}

export const isSeriesWinner = (series, team) => team.wins >= winsNeeded(series.bestOf);

// Sejre og nederlag pr. hold i de afgjorte serier
export function phaseRecords(seriesList) {
  const recordByTeam = new Map();
  for (const series of seriesList.filter((item) => item.isDecided)) {
    for (const team of series.teams) {
      const record = recordByTeam.get(team.code) ?? { code: team.code, name: team.name, wins: 0, losses: 0 };
      if (isSeriesWinner(series, team)) record.wins++; else record.losses++;
      recordByTeam.set(team.code, record);
    }
  }
  return [...recordByTeam.values()].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
}

export const seriesLabel = (series) => series.teams.map((team) => team.code).join("–");

// Afsluttede serier i tidsorden: hvert punkt er et tidspunkt, hvor stillingen kan vises
export function finishedSeriesInOrder(seriesList) {
  return seriesList
    .filter((series) => series.lastGameEndedAt)
    .map((series) => ({ at: series.lastGameEndedAt, label: seriesLabel(series) }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

// Udsnit af kampprogrammet omkring "nu": de seneste afgjorte og de næste kampe
export function recentAndUpcomingSeries(seriesList, before = 4, after = 8) {
  const firstOpen = Math.max(0, seriesList.findIndex((series) => !series.isDecided));
  return seriesList.slice(Math.max(0, firstOpen - before), firstOpen + after);
}
