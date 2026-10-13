"""Ansvar: Simulerer fantasy-drafts på et tidligere Worlds for at teste prismodellen,
og hvor meget viden om spillet belønnes.

Kør:  python3 simulation.py <datamappe> <udfil.json> <år>
"""
import itertools
import json
import sys
from dataclasses import dataclass

import numpy as np

from pointmodel import ROLES, load_player_games, add_game_scores, series_points, phase_points

random = np.random.default_rng(7)

# ---------- Spillets regler ----------
BUDGET = 100
PHASES = ["Swiss", "QF", "SF", "Final"]
MAX_PLAYERS_PER_TEAM = {"Swiss": 2, "QF": 2, "SF": 3, "Final": None}   # None = ingen grænse
USER_TEAMS = {"Swiss A": "Swiss", "Swiss B": "Swiss", "QF": "QF", "SF": "SF", "Final": "Final"}
SWISS_PRICE = {"Favorit": 26, "Stærk": 22, "Middel": 18, "Underdog": 14}
KNOCKOUT_FAVORITE_PRICE = 23
KNOCKOUT_UNDERDOG_PRICE = 17

# Swiss-prisklasser sat ud fra region og regional placering (vurdering, ikke officielle puljer)
SWISS_TIERS = {
    "2025": {"GEN": "Favorit", "HLE": "Favorit", "BLG": "Favorit", "AL": "Favorit",
             "KT": "Stærk", "T1": "Stærk", "TES": "Stærk", "G2": "Stærk",
             "MKOI": "Middel", "FNC": "Middel", "FLY": "Middel", "CFO": "Middel",
             "100T": "Underdog", "VKS": "Underdog", "TSW": "Underdog", "PSG": "Underdog"},
    "2024": {"GEN": "Favorit", "HLE": "Favorit", "BLG": "Favorit", "TES": "Favorit",
             "DK": "Stærk", "T1": "Stærk", "LNG": "Stærk", "WBG": "Stærk",
             "G2": "Middel", "FNC": "Middel", "FLY": "Middel", "TLAW": "Middel",
             "MKOI": "Underdog", "PSG": "Underdog", "GAM": "Underdog", "PAIN": "Underdog"},
}

# ---------- Simuleringens størrelse ----------
USERS_PER_STRATEGY = 1000
LEAGUES = 4000
USERS_PER_KNOWLEDGE_LEVEL = 300
GREEDY_SEARCH_DEPTHS = (6, 9, 14)      # hvor mange af de bedste pr. rolle der prøves i kombination
STRATEGIES = {"random": "Tilfældig", "favorites": "Favorit-tung", "underdogs": "Underdog-tung"}
# Viden udtrykt som sammenhæng (korrelation) mellem brugerens vurdering og spillerens faktiske point
KNOWLEDGE_LEVELS = {"Fan": 0.10, "Kender scenen": 0.20, "Analytiker": 0.30, "Ekspert": 0.45}


@dataclass
class Tournament:
    points: dict            # (fase, spiller) -> fasepoint
    team_of: dict           # spiller -> holdkode
    role_of: dict           # spiller -> rolle
    pool: dict              # fase -> rolle -> spillere der spillede i fasen
    price_of_team: dict     # fase -> holdkode -> pris (None i finalen)
    swiss_balance: dict     # holdkode -> sejre minus nederlag i Swiss


# ---------- Opbygning af turneringen ----------
def build_tournament(data_folder, year):
    scored = add_game_scores(load_player_games(data_folder))
    series = series_points(scored)
    events = json.load(open(f"{data_folder}/events.json"))["data"]["schedule"]["events"]
    players = scored.drop_duplicates("player").set_index("player")
    swiss_balance = swiss_win_balance(events)
    tiers = SWISS_TIERS[year]
    return Tournament(
        points={key: float(value) for key, value in phase_points(scored).items()},
        team_of=players.team.to_dict(),
        role_of=players.role.to_dict(),
        pool={phase: {role: sorted(set(series[(series.phase == phase) & (series.role == role)].player)) for role in ROLES}
              for phase in PHASES},
        price_of_team={
            "Swiss": {team: SWISS_PRICE[tier] for team, tier in tiers.items()},
            "QF": knockout_prices(events, "Quarterfinals", swiss_balance, tiers),
            "SF": knockout_prices(events, "Semifinals", swiss_balance, tiers),
            "Final": None,
        },
        swiss_balance=swiss_balance,
    )


