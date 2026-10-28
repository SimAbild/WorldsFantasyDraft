// Ansvar: Teksten "Sådan får du point" på draft-siden – pointsystem, priser og regler forklaret for brugeren
import { isTwoTeamPhase } from "../../domain/phase.js";

// Valgfri forklaring: isOpen er brugerens eget valg, så den forbliver som brugeren efterlod den
export function howPointsWorkHtml(phase, isOpen) {
  return `<details class="rules-toggle" ${isOpen ? "open" : ""}><summary>Sådan får du point (valgfrit at læse)</summary><div class="rules-explained">
    <div><h3>Point pr. kamp</h3>
      <p>En spiller får <b>omkring 20 point</b> i en gennemsnitlig kamp for sin rolle. Bedre end rollens snit giver flere, dårligere giver færre.</p>
      <p>Rollens snit er regnet ud fra <b>Worlds 2025</b> og ændrer sig ikke under turneringen. En kamp giver derfor de samme point i dag som efter finalen.</p>
      <p class="formula">20 + 10 × præstation + MVP/ACE</p>
      <p>Bedste spiller på vinderholdet og bedste på taberholdet får <b>+3</b>. En stærk spiller på et tabende hold kan slå en svag spiller på vinderholdet.</p></div>
    <div><h3>Fra kamp til fase</h3>
      <p>Seriepoint er <b>snittet</b> af spillerens kampe i serien. Fasepoint er <b>snittet</b> af hans serier i fasen.</p>
      <p>Flere spillede kampe giver ikke flere point. Et hold, der ryger ud tidligt, kan stadig give mange point.</p>
      <p>Din score er summen af alle dine hold: Play-In, Swiss A, Swiss B, kvartfinale, semifinale og finale.</p></div>
    <div><h3>Priser og regler</h3>
      <p>Swiss: Favorit <b>26</b> · Stærk <b>22</b> · Middel <b>18</b> · Underdog <b>14</b>. Kvartfinale og semifinale: <b>23</b> / <b>17</b>. Finalen er fri.</p>
      <p>${teamRulesText(phase)}</p>
      <p>Kun startspillere kan vælges. "Lock in" gemmer; du kan ændre indtil fristen.</p></div>
    <div><h3>Hvorfor har holdene forskellige priser?</h3>
      <p>Prisen er en vurdering af holdets styrke <b>før</b> fasen, ikke af den enkelte spiller.</p>
      <p>Prisklassen følger holdets placering i <b>lolesports' Global Power Rankings</b>, når draften åbner. Højest placeret er dyrest.</p>
      <p>Hvert holds begrundelse står, når du vælger holdet. Underdogs er billige, men kan score lige så mange point.</p></div>
    <div class="roles-explained"><h3>Point pr. rolle</h3>
      <p>Alle roller giver <b>i snit lige mange point</b>. Forskellen er, hvad de får point for.</p>
      <p><b>Top:</b> kills og CS/min vejer tungest, plus skade og en stor andel af holdets kills.</p>
      <p><b>Jungle:</b> kills, assists, kill participation og ødelagte wards. Tillæg når holdet tager drage (<b>+0,5</b>), elder (<b>+1</b>) og baron (<b>+1</b>). CS og skade tæller ikke.</p>
      <p><b>Mid:</b> kills, CS/min og skade, plus andel af holdets kills.</p>
      <p><b>ADC:</b> kills, CS/min, skade og killandel vejer tungest. Deaths koster mest af alle roller.</p>
      <p><b>Support:</b> assists, kills, kill participation og wards (placeret og ødelagt). Deaths koster mindst. CS og skade tæller ikke.</p>
      <p>Alle undtagen support får <b>+2</b> for 10+ kills eller assists i en kamp. En sejr giver lidt ekstra.</p></div>
  </div></details>`;
}

// Fasen uden budget (finalen) er fri leg
function teamRulesText(phase) {
  if (!phase.budget) return "Fri leg: intet budget og ingen grænse pr. prohold. Én spiller pr. rolle.";
  const acrossBothTeams = isTwoTeamPhase(phase) ? " på tværs af begge hold. En spiller kan ikke være på begge hold" : "";
  return `Budget <b>${phase.budget}</b> pr. hold. Én spiller pr. rolle. Højst <b>${phase.max_per_team} spillere fra samme prohold</b>${acrossBothTeams}.`;
}
