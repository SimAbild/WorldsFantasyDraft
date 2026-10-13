"""Ansvar: Henter slutstats for hver kamp i events.json fra lolesports' livestats-feed og gemmer dem i games.json.

Kør:  python3 fetch_games.py <datamappe>    (mappen skal indeholde events.json)
"""
import json
import sys
import time
import urllib.request
from datetime import datetime, timedelta

LIVESTATS_FEED = "https://feed.lolesports.com/livestats/v1"
FINAL_FRAME_OFFSET = timedelta(minutes=90)   # sidste frame hentes 90 min efter kampstart
FEED_TIME_ROUNDING_SECONDS = 10              # feedet vil have tider rundet ned til 10 sekunder
MAX_ATTEMPTS = 4
PAUSE_BETWEEN_GAMES_SECONDS = 0.3


def fetch_json(url):
    """Henter JSON med op til fire forsøg. Returnerer None, hvis det ikke lykkes."""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                body = response.read()
                return json.loads(body) if body else None
        except Exception as error:
            if attempt == MAX_ATTEMPTS:
                print("Fejl:", url, error, file=sys.stderr)
                return None
            time.sleep(2 * attempt)


def parse_time(text):
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def feed_timestamp(moment):
    rounded = moment.replace(microsecond=0, second=moment.second // FEED_TIME_ROUNDING_SECONDS * FEED_TIME_ROUNDING_SECONDS)
    return rounded.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def fetch_final_stats(series_id, block_name, game_id):
    first_window = fetch_json(f"{LIVESTATS_FEED}/window/{game_id}")
    if not first_window or not first_window.get("frames"):
        return None
    started_at = parse_time(first_window["frames"][0]["rfc460Timestamp"])
    final_time = feed_timestamp(started_at + FINAL_FRAME_OFFSET)
    last_window = fetch_json(f"{LIVESTATS_FEED}/window/{game_id}?startingTime={final_time}")
    last_details = fetch_json(f"{LIVESTATS_FEED}/details/{game_id}?startingTime={final_time}")
    if not last_window or not last_details:
        return None
    window_frame, details_frame = last_window["frames"][-1], last_details["frames"][-1]
    if window_frame["gameState"] != "finished":
        return None
    metadata = first_window["gameMetadata"]
    return {
        "gameId": game_id,
        "matchId": series_id,
        "block": block_name,
        "minutes": (parse_time(window_frame["rfc460Timestamp"]) - started_at).total_seconds() / 60,
        "teams": {side: team_summary(window_frame[f"{side}Team"], metadata[f"{side}TeamMetadata"]) for side in ("blue", "red")},
        "participants": details_frame["participants"],
    }


def team_summary(team_frame, team_metadata):
    return {
        "dragons": team_frame["dragons"],
        "barons": team_frame["barons"],
        "towers": team_frame["towers"],
        "inhibitors": team_frame["inhibitors"],
        "kills": team_frame["totalKills"],
        "gold": team_frame["totalGold"],
        "players": team_metadata["participantMetadata"],
    }


def main(data_folder):
    events = json.load(open(f"{data_folder}/events.json"))["data"]["schedule"]["events"]
    games = []
    for event in events:
        for game in event["games"]:
            stats = fetch_final_stats(event["match"]["id"], event.get("blockName"), game["id"])
            if stats:
                games.append(stats)
                print(len(games), game["id"], file=sys.stderr)
            time.sleep(PAUSE_BETWEEN_GAMES_SECONDS)
    json.dump(games, open(f"{data_folder}/games.json", "w"))
    print("Kampe hentet:", len(games))


if __name__ == "__main__":
    main(sys.argv[1])
