"""
PLACAR — API de dados ao vivo (Python, só biblioteca padrão)

Rode na pasta do projeto:   python server/placar_api.py
Abre em:                     http://localhost:8000

O que faz
  * Serve o site (index.html, css, js…).
  * Mantém os dados atualizados em segundo plano:
      - tabela do Brasileirão e placares da rodada (ESPN), a cada poucos minutos;
      - elencos e a escalação do último jogo de cada clube (ESPN), a cada algumas horas;
      - notícias de cada clube e dos setoristas configurados (Google Notícias RSS).
  * "Minuto a minuto": narra a partida em português, com textos próprios, a partir
    dos lances da súmula ao vivo (gols, cartões, substituições, intervalo…).

Rotas
  GET /api/health
  GET /api/state                          tabela, jogos, elencos e últimas escalações
  GET /api/rankings        [?tipo=gols|ataque|defesa|amarelos|vermelhos]   rankings do campeonato
  GET /api/jogadores       [?club=id]     pendurados, sequência de jogos, lesionados e minutagem dos reservas

Gera também o arquivo do site sem a API (GitHub Pages):  python server/placar_api.py --snapshot
  GET /api/news            [?club=id]     manchetes (título, fonte, data e link)
  GET /api/minuto-a-minuto/<id_espn>      narração completa do jogo até agora
  GET /api/minuto-a-minuto/<id_espn>/stream   o mesmo, ao vivo (Server-Sent Events)

Notícias: só título, fonte, data e link — o texto das matérias fica no site de origem.
"""
import email.utils
import gzip
import json
import os
import re
import sys
import threading
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_FILE = os.path.join(HERE, "cache", "state.json")
MATCHES_FILE = os.path.join(HERE, "cache", "partidas.json")   # súmula resumida de cada jogo encerrado
CONFIG = json.load(open(os.path.join(HERE, "config.json"), encoding="utf-8"))
CLUBS = CONFIG["clubes"]
BY_ESPN = {v["espn"]: k for k, v in CLUBS.items()}
ESPN = "https://site.api.espn.com/apis"
LEAGUES = ["bra.1", "bra.copa_do_brazil", "conmebol.libertadores", "conmebol.sudamericana"]
COMP_NAME = {"bra.1": "Brasileirão", "bra.copa_do_brazil": "Copa do Brasil", "conmebol.libertadores": "Libertadores", "conmebol.sudamericana": "Sul-Americana"}

lock = threading.Lock()
state = {"updated": None, "standings": None, "round": None, "fixtures": None, "squads": None, "last": None, "news": {}, "players": None, "errors": []}


def log(*a):
    print(time.strftime("[%H:%M:%S]"), *a, flush=True)


def get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "placar-portfolio/1.0", "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            data = gzip.decompress(data)
        return data


def get_json(url):
    return json.loads(get(url))


# ---------------------------------------------------------------------------
# Dados de partida que já vêm no site (js/data.js e js/squads.js) servem de base
# ---------------------------------------------------------------------------
def js_object(path, name):
    src = open(os.path.join(ROOT, path), encoding="utf-8").read()
    m = re.search(rf"{name}\s*=\s*(\{{.*?\n\}});", src, re.S)
    txt = re.sub(r"/\*.*?\*/", "", m.group(1), flags=re.S)
    txt = re.sub(r"(?m)^\s*(\w[\w-]*):", r'"\1":', txt)        # chaves sem aspas
    txt = re.sub(r"([{,]\s*)(\d+):", r'\1"\2":', txt)          # chaves numéricas
    txt = re.sub(r",(\s*[\]}])", r"\1", txt)                    # vírgula sobrando
    return json.loads(txt)


def seed():
    real = js_object("js/data.js", "const REAL")
    fixtures = js_object("js/data.js", "const FIXTURES")
    return real, fixtures


