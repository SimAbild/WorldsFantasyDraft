// Forside: Worlds-status med kampprogram, stilling, holdstats og bedste spillere
import * as api from "../api.js";
import { esc, day, time, PHASE_NAME, phaseState, ROLE_NAME } from "../ui.js";

// v_series har én række pr. hold; saml dem til én kamp med to hold
function groupSeries(rows) {
  const by = new Map();
  for (const r of rows) {
    const s = by.get(r.series_id) ?? { ...r, teams: [] };
    s.teams.push({ id: r.pro_team_id, code: r.team_code, name: r.team_name, wins: r.game_wins });
    by.set(r.series_id, s);
  }
  return [...by.values()].map((s) => {
    const need = Math.ceil(s.best_of / 2);
    s.done = s.teams.some((t) => t.wins >= need);
    s.live = !s.done && s.teams.some((t) => t.wins > 0);
    return s;
  });
}

// Stilling i en fase: sejre og nederlag i afgjorte serier
function records(list) {
  const rec = new Map();
  for (const s of list.filter((x) => x.done)) {
    const need = Math.ceil(s.best_of / 2);
    for (const t of s.teams) {
      const r = rec.get(t.code) ?? { code: t.code, name: t.name, w: 0, l: 0 };
      if (t.wins >= need) r.w++; else r.l++;
      rec.set(t.code, r);
    }
  }
  return [...rec.values()].sort((a, b) => b.w - a.w || a.l - b.l);
}

export async function render(root, ctx) {
  const { tournament, phases } = ctx;
  const current = phases.find((p) => ["open", "live"].includes(phaseState(p))) ?? phases.find((p) => phaseState(p) === "soon") ?? phases.at(-1);
  const [rows, teams, players] = await Promise.all([
    api.series(phases.map((p) => p.id)), api.teamStats(tournament.id), api.topPlayers(tournament.id),
  ]);
  const all = groupSeries(rows);
  const nextUp = all.find((s) => !s.done);
  const phaseOf = new Map(phases.map((p) => [p.id, p.kind]));
  const inPhase = all.filter((s) => s.phase_id === current.id);
  const standPhase = inPhase.some((s) => s.done) ? current : phases.find((p) => all.some((s) => s.phase_id === p.id && s.done)) ?? current;
  const table = records(all.filter((s) => s.phase_id === standPhase.id));

  // Vis de seneste afsluttede og de næste kampe omkring "nu"
  const idx = Math.max(0, all.findIndex((s) => !s.done));
  const shown = all.slice(Math.max(0, idx - 4), idx + 8);

  root.innerHTML = `
    <div class="hero">
      <div class="stage">Worlds ${tournament.year} · ${PHASE_NAME[current.kind]}</div>
      <h1>${PHASE_NAME[current.kind]}</h1>
      <p class="muted">${nextUp ? `Næste kamp: ${esc(nextUp.teams.map((t) => t.code).join(" mod "))} ${day(nextUp.starts_at)} kl. ${time(nextUp.starts_at)}` : "Ingen kommende kampe med kendte hold."}</p>
    </div>
    <div class="panel">
      <h3>Kampprogram · dansk tid</h3>
      ${shown.length ? `<div class="matches">${shown.map((s) => {
        const [a, b] = s.teams; const need = Math.ceil(s.best_of / 2);
        const status = s.done ? `Færdig · Bo${s.best_of}` : s.live ? `● Live · Bo${s.best_of}` : `${time(s.starts_at)} · Bo${s.best_of}`;
        return `<div class="match"><small>${day(s.starts_at)} · ${PHASE_NAME[phaseOf.get(s.phase_id)]}</small><small class="${s.live ? "live" : ""}">${status}</small>
          <div class="row2 ${s.done && a.wins < need ? "l" : ""}"><span>${esc(a.code)}</span><span class="num">${s.done || s.live ? a.wins : "–"}</span></div>
          <div class="row2 ${s.done && b && b.wins < need ? "l" : ""}"><span>${esc(b?.code ?? "TBD")}</span><span class="num">${s.done || s.live ? b?.wins ?? "" : "–"}</span></div></div>`;
      }).join("")}</div>` : `<div class="empty">Kampene vises her, når holdene er kendt.</div>`}
    </div>
    <div class="cols">
      <div class="panel">
        <h3>Stilling · ${PHASE_NAME[standPhase.kind]}</h3>
        ${table.length ? `<div class="tbl"><table><tr><th>Hold</th><th class="r">Record</th></tr>${table.map((r) =>
          `<tr><td class="team">${esc(r.name)}</td><td class="r"><span class="rec ${standPhase.kind === "swiss" && r.w === 3 ? "q" : standPhase.kind === "swiss" && r.l === 3 ? "o" : ""}">${r.w}-${r.l}</span></td></tr>`).join("")}</table></div>`
          : `<div class="empty">Ingen afgjorte serier endnu.</div>`}
      </div>
      <div class="panel">
        <h3>Holdstats pr. kamp</h3>
        ${teams.length ? `<div class="tbl"><table><tr><th>Hold</th><th class="r">Kampe</th><th class="r">Sejre</th><th class="r">Kills</th><th class="r">Drager</th><th class="r">Baroner</th><th class="r">Tårne</th></tr>${teams.map((t) =>
          `<tr><td class="team">${esc(t.team_code)}</td><td class="r num">${t.games}</td><td class="r num">${t.wins}</td><td class="r num">${t.kills}</td><td class="r num">${t.dragons}</td><td class="r num">${t.barons}</td><td class="r num">${t.towers}</td></tr>`).join("")}</table></div>`
          : `<div class="empty">Stats kommer efter første kamp.</div>`}
      </div>
    </div>
    <div class="panel">
      <h3>Bedste spillere (fantasy-point pr. kamp)</h3>
      ${players.length ? `<div class="tbl"><table><tr><th>Spiller</th><th>Hold</th><th>Rolle</th><th class="r">Kampe</th><th class="r">KDA</th><th class="r">MVP/ACE</th><th class="r">Point/kamp</th></tr>${players.map((p) =>
        `<tr><td class="team">${esc(p.handle)}</td><td>${esc(p.team_code)}</td><td class="muted">${ROLE_NAME[p.role_code]}</td><td class="r num">${p.games}</td><td class="r num">${p.kills}/${p.deaths}/${p.assists}</td><td class="r num">${p.titles}</td><td class="r num">${p.avg_score}</td></tr>`).join("")}</table></div>`
        : `<div class="empty">Point kommer efter første kamp.</div>`}
    </div>`;
}
