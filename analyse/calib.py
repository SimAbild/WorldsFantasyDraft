"""Worlds Fantasy - fuld simulering af den laaste model paa Worlds 2025 -> sim.json

Model (Pointsystem laast):
  kampscore = 20 + 10*z_rolle(0,5*z(A) + 0,5*z(B)) + MVP/ACE(+3)
  seriepoint = snit af kampscorer; fasepoint = snit af seriepoint i fasen
  Swiss: 2 hold (A og B), 100 i budget hver, unikke spillere, maks 2 pr. pro-hold paa tvaers
  Kvartfinale: 1 hold, 100, maks 2 pr. pro-hold; Semifinale: 100, maks 3; Finale: fri leg
"""
import json, sys
import numpy as np, pandas as pd

DATA, OUT, YEAR = sys.argv[1], sys.argv[2], sys.argv[3]
rng = np.random.default_rng(7)
games = json.load(open(f"{DATA}/games.json"))
events = json.load(open(f"{DATA}/events.json"))["data"]["schedule"]["events"]
ROLE = {"top": "Top", "jungle": "Jungle", "mid": "Mid", "bottom": "ADC", "support": "Support"}
ROLES = ["Top", "Jungle", "Mid", "ADC", "Support"]
STAGE = {"Swiss": "Swiss", "Quarterfinals": "QF", "Semifinals": "SF", "Finals": "Final"}
stage_of = {e["match"]["id"]: STAGE.get(e.get("blockName")) for e in events}

# ---------- 1. raekker pr. spiller pr. kamp ----------------------------------
ALIAS = {"MDK": "MKOI", "PNG": "PAIN", "TL": "TLAW", "100": "100T"}
rows = []
for g in games:
    b, r = g["teams"]["blue"], g["teams"]["red"]
    key = lambda t: (t["towers"], t["inhibitors"], t["gold"])
    winner = "blue" if key(b) > key(r) else "red"
    parts = {p["participantId"]: p for p in g["participants"]}
    for side in ("blue", "red"):
        t = g["teams"][side]
        for m in t["players"]:
            p = parts[m["participantId"]]
            rows.append(dict(game=g["gameId"], match=g["matchId"], stage=stage_of.get(g["matchId"]),
                             side=side, player=m["summonerName"], team=ALIAS.get(m["summonerName"].split(" ")[0], m["summonerName"].split(" ")[0]),
                             role=ROLE[m["role"]], win=side == winner, minutes=g["minutes"],
                             k=p["kills"], d=p["deaths"], a=p["assists"],
                             cspm=p["creepScore"] / g["minutes"], dmg=p["championDamageShare"] * 100,
                             kp=p["killParticipation"] * 100, wp=p["wardsPlaced"], wd=p["wardsDestroyed"],
                             drag=sum(x != "elder" for x in t["dragons"]),
                             elder=sum(x == "elder" for x in t["dragons"]), baron=t["barons"]))
df = pd.DataFrame(rows)
df["ks"] = df.k / df.groupby(["game", "side"]).k.transform("sum").clip(lower=1) * 100
snit = df.groupby("role")[["cspm", "dmg", "kp", "wp", "wd", "ks", "d"]].mean()

# ---------- 2. Del A og Del B (vaegte fra spec) -----------------------------
WA = {"Top": dict(k=3, a=1.5, d=-1, cspm=3, dmg=.5, kp=0, wp=0, wd=0),
      "Jungle": dict(k=2.5, a=2, d=-1, cspm=0, dmg=0, kp=.3, wp=0, wd=.3),
      "Mid": dict(k=3, a=1.5, d=-1, cspm=2.5, dmg=.5, kp=.15, wp=0, wd=0),
      "ADC": dict(k=3, a=1, d=-1.5, cspm=3, dmg=.6, kp=0, wp=0, wd=0),
      "Support": dict(k=2, a=2, d=-.5, cspm=0, dmg=0, kp=.4, wp=.1, wd=.3)}
WB = {"Top": dict(ks=.6, kp=.2, d=-1, cspm=3, dmg=.5, wd=0, wp=0),
      "Jungle": dict(ks=.4, kp=.5, d=-1, cspm=0, dmg=0, wd=.3, wp=0),
      "Mid": dict(ks=.6, kp=.3, d=-1, cspm=2.5, dmg=.5, wd=0, wp=0),
      "ADC": dict(ks=.7, kp=.2, d=-1.5, cspm=3, dmg=.6, wd=0, wp=0),
      "Support": dict(ks=.2, kp=.6, d=-.5, cspm=0, dmg=0, wd=.3, wp=.1)}
