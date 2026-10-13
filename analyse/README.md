# Analyse

Python-scripts brugt under designet af pointsystemet. De bruges ikke i drift.

| Fil | Ansvar |
|---|---|
| `fetch_games.py` | Henter slutstats pr. kamp fra lolesports-feedet til `games.json` |
| `pointmodel.py` | Pointmodellen: fra rå stats til kampscore, seriepoint og fasepoint (samme formel som databasen) |
| `calibration.py` | Beregner rollesnit, spredninger og vægte, som ligger i `supabase/seed/02_calibration_2025.sql` |
| `simulation.py` | Simulerer drafts med forskellige strategier og vidensniveauer for at teste prismodellen |

```bash
python3 fetch_games.py data/                  # data/ skal indeholde events.json
python3 calibration.py data/ kalibrering.json
python3 simulation.py data/ resultat.json 2025
```

Kræver `pandas` og `numpy`. Datafilerne (`events.json`, `games.json`) ligger ikke i repoet.

**Kontrol:** `calibration.py` giver de samme konstanter som dem i databasen (afvigelse under 0,000000000000001).
