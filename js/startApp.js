// Ansvar: Starter appen – tjekker login, henter det alle sider skal bruge (appData) og logger ud
import * as database from "./database.js";
import { errorBox } from "./shared/displayText.js";
import * as loginPage from "./views/login.js";
import { startNavigation, mayLeaveCurrentPage, resetCurrentPage } from "./navigation.js";

const pageElement = document.getElementById("view");
const topbar = document.getElementById("topbar");

// appData sendes til hver side: { user, profile, tournament, phases }
async function loadAppData(user) {
  const [profile, tournament] = await Promise.all([database.fetchProfile(user.id), database.fetchCurrentTournament()]);
  const phases = await database.fetchPhases(tournament.id);
  return { user, profile, tournament, phases };
}

async function startApp() {
  const user = await database.fetchCurrentUser();
  if (!user) {
    showLogin();
    return;
  }
  try {
    const appData = await loadAppData(user);
    document.getElementById("whoami").textContent = appData.profile.username;
    topbar.hidden = false;
    startNavigation(appData);
  } catch (error) {
    pageElement.innerHTML = errorBox(`Kunne ikke hente data: ${error.message}`);
  }
}

function showLogin() {
  topbar.hidden = true;
  loginPage.render(pageElement, { onLoggedIn: startApp });
}

async function logOut() {
  if (!mayLeaveCurrentPage()) return;
  await database.signOut();
  resetCurrentPage();
  startApp();
}

document.getElementById("logout").onclick = logOut;
startApp();