# ---------------------------------------------------------------------------
# Atualizações
# ---------------------------------------------------------------------------
def update_standings_and_fixtures():
    real, fixtures = seed()
    with lock:
        fixtures = state["fixtures"] or fixtures
    # tabela (ESPN): pontos, jogos, V/E/D e gols; cartões e próximo jogo vêm da última tabela da CBF
    old = {r[0]: r for r in real["table"]}
    d = get_json(f"{ESPN}/v2/sports/soccer/bra.1/standings")
    rows = []
    for e in d["children"][0]["standings"]["entries"]:
        cid = BY_ESPN.get(e["team"]["id"])
        if not cid:
            continue
        s = {x["name"]: x.get("value") for x in e["stats"]}
        o = old.get(cid, [cid, 0, 0, 0, 0, 0, 0, 0, 0, 0, None])
        rows.append([int(s.get("rank") or 99), [cid, int(s["points"]), int(s["gamesPlayed"]), int(s["wins"]), int(s["ties"]), int(s["losses"]), int(s["pointsFor"]), int(s["pointsAgainst"]), o[8], o[9], o[10]]])
    rows.sort(key=lambda x: x[0])
    table = [r for _, r in rows]

    # placares: procura cada jogo da rodada no placar da ESPN do dia
    days = {}
    for rd, games in fixtures.items():
        for g in games:
            if g[4]:
                days.setdefault(g[4], None)
    for day in list(days):
        try:
            days[day] = get_json(f"{ESPN}/site/v2/sports/soccer/bra.1/scoreboard?dates={day.replace('-', '')}")
        except Exception as ex:  # um dia sem resposta não derruba a atualização
            log("placar", day, ex)
    for rd, games in fixtures.items():
        for g in games:
            sb = days.get(g[4])
            if not sb:
                continue
            for ev in sb.get("events", []):
                comp = ev["competitions"][0]
                teams = {BY_ESPN.get(c["team"]["id"]): c for c in comp["competitors"]}
                if g[0] in teams and g[1] in teams:
                    st = comp["status"]["type"]
                    while len(g) < 9:
                        g.append(None)
                    g[7] = ev["id"]
                    if st["state"] in ("in", "post"):
                        g[2], g[3] = int(teams[g[0]]["score"]), int(teams[g[1]]["score"])
                    g[8] = {"state": st["state"], "clock": comp["status"].get("displayClock"), "detail": st.get("shortDetail")}
                    if st["state"] == "in":  # ainda em andamento: placar parcial, não final
                        g[8]["live"] = True
    add_new_cards(table, old, fixtures)
    rnd = max(int(k) for k in fixtures)
    with lock:
        state.update(standings=table, fixtures=fixtures, round=rnd, scorers=real["scorers"], updated=time.strftime("%d/%m/%Y às %H:%M"))
    log("tabela e jogos atualizados")


cards_by_event = {}  # cartões de cada jogo encerrado (não mudam mais, então ficam guardados)


def match_cards(eid):
    if eid not in cards_by_event:
        d = summary(eid)
        out = {}
        for t in ((d or {}).get("boxscore") or {}).get("teams", []):
            st = {x["name"]: x.get("displayValue") for x in t.get("statistics", [])}
            out[t["team"]["id"]] = (int(st.get("yellowCards") or 0), int(st.get("redCards") or 0))
        if not out:
            return {}
        cards_by_event[eid] = out
    return cards_by_event[eid]


def add_new_cards(table, base, fixtures):
    """Cartões: a base é a última tabela da CBF. Para cada clube que já jogou mais vezes do que
    nessa base, soma os cartões dos jogos encerrados mais recentes (súmula da ESPN)."""
    done = []
    for games in fixtures.values():
        for g in games:
            if len(g) > 8 and g[7] and isinstance(g[8], dict) and g[8].get("state") == "post":
                done.append(g)
    done.sort(key=lambda g: (g[4] or "", g[5] or ""), reverse=True)
    for row in table:
        cid, j = row[0], row[2]
        b = base.get(cid)
        if not b:
            continue
        extra = j - b[2]
        if extra <= 0:
            continue
        espn = CLUBS[cid]["espn"]
        mine = [g for g in done if cid in (g[0], g[1])][:extra]
        for g in mine:
            try:
                y, r = match_cards(g[7]).get(espn, (0, 0))
            except Exception as ex:
                log("cartões", g[7], ex)
                continue
            row[8] += y
            row[9] += r


RANK_ORDER = {
    "gols": ("gols marcados", lambda r: (-r["gf"], -r["sg"]), lambda r: r["gf"]),
    "ataque": ("gols marcados por jogo", lambda r: (-r["gf"] / max(r["j"], 1), -r["gf"]), lambda r: round(r["gf"] / max(r["j"], 1), 2)),
    "defesa": ("gols sofridos por jogo", lambda r: (r["ga"] / max(r["j"], 1), r["ga"]), lambda r: round(r["ga"] / max(r["j"], 1), 2)),
    "amarelos": ("cartões amarelos", lambda r: (-r["ca"], -r["cv"]), lambda r: r["ca"]),
    "vermelhos": ("cartões vermelhos", lambda r: (-r["cv"], -r["ca"]), lambda r: r["cv"]),
}


def rankings(tipo=None):
    with lock:
        table, updated, rnd = state["standings"] or [], state["updated"], state["round"]
    rows = [dict(id=t[0], pos=i + 1, p=t[1], j=t[2], gf=t[6], ga=t[7], sg=t[6] - t[7], ca=t[8], cv=t[9]) for i, t in enumerate(table)]
    out = {}
    for k, (label, key, val) in RANK_ORDER.items():
        if tipo and k != tipo:
            continue
        out[k] = {"criterio": label, "ranking": [dict(r, rank=i + 1, valor=val(r)) for i, r in enumerate(sorted(rows, key=key))]}
    return {"updated": updated, "round": rnd, "rankings": out}


