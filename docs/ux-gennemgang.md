# UX- og tilgængelighedsgennemgang

**Standard:** Nielsens 10 usability-heuristikker og WCAG 2.1 niveau AA · **Dato:** 13. oktober 2026 · **Gælder:** PC-browser (spillet er ikke lavet til mobil)

## Opsummering

| | Antal |
|---|---|
| Fund i alt | 16 |
| Kritiske | 1 |
| Større | 7 |
| Mindre | 8 |
| Rettet | 16 |

Alvorlighed: 🔴 kritisk (blokerer eller irriterer hver gang) · 🟡 større (forvirrer eller koster tid) · 🟢 mindre (polering).

---

## Usability (Nielsens heuristikker)

| # | Heuristik | Fund | Alvor | Rettelse |
|---|---|---|---|---|
| 1 | Minimalistisk design | "Sådan får du point" foldede sig ud igen, hver gang man flyttede en spiller, og var åben fra start. Reglerne blev tvunget på brugeren. | 🔴 | Foldet sammen fra start, og brugerens valg huskes, når siden tegnes om. Overskriften siger "(valgfrit at læse)". |
| 2 | Synlighed af status | Man kunne ikke se, om holdet var gemt. | 🟡 | "Ikke gemt endnu – tryk Lock in for at gemme." vises ved hver ændring, også når holdnavnet rettes. Knappen viser "Gemmer…". |
| 3 | Brugerkontrol | Ændringer forsvandt uden advarsel ved skift af fase, fane eller ved lukning af siden. | 🟡 | Bekræftelse før man forlader draften med ændringer, der ikke er gemt. |
| 4 | Brugerkontrol | En spiller kunne kun fjernes ved at trække en anden ind. | 🟡 | "Fjern"-knap på hver spiller på holdet. |
| 5 | Genkendelse frem for hukommelse | Spillerne havde ingen billeder, så man skulle kende dem på navnet. | 🟡 | Billede af alle spillere på kort, hold, leaderboard-dialog og forside. Initialer, hvis billedet mangler. |
| 6 | Match med virkeligheden | Prisklasserne (Stærk, Middel, Underdog) stod uden begrundelse. | 🟡 | Begrundelse ved hvert hold i draften og en fælles forklaring af kriterierne i reglerne. |
| 7 | Synlighed af status | Kort, der allerede var på holdet, blev blot dæmpet. Det lignede en fejl. | 🟡 | Mærkaten "Valgt" i fuld kontrast oven på kortet. |
| 8 | Fejlbeskeder | Login-fejl var tekniske ("Invalid login credentials"). | 🟡 | Beskeder på dansk med næste skridt, fx "Forkert brugernavn eller password. Er du ny, så tryk Opret bruger." |
| 9 | Konsistens | Mine hold og andres hold så forskellige ud. | 🟢 | Samme visning (`teamSummary.js`) begge steder. |
| 10 | Fleksibilitet | Shift for hold B virkede kun med mus ifølge hjælpeteksten. | 🟢 | Hjælpeteksten nævner både Shift+klik og Shift+Enter. |

---

## Tilgængelighed (WCAG 2.1 AA)

| # | Fund | Kriterium | Alvor | Rettelse |
|---|---|---|---|---|
| 11 | Kanten på inputfelter og rollepladser havde kontrast 1,3:1. | 1.4.11 Kontrast for ikke-tekst | 🟢 | Ny farve `--control-border` med 3,7–4,0:1. |
| 12 | Intet tydeligt fokus, når man bruger tastaturet. | 2.4.7 Synligt fokus | 🟢 | Fælles `:focus-visible`-ramme i accentfarven (10,2:1). |
| 13 | Fokus forsvandt, når siden blev tegnet om efter et valg med Enter. Tastaturbrugere startede forfra. | 2.4.3 Fokusrækkefølge | 🟢 | Fokus sættes tilbage på samme kort, holdknap eller rolleplads. |
| 14 | Spillerkort havde ingen rolle eller navn for skærmlæsere. | 4.1.2 Navn, rolle, værdi | 🟢 | `role="button"` og `aria-label`, fx "Canna, Top, KC, pris 26, Valgt". |
| 15 | Budgetbjælken var kun grafik. | 1.3.1 Info og relationer | 🟢 | `role="progressbar"` med min, max og værdi. |
| 16 | Leaderboard-tabellen manglede overskrift og kolonnehoveder. Initialer blev læst op før navnet. | 1.3.1 Info og relationer | 🟢 | Skjult `caption`, `scope="col"` og `aria-hidden` på initialer. |