LAB = dict(k="Kills", a="Assists", d="Deaths", cspm="CS/min", dmg="Damage-andel", kp="Kill participation",
           wp="Wards placeret", wd="Wards ryddet", ks="Kill share", obj="Holdets objectives")


def parts_A(r):
    w, s = WA[r.role], snit.loc[r.role]
    out = {"k": w["k"] * r.k, "a": w["a"] * r.a, "d": w["d"] * r.d}
    for c in ["cspm", "dmg", "kp", "wp", "wd"]:
        out[c] = w[c] * (r[c] - s[c])
    out["obj"] = (.5 * r.drag + r.elder + r.baron) if r.role == "Jungle" else 0
    return out


def parts_B(r):
    w, s = WB[r.role], snit.loc[r.role]
    out = {c: w[c] * (r[c] - s[c]) for c in ["ks", "kp", "cspm", "dmg", "wd", "wp"]}
    out["d"] = w["d"] * (r.d - s["d"])
    out["obj"] = (.5 * r.drag + r.elder + r.baron) if r.role == "Jungle" else 0
    return out


df["rawA"] = [sum(parts_A(r).values()) for _, r in df.iterrows()]
df["rawB"] = [sum(parts_B(r).values()) for _, r in df.iterrows()]
multA = 20 / df.groupby("role").rawA.mean()
df["A"] = np.maximum(-5, df.rawA * df.role.map(multA))
df["A"] += np.where(df.win & (df.A > 0), .05 * df.A, 0)
df["A"] += np.where((df.role != "Support") & ((df.k >= 10) | (df.a >= 10)), 2, 0)
sdB = df.groupby("role").rawB.std()
df["B"] = 20 + df.rawB * 10 / df.role.map(sdB)


def zr(col):
    g = df.groupby("role")[col]
    return (df[col] - g.transform("mean")) / g.transform("std")


df["zA"], df["zB"] = zr("A"), zr("B")
df["mix"] = .5 * df.zA + .5 * df.zB
df["zmix"] = zr("mix")
df["base"] = 20 + 10 * df.zmix
best = df.groupby(["game", "side"]).base.rank(ascending=False, method="first") == 1
df["title"] = np.where(best, np.where(df.win, "MVP", "ACE"), "")
df["score"] = df.base + np.where(best, 3, 0)
# ---------- kalibrering til databasen ----------
RC = {"Top":"top","Jungle":"jungle","Mid":"mid","ADC":"adc","Support":"support"}
out = {"roles":[], "metrics":[]}
for role in ROLES:
    d = df[df.role == role]
    out["roles"].append(dict(role=RC[role], mult_a=float(multA[role]), a_mean=float(d.A.mean()), a_sd=float(d.A.std()),
        b_mean=float(d.rawB.mean()), b_sd=float(d.rawB.std()), mix_mean=float(d.mix.mean()), mix_sd=float(d.mix.std())))
    M = {"kills":("k",None), "assists":("a",None), "deaths":("d","d"), "cspm":("cspm","cspm"), "dmg_share":("dmg","dmg"),
         "kp":("kp","kp"), "kill_share":(None,"ks"), "wards_placed":("wp","wp"), "wards_destroyed":("wd","wd")}
    src = {"k":"k","a":"a","d":"d","cspm":"cspm","dmg":"dmg","kp":"kp","ks":"ks","wp":"wp","wd":"wd"}
    for code,(ka,kb) in M.items():
        col = ka or kb
        out["metrics"].append(dict(role=RC[role], metric=code, mean=float(d[src[col]].mean()),
            wa=float(WA[role].get(ka,0)) if ka else 0.0, wb=float(WB[role].get(kb,0)) if kb else 0.0))
json.dump(out, open("calib2025.json","w"), indent=0)
print(json.dumps(out["roles"], indent=0))
print(df.groupby("role").score.agg(["mean","std"]).round(2))
for gid in ["113475798006599035","113475798006664573"]:
    print(df[df.game==gid][["player","role","win","A","base","score","title"]].round(2).to_string())