def update_squads():
    squads, last = {}, {}
    order = {"G": 0, "D": 1, "M": 2, "F": 3}
    for cid, c in CLUBS.items():
        d = get_json(f"{ESPN}/site/v2/sports/soccer/bra.1/teams/{c['espn']}/roster")
        rows = []
        for a in d.get("athletes", []):
            p = (a.get("position") or {}).get("abbreviation", "M")
            p = p if p in order else "M"
            n = a.get("jersey")
            rows.append([int(n) if n and n.isdigit() else None, a.get("displayName"), p, a.get("age"), a.get("id")])
        rows.sort(key=lambda r: (order[r[2]], r[0] if r[0] is not None else 999, r[1]))
        squads[cid] = rows
    # último jogo de cada clube, olhando 21 dias para trás em 4 competições
    seen = {}
    today = time.time()
    for back in range(0, 21):
        day = time.strftime("%Y%m%d", time.localtime(today - back * 86400))
        for lg in LEAGUES:
            try:
                sb = get_json(f"{ESPN}/site/v2/sports/soccer/{lg}/scoreboard?dates={day}")
            except Exception:
                continue
            for ev in sb.get("events", []):
                if not ev["status"]["type"]["completed"]:
                    continue
                for c in ev["competitions"][0]["competitors"]:
                    cid = BY_ESPN.get(c["team"]["id"])
                    if cid and (cid not in seen or ev["date"] > seen[cid][0]):
                        seen[cid] = (ev["date"], lg, ev["id"])
        if len(seen) == len(CLUBS) and back > 7:
            break
    for cid, (date, lg, eid) in seen.items():
        try:
            s = get_json(f"{ESPN}/site/v2/sports/soccer/{lg}/summary?event={eid}")
            r = [x for x in s["rosters"] if x["team"]["id"] == CLUBS[cid]["espn"]][0]
            comp = s["header"]["competitions"][0]["competitors"]
            me = [t for t in comp if t["team"]["id"] == CLUBS[cid]["espn"]][0]
            opp = [t for t in comp if t["team"]["id"] != CLUBS[cid]["espn"]][0]
            st = sorted([x for x in r["roster"] if x.get("starter")], key=lambda x: int(x.get("formationPlace") or 99))
            last[cid] = {"date": date[:10], "comp": COMP_NAME[lg], "vs": opp["team"]["displayName"], "home": me.get("homeAway") == "home",
                         "score": f'{me.get("score")}-{opp.get("score")}', "formation": r.get("formation"),
                         "xi": [[int(x.get("formationPlace")), x["athlete"]["id"]] for x in st],
                         "bench": [x["athlete"]["id"] for x in r["roster"] if not x.get("starter")][:12]}
            known = {row[4] for row in squads[cid]}
            for x in r["roster"]:  # quem jogou e não está na lista do elenco entra nela
                if x["athlete"]["id"] not in known:
                    n = x.get("jersey")
                    squads[cid].append([int(n) if n and n.isdigit() else None, x["athlete"]["displayName"], "M", None, x["athlete"]["id"]])
        except Exception as ex:
            log("última escalação", cid, ex)
    with lock:
        state.update(squads=squads, last=last)
    log("elencos e últimas escalações atualizados")


# ---------------------------------------------------------------------------
# Jogadores: pendurados, sequência, lesionados e minutagem dos reservas
# ---------------------------------------------------------------------------
SUSPENSAO_AMARELOS = 3   # no Brasileirão, o 3º amarelo suspende; com 2 o jogador está "pendurado"
LESAO = re.compile(r"les[ãa]o|lesionad|departamento m[ée]dico|\bDM\b|cirurgia|contus[ãa]o|estiramento|entorse|fratura|ruptura|ligamento|tratamento|vetado|machuc|edema|hérnia|hernia|\bdores?\b|problema f[íi]sico", re.I)


# manchetes de quem já se recuperou não contam como lesão atual
RECUPERADO = re.compile(r"recuperad|retorna|volta a treinar|volta aos|liberad|após retornar|de volta|reaparece|alta m[ée]dica|descart\w* les|sem les[ãa]o|n[ãa]o tem les|reforça|relacionad|treina normal", re.I)
# o mesmo portal aparece com nomes diferentes no Google Notícias
SOURCE_NAMES = {"ge": "ge", "globo esporte": "ge", "lance!": "Lance", "lance": "Lance", "espn brasil": "ESPN", "espn": "ESPN", "uol": "UOL", "uol esporte": "UOL",
                "gazeta esportiva": "Gazeta Esportiva", "terra": "Terra"}

