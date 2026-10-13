// Starter appen: tjekker login, henter turnering og faser, og skifter mellem fanerne
import * as api from "./api.js";
import { errorBox } from "./ui.js";
import * as login from "./views/login.js";
import * as home from "./views/home.js";
import * as draft from "./views/draft.js";
import * as leaderboard from "./views/leaderboard.js";
import * as mine from "./views/mine.js";

const VIEWS = { home, draft, leaderboard, mine };
const root = document.getElementById("view");
const topbar = document.getElementById("topbar");
let ctx = null;

async function show(name) {
  const view = VIEWS[name] ? name : "home";
  document.querySelectorAll("nav [data-view]").forEach((b) => b.setAttribute("aria-selected", b.dataset.view === view));
  if (location.hash !== `#${view}`) history.replaceState(null, "", `#${view}`);
  root.innerHTML = `<p class="muted">Henter…</p>`;
  try {
    await VIEWS[view].render(root, ctx);
  } catch (ex) {
    root.innerHTML = errorBox(`Noget gik galt: ${ex.message}`);
  }
}

async function start() {
  const user = await api.currentUser();
  if (!user) {
    topbar.hidden = true;
    return login.render(root, { onLoggedIn: start });
  }
  try {
    const [profile, tournament] = await Promise.all([api.myProfile(user.id), api.tournament()]);
    const phases = await api.phases(tournament.id);
    ctx = { user, profile, tournament, phases };
    document.getElementById("whoami").textContent = profile.username;
    topbar.hidden = false;
    show(location.hash.slice(1));
  } catch (ex) {
    root.innerHTML = errorBox(`Kunne ikke hente data: ${ex.message}`);
  }
}

document.querySelectorAll("nav [data-view]").forEach((b) => b.onclick = () => show(b.dataset.view));
document.getElementById("logout").onclick = async () => { await api.signOut(); start(); };
start();
