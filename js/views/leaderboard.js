// Leaderboard: stilling i ligaen, og hvem der førte efter hver afsluttet serie
import * as api from "../api.js";
import { esc, day, time, errorBox } from "../ui.js";

let selectedLeague = null;

function leagueForms(err = "") {
  return `<div class="panel"><h3>Ligaer</h3>
    <div class="row">
      <label for="jc">Invitationskode<input id="jc" maxlength="8" placeholder="fx 3fa9c21b"></label>
      <button class="btn" id="join">Join liga</button>
    </div>
    <div class="row">
      <label for="ln">Ny liga<input id="ln" maxlength="40" placeholder="Vennerne"></label>
      <button class="btn ghost" id="create">Opret liga</button>
    </div>
    ${err ? errorBox(err) : ""}</div>`;
}

export async function render(root, ctx) {
  const { phases, user } = ctx;
  const leagues = await api.myLeagues();
  const wireForms = () => {
    root.querySelector("#join").onclick = async () => {
      try { selectedLeague = (await api.joinLeague(root.querySelector("#jc").value)).id; render(root, ctx); }
      catch (ex) { root.querySelector(".panel:last-child").outerHTML = leagueForms(ex.message); wireForms(); }
    };
    root.querySelector("#create").onclick = async () => {
      const name = root.querySelector("#ln").value.trim();
      if (!name) return;
      try { selectedLeague = (await api.createLeague(name)).id; render(root, ctx); }
      catch (ex) { root.querySelector(".panel:last-child").outerHTML = leagueForms(ex.message); wireForms(); }
    };
  };

  if (!leagues.length) {
    root.innerHTML = `<h2>Leaderboard</h2><p class="muted">Du er ikke med i en liga endnu. Join med en kode fra en ven, eller opret din egen.</p>${leagueForms()}`;
    return wireForms();
  }
  if (!leagues.some((l) => l.id === selectedLeague)) selectedLeague = leagues[0].id;
  const league = leagues.find((l) => l.id === selectedLeague);

  // Tidslinje: hver afsluttet serie er et punkt, hvor stillingen kan ses
  const rows = await api.series(phases.map((p) => p.id));
  const steps = [...new Map(rows.filter((r) => r.last_game_ended_at).map((r) => [r.series_id, r])).values()]
    .map((r) => ({ at: r.last_game_ended_at, label: rows.filter((x) => x.series_id === r.series_id).map((x) => x.team_code).join("–") }))
    .sort((a, b) => a.at.localeCompare(b.at));
  let pos = steps.length; // 0 = før første kamp, steps.length = nu

  const cache = new Map();
  const at = (i) => (i >= steps.length ? null : i === 0 ? "1970-01-01T00:00:00Z" : steps[i - 1].at);
  const get = async (i) => {
    if (!cache.has(i)) cache.set(i, api.standings(league.id, at(i) ?? undefined));
    return cache.get(i);
  };

  async function draw() {
    const [now, prev] = await Promise.all([get(pos), get(Math.max(0, pos - 1))]);
    const step = steps[pos - 1];
    root.innerHTML = `
      <div class="lb-head">
        <div><h2>Leaderboard</h2>
          <p class="muted">${leagues.length > 1 ? `<select id="ls">${leagues.map((l) => `<option value="${l.id}" ${l.id === league.id ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select>` : esc(league.name)}
          · ${now.length} spillere · invitationskode <span class="code">${esc(league.invite_code)}</span></p></div>
        ${steps.length ? `<div class="slider"><label for="after">Stilling efter: <span>${step ? `${esc(step.label)} · ${day(step.at)} ${time(step.at)}` : "før første kamp"}</span></label>
          <input type="range" id="after" min="0" max="${steps.length}" value="${pos}">
          <div class="leaders" id="leaders"></div></div>` : ""}
      </div>
      <div class="panel"><div class="tbl"><table>
        <tr><th>#</th><th>Bruger</th><th class="r">Point</th><th class="r">Siden sidst</th><th class="r">Placering</th></tr>
        ${now.map((x) => {
          const p = prev.find((y) => y.user_id === x.user_id);
          const d = p ? p.rank - x.rank : 0;
          const gain = p ? (x.points - p.points).toFixed(1) : "0.0";
          return `<tr class="${x.rank === 1 && x.points > 0 ? "lead" : ""}"><td class="rank">${x.rank}</td>
            <td class="team">${esc(x.username)}${x.user_id === user.id ? ' <span class="muted small">(dig)</span>' : ""}</td>
            <td class="r num">${x.points}</td><td class="r num">+${gain}</td>
            <td class="r"><span class="delta ${d > 0 ? "up" : d < 0 ? "dn" : ""}">${d > 0 ? "▲ " + d : d < 0 ? "▼ " + -d : "–"}</span></td></tr>`;
        }).join("")}
      </table></div><p class="muted small">Andres hold kan ses, når en fase er låst. Point opdateres efter hver kamp.</p></div>
      ${leagueForms()}`;
    wireForms();
    const ls = root.querySelector("#ls");
    if (ls) ls.onchange = () => { selectedLeague = Number(ls.value); render(root, ctx); };
    const sl = root.querySelector("#after");
    if (sl) sl.onchange = () => { pos = Number(sl.value); draw(); };
    drawLeaders();
  }

  // Hvem førte efter hver af de seneste 20 serier
  async function drawLeaders() {
    const el = root.querySelector("#leaders");
    if (!el) return;
    const from = Math.max(1, steps.length - 19);
    const idx = Array.from({ length: steps.length - from + 1 }, (_, i) => from + i);
    const res = await Promise.all(idx.map(get));
    el.innerHTML = idx.map((i, k) => {
      const lead = res[k][0];
      return `<span class="${i === pos ? "cur" : ""}" title="${esc(steps[i - 1].label)}">${esc(steps[i - 1].label)}: ${lead && lead.points > 0 ? esc(lead.username) : "–"}</span>`;
    }).join("");
  }

  await draw();
}