# como cada clube aparece nas manchetes
HEADLINE_NAMES = {
    "athletico-pr": ["Athletico", "Furacão", "CAP"], "atletico-mg": ["Atlético-MG", "Atlético Mineiro", "Galo"], "bahia": ["Bahia", "Tricolor de Aço"],
    "botafogo": ["Botafogo", "Fogão"], "bragantino": ["Bragantino", "Massa Bruta"], "chapecoense": ["Chapecoense", "Chape"],
    "corinthians": ["Corinthians", "Timão"], "coritiba": ["Coritiba", "Coxa"], "cruzeiro": ["Cruzeiro", "Raposa"], "flamengo": ["Flamengo", "Mengão", "Fla"],
    "fluminense": ["Fluminense", "Flu"], "gremio": ["Grêmio", "Gremio"], "internacional": ["Internacional", "Inter", "Colorado"], "mirassol": ["Mirassol"],
    "palmeiras": ["Palmeiras", "Verdão"], "remo": ["Remo", "Leão Azul"], "santos": ["Santos", "Peixe"], "sao-paulo": ["São Paulo", "Tricolor Paulista", "SPFC"],
    "vasco": ["Vasco"], "vitoria": ["Vitória", "Leão da Barra"],
}


def minute(txt):
    m = re.match(r"\s*(\d+)", txt or "")
    return min(int(m.group(1)), 90) if m else None


def match_extract(eid):
    """Resumo de um jogo encerrado: para cada time, quem jogou, quanto tempo e os cartões."""
    d = get_json(f"{ESPN}/site/v2/sports/soccer/bra.1/summary?event={eid}")
    out = {"date": d["header"]["competitions"][0]["date"][:10], "teams": {}}
    for r in d.get("rosters", []):
        rows = []
        for x in r.get("roster", []):
            st = {k["name"]: k.get("value") or 0 for k in x.get("stats", [])}
            if not (x.get("starter") or x.get("subbedIn")):
                continue
            sub_min = [minute(pl["clock"]["displayValue"]) for pl in x.get("plays", []) if pl.get("substitution")]
            red_min = [minute(pl["clock"]["displayValue"]) for pl in x.get("plays", []) if pl.get("redCard")]
            if x.get("starter"):
                start, end = 0, (sub_min[0] if x.get("subbedOut") and sub_min else 90)
            else:
                start, end = (sub_min[0] or 45) if sub_min else 45, 90
                if x.get("subbedOut") and len(sub_min) > 1:
                    end = sub_min[1]
            if red_min and red_min[0] is not None:
                end = min(end, red_min[0])
            rows.append([x["athlete"]["id"], x["athlete"]["displayName"], bool(x.get("starter")), max(0, (end or 90) - (start or 0)),
                         int(st.get("yellowCards", 0)), int(st.get("redCards", 0))])
        out["teams"][r["team"]["id"]] = rows
    return out


def load_matches():
    try:
        return json.load(open(MATCHES_FILE, encoding="utf-8"))
    except Exception:
        return {}


