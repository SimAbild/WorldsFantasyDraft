# Forbedringer: clean code, DRY og GRASP

Dette dokument beskriver refaktoreringen af Worlds Fantasy efter første version. Principperne følger skabelonen fra [ProgExam](https://github.com/SimAbild/ProgExam): én `// Ansvar:`-kommentar pr. fil, korte metoder der læses som trin, fulde navne, logik adskilt fra præsentation, og unit tests.

Funktionaliteten er uændret. Alle ændringer er testet med unit tests og ende-til-ende i browseren mod databasen.

---

## 1. Ansvar øverst i hver fil

**Filer:** alle filer i `js/`, `tests/`, `supabase/functions/ingest/index.ts` og migrationerne

**Hvad blev ændret:**
Hver fil starter med en `// Ansvar:`-kommentar på én linje, der siger, hvad filen har ansvar for.

**Hvorfor:**
Clean code og GRASP (høj samhørighed). Når ansvaret skal kunne skrives på én linje, kan man se med det samme, hvis en fil gør for meget.

**Før:**
```js
// Fantasy draft: vælg fase, vælg hold i power ranking-rækkefølge, træk spillerkort ind på dine hold
```

**Efter:**
```js
// Ansvar: Draft-siden – viser faser, hold og spillerkort, og sender brugerens valg til databasen
```

---

## 2. Fulde navne i stedet for forkortelser

**Filer:** alle filer i `js/` og `supabase/functions/ingest/index.ts`

**Hvad blev ændret:**
Korte navne som `ph`, `c`, `t`, `p`, `sp`, `ok`, `must`, `esc` og `sb` er erstattet af fulde navne.

**Hvorfor:**
Clean code: et navn skal sige, hvad det er, så man ikke skal læse koden omkring det for at forstå det.

**Før:**
```js
const cost = (t) => Object.values(t.picks).reduce((s, id) => s + (byId.get(id)?.price ?? 0), 0);
function ok({ data, error }) { ... }
```

**Efter:**
```js
export function teamCost(team, cardsById) {
  return Object.values(team.picks).reduce((sum, playerId) => sum + (cardsById.get(playerId)?.price ?? 0), 0);
}
function unwrap({ data, error }) { ... }
```

---

## 3. Draft-reglerne flyttet ud af visningen

**Filer:** `js/views/draft.js`, ny `js/domain/draftRules.js`

**Hvad blev ændret:**
`draft.js` havde én funktion på ca. 150 linjer, der hentede data, holdt styr på holdene, tjekkede regler, tegnede siden og håndterede klik. Reglerne ligger nu i `draftRules.js` som rene funktioner (`teamCost`, `placePlayer`, `draftProblems`, `toSubmitPayload` m.fl.). Visningen er delt i små funktioner: én pr. del af siden (`phaseTabsHtml`, `teamPickerHtml`, `myTeamHtml`, `lockBarHtml`) og én pr. slags hændelse (`bindCardEvents`, `bindSlotEvents`, `bindLockIn`).

**Hvorfor:**
GRASP:
- **Information Expert:** reglerne ligger hos den, der kender holdene.
- **Høj samhørighed:** hver funktion har ét ansvar.

Desuden kan reglerne nu unit-testes uden en browser.

**Før:**
```js
export async function render(root, ctx) {
  // ... data, tilstand, regler, HTML og klik i én funktion
  function problems() { ... }
  function place(id, slot) { ... }
  function draw() { ... }
  function wire() { ... }
}
```

**Efter:**
```js
export async function render(root, context) {
  const phase = selectPhase(context.phases);
  const [cards, savedTeams] = await Promise.all([...]);
  const state = createState(phase, cards, savedTeams);
  const redraw = () => draw(root, context, state, redraw);
  redraw();
}
```

---

## 4. Serie-logik samlet ét sted

**Filer:** `js/views/home.js`, `js/views/leaderboard.js`, ny `js/domain/series.js`

**Hvad blev ændret:**
Både forsiden og leaderboardet satte selv databasens serie-rækker sammen til kampe. Det sker nu kun i `groupSeriesRows`. Stilling (`phaseRecords`), tidslinje (`seriesTimeline`) og kampprogrammets udsnit (`scheduleWindow`) ligger samme sted. Funktionerne returnerer objekter med egne feltnavne i camelCase (`seriesId`, `bestOf`, `isDecided`), så visningerne ikke afhænger af databasens kolonnenavne.

**Hvorfor:**
- **DRY:** én regel for hvornår en serie er afgjort.
- **GRASP Low Coupling:** visningerne kender ikke databasens format.

**Før:**
```js
// home.js
function groupSeries(rows) { ... }
// leaderboard.js
const steps = [...new Map(rows.filter((r) => r.last_game_ended_at).map(...))]
```

**Efter:**
```js
// begge sider
const allSeries = groupSeriesRows(seriesRows);
const timeline = seriesTimeline(allSeries);
```

---

## 5. Fase-regler samlet ét sted

**Filer:** `js/ui.js`, ny `js/domain/phase.js`

**Hvad blev ændret:**
`phaseState`, valg af aktuel fase, `isTwoTeamPhase` og `slotLabel` ligger nu i `phase.js`. Tidligere stod `teams_per_user === 2` og `"AB"[slot - 1]` flere steder.

**Hvorfor:**
- **DRY.**
- **GRASP Protected Variations:** ændres reglen for Swiss-hold, skal det kun ske ét sted.

**Før:**
```js
`Hold ${"AB"[i]}`              // draft.js
`Hold ${"AB"[slot - 1]}`       // mine.js
ph.teams_per_user === 2        // flere steder
```

**Efter:**
```js
`Hold ${slotLabel(slot)}`
isTwoTeamPhase(phase)
```

---

## 6. Prisklasser beskrevet ét sted

**Fil:** `js/ui.js`

**Hvad blev ændret:**
`TIER_NAME` og `tierClass` beskrev de samme seks prisklasser i to opslag. Nu er der ét: `TIERS`, med navn og kortfarve, og `tierOf()` til at slå op.

**Hvorfor:**
DRY: en ny prisklasse skal kun tilføjes ét sted.

**Før:**
```js
export const TIER_NAME = { favorit: "Favorit", staerk: "Stærk", ... };
export function tierClass(tier) { return { favorit: "favorit", ko_favorit: "favorit", ... }[tier] ?? "fri"; }
```

**Efter:**
```js
const TIERS = { favorit: { label: "Favorit", rim: "favorit" }, ... };
export const tierOf = (tierCode) => TIERS[tierCode] ?? FREE_TIER;
```

---

## 7. `submit_draft` delt op og bygget på `v_player_card`

**Fil:** `supabase/migrations/010_submit_draft_via_player_card.sql`

**Hvad blev ændret:**
`submit_draft` var én funktion på ca. 90 linjer, der gentog de samme joins (roster → team_price → price_tier), som `v_player_card` allerede laver. Nu er den delt i fire funktioner med ét ansvar hver:

| Funktion | Ansvar |
|---|---|
| `draft_choices` | Brugerens valg koblet til spillerkortet |
| `assert_draft_open` | Fasen findes, er åben og har det rigtige antal hold |
| `assert_draft_valid` | Roller, unikke spillere, startspillere, budget og holdgrænse |
| `save_draft` | Gemmer holdene |

Hjælpefunktionerne kan ikke kaldes udefra.

**Hvorfor:**
- **DRY:** `v_player_card` er eneste sted, der afgør, om en spiller kan vælges, hvad han koster, og om han er startspiller.
- **Clean code:** `submit_draft` læses nu som de tre trin, den består af.

Den midlertidige tabel `_pick` er også væk.

**Efter:**
```sql
perform public.assert_draft_open(draft_phase, p_teams);
perform public.assert_draft_valid(draft_phase, p_teams);
perform public.save_draft(draft_phase.id, auth.uid(), p_teams);
```

**Testet:** et gyldigt hold gemmes. En reserve afvises med "Ugyldige valg: APA". Et hold over budget afvises med "Hold 1 er over budget på 100".

---

## 8. `ingest` delt op i små funktioner med navngivne konstanter

**Fil:** `supabase/functions/ingest/index.ts`

**Hvad blev ændret:**
Hovedløkken på ca. 60 linjer er delt i `ingestEvent` → `upsertSeries`, `needsDetails`, `syncSeriesTeams`, `syncGames` og `assignWinners`. Stats-gemningen er delt i `saveFinalStats`, `saveTeamSide`, `saveDragons` og `savePlayerStats`. Vinderlogikken er delt i `missingWinsByTeam` og `assignByObjectives`. Tal midt i koden har fået navne.

**Hvorfor:**
- **Clean code:** korte metoder, der læses som trin, ligesom `createWarning` i ProgExam.
- **Ingen magiske tal.**

**Før:**
```ts
if (Date.now() - started > 100000) { ... }
const late = new Date(Math.min(start.getTime() + 90 * 60000, Date.now() - 30000));
```

**Efter:**
```ts
const RUN_TIME_BUDGET_MS = 100_000;      // stop i god tid før Edge Functions' tidsgrænse
const FINAL_FRAME_OFFSET_MINUTES = 90;   // sidste frame hentes 90 min efter kampstart
const FEED_SAFETY_MARGIN_MS = 30_000;    // feedet har ikke data helt op til "nu"
```

---

## 9. Unit tests

**Filer:** nye `tests/draftRules.test.js`, `tests/series.test.js`, `tests/phase.test.js`, `package.json`

**Hvad blev ændret:**
20 unit tests af domæne-modulerne med Nodes indbyggede testværktøj. Der er ingen ekstra pakker. Kør dem med:

```bash
npm test
```

**Hvorfor:**
Ligesom i ProgExam testes logikken uden om brugerfladen. Testene dækker blandt andet:
- budget og holdgrænse
- at en spiller ikke kan stå på begge Swiss-hold
- at fristen præcis ved første kamp låser fasen
- at Bo5 kræver tre sejre

---

## 10. Hele databasen og analysen i repoet

**Filer:** `supabase/migrations/`, nye `supabase/seed/` og `analyse/`

**Hvad blev ændret:**
- Alle migrationer ligger nu i repoet med samme numre som i Supabase. Pointberegningen (006 og 009), cron (007) og stats-views (008) manglede før.
- Opslagsdata, faser og kalibreringen ligger i `supabase/seed/`.
- Python-scriptene fra simuleringen ligger i `analyse/`.

**Hvorfor:**
Alle valg skal kunne genfindes. Pointformlen skal ligge i koden og ikke kun i databasen.

---

## Bevidst dobbelthed

Draft-reglerne findes to steder: `draftRules.js` (klient) og `assert_draft_valid` (database). Det er bevidst:
- **Klienten** giver brugeren besked med det samme.
- **Databasen** håndhæver reglerne og kan ikke omgås fra browseren.

Ændres en regel, skal begge steder opdateres. Testene i `tests/draftRules.test.js` og migrationen 010 beskriver de samme regler.
