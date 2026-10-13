# Analyse

Python-scripts brugt under designet af pointsystemet. De bruges ikke i drift.

| Fil | Ansvar |
|---|---|
| `fetch_games.py` | Henter slutstats pr. kamp fra lolesports-feedet til `games.json` |
| `simulation.py` | Den låste pointmodel og simuleringen af draft-strategier på Worlds 2024 og 2025 |
| `calib.py` | Beregner kalibreringen (rollesnit, spredninger, vægte), som ligger i `supabase/seed/02_calibration_2025.sql` |

Kræver `pandas` og `numpy`. Datafilerne (`events.json`, `games.json`) ligger ikke i repoet.