def club_player_stats(cid, matches, squad_names, news):
    espn = CLUBS[cid]["espn"]
    sched = get_json(f"{ESPN}/site/v2/sports/soccer/bra.1/teams/{espn}/schedule?season={time.strftime('%Y')}")
    evs = sorted((e for e in sched.get("events", []) if e["competitions"][0]["status"]["type"].get("completed")), key=lambda e: e["date"])
    for e in evs:
        if e["id"] not in matches:
            try:
                matches[e["id"]] = match_extract(e["id"])
                time.sleep(0.25)
            except Exception as ex:
                log("súmula", e["id"], ex)
    games = [matches[e["id"]] for e in evs if e["id"] in matches]
    P = {}
    for gi, g in enumerate(games):
        for pid, nm, starter, mins, yc, rc in g["teams"].get(espn, []):
            q = P.setdefault(pid, {"id": pid, "name": squad_names.get(pid, nm), "apps": 0, "starts": 0, "min": 0, "yc": 0, "rc": 0, "played": set(), "started": set(), "last_yc": None})
            q["apps"] += 1; q["starts"] += starter; q["min"] += mins; q["yc"] += yc; q["rc"] += rc
            q["played"].add(gi)
            if starter:
                q["started"].add(gi)
            if yc:
                q["last_yc"] = g["date"]
    n = len(games)

    def streak(idx):
        k = 0
        for gi in range(n - 1, -1, -1):
            if gi not in idx:
                break
            k += 1
        return k

    pend, seq, res = [], [], []
    for q in P.values():
        if q["yc"] and q["yc"] % SUSPENSAO_AMARELOS == SUSPENSAO_AMARELOS - 1:
            pend.append({"id": q["id"], "name": q["name"], "amarelos": q["yc"], "ultimo": q["last_yc"]})
        sp, ss = streak(q["played"]), streak(q["started"])
        if sp >= 2:
            seq.append({"id": q["id"], "name": q["name"], "jogos": sp, "titular": ss})
        # reserva: entrou em campo, mas foi titular em menos da metade dos jogos do clube
        if q["apps"] and q["starts"] * 2 < n:
            res.append({"id": q["id"], "name": q["name"], "minutos": q["min"], "jogos": q["apps"], "titular": q["starts"], "media": round(q["min"] / q["apps"])})
    pend.sort(key=lambda x: (x["ultimo"] or ""), reverse=True)
    seq.sort(key=lambda x: (-x["jogos"], -x["titular"]))
    res.sort(key=lambda x: -x["minutos"])

    # nomes do elenco que dá para achar numa manchete (nome completo ou sobrenome sem ambiguidade)
    names = {}
    for pid, nm in squad_names.items():
        parts = [w for w in re.split(r"\s+", nm) if len(w) >= 4]
        for k in {nm} | ({parts[-1]} if parts else set()):
            names.setdefault(k.lower(), set()).add(pid)

    club_words = {w.lower() for w in (CLUBS[cid]["busca"], *HEADLINE_NAMES.get(cid, []))}

    def cited(t):
        """Jogadores do elenco citados na manchete. Para evitar confundir nomes, a manchete precisa citar o clube,
        e um sobrenome sozinho não vale quando vem logo depois de outro nome ("Paulo Henrique" não é "Bruno Henrique")."""
        if not any(re.search(rf"(?<!\w){re.escape(w)}(?!\w)", t, re.I) for w in club_words):
            return set()
        out = set()
        for k, p in names.items():
            if len(p) != 1:
                continue
            pid = next(iter(p))
            full = squad_names[pid].lower()
            for m in re.finditer(rf"(?<!\w){re.escape(k)}(?!\w)", t, re.I):
                before = re.search(r"([A-ZÀ-Ý][\wÀ-ÿ'-]+)\s+$", t[:m.start()])
                after = re.match(r"\s+([A-ZÀ-Ý][\wÀ-ÿ'-]+)", t[m.end():])
                if k != full and ((before and before.group(1).lower() not in full) or (after and after.group(1).lower() not in full)):
                    continue
                out.add(pid)
                break
        return out

    def item(it):
        return {"manchete": it.get("title"), "fonte": it.get("source"), "link": it.get("link"), "setorista": it.get("tag") not in (None, "clube"),
                "data": time.strftime("%Y-%m-%d", time.localtime(it.get("ts") or 0))}

    # lesionados: só portais jornalísticos e setoristas; cada jogador guarda quantas fontes diferentes citam a lesão
    inj = {}
    recent = time.time() - 21 * 86400
    cleared = set()  # a notícia mais recente diz que está liberado: notícias de lesão mais antigas não contam
    for it in sorted(news, key=lambda x: -(x.get("ts") or 0)):
        t = it.get("title") or ""
        if (it.get("ts") or 0) < recent:
            continue
        if RECUPERADO.search(t):
            cleared |= cited(t) - set(inj)
            continue
        if not LESAO.search(t):
            continue
        fonte = SOURCE_NAMES.get((it.get("source") or "").lower(), it.get("source"))
        for pid in cited(t) - cleared:
            q = inj.setdefault(pid, {"id": pid, "name": squad_names[pid], "fontes": [], "noticias": []})
            if fonte not in q["fontes"]:
                q["fontes"].append(fonte)
                q["noticias"].append(dict(item(it), fonte=fonte))
    for q in inj.values():
        q["confirmado"] = len(q["fontes"]) >= 2 or any(x["setorista"] for x in q["noticias"])
    lesionados = sorted(inj.values(), key=lambda q: (q["confirmado"], len(q["fontes"]), max(x["data"] for x in q["noticias"])), reverse=True)

    # pendurados: a conta da súmula (ESPN) é conferida com o que a imprensa publicou
    press = {}
    for it in news:
        t = it.get("title") or ""
        if re.search(r"pendurad", t, re.I):
            for pid in cited(t):
                press.setdefault(pid, item(it))
    for p in pend:
        p["imprensa"] = press.get(p["id"])
    known = {p["id"] for p in pend}
    for pid, it in press.items():
        if pid not in known:  # a imprensa cita, a súmula não fecha a conta: mostra marcado como "segundo a imprensa"
            q = P.get(pid, {})
            pend.append({"id": pid, "name": squad_names[pid], "amarelos": q.get("yc"), "ultimo": q.get("last_yc"), "imprensa": it, "so_imprensa": True})
    return {"jogos": n, "pendurados": pend, "sequencia": seq[:12], "lesionados": lesionados[:10], "reservas": res[:12],
            "fontes": {"sumulas": "ESPN", "imprensa": sorted({x["fonte"] for q in inj.values() for x in q["noticias"] if x["fonte"]})}}


