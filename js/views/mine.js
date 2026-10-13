// Mine hold: point pr. hold og pr. spiller, med seriepoint efter hver kamp
import * as api from "../api.js";
import { esc, ROLES, ROLE_NAME, PHASE_NAME, phaseState, STATE_NAME } from "../ui.js";

export async function render(root, ctx) {
  const { phases, user } = ctx;
  const picks = await api.myPickPoints(user.id);
  if (!picks.length) {
    root.innerHTML = `<h2>Mine hold</h2><div class="empty">Du har ingen hold endnu. Byg dem under Fantasy draft.</div>`;
    return;
  }

  // Seriepoint for de valgte spillere, hentet pr. fase
  const byPhase = new Map();
  await Promise.all(phases.map(async (p) => {
    const ids = [...new Set(picks.filter((x) => x.phase_id === p.id).map((x) => x.player_id))];
    byPhase.set(p.id, await api.seriesPoints(p.id, ids));
  }));

  const total = picks.reduce((s, x) => s + Number(x.points), 0);
  const sections = phases.filter((p) => picks.some((x) => x.phase_id === p.id)).map((p) => {
    const teams = [...new Set(picks.filter((x) => x.phase_id === p.id).map((x) => x.slot))].sort();
    const sp = byPhase.get(p.id) ?? [];
    return `<div><div class="stage">${PHASE_NAME[p.kind]} · ${STATE_NAME[phaseState(p)]}</div>
      <div class="myteams ${teams.length === 1 ? "one" : ""}">${teams.map((slot) => {
        const rows = picks.filter((x) => x.phase_id === p.id && x.slot === slot)
          .sort((a, b) => ROLES.indexOf(a.role_code) - ROLES.indexOf(b.role_code));
        const sum = rows.reduce((s, x) => s + Number(x.points), 0);
        const max = Math.max(30, ...rows.map((x) => Number(x.points)));
        return `<div class="myteam"><header><div><h3>${teams.length === 2 ? `Hold ${"AB"[slot - 1]}` : "Hold"}</h3>
            <div class="team" style="font-size:24px">${esc(rows[0].team_name)}</div></div><div class="score num">${sum.toFixed(1)}</div></header>
          <div style="display:grid;gap:10px">${rows.map((x) => {
            const series = sp.filter((s) => s.player_id === x.player_id);
            return `<div class="pbar"><span><b>${esc(x.handle)}</b> <span class="muted small">${ROLE_NAME[x.role_code]} · ${esc(x.team_code)}${x.price ? ` · ${x.price}` : ""}</span></span>
              <div class="bar"><i style="width:${Math.max(0, (Number(x.points) / max) * 100).toFixed(0)}%"></i></div><span class="num" style="text-align:right">${Number(x.points).toFixed(1)}</span>
              ${series.length ? `<div class="series-pts">${series.map((s, i) => `<span title="${s.games} kampe">Serie ${i + 1}: ${s.series_points}</span>`).join("")}</div>` : ""}</div>`;
          }).join("")}</div>
          <p class="muted small">Holdets point er summen af spillernes fasepoint: snittet af deres serier indtil nu.</p></div>`;
      }).join("")}</div></div>`;
  });

  root.innerHTML = `<div class="lb-head"><div><h2>Mine hold</h2><p class="muted">Point opdateres efter hver kamp</p></div>
    <div style="text-align:right"><div class="muted small" style="letter-spacing:.1em;text-transform:uppercase">I alt</div><div class="score num">${total.toFixed(1)}</div></div></div>
    ${sections.join("")}`;
}
