// Ansvar: Skift mellem fanerne – hvilken side hver fane viser, login på de fanevisninger der kræver det, markering af aktiv fane, #adresse og advarsel om ugemte ændringer
import { errorBox } from "./shared/displayText.js";
import * as homePage from "./views/home.js";
import * as draftPage from "./views/draft/draftPage.js";
import * as leaderboardPage from "./views/leaderboard.js";
import * as myTeamsPage from "./views/myTeams.js";
import * as loginPage from "./views/login.js";

// Nøglerne er fanernes data-view i index.html
const PAGE_BY_TAB = { home: homePage, draft: draftPage, leaderboard: leaderboardPage, mine: myTeamsPage };
const DEFAULT_TAB = "home";
const LOGIN_REQUIRED_TABS = new Set(["draft", "mine"]);   // gæster kan se forside og leaderboard
const pageElement = document.getElementById("view");
const tabButtons = document.querySelectorAll("nav [data-view]");

let appData = null;
let restartAfterLogin = null;
let currentTabName = null;

const hasUnsavedDraft = () => currentTabName === "draft" && draftPage.hasUnsavedChanges();

// Advarer, før brugeren forlader draften med ændringer, der ikke er gemt
export function mayLeaveCurrentPage() {
  if (!hasUnsavedDraft()) return true;
  return confirm("Du har ændringer i dit hold, der ikke er gemt. Vil du forlade siden alligevel?");
}

// Kaldes ved start og efter login; åbner fanen fra adressen (#draft osv.) eller forsiden
export function startNavigation(loadedAppData, restartApp) {
  appData = loadedAppData;
  restartAfterLogin = restartApp;
  showPage(location.hash.slice(1));
}

export const openTab = (tabName) => showPage(tabName);

// Efter log ud er ingen side åben, så der ikke advares om en draft, der ikke længere vises
export function resetCurrentPage() {
  currentTabName = null;
}

async function showPage(requestedTab) {
  const tabName = PAGE_BY_TAB[requestedTab] ? requestedTab : DEFAULT_TAB;
  if (!mayLeaveCurrentPage()) return;
  currentTabName = tabName;
  markActiveTab(tabName);
  if (location.hash !== `#${tabName}`) history.replaceState(null, "", `#${tabName}`);
  pageElement.innerHTML = `<p class="muted">Henter…</p>`;
  try {
    if (LOGIN_REQUIRED_TABS.has(tabName) && !appData.user) {
      loginPage.render(pageElement, { onLoggedIn: restartAfterLogin, reason: "Log ind for at lave din fantasy draft og se dine hold." });
    } else {
      await PAGE_BY_TAB[tabName].render(pageElement, appData);
    }
  } catch (error) {
    pageElement.innerHTML = errorBox(`Noget gik galt: ${error.message}`);
  }
}

function markActiveTab(tabName) {
  tabButtons.forEach((tab) => tab.setAttribute("aria-selected", tab.dataset.view === tabName));
}

tabButtons.forEach((tab) => { tab.onclick = () => showPage(tab.dataset.view); });
window.addEventListener("beforeunload", (event) => {
  if (hasUnsavedDraft()) event.preventDefault();
});
