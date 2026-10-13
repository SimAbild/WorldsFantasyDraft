"""Ansvar: Beregner kalibreringen (rollesnit, spredninger og vægte) fra et tidligere Worlds.

Resultatet indlæses i databasen som supabase/seed/02_calibration_2025.sql.

Kør:  python3 calibration.py <datamappe> <udfil.json>
"""
import json
import sys

from pointmodel import ROLES, PART_A_WEIGHTS, PART_B_WEIGHTS, load_player_games, add_game_scores

# Databasens navne for roller og målepunkter
DATABASE_ROLE = {"Top": "top", "Jungle": "jungle", "Mid": "mid", "ADC": "adc", "Support": "support"}
DATABASE_METRIC = {
    "kills": "kills", "assists": "assists", "deaths": "deaths", "cs_per_minute": "cspm",
    "damage_share": "dmg_share", "kill_participation": "kp", "kill_share": "kill_share",
    "wards_placed": "wards_placed", "wards_destroyed": "wards_destroyed",
}


def role_constants(scored, role):
    """Konstanterne pr. rolle: Del A-faktor og snit/spredning for Del A, Del B og blandingen."""
    games_in_role = scored[scored.role == role]
    return dict(
        role=DATABASE_ROLE[role],
        mult_a=float(scored.attrs["role_multiplier"][role]),
        a_mean=float(games_in_role.part_a.mean()), a_sd=float(games_in_role.part_a.std()),
        b_mean=float(games_in_role.part_b_raw.mean()), b_sd=float(games_in_role.part_b_raw.std()),
        mix_mean=float(games_in_role.blend.mean()), mix_sd=float(games_in_role.blend.std()),
    )


def metric_constants(scored, role):
    """Pr. målepunkt: rollens snit og vægtene i Del A og Del B."""
    games_in_role = scored[scored.role == role]
    return [
        dict(role=DATABASE_ROLE[role], metric=database_metric, mean=float(games_in_role[stat].mean()),
             weight_a=float(PART_A_WEIGHTS[role].get(stat, 0)), weight_b=float(PART_B_WEIGHTS[role].get(stat, 0)))
        for stat, database_metric in DATABASE_METRIC.items()
    ]


def main(data_folder, output_file):
    scored = add_game_scores(load_player_games(data_folder))
    calibration = dict(
        roles=[role_constants(scored, role) for role in ROLES],
        metrics=[metric for role in ROLES for metric in metric_constants(scored, role)],
    )
    json.dump(calibration, open(output_file, "w"), indent=1)
    print(scored.groupby("role").score.agg(["mean", "std"]).round(2))


if __name__ == "__main__":
    main(*sys.argv[1:3])