def press_news(c):
    """Manchetes de lesão e de pendurados nos portais configurados e com os setoristas do clube."""
    sites = " OR ".join(f"site:{s}" for s in CONFIG["fontes"])
    terms = '(lesão OR lesionado OR "departamento médico" OR cirurgia OR desfalque OR vetado OR pendurado OR pendurados)'
    items = [dict(x, tag="clube") for x in news_query(f'"{c["busca"]}" {terms} ({sites}) when:21d')]
    for rep in c.get("setoristas", []):
        items += [dict(x, tag=rep) for x in news_query(f'"{rep}" "{c["busca"]}" {terms} when:21d')]
    return items


def update_players():
    with lock:
        squads = state["squads"] or {}
        club_news = dict(state["news"])
    if not squads:  # sem cache: usa o elenco gravado no site
        src = open(os.path.join(ROOT, "js", "squads.js"), encoding="utf-8").read()
        squads = json.loads(src[src.index("window.SQUADS = ") + 16:src.index("window.SQUADS_LAST")].strip().rstrip(";"))
    matches = load_matches()
    out = {}
    for cid, c in CLUBS.items():
        names = {row[4]: row[1] for row in squads.get(cid, []) if row[4]}
        try:
            news = press_news(c) + club_news.get(cid, [])
        except Exception as ex:
            log("notícias de lesão", cid, ex)
            news = club_news.get(cid, [])
        try:
            out[cid] = club_player_stats(cid, matches, names, news)
        except Exception as ex:
            log("jogadores", cid, ex)
        time.sleep(0.5)
    os.makedirs(os.path.dirname(MATCHES_FILE), exist_ok=True)
    json.dump(matches, open(MATCHES_FILE, "w", encoding="utf-8"), ensure_ascii=False)
    with lock:
        state["players"] = {"updated": time.strftime("%d/%m/%Y às %H:%M"), "clubs": out}
    log("estatísticas de jogadores atualizadas")


def write_snapshot():
    """Grava js/player-stats.js para o site funcionar sem a API (GitHub Pages)."""
    update_players()
    with lock:
        data = state["players"]
    path = os.path.join(ROOT, "js", "player-stats.js")
    head = ("/* PLACAR — estatísticas de jogadores (gerado por: python server/placar_api.py --snapshot)\n"
            "   Súmulas: ESPN · lesões: manchetes do Google Notícias que citam o jogador. */\n")
    open(path, "w", encoding="utf-8").write(head + "window.PLAYER_STATS = " + json.dumps(data, ensure_ascii=False) + ";\n")
    log("gravado", path)


def news_query(q):
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": q, "hl": "pt-BR", "gl": "BR", "ceid": "BR:pt-419"})
    root = ET.fromstring(get(url))
    out = []
    for it in root.iter("item"):
        src = it.find("source")
        pub = it.findtext("pubDate")
        try:
            ts = email.utils.parsedate_to_datetime(pub).timestamp()
        except Exception:
            ts = 0
        out.append({"title": (it.findtext("title") or "").rsplit(" - ", 1)[0], "link": it.findtext("link"),
                    "source": src.text if src is not None else "", "ts": ts})
    return out


def update_news():
    sites = " OR ".join(f"site:{s}" for s in CONFIG["fontes"])
    for cid, c in CLUBS.items():
        items = []
        try:
            items += [dict(x, tag="clube") for x in news_query(f'"{c["busca"]}" ({sites}) when:2d')]
            for rep in c.get("setoristas", []):
                items += [dict(x, tag=rep) for x in news_query(f'"{rep}" "{c["busca"]}" when:3d')]
        except Exception as ex:
            log("notícias", cid, ex)
            continue
        uniq = {}
        for x in sorted(items, key=lambda x: -x["ts"]):
            uniq.setdefault(x["title"], x)
        with lock:
            state["news"][cid] = list(uniq.values())[:20]
        time.sleep(1)  # educado com o servidor de notícias
    log("notícias atualizadas")


def persist():
    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
    with lock:
        json.dump(state, open(CACHE_FILE, "w", encoding="utf-8"), ensure_ascii=False)


