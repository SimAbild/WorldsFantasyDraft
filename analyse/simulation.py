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

# ---------- 3. serie- og fasepoint ------------------------------------------
ser = df.groupby(["stage", "match", "player", "team", "role"]).score.mean().reset_index(name="sp")
phase_pts = ser.groupby(["stage", "player"]).sp.mean()            # fasepoint
players = df.drop_duplicates("player").set_index("player")[["team", "role"]]
team_of = players.team.to_dict(); role_of = players.role.to_dict()
PP = {k: float(v) for k, v in phase_pts.items()}

# ---------- 4. priser -------------------------------------------------------
# Swiss: tilnaermede seed-puljer ud fra region og regional placering (vurdering, ikke officielle puljer)
TIERS = {
 "2025": {"GEN": "Favorit", "HLE": "Favorit", "BLG": "Favorit", "AL": "Favorit",
          "KT": "St\u00e6rk", "T1": "St\u00e6rk", "TES": "St\u00e6rk", "G2": "St\u00e6rk",
          "MKOI": "Middel", "FNC": "Middel", "FLY": "Middel", "CFO": "Middel",
          "100T": "Underdog", "VKS": "Underdog", "TSW": "Underdog", "PSG": "Underdog"},
 "2024": {"GEN": "Favorit", "HLE": "Favorit", "BLG": "Favorit", "TES": "Favorit",
          "DK": "St\u00e6rk", "T1": "St\u00e6rk", "LNG": "St\u00e6rk", "WBG": "St\u00e6rk",
          "G2": "Middel", "FNC": "Middel", "FLY": "Middel", "TLAW": "Middel",
          "MKOI": "Underdog", "PSG": "Underdog", "GAM": "Underdog", "PAIN": "Underdog"}}
TIER = TIERS[YEAR]
PRICE = {"Favorit": 26, "Stærk": 22, "Middel": 18, "Underdog": 14}
TRANK = {"Favorit": 0, "Stærk": 1, "Middel": 2, "Underdog": 3}
rec = {}
for e in events:
    if e.get("blockName") != "Swiss":
        continue
    ws = [t["result"]["gameWins"] for t in e["match"]["teams"]]
    for t, w in zip(e["match"]["teams"], ws):
        x = rec.setdefault(t["code"], [0, 0]); x[0 if w == max(ws) else 1] += 1


def ko_prices(stage):
    out = {}
    for e in events:
        if STAGE.get(e.get("blockName")) != stage:
            continue
        a, b = [t["code"] for t in e["match"]["teams"]]
        key = lambda c: (-(rec[c][0] - rec[c][1]), TRANK[TIER[c]])
        fav = min([a, b], key=key)
        out[fav], out[b if fav == a else a] = 26, 14
    return out


stage_price = {"Swiss": {t: PRICE[v] for t, v in TIER.items()},
               "QF": ko_prices("QF"), "SF": ko_prices("SF"), "Final": None}
CAP = {"Swiss": 2, "QF": 2, "SF": 3, "Final": 99}
pool = {}
for st in ["Swiss", "QF", "SF", "Final"]:
    pl = sorted(set(ser[ser.stage == st].player))
    pool[st] = {r: [p for p in pl if role_of[p] == r] for r in ROLES}


def price(st, p):
    pr = stage_price[st]
    return 0 if pr is None else pr[team_of[p]]


def pts(st, p):
    return PP.get((st, p), 0.0)


# ---------- 5. strategier ---------------------------------------------------
def valid(st, lineup, taken=(), taken_teams=None):
    teams = dict(taken_teams or {})
    for p in lineup:
        if p in taken:
            return False
        t = team_of[p]; teams[t] = teams.get(t, 0) + 1
        if teams[t] > CAP[st]:
            return False
    return st == "Final" or sum(price(st, p) for p in lineup) <= 100


