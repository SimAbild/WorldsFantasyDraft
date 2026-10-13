"""Ansvar: Pointmodellen – fra rå kampstats til kampscore, seriepoint og fasepoint.

Samme formel som databasens v_game_score. Bruges af calibration.py og simulation.py.
"""
import json

import numpy as np
import pandas as pd

ROLES = ["Top", "Jungle", "Mid", "ADC", "Support"]
ROLE_BY_FEED_ROLE = {"top": "Top", "jungle": "Jungle", "mid": "Mid", "bottom": "ADC", "support": "Support"}
PHASE_BY_BLOCK = {"Swiss": "Swiss", "Quarterfinals": "QF", "Semifinals": "SF", "Finals": "Final"}

# Nogle hold har skiftet holdkode i løbet af året; spillernavnet bærer den gamle kode
TEAM_CODE_ALIASES = {"MDK": "MKOI", "PNG": "PAIN", "TL": "TLAW", "100": "100T"}

# ---------- Regler for kampscore ----------
AVERAGE_GAME_SCORE = 20          # en gennemsnitlig kamp for rollen
POINTS_PER_STANDARD_DEVIATION = 10
BEST_ON_TEAM_BONUS = 3           # MVP (bedst på vinderholdet) og ACE (bedst på taberholdet)
PART_A_FLOOR = -5                # Del A kan ikke blive lavere end dette
WIN_BONUS_SHARE = 0.05           # +5 % af Del A ved sejr, hvis Del A er positiv
BIG_GAME_BONUS = 2               # +2 for mindst 10 kills eller 10 assists (ikke support)
BIG_GAME_THRESHOLD = 10

# Junglerens tillæg pr. objective holdet tager
JUNGLE_POINTS_PER_DRAGON = 0.5
JUNGLE_POINTS_PER_ELDER = 1
JUNGLE_POINTS_PER_BARON = 1

# Del A: kills, assists og deaths tæller råt; øvrige stats som afvigelse fra rollens snit
PART_A_WEIGHTS = {
    "Top":     dict(kills=3,   assists=1.5, deaths=-1,   cs_per_minute=3,   damage_share=0.5, kill_participation=0,    wards_placed=0,   wards_destroyed=0),
    "Jungle":  dict(kills=2.5, assists=2,   deaths=-1,   cs_per_minute=0,   damage_share=0,   kill_participation=0.3,  wards_placed=0,   wards_destroyed=0.3),
    "Mid":     dict(kills=3,   assists=1.5, deaths=-1,   cs_per_minute=2.5, damage_share=0.5, kill_participation=0.15, wards_placed=0,   wards_destroyed=0),
    "ADC":     dict(kills=3,   assists=1,   deaths=-1.5, cs_per_minute=3,   damage_share=0.6, kill_participation=0,    wards_placed=0,   wards_destroyed=0),
    "Support": dict(kills=2,   assists=2,   deaths=-0.5, cs_per_minute=0,   damage_share=0,   kill_participation=0.4,  wards_placed=0.1, wards_destroyed=0.3),
}
PART_A_RAW_STATS = ["kills", "assists", "deaths"]

# Del B: alle stats som afvigelse fra rollens snit
PART_B_WEIGHTS = {
    "Top":     dict(kill_share=0.6, kill_participation=0.2, deaths=-1,   cs_per_minute=3,   damage_share=0.5, wards_destroyed=0,   wards_placed=0),
    "Jungle":  dict(kill_share=0.4, kill_participation=0.5, deaths=-1,   cs_per_minute=0,   damage_share=0,   wards_destroyed=0.3, wards_placed=0),
    "Mid":     dict(kill_share=0.6, kill_participation=0.3, deaths=-1,   cs_per_minute=2.5, damage_share=0.5, wards_destroyed=0,   wards_placed=0),
    "ADC":     dict(kill_share=0.7, kill_participation=0.2, deaths=-1.5, cs_per_minute=3,   damage_share=0.6, wards_destroyed=0,   wards_placed=0),
    "Support": dict(kill_share=0.2, kill_participation=0.6, deaths=-0.5, cs_per_minute=0,   damage_share=0,   wards_destroyed=0.3, wards_placed=0.1),
}

AVERAGED_STATS = ["cs_per_minute", "damage_share", "kill_participation", "kill_share", "deaths", "wards_placed", "wards_destroyed"]


# ---------- Indlæsning ----------
def load_player_games(data_folder):
    """Én række pr. spiller pr. kamp, med stats i procent og pr. minut."""
    games = json.load(open(f"{data_folder}/games.json"))
    events = json.load(open(f"{data_folder}/events.json"))["data"]["schedule"]["events"]
    phase_by_series = {event["match"]["id"]: PHASE_BY_BLOCK.get(event.get("blockName")) for event in events}
    rows = [row for game in games for row in rows_for_game(game, phase_by_series)]
    player_games = pd.DataFrame(rows)
    team_kills = player_games.groupby(["game", "side"]).kills.transform("sum").clip(lower=1)
    player_games["kill_share"] = player_games.kills / team_kills * 100
    return player_games


