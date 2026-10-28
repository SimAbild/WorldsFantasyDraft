// Ansvar: Skift mellem fanerne – hvilken side hver fane viser, markering af aktiv fane, #adresse og advarsel om ugemte ændringer
import { errorBox } from "./shared/displayText.js";
import * as homePage from "./views/home.js";
import * as draftPage from "./views/draft.js";
import * as leaderboardPage from "./views/leaderboard.js";
import * as myTeamsPage from "./views/myTeams.js";

// Nøglerne er fanernes data-view i index.html
const PAGE_BY_TAB = { home: homePage, draft: draftPage, leaderboard: leaderboardPage, mine: myTeamsPage };
const DEFAULT_TAB = "home";
const pageElement = document.getElementById("view");
const tabButtons = document.querySelectorAll("nav [data-view]");

let appData = null;
let currentTabName = null;

const hasUnsavedDraft = () => currentTabName === "draft" && draftPage.hasUnsavedChanges();

// Advarer, før brugeren forlader draften med ændringer, der ikke er gemt
export function mayLeaveCurrentPage() {
  if (!hasUnsavedDraft()) return true;
  return confirm("Du har ændringer i dit hold, der ikke er gemt. Vil du forlade siden alligevel?");
}

// Kaldes efter login; åbner fanen fra adressen (#draft osv.) eller forsiden
export function startNavigation(loadedAppData) {
  appData = loadedAppData;
  showPage(location.hash.slice(1));
}

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
    await PAGE_BY_TAB[tabName].render(pageElement, appData);
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