def sample(st, mode, taken=(), taken_teams=None, tries=400):
    """mode: random | fav (max forbrug) | dog (min forbrug)"""
    best, best_spend = None, None
    for _ in range(tries):
        lu = [rng.choice(pool[st][r]) for r in ROLES]
        if not valid(st, lu, taken, taken_teams):
            continue
        if mode == "random":
            return lu
        sp = sum(price(st, p) for p in lu) if st != "Final" else 0
        if st == "Final":   # fri leg: fav = alle fra favorit-holdet (bedst Swiss-rekord), dog = modsat
            teams = sorted({team_of[p] for r in ROLES for p in pool[st][r]},
                           key=lambda c: -(rec[c][0] - rec[c][1]))
            want = teams[0] if mode == "fav" else teams[1]
            lu = [rng.choice([p for p in pool[st][r] if team_of[p] == want]) for r in ROLES]
            return lu
        better = best is None or (sp > best_spend if mode == "fav" else sp < best_spend)
        if better:
            best, best_spend = lu, sp
    return best


def facit(st, taken=(), taken_teams=None, sc=None):
    sc = sc or (lambda p: pts(st, p))
    """Bedste gyldige hold med facit i haanden (graadig + lokal forbedring)."""
    cand = {r: sorted(pool[st][r], key=lambda p: -sc(p)) for r in ROLES}
    best, bv = None, -1e9
    import itertools
    for depth in (6, 9, 14):
        tops = {r: cand[r][:depth] for r in ROLES}
        for combo in itertools.product(*[tops[r] for r in ROLES]):
            if valid(st, list(combo), taken, taken_teams):
                v = sum(sc(p) for p in combo)
                if v > bv:
                    best, bv = list(combo), v
        if best is not None:
            return best
    return best


STAGE_SD = {st: float(np.std([pts(st, p) for r in ROLES for p in pool[st][r]])) for st in ["Swiss", "QF", "SF", "Final"]}


def draft_know(k):
    """Bruger med viden: ser hver spillers rigtige fasepoint + stoej (sd = k x spredningen i fasen)."""
    noisy = {st: {p: pts(st, p) + rng.normal(0, k * STAGE_SD[st]) for r in ROLES for p in pool[st][r]} for st in STAGE_SD}
    res = {}
    A = facit("Swiss", sc=lambda p: noisy["Swiss"][p])
    tt = {}
    for p in A:
        tt[team_of[p]] = tt.get(team_of[p], 0) + 1
    res["SwissA"], res["SwissB"] = A, facit("Swiss", set(A), tt, sc=lambda p: noisy["Swiss"][p])
    for st in ["QF", "SF", "Final"]:
        res[st] = facit(st, sc=lambda p, st=st: noisy[st][p])
    return res


def draft_all(mode):
    res = {}
    if mode == "facit":
        A = facit("Swiss")
    else:
        A = sample("Swiss", mode)
    tt = {}
    for p in A:
        t = team_of[p]; tt[t] = tt.get(t, 0) + 1
    B = facit("Swiss", set(A), tt) if mode == "facit" else sample("Swiss", mode, set(A), tt)
    res["SwissA"], res["SwissB"] = A, B
    for st in ["QF", "SF", "Final"]:
        res[st] = facit(st) if mode == "facit" else sample(st, mode)
    return res


PART_STAGE = {"SwissA": "Swiss", "SwissB": "Swiss", "QF": "QF", "SF": "SF", "Final": "Final"}
PARTS = ["SwissA", "SwissB", "QF", "SF", "Final"]


def score_user(d):
    return {k: sum(pts(PART_STAGE[k], p) for p in d[k]) for k in PARTS}


N = 1000
STRATS = {"random": "Tilfældig", "fav": "Favorit-tung", "dog": "Underdog-tung"}
sims = {}
for s in STRATS:
    sims[s] = [score_user(draft_all(s)) for _ in range(N)]
    print(s, "done", file=sys.stderr)
fac = score_user(draft_all("facit"))

# ---------- 6. ligaer: 6 brugere (2 af hver) ---------------------------------
L = 4000
win_count = {s: 0 for s in STRATS}
totals = {s: np.array([sum(u.values()) for u in sims[s]]) for s in STRATS}
for _ in range(L):
    entrants = [(s, totals[s][rng.integers(N)]) for s in STRATS for _ in range(2)]
    win_count[max(entrants, key=lambda x: x[1])[0]] += 1