def swiss_win_balance(events):
    balance = {}
    for event in events:
        if event.get("blockName") != "Swiss":
            continue
        teams = event["match"]["teams"]
        best = max(team["result"]["gameWins"] for team in teams)
        for team in teams:
            balance[team["code"]] = balance.get(team["code"], 0) + (1 if team["result"]["gameWins"] == best else -1)
    return balance


def knockout_prices(events, block_name, swiss_balance, tiers):
    """Favoritten i hver knockout-serie er holdet med bedst Swiss-resultat (ved lighed: højeste prisklasse)."""
    tier_rank = {tier: rank for rank, tier in enumerate(SWISS_PRICE)}
    prices = {}
    for event in events:
        if event.get("blockName") != block_name:
            continue
        team_a, team_b = [team["code"] for team in event["match"]["teams"]]
        favorite = min([team_a, team_b], key=lambda code: (-swiss_balance[code], tier_rank[tiers[code]]))
        underdog = team_b if favorite == team_a else team_a
        prices[favorite], prices[underdog] = KNOCKOUT_FAVORITE_PRICE, KNOCKOUT_UNDERDOG_PRICE
    return prices


# ---------- Regler for et hold ----------
def player_price(tournament, phase, player):
    prices = tournament.price_of_team[phase]
    return 0 if prices is None else prices[tournament.team_of[player]]


def player_points(tournament, phase, player):
    return tournament.points.get((phase, player), 0.0)


def is_valid_team(tournament, phase, lineup, taken_players=(), taken_team_counts=None):
    team_counts = dict(taken_team_counts or {})
    limit = MAX_PLAYERS_PER_TEAM[phase]
    for player in lineup:
        if player in taken_players:
            return False
        team = tournament.team_of[player]
        team_counts[team] = team_counts.get(team, 0) + 1
        if limit and team_counts[team] > limit:
            return False
    return tournament.price_of_team[phase] is None or sum(player_price(tournament, phase, p) for p in lineup) <= BUDGET


def count_by_team(tournament, lineup):
    counts = {}
    for player in lineup:
        counts[tournament.team_of[player]] = counts.get(tournament.team_of[player], 0) + 1
    return counts


# ---------- Strategier ----------
def random_team(tournament, phase, strategy, taken_players=(), taken_team_counts=None, attempts=400):
    """Tilfældigt gyldigt hold. 'favorites' bruger mest muligt af budgettet, 'underdogs' mindst muligt."""
    if tournament.price_of_team[phase] is None and strategy != "random":
        return final_team_from_one_side(tournament, strategy)
    best_lineup, best_spend = None, None
    for _ in range(attempts):
        lineup = [random.choice(tournament.pool[phase][role]) for role in ROLES]
        if not is_valid_team(tournament, phase, lineup, taken_players, taken_team_counts):
            continue
        if strategy == "random":
            return lineup
        spend = sum(player_price(tournament, phase, player) for player in lineup)
        is_better = best_lineup is None or (spend > best_spend if strategy == "favorites" else spend < best_spend)
        if is_better:
            best_lineup, best_spend = lineup, spend
    return best_lineup


def final_team_from_one_side(tournament, strategy):
    """Finalen er fri leg: favorit-strategien tager alt fra holdet med bedst Swiss-resultat, underdog-strategien fra det andet."""
    finalists = sorted({tournament.team_of[p] for role in ROLES for p in tournament.pool["Final"][role]},
                       key=lambda team: -tournament.swiss_balance[team])
    chosen_team = finalists[0] if strategy == "favorites" else finalists[1]
    return [random.choice([p for p in tournament.pool["Final"][role] if tournament.team_of[p] == chosen_team]) for role in ROLES]


