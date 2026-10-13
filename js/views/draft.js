// Fantasy draft: vælg fase, vælg hold i power ranking-rækkefølge, træk spillerkort ind på dine hold
import * as api from "../api.js";
import { esc, card, dayTime, ROLES, ROLE_NAME, PHASE_NAME, TIER_NAME, phaseState, STATE_NAME, errorBox } from "../ui.js";

let selectedPhaseId = null; // huskes mellem besøg på fanen

function explainHTML(ph) {
  const rules = ph.budget
    ? `Budget <b>${ph.budget}</b> pr. hold. Én spiller pr. rolle. Højst <b>${ph.max_per_team} spillere fra samme prohold</b>${ph.teams_per_user === 2 ? " på tværs af begge hold. En spiller kan ikke være på begge hold" : ""}.`
    : `Fri leg: intet budget og ingen grænse pr. prohold. Én spiller pr. rolle.`;
  return `<details class="how" open><summary>Sådan får du point</summary><div class="explain">
    <div><h3>Point pr. kamp</h3>
      <p>En spiller får <b>omkring 20 point</b> i en gennemsnitlig kamp for sin rolle. Bedre end rollens snit giver flere, dårligere giver færre.</p>
      <p class="formula">20 + 10 × præstation + MVP/ACE</p>
      <p>Bedste spiller på vinderholdet og bedste på taberholdet får <b>+3</b>. En stærk spiller på et tabende hold kan slå en svag spiller på vinderholdet.</p></div>
    <div><h3>Fra kamp til fase</h3>
      <p>Seriepoint er <b>snittet</b> af spillerens kampe i serien. Fasepoint er <b>snittet</b> af hans serier i fasen.</p>
      <p>Flere spillede kampe giver ikke flere point. Et hold, der ryger ud tidligt, kan stadig give mange point.</p>
      <p>Din score er summen af alle dine hold: Play-In, Swiss A, Swiss B, kvartfinale, semifinale og finale.</p></div>
    <div><h3>Priser og regler</h3>
      <p>Swiss: Favorit <b>26</b> · Stærk <b>22</b> · Middel <b>18</b> · Underdog <b>14</b>. Kvartfinale og semifinale: <b>23</b> / <b>17</b>. Finalen er fri.</p>
      <p>${rules}</p>
      <p>Kun startspillere kan vælges. "Lock in" gemmer; du kan ændre indtil fristen.</p></div>
  </div></details>`;
}

