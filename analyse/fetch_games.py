"""Hent Worlds 2025 slutstats pr. kamp fra lolesports livestats -> data/games.json"""
import json, sys, time, urllib.request
from datetime import datetime, timedelta

DATA = sys.argv[1]
FEED = "https://feed.lolesports.com/livestats/v1"


def get(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                body = r.read()
                return json.loads(body) if body else None
        except Exception as e:
            if attempt == 3:
                print("FEJL", url, e, file=sys.stderr)
                return None
            time.sleep(2 * (attempt + 1))


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def iso(t):
    t = t.replace(microsecond=0, second=(t.second // 10) * 10)
    return t.strftime("%Y-%m-%dT%H:%M:%S.000Z")


events = json.load(open(f"{DATA}/events.json"))["data"]["schedule"]["events"]
games_out = []
for ev in events:
    match = ev["match"]
    for g in ev["games"]:
        gid = g["id"]
        w0 = get(f"{FEED}/window/{gid}")
        if not w0 or not w0.get("frames"):
            continue
        start = ts(w0["frames"][0]["rfc460Timestamp"])
        late = iso(start + timedelta(minutes=90))
        wl = get(f"{FEED}/window/{gid}?startingTime={late}")
        dl = get(f"{FEED}/details/{gid}?startingTime={late}")
        if not wl or not dl:
            continue
        fw, fd = wl["frames"][-1], dl["frames"][-1]
        if fw["gameState"] != "finished":
            continue
        meta = w0["gameMetadata"]
        games_out.append({
            "gameId": gid,
            "matchId": match["id"],
            "block": ev.get("blockName"),
            "minutes": (ts(fw["rfc460Timestamp"]) - start).total_seconds() / 60,
            "teams": {
                side: {
                    "dragons": fw[f"{side}Team"]["dragons"],
                    "barons": fw[f"{side}Team"]["barons"],
                    "towers": fw[f"{side}Team"]["towers"],
                    "inhibitors": fw[f"{side}Team"]["inhibitors"],
                    "kills": fw[f"{side}Team"]["totalKills"],
                    "gold": fw[f"{side}Team"]["totalGold"],
                    "players": meta[f"{side}TeamMetadata"]["participantMetadata"],
                }
                for side in ("blue", "red")
            },
            "participants": fd["participants"],
        })
        print(len(games_out), gid, file=sys.stderr)
        time.sleep(0.3)

json.dump(games_out, open(f"{DATA}/games.json", "w"))
print("kampe:", len(games_out))