def best_team(tournament, phase, rating, taken_players=(), taken_team_counts=None):
    """Det gyldige hold med højest samlet vurdering. Søger bredere, hvis intet gyldigt hold findes."""
    ranked = {role: sorted(tournament.pool[phase][role], key=lambda p: -rating(p)) for role in ROLES}
    for depth in GREEDY_SEARCH_DEPTHS:
        candidates = [ranked[role][:depth] for role in ROLES]
        valid_lineups = [list(lineup) for lineup in itertools.product(*candidates)
                         if is_valid_team(tournament, phase, lineup, taken_players, taken_team_counts)]
        if valid_lineups:
            return max(valid_lineups, key=lambda lineup: sum(rating(p) for p in lineup))
    return None


def draft_all_teams(tournament, choose_team):
    """Drafter alle brugerens hold. Swiss B må ikke genbruge spillere fra Swiss A og deler holdgrænsen."""
    swiss_a = choose_team("Swiss", (), None)
    swiss_b = choose_team("Swiss", set(swiss_a), count_by_team(tournament, swiss_a))
    teams = {"Swiss A": swiss_a, "Swiss B": swiss_b}
    for phase in ["QF", "SF", "Final"]:
        teams[phase] = choose_team(phase, (), None)
    return teams


def draft_with_strategy(tournament, strategy):
    return draft_all_teams(tournament, lambda phase, taken, counts: random_team(tournament, phase, strategy, taken, counts))


def draft_with_hindsight(tournament):
    """Det bedst mulige resultat: brugeren kender de faktiske point på forhånd."""
    return draft_all_teams(tournament, lambda phase, taken, counts:
                           best_team(tournament, phase, lambda p: player_points(tournament, phase, p), taken, counts))


def draft_with_knowledge(tournament, correlation):
    """Brugeren ser de faktiske point med støj. Mere viden = mindre støj."""
    noise_factor = np.sqrt(1 / correlation ** 2 - 1)
    spread = {phase: np.std([player_points(tournament, phase, p) for role in ROLES for p in tournament.pool[phase][role]]) for phase in PHASES}
    estimate = {phase: {p: player_points(tournament, phase, p) + random.normal(0, noise_factor * spread[phase])
                        for role in ROLES for p in tournament.pool[phase][role]} for phase in PHASES}
    return draft_all_teams(tournament, lambda phase, taken, counts:
                           best_team(tournament, phase, lambda p: estimate[phase][p], taken, counts))


def total_score(tournament, teams):
    return sum(player_points(tournament, USER_TEAMS[name], p) for name, lineup in teams.items() for p in lineup)


# ---------- Ligaer ----------
def winner_share(own_scores, opponent_scores, opponents=5):
    """Hvor ofte en bruger vinder en liga mod 5 tilfældige modstandere."""
    wins = sum(random.choice(own_scores) > np.max(random.choice(opponent_scores, opponents)) for _ in range(LEAGUES))
    return round(wins / LEAGUES, 3)


def summarize(scores):
    return dict(mean=round(float(np.mean(scores)), 1),
                percentiles_10_50_90=[round(float(v), 1) for v in np.percentile(scores, [10, 50, 90])])


def main(data_folder, output_file, year):
    tournament = build_tournament(data_folder, year)
    strategy_scores = {strategy: np.array([total_score(tournament, draft_with_strategy(tournament, strategy))
                                           for _ in range(USERS_PER_STRATEGY)]) for strategy in STRATEGIES}
    everyone = np.concatenate(list(strategy_scores.values()))

    results = dict(
        year=year,
        hindsight_score=round(total_score(tournament, draft_with_hindsight(tournament)), 1),
        strategies={label: summarize(strategy_scores[strategy]) | dict(league_win_share=winner_share(strategy_scores[strategy], everyone))
                    for strategy, label in STRATEGIES.items()},
        knowledge={"Ingen viden": summarize(everyone) | dict(league_win_share=winner_share(everyone, everyone))},
    )
    for label, correlation in KNOWLEDGE_LEVELS.items():
        scores = np.array([total_score(tournament, draft_with_knowledge(tournament, correlation)) for _ in range(USERS_PER_KNOWLEDGE_LEVEL)])
        results["knowledge"][label] = summarize(scores) | dict(league_win_share=winner_share(scores, everyone))

    json.dump(results, open(output_file, "w"), ensure_ascii=False, indent=1)
    print(json.dumps(results, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main(*sys.argv[1:4])
