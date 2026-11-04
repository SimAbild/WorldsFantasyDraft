// Ansvar: Starter appen – henter det alle sider skal bruge (appData), med eller uden login, og logger ud
import * as database from "./database.js";
import { errorBox } from "./shared/displayText.js";
import { startNavigation, openTab, mayLeaveCurrentPage, resetCurrentPage } from "./navigation.js";

const pageElement = document.getElementById("view");
const topbar = document.getElementById("topbar");

// appData sendes til hver side: { user, profile, tournament, phases }. user og profile er null for gæster.
async function loadAppData(user) {
  const [profile, tournament] = await Promise.all([
    user ? database.fetchProfile(user.id) : null,
    database.fetchCurrentTournament(),
  ]);
  const phases = await database.fetchPhases(tournament.id);
  return { user, profile, tournament, phases };
}

async function startApp() {
  try {
    const user = await database.fetchCurrentUser();
    const appData = await loadAppData(user);
    showUserBar(appData.profile);
    topbar.hidden = false;
    startNavigation(appData, startApp);
  } catch (error) {
    pageElement.innerHTML = errorBox(`Kunne ikke hente data: ${error.message}`);
  }
}

// Indlogget: "brugernavn · Log ud". Gæst: "Log ind".
function showUserBar(profile) {
  document.getElementById("whoami").textContent = profile?.username ?? "";
  document.getElementById("logged-in").hidden = !profile;
  document.getElementById("login").hidden = Boolean(profile);
}

async function logOut() {
  if (!mayLeaveCurrentPage()) return;
  await database.signOut();
  resetCurrentPage();
  startApp();
}

document.getElementById("logout").onclick = logOut;
document.getElementById("login").onclick = () => openTab("draft");
startApp();