KNOW = [(lab, float(np.sqrt(1 / c**2 - 1))) for lab, c in [("Fan", .1), ("Kender scenen", .2), ("Analytiker", .3), ("Ekspert", .45)]]
NK = 300
mixed = np.concatenate([totals[s] for s in STRATS])
know = []
for lab, k in KNOW:
    t = np.array([sum(score_user(draft_know(k)).values()) for _ in range(NK)])
    wins = sum(t[rng.integers(NK)] > np.max(rng.choice(mixed, 5)) for _ in range(L))
    know.append(dict(label=lab, k=round(k, 2), corr=round(1 / np.sqrt(1 + k * k), 2), mean=round(float(t.mean()), 1),
                     q=[round(float(v), 1) for v in np.percentile(t, [10, 25, 50, 75, 90])], win_share=round(wins / L, 3)))
    print(lab, "done", file=sys.stderr)
sw_pl = [p for r in ROLES for p in pool["Swiss"][r]]
corr_price = round(float(np.corrcoef([price("Swiss", p) for p in sw_pl], [pts("Swiss", p) for p in sw_pl])[0, 1]), 2)
base_wins = sum(mixed[rng.integers(len(mixed))] > np.max(rng.choice(mixed, 5)) for _ in range(L))
know.insert(0, dict(label="Ingen viden", k=None, corr=0.0, mean=round(float(mixed.mean()), 1),
                    q=[round(float(v), 1) for v in np.percentile(mixed, [10, 25, 50, 75, 90])], win_share=round(base_wins / L, 3)))

# ---------- 7. eksempel-liga til afspilning ---------------------------------
NAMES = [("Bruger 1", "random"), ("Bruger 2", "random"), ("Bruger 3", "fav"),
         ("Bruger 4", "fav"), ("Bruger 5", "dog"), ("Bruger 6", "dog")]
league = []
for name, s in NAMES:
    d = draft_all(s)
    sc = score_user(d)
    league.append(dict(name=name, strategy=STRATS[s], parts={
        k: dict(total=round(sc[k], 1), players=[dict(name=p, role=role_of[p], team=team_of[p],
                                                     price=price(PART_STAGE[k], p), pts=round(pts(PART_STAGE[k], p), 1))
                                                for p in d[k]]) for k in PARTS}))

# ---------- 8. eksempler paa beregning --------------------------------------
def explain(idx):
    r = df.loc[idx]
    pa, pb = parts_A(r), parts_B(r)
    m = multA[r.role]
    a_before = max(-5, r.rawA * m)
    return dict(player=r.player, role=r.role, team=r.team, win=bool(r.win), stage=r.stage,
                minutes=round(r.minutes, 1), k=int(r.k), d=int(r.d), a=int(r.a),
                cspm=round(r.cspm, 2), dmg=round(r.dmg, 1), kp=round(r.kp, 1), ks=round(r.ks, 1),
                wp=int(r.wp), wd=int(r.wd),
                snit={c: round(float(snit.loc[r.role, c]), 2) for c in ["cspm", "dmg", "kp", "ks", "d", "wp", "wd"]},
                A_parts=[dict(key=k, label=LAB[k], v=round(v, 2)) for k, v in pa.items() if abs(v) > 1e-9],
                rawA=round(r.rawA, 2), multA=round(m, 3), A_scaled=round(a_before, 2), A=round(r.A, 2),
                A_mean=round(df[df.role == r.role].A.mean(), 2), A_sd=round(df[df.role == r.role].A.std(), 2),
                zA=round(r.zA, 2),
                B_parts=[dict(key=k, label=LAB[k], v=round(v, 2)) for k, v in pb.items() if abs(v) > 1e-9],
                rawB=round(r.rawB, 2), sdB=round(sdB[r.role], 2), B=round(r.B, 2),
                B_mean=round(df[df.role == r.role].B.mean(), 2), B_sd=round(df[df.role == r.role].B.std(), 2),
                zB=round(r.zB, 2), mix=round(r.mix, 2),
                mix_mean=round(df[df.role == r.role].mix.mean(), 3), mix_sd=round(df[df.role == r.role].mix.std(), 3),
                zmix=round(r.zmix, 2), base=round(r.base, 2), title=r.title, score=round(r.score, 2))


def pick(cond):
    sub = df[cond]
    return sub.index[np.argmin(np.abs(sub.score - sub.score.median()))]


ex = [explain(pick((df.title == "MVP") & (df.role == "ADC"))),
      explain(pick((df.title == "ACE") & (df.role == "Support"))),
      explain(pick((df.title == "") & (~df.win) & (df.role == "Jungle")))]