def every(minutes, fn):
    def loop():
        while True:
            try:
                fn()
                persist()
            except Exception as ex:
                log("falha em", fn.__name__, ex)
                with lock:
                    state["errors"] = (state["errors"] + [f"{time.strftime('%H:%M')} {fn.__name__}: {ex}"])[-10:]
            time.sleep(minutes * 60)
    threading.Thread(target=loop, daemon=True).start()


# ---------------------------------------------------------------------------
# Minuto a minuto: narração própria a partir dos lances
# ---------------------------------------------------------------------------
summary_cache = {}


def summary(eid):
    hit = summary_cache.get(eid)
    if hit and time.time() - hit[0] < 15:
        return hit[1]
    data = None
    for lg in LEAGUES:
        try:
            d = get_json(f"{ESPN}/site/v2/sports/soccer/{lg}/summary?event={eid}")
            if d.get("header"):
                data = d
                break
        except Exception:
            continue
    summary_cache[eid] = (time.time(), data)
    return data


def name(c):
    return BY_ESPN.get(c["team"]["id"]) or c["team"]["displayName"]


def narrate(eid):
    d = summary(eid)
    if not d:
        return None
    comp = d["header"]["competitions"][0]
    teams = {c["team"]["id"]: c for c in comp["competitors"]}
    home = [c for c in comp["competitors"] if c.get("homeAway") == "home"][0]
    away = [c for c in comp["competitors"] if c.get("homeAway") == "away"][0]
    tname = {c["team"]["id"]: c["team"]["displayName"] for c in comp["competitors"]}
    score = {home["team"]["id"]: 0, away["team"]["id"]: 0}
    placar = lambda: f'{tname[home["team"]["id"]]} {score[home["team"]["id"]]} x {score[away["team"]["id"]]} {tname[away["team"]["id"]]}'
    lines = []
    for i, k in enumerate(d.get("keyEvents", [])):
        typ = (k.get("type") or {}).get("type", "")
        clock = (k.get("clock") or {}).get("displayValue") or ""
        tid = (k.get("team") or {}).get("id")
        team = tname.get(tid, "")
        ps = [p["athlete"]["displayName"] for p in k.get("participants", [])]
        text, kind = None, typ
        if typ == "kickoff":
            text, kind = "Rola a bola! Começa a partida.", "status"
        elif typ == "halftime":
            text, kind = f"Fim do primeiro tempo. {placar()}.", "status"
        elif typ == "start-2nd-half":
            text, kind = "Bola rolando para o segundo tempo.", "status"
        elif typ in ("end-regular-time", "full-time", "end-of-game"):
            text, kind = f"Fim de jogo! {placar()}.", "status"
        elif k.get("scoringPlay") and tid in score:
            score[tid] += 1
            if typ == "own-goal":
                text = f"GOL do {team}! {ps[0] if ps else 'O adversário'} manda contra o próprio gol. {placar()}."
            elif "penalty" in typ:
                text = f"GOL do {team}! {ps[0] if ps else ''} cobra o pênalti e marca. {placar()}."
            else:
                how = " de cabeça" if "header" in typ else ""
                ast = f", com assistência de {ps[1]}" if len(ps) > 1 else ""
                text = f"GOL do {team}! {ps[0] if ps else ''} marca{how}{ast}. {placar()}."
            kind = "goal"
        elif typ == "yellow-card":
            text = f"Cartão amarelo para {ps[0] if ps else 'jogador'} ({team})."
        elif typ in ("red-card", "second-yellow-card"):
            text, kind = f"Expulso! {ps[0] if ps else 'Jogador'} ({team}) recebe o vermelho e deixa o {team} com um a menos.", "red-card"
        elif typ == "substitution" and len(ps) >= 2:
            text = f"Substituição no {team}: entra {ps[0]}, sai {ps[1]}."
        elif typ in ("start-delay",):
            text, kind = "Jogo paralisado.", "status"
        elif typ in ("end-delay",):
            text, kind = "Partida reiniciada.", "status"
        elif typ == "penalty---missed" or typ == "penalty-missed":
            text = f"Perdeu! {ps[0] if ps else 'O batedor'} ({team}) desperdiça o pênalti."
        if text:
            lines.append({"id": f"{eid}-{i}", "min": clock, "type": kind, "text": text})
    st = comp["status"]
    stats = {}
    for t in (d.get("boxscore") or {}).get("teams", []):
        stats[t["team"]["id"]] = {s["name"]: s.get("displayValue") for s in t.get("statistics", [])}
    if st["type"]["state"] == "in" and stats:
        h, a = stats.get(home["team"]["id"], {}), stats.get(away["team"]["id"], {})
        lines.append({"id": f"{eid}-panorama-{st.get('displayClock')}", "min": st.get("displayClock", ""), "type": "panorama",
                      "text": f"Panorama: posse {h.get('possessionPct', '–')}% x {a.get('possessionPct', '–')}%, finalizações {h.get('totalShots', '–')} x {a.get('totalShots', '–')}."})
    return {"event": eid, "state": st["type"]["state"], "clock": st.get("displayClock"), "detail": st["type"].get("shortDetail"),
            "home": {"id": name(home), "name": home["team"]["displayName"], "score": int(home.get("score") or 0)},
            "away": {"id": name(away), "name": away["team"]["displayName"], "score": int(away.get("score") or 0)},
            "stats": {"home": stats.get(home["team"]["id"], {}), "away": stats.get(away["team"]["id"], {})},
            "lines": lines, "source": "Lances: ESPN · narração: PLACAR"}