---

## Kontrast

| Element | Forgrund | Baggrund | Forhold | Krav | OK |
|---|---|---|---|---|---|
| Brødtekst | `#eef2f7` | `#07090d` | 17,7:1 | 4,5:1 | ✅ |
| Brødtekst på panel | `#eef2f7` | `#10141b` | 16,4:1 | 4,5:1 | ✅ |
| Dæmpet tekst på panel | `#8b96a7` | `#10141b` | 6,2:1 | 4,5:1 | ✅ |
| Dæmpet tekst på kort | `#8b96a7` | `#171c25` | 5,7:1 | 4,5:1 | ✅ |
| Knaptekst og "Valgt" | `#07090d` | `#4fd1e8` | 11,0:1 | 4,5:1 | ✅ |
| Fejltekst | `#e0655b` | `#10141b` | 5,4:1 | 4,5:1 | ✅ |
| Gyldig / sejr | `#4cc38a` | `#10141b` | 8,3:1 | 4,5:1 | ✅ |
| Førsteplads (guld) | `#e3b54d` | `#10141b` | 9,7:1 | 4,5:1 | ✅ |
| Kant på felter og pladser | `#66717f` | `#10141b` | 3,7:1 | 3:1 | ✅ |
| Fokusramme | `#4fd1e8` | `#10141b` | 10,2:1 | 3:1 | ✅ |

Kort, der ikke kan vælges, fordi draften er lukket, er dæmpede. WCAG undtager inaktive elementer fra kontrastkravet.

---

## Tastatur

| Element | Tab | Enter / mellemrum | Escape |
|---|---|---|---|
| Topnavigation | Ja | Skifter side | – |
| Fasefaner | Ja | Skifter fase (spørger, hvis noget ikke er gemt) | – |
| "Sådan får du point" | Ja | Folder ud og sammen | – |
| Holdknapper | Ja | Viser holdets spillere. Fokus bliver på knappen. | – |
| Spillerkort | Ja | Sætter kortet på holdet (Shift = hold B i Swiss). Fokus bliver på kortet. | – |
| Fjern | Ja | Fjerner spilleren. Fokus flytter til den tomme rolleplads. | – |
| Holdnavn | Ja | – | – |
| Lock in | Ja | Gemmer | – |
| Bruger på leaderboard | Ja | Åbner hold-dialogen med fokus på Luk | Lukker. Fokus går tilbage til brugeren. |

---

## Test

Testet med Playwright i Chromium mod den rigtige database:

| Test | Resultat |
|---|---|
| Login, valg af hold og spillere, Fjern og leaderboard-dialog kun med tastatur | ✅ |
| Fokus bevares efter Enter på holdknap og kort, og efter Fjern | ✅ |
| Dialog: fokus på Luk ved åbning, tilbage på brugeren efter Escape | ✅ |
| 200 % zoom (640 px bred visning): ingen vandret scroll på de fire sider | ✅ |
| Billeder indlæst på kortene | 10 af 10 |
| Fejl i browserkonsollen | 0 |

## Ikke dækket

- **Rigtig skærmlæser:** siden har labels og roller, men er ikke testet med NVDA eller VoiceOver.
- **Træk og slip med tastatur:** findes ikke. Enter på kortet gør det samme, fordi hver spiller kun kan stå på sin egen rolle.
- **Mobil og touch:** uden for målet. Spillet er lavet til PC.
- **200 % zoom:** Lock in-baren nederst fylder en del af skærmen, men dækker ikke indhold, man ikke kan scrolle frem.
