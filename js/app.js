// Ansvar: Starter appen – tjekker login, henter turnering og faser, og skifter mellem fanerne
import * as database from "./database.js";
import { errorBox } from "./shared/displayText.js";
import * as loginView from "./views/login.js";
import * as homeView from "./views/home.js";
import * as draftView from "./views/draft.js";
import * as leaderboardView from "./views/leaderboard.js";
import * as myTeamsView from "./views/myTeams.js";

const VIEWS = { home: homeView, draft: draftView, leaderboard: leaderboardView, mine: myTeamsView };
const DEFAULT_VIEW = "home";
const viewRoot = document.getElementById("view");
const topbar = document.getElementById("topbar");
let context = null;

let currentViewName = null;

// Advarer, før brugeren forlader draften med ændringer, der ikke er gemt
function mayLeaveCurrentView() {
  if (currentViewName !== "draft" || !draftView.hasUnsavedChanges()) return true;
  return confirm("Du har ændringer i dit hold, der ikke er gemt. Vil du forlade siden alligevel?");
}

async function showView(name) {
  const viewName = VIEWS[name] ? name : DEFAULT_VIEW;
  if (!mayLeaveCurrentView()) return;
  currentViewName = viewName;
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
  const [profile, tournament] = await Promise.all([database.fetchProfile(user.id), database.fetchCurrentTournament()]);
  const phases = await database.fetchPhases(tournament.id);
  return { user, profile, tournament, phases };
}

async function start() {
  const user = await database.fetchCurrentUser();
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
document.getElementById("logout").onclick = async () => {
  if (!mayLeaveCurrentView()) return;
  await database.signOut();
  currentViewName = null;
  start();
};
window.addEventListener("beforeunload", (event) => {
  if (currentViewName === "draft" && draftView.hasUnsavedChanges()) event.preventDefault();
});
start();