# ---------------------------------------------------------------------------
# Servidor
# ---------------------------------------------------------------------------
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            log(fmt % args)

    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        parts = [p for p in u.path.split("/") if p]
        if not parts or parts[0] != "api":
            return super().do_GET()
        try:
            if parts[1:] == ["health"]:
                with lock:
                    return self.send_json({"ok": True, "updated": state["updated"], "errors": state["errors"]})
            if parts[1:] == ["state"]:
                with lock:
                    s = {k: state[k] for k in ("updated", "standings", "round", "fixtures", "squads", "last", "scorers", "players") if k in state}
                if not s.get("standings"):
                    return self.send_json({"ok": False, "message": "carregando dados"}, 503)
                return self.send_json(s)
            if parts[1:] == ["rankings"]:
                tipo = (q.get("tipo") or [None])[0]
                if tipo and tipo not in RANK_ORDER:
                    return self.send_json({"ok": False, "message": f"tipo deve ser um de: {', '.join(RANK_ORDER)}"}, 400)
                r = rankings(tipo)
                return self.send_json(r) if r["rankings"] and r["updated"] else self.send_json({"ok": False, "message": "carregando dados"}, 503)
            if parts[1:] == ["jogadores"]:
                with lock:
                    pl = state.get("players")
                if not pl:
                    return self.send_json({"ok": False, "message": "carregando dados"}, 503)
                club = (q.get("club") or [None])[0]
                if club:
                    return self.send_json({"updated": pl["updated"], "club": club, **pl["clubs"].get(club, {})})
                return self.send_json(pl)
            if parts[1:] == ["news"]:
                with lock:
                    club = (q.get("club") or [None])[0]
                    return self.send_json({"club": club, "items": state["news"].get(club, []) if club else state["news"]})
            if len(parts) >= 3 and parts[1] == "minuto-a-minuto":
                eid = re.sub(r"\D", "", parts[2])
                if len(parts) == 4 and parts[3] == "stream":
                    return self.stream(eid)
                n = narrate(eid)
                return self.send_json(n) if n else self.send_json({"ok": False, "message": "jogo não encontrado"}, 404)
            self.send_json({"ok": False, "message": "rota não encontrada"}, 404)
        except Exception as ex:
            self.send_json({"ok": False, "message": str(ex)}, 500)

    def stream(self, eid):
        """Server-Sent Events: manda cada lance novo assim que aparece."""
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        sent = set()
        try:
            while True:
                n = narrate(eid)
                if n:
                    new = [l for l in n["lines"] if l["id"] not in sent and l["type"] != "panorama"]
                    pan = [l for l in n["lines"] if l["type"] == "panorama" and l["id"] not in sent]
                    for l in new + pan[-1:]:
                        sent.add(l["id"])
                    payload = {k: n[k] for k in ("state", "clock", "detail", "home", "away", "stats")}
                    payload["lines"] = new + pan[-1:]
                    self.wfile.write(f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8"))
                    self.wfile.flush()
                    if n["state"] == "post":
                        break
                time.sleep(20)
        except (BrokenPipeError, ConnectionResetError):
            pass


def main():
    port = int(os.environ.get("PORT", next((a for a in sys.argv[1:] if a.isdigit()), 8000)))
    if os.path.exists(CACHE_FILE):  # começa com o que já tinha sido baixado
        try:
            state.update(json.load(open(CACHE_FILE, encoding="utf-8")))
            log("cache carregado de", state.get("updated"))
        except Exception:
            pass
    iv = CONFIG["intervalos_minutos"]
    every(iv["tabela_e_jogos"], update_standings_and_fixtures)
    every(iv["elencos"], update_squads)
    every(iv["noticias"], update_news)
    every(iv.get("jogadores", 60), update_players)
    log(f"PLACAR no ar: http://localhost:{port}")
    ThreadingHTTPServer(("", port), Handler).serve_forever()


if __name__ == "__main__":
    if "--snapshot" in sys.argv:
        write_snapshot()
    else:
        main()