def rows_for_game(game, phase_by_series):
    winner_side = guess_winner_side(game["teams"])
    participants = {participant["participantId"]: participant for participant in game["participants"]}
    for side in ("blue", "red"):
        team = game["teams"][side]
        for metadata in team["players"]:
            stats = participants[metadata["participantId"]]
            yield dict(
                game=game["gameId"], series=game["matchId"], phase=phase_by_series.get(game["matchId"]),
                side=side, player=metadata["summonerName"], team=team_code_of(metadata["summonerName"]),
                role=ROLE_BY_FEED_ROLE[metadata["role"]], won=side == winner_side, minutes=game["minutes"],
                kills=stats["kills"], deaths=stats["deaths"], assists=stats["assists"],
                cs_per_minute=stats["creepScore"] / game["minutes"],
                damage_share=stats["championDamageShare"] * 100,
                kill_participation=stats["killParticipation"] * 100,
                wards_placed=stats["wardsPlaced"], wards_destroyed=stats["wardsDestroyed"],
                dragons=sum(dragon != "elder" for dragon in team["dragons"]),
                elders=sum(dragon == "elder" for dragon in team["dragons"]),
                barons=team["barons"],
            )


# Analysen har ikke seriestillingen pr. kamp, så vinderen gættes ud fra tårne, inhibitors og guld.
# (Databasen bruger seriestillingen i stedet.)
def guess_winner_side(teams):
    def strength(team):
        return team["towers"], team["inhibitors"], team["gold"]
    return "blue" if strength(teams["blue"]) > strength(teams["red"]) else "red"


def team_code_of(summoner_name):
    code = summoner_name.split(" ")[0]
    return TEAM_CODE_ALIASES.get(code, code)


# ---------- Kampscore ----------
def role_averages(player_games):
    return player_games.groupby("role")[AVERAGED_STATS].mean()


def jungle_objective_points(row):
    if row.role != "Jungle":
        return 0
    return JUNGLE_POINTS_PER_DRAGON * row.dragons + JUNGLE_POINTS_PER_ELDER * row.elders + JUNGLE_POINTS_PER_BARON * row.barons


def part_a_raw(row, averages):
    weights, average = PART_A_WEIGHTS[row.role], averages.loc[row.role]
    total = jungle_objective_points(row)
    for stat, weight in weights.items():
        value = row[stat] if stat in PART_A_RAW_STATS else row[stat] - average[stat]
        total += weight * value
    return total


def part_b_raw(row, averages):
    weights, average = PART_B_WEIGHTS[row.role], averages.loc[row.role]
    return jungle_objective_points(row) + sum(weight * (row[stat] - average[stat]) for stat, weight in weights.items())


def z_score_within_role(player_games, column):
    by_role = player_games.groupby("role")[column]
    return (player_games[column] - by_role.transform("mean")) / by_role.transform("std")


def add_game_scores(player_games):
    """Tilføjer Del A, Del B, blandingen og den endelige kampscore med MVP/ACE."""
    averages = role_averages(player_games)
    scored = player_games.copy()
    scored["part_a_raw"] = [part_a_raw(row, averages) for _, row in scored.iterrows()]
    scored["part_b_raw"] = [part_b_raw(row, averages) for _, row in scored.iterrows()]

    # Del A skaleres, så hver rolle i snit giver lige meget
    role_multiplier = AVERAGE_GAME_SCORE / scored.groupby("role").part_a_raw.mean()
    part_a = np.maximum(PART_A_FLOOR, scored.part_a_raw * scored.role.map(role_multiplier))
    part_a += np.where(scored.won & (part_a > 0), WIN_BONUS_SHARE * part_a, 0)
    is_big_game = (scored.role != "Support") & ((scored.kills >= BIG_GAME_THRESHOLD) | (scored.assists >= BIG_GAME_THRESHOLD))
    scored["part_a"] = part_a + np.where(is_big_game, BIG_GAME_BONUS, 0)

    # Halvt Del A, halvt Del B, målt i standardafvigelser inden for rollen
    scored["blend"] = 0.5 * z_score_within_role(scored, "part_a") + 0.5 * z_score_within_role(scored, "part_b_raw")
    scored["base_score"] = AVERAGE_GAME_SCORE + POINTS_PER_STANDARD_DEVIATION * z_score_within_role(scored, "blend")

    is_best_on_team = scored.groupby(["game", "side"]).base_score.rank(ascending=False, method="first") == 1
    scored["title"] = np.where(is_best_on_team, np.where(scored.won, "MVP", "ACE"), "")
    scored["score"] = scored.base_score + np.where(is_best_on_team, BEST_ON_TEAM_BONUS, 0)
    scored.attrs["role_multiplier"] = role_multiplier
    scored.attrs["role_averages"] = averages
    return scored


# ---------- Serie- og fasepoint ----------
def series_points(scored):
    """Seriepoint = snittet af spillerens kampe i serien."""
    return scored.groupby(["phase", "series", "player", "team", "role"]).score.mean().reset_index(name="series_points")


def phase_points(scored):
    """Fasepoint = snittet af spillerens serier i fasen."""
    return series_points(scored).groupby(["phase", "player"]).series_points.mean()