export async function render(root, ctx) {
  const { phases, user } = ctx;
  const open = phases.find((p) => phaseState(p) === "open");
  if (!phases.some((p) => p.id === selectedPhaseId)) selectedPhaseId = (open ?? phases.find((p) => phaseState(p) !== "done") ?? phases.at(-1)).id;
  const ph = phases.find((p) => p.id === selectedPhaseId);
  const state = phaseState(ph);
  const editable = state === "open";

  const [cards, existing] = await Promise.all([api.playerCards(ph.id), api.myTeams(ph.id, user.id)]);
  const byId = new Map(cards.map((c) => [c.player_id, c]));
  const proTeams = [...new Map(cards.map((c) => [c.pro_team_id, c])).values()]
    .sort((a, b) => (a.power_rank ?? 99) - (b.power_rank ?? 99) || a.team_code.localeCompare(b.team_code));

  // Brugerens hold i fasen: eksisterende valg, ellers tomme pladser
  const teams = Array.from({ length: ph.teams_per_user }, (_, i) => {
    const t = existing.find((x) => x.slot === i + 1);
    const picks = {};
    t?.fantasy_pick.forEach((p) => { picks[p.role_code] = p.player_id; });
    return { slot: i + 1, name: t?.name ?? (ph.teams_per_user === 2 ? `Hold ${"AB"[i]}` : "Mit hold"), picks };
  });
  let openTeam = proTeams[0]?.pro_team_id;
  let message = existing.length ? `<span class="muted">Gemt tidligere. Du kan ændre indtil ${dayTime(ph.locks_at)}.</span>` : "";

  const used = () => new Set(teams.flatMap((t) => Object.values(t.picks)));
  const cost = (t) => Object.values(t.picks).reduce((s, id) => s + (byId.get(id)?.price ?? 0), 0);

  function problems() {
    const out = [];
    for (const t of teams) {
      const missing = ROLES.filter((r) => !t.picks[r]).length;
      if (missing) out.push({ bad: false, text: `${esc(t.name)}: ${missing} roller mangler` });
      if (ph.budget && cost(t) > ph.budget) out.push({ bad: true, text: `${esc(t.name)} er ${cost(t) - ph.budget} over budget` });
    }
    if (ph.max_per_team) {
      const count = new Map();
      used().forEach((id) => { const c = byId.get(id); if (c) count.set(c.team_code, (count.get(c.team_code) ?? 0) + 1); });
      count.forEach((n, code) => n > ph.max_per_team && out.push({ bad: true, text: `${n} spillere fra ${esc(code)} (højst ${ph.max_per_team})` }));
    }
    return out;
  }

  function place(id, slot) {
    if (!editable || used().has(id)) return;
    const c = byId.get(id);
    teams[slot - 1].picks[c.role_code] = id;
    message = "";
    draw();
  }

  function draw() {
    const u = used();
    const probs = problems();
    const shown = cards.filter((c) => c.pro_team_id === openTeam).sort((a, b) => a.role_order - b.role_order);
    const ot = proTeams.find((t) => t.pro_team_id === openTeam);
    root.innerHTML = `
      <div class="phases" role="group" aria-label="Faser">${phases.map((p) => {
        const s = phaseState(p);
        return `<button class="phase" aria-pressed="${p.id === ph.id}" data-id="${p.id}"><span class="st ${s}">${STATE_NAME[s]}</span><b>${PHASE_NAME[p.kind]}</b><span>Låser ${dayTime(p.locks_at)} · ${p.teams_per_user} hold</span></button>`;
      }).join("")}</div>
      <div><div class="stage">${PHASE_NAME[ph.kind]} · ${editable ? `låser ${dayTime(ph.locks_at)}` : STATE_NAME[state]}</div>
        <h2>${ph.teams_per_user === 2 ? "Byg dine to hold" : "Byg dit hold"}</h2></div>
      ${explainHTML(ph)}
      ${cards.length ? `<div class="panel">
        <h3>Hold efter power ranking</h3>
        <div class="teams" role="group" aria-label="Vælg hold">${proTeams.map((t) =>
          `<button class="tchip" aria-pressed="${t.pro_team_id === openTeam}" data-team="${t.pro_team_id}"><span class="pr">${t.power_rank ? `#${t.power_rank}` : "–"} · ${esc(t.region ?? "")}</span><span class="tn">${esc(t.team_code)}</span><span class="tp">${t.tier_code ? `${TIER_NAME[t.tier_code]} · ${t.price}` : "Fri"}</span></button>`).join("")}</div>
        <div class="dropdown"><header><h3 style="color:var(--fg)">${esc(ot?.team_name ?? "")}</h3>
          <span class="muted small">${editable ? "Træk et kort til en rolle, eller klik for at sætte det på det første hold" + (ph.teams_per_user === 2 ? " (shift+klik: andet hold)" : "") : "Draften er ikke åben"}</span></header>
          <div class="cards">${shown.map((c) => card(c, `draggable="${editable && !u.has(c.player_id)}" aria-disabled="${!editable || u.has(c.player_id)}"`)).join("")}</div></div>
      </div>` : `<div class="empty">Holdene til ${PHASE_NAME[ph.kind]} er ikke kendt endnu.</div>`}
      <div class="myteams ${ph.teams_per_user === 1 ? "one" : ""}">${teams.map((t) => {
        const c = cost(t), over = ph.budget && c > ph.budget;
        return `<div class="myteam"><header>
          <label for="tn${t.slot}" style="gap:4px">${ph.teams_per_user === 2 ? `${PHASE_NAME[ph.kind]}-hold ${"AB"[t.slot - 1]}` : `${PHASE_NAME[ph.kind]}-hold`}<input class="tname" id="tn${t.slot}" data-slot="${t.slot}" maxlength="30" value="${esc(t.name)}" ${editable ? "" : "disabled"}></label>
          ${ph.budget ? `<div class="budget"><span><b class="num" style="color:var(--fg)">${c}</b> / ${ph.budget} brugt</span><div class="bar ${over ? "over" : ""}"><i style="width:${Math.min(100, (c / ph.budget) * 100)}%"></i></div></div>` : `<div class="budget">Fri leg · intet budget</div>`}
        </header>
        <div class="slots">${ROLES.map((r) => {
          const id = t.picks[r];
          return `<div class="slot" data-slot="${t.slot}" data-role="${r}">${id && byId.get(id) ? card(byId.get(id), editable ? 'title="Klik for at fjerne"' : "") : `<span>${ROLE_NAME[r]}</span>${editable ? '<span style="font-size:10px">træk spiller hertil</span>' : ""}`}</div>`;
        }).join("")}</div></div>`;
      }).join("")}</div>
      ${editable ? `<div class="lockbar"><div class="rules">${probs.length ? probs.map((p) => `<span class="${p.bad ? "bad" : ""}">${p.text}</span>`).join("") : `<span class="good">Alt er klar</span>`}</div>
        <div class="row"><span role="status">${message}</span><button class="btn" id="lockin" ${probs.length ? "disabled" : ""}>${ph.teams_per_user === 2 ? "Lock in teams" : "Lock in team"}</button></div></div>` : ""}`;
    wire();
  }

  function wire() {
    root.querySelectorAll(".phase").forEach((b) => b.onclick = () => { selectedPhaseId = Number(b.dataset.id); render(root, ctx); });
    root.querySelectorAll(".tchip").forEach((b) => b.onclick = () => { openTeam = Number(b.dataset.team); draw(); });
    root.querySelectorAll("input.tname").forEach((inp) => inp.oninput = () => { teams[inp.dataset.slot - 1].name = inp.value; });
    if (!editable) return;
    root.querySelectorAll(".dropdown .card").forEach((el) => {
      const id = Number(el.dataset.id);
      el.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", String(id)));
      el.addEventListener("click", (e) => place(id, e.shiftKey && teams.length === 2 ? 2 : 1));
      el.addEventListener("keydown", (e) => { if (e.key === "Enter") place(id, e.shiftKey && teams.length === 2 ? 2 : 1); });
    });
    root.querySelectorAll(".slot").forEach((s) => {
      s.addEventListener("dragover", (e) => { e.preventDefault(); s.classList.add("over"); });
      s.addEventListener("dragleave", () => s.classList.remove("over"));
      s.addEventListener("drop", (e) => {
        e.preventDefault(); s.classList.remove("over");
        const c = byId.get(Number(e.dataTransfer.getData("text/plain")));
        if (!c) return;
        if (c.role_code !== s.dataset.role) { message = `<span class="error">${esc(c.handle)} er ${ROLE_NAME[c.role_code]} og kan kun stå på ${ROLE_NAME[c.role_code]}.</span>`; return draw(); }
        place(c.player_id, Number(s.dataset.slot));
      });
      const placed = s.querySelector(".card");
      if (placed) placed.onclick = () => { delete teams[s.dataset.slot - 1].picks[s.dataset.role]; draw(); };
    });
    const btn = root.querySelector("#lockin");
    if (btn) btn.onclick = async () => {
      btn.disabled = true;
      try {
        await api.submitDraft(ph.id, teams.map((t) => ({
          slot: t.slot, name: t.name, picks: ROLES.map((r) => ({ role: r, player_id: t.picks[r] })),
        })));
        message = `<span class="ok">Gemt. Du kan ændre indtil ${dayTime(ph.locks_at)}.</span>`;
      } catch (ex) {
        message = errorBox(ex.message);
      }
      draw();
    };
  }

  draw();
}