# serie->fase eksempel for foerste eksempelspiller
pl = ex[0]["player"]
chain = ser[ser.player == pl].sort_values(["stage", "match"])
chain_out = []
for st in ["Swiss", "QF", "SF", "Final"]:
    sub = chain[chain.stage == st]
    if len(sub):
        series_list = []
        for m in sub.match:
            gs = df[(df.match == m) & (df.player == pl)].score.round(1).tolist()
            series_list.append(dict(games=gs, sp=round(float(np.mean(gs)), 1)))
        chain_out.append(dict(stage=st, series=series_list, fase=round(pts(st, pl), 1)))

# ---------- 9. fordelinger --------------------------------------------------
bins = np.arange(-10, 66, 4)
hist = lambda x: np.histogram(np.clip(x, bins[0], bins[-1] - .01), bins)[0].tolist()
dist = dict(bins=bins.tolist(), win=hist(df[df.win].score), loss=hist(df[~df.win].score),
            role={r: dict(q=[round(float(v), 1) for v in np.percentile(df[df.role == r].score, [10, 25, 50, 75, 90])],
                          mean=round(float(df[df.role == r].score.mean()), 1),
                          win=round(float(df[(df.role == r) & df.win].score.mean()), 1),
                          loss=round(float(df[(df.role == r) & ~df.win].score.mean()), 1)) for r in ROLES},
            mean_win=round(float(df[df.win].score.mean()), 1), mean_loss=round(float(df[~df.win].score.mean()), 1),
            loser_top3=round(float((~df[df.groupby("game").score.rank(ascending=False, method="first") <= 3].win).mean()), 3),
            n_games=int(df.game.nunique()), n_rows=len(df))

tb = np.arange(0, 1.0001, 1)  # placeholder
allt = np.concatenate(list(totals.values()))
tbins = np.linspace(np.floor(allt.min() / 25) * 25, np.ceil(max(allt.max(), sum(fac.values())) / 25) * 25, 25)
strat = {}
for s, lab in STRATS.items():
    t = totals[s]
    strat[s] = dict(label=lab, hist=np.histogram(t, tbins)[0].tolist(),
                    q=[round(float(v), 1) for v in np.percentile(t, [10, 25, 50, 75, 90])], mean=round(float(t.mean()), 1),
                    parts={k: round(float(np.mean([u[k] for u in sims[s]])), 1) for k in PARTS},
                    win_share=round(win_count[s] / L, 3))
budget = {}
for st in ["Swiss", "QF", "SF"]:
    spends = []
    for _ in range(3000):
        lu = [rng.choice(pool[st][r]) for r in ROLES]
        spends.append(sum(price(st, p) for p in lu))
    spends = np.array(spends)
    budget[st] = dict(over=round(float((spends > 100).mean()), 3), mean=round(float(spends.mean()), 1))

tiers = []
for t, tier in TIER.items():
    tiers.append(dict(team=t, tier=tier, price=PRICE[tier], swiss=f"{rec[t][0]}-{rec[t][1]}",
                      qf=stage_price["QF"].get(t), sf=stage_price["SF"].get(t),
                      final=t in {team_of[p] for r in ROLES for p in pool["Final"][r]},
                      swiss_avg=round(float(np.mean([pts("Swiss", p) for p in players.index if team_of[p] == t and ("Swiss", p) in PP])), 1)))

out = dict(examples=ex, chain=dict(player=pl, phases=chain_out), dist=dist, strat=strat, tbins=tbins.round(0).tolist(),
           facit=dict(total=round(sum(fac.values()), 1), parts={k: round(v, 1) for k, v in fac.items()}),
           league=league, know=know, corr_price=corr_price, year=YEAR, n_games=int(df.game.nunique()), tiers=tiers, budget=budget, multA={r: round(float(multA[r]), 2) for r in ROLES},
           N=N, L=L)
json.dump(out, open(OUT, "w"), ensure_ascii=False, default=lambda o: o.item() if hasattr(o, "item") else str(o))
print(json.dumps({k: out[k] for k in ["strat", "facit", "budget", "know"]}, ensure_ascii=False, indent=1, default=lambda o: o.item()))
print("dist means", dist["mean_win"], dist["mean_loss"], dist["loser_top3"])
print("examples", [(e["player"], e["score"], e["title"]) for e in ex])
print("chain", chain_out)
