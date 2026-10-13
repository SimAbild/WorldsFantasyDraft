// Ansvar: Starter appen – tjekker login, henter turnering og faser, og skifter mellem fanerne
import * as api from "./api.js";
import { errorBox } from "./ui.js";
import * as loginView from "./views/login.js";
import * as homeView from "./views/home.js";
import * as draftView from "./views/draft.js";
import * as leaderboardView from "./views/leaderboard.js";
import * as myTeamsView from "./views/mine.js";

const VIEWS = { home: homeView, draft: draftView, leaderboard: leaderboardView, mine: myTeamsView };
const DEFAULT_VIEW = "home";
const viewRoot = document.getElementById("view");
const topbar = document.getElementById("topbar");
let context = null;

async function showView(name) {
  const viewName = VIEWS[name] ? name : DEFAULT_VIEW;
  markActiveTab(viewName);
  if (location.hash !== `#${viewName}`) history.replaceState(null, "", `#${viewName}`);
  viewRoot.innerHTML = `<p class="muted">Henter…</p>`;
  try {
    await VIEWS[viewName].render(viewRoot, context);
  } catch (error) {
    viewRoot.innerHTML = errorBox(`Noget gik galt: ${error.message}`);
  }
}

function markActiveTab(viewName) {
  document.querySelectorAll("nav [data-view]").forEach((tab) => tab.setAttribute("aria-selected", tab.dataset.view === viewName));
}

async function loadContext(user) {
  const [profile, tournament] = await Promise.all([api.fetchProfile(user.id), api.fetchCurrentTournament()]);
  const phases = await api.fetchPhases(tournament.id);
  return { user, profile, tournament, phases };
}

async function start() {
  const user = await api.fetchCurrentUser();
  if (!user) {
    topbar.hidden = true;
    loginView.render(viewRoot, { onLoggedIn: start });
    return;
  }
  try {
    context = await loadContext(user);
    document.getElementById("whoami").textContent = context.profile.username;
    topbar.hidden = false;
    showView(location.hash.slice(1));
  } catch (error) {
    viewRoot.innerHTML = errorBox(`Kunne ikke hente data: ${error.message}`);
  }
}

document.querySelectorAll("nav [data-view]").forEach((tab) => { tab.onclick = () => showView(tab.dataset.view); });
document.getElementById("logout").onclick = async () => { await api.signOut(); start(); };
start();
