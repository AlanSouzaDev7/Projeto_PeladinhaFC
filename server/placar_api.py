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
CONFIG = json.load(open(os.path.join(HERE, "config.json"), encoding="utf-8"))
CLUBS = CONFIG["clubes"]
BY_ESPN = {v["espn"]: k for k, v in CLUBS.items()}
ESPN = "https://site.api.espn.com/apis"
LEAGUES = ["bra.1", "bra.copa_do_brazil", "conmebol.libertadores", "conmebol.sudamericana"]
COMP_NAME = {"bra.1": "Brasileirão", "bra.copa_do_brazil": "Copa do Brasil", "conmebol.libertadores": "Libertadores", "conmebol.sudamericana": "Sul-Americana"}

lock = threading.Lock()
state = {"updated": None, "standings": None, "round": None, "fixtures": None, "squads": None, "last": None, "news": {}, "errors": []}


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
    rnd = max(int(k) for k in fixtures)
    with lock:
        state.update(standings=table, fixtures=fixtures, round=rnd, scorers=real["scorers"], updated=time.strftime("%d/%m/%Y às %H:%M"))
    log("tabela e jogos atualizados")


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
                    s = {k: state[k] for k in ("updated", "standings", "round", "fixtures", "squads", "last", "scorers") if k in state}
                if not s.get("standings"):
                    return self.send_json({"ok": False, "message": "carregando dados"}, 503)
                return self.send_json(s)
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
    port = int(os.environ.get("PORT", sys.argv[1] if len(sys.argv) > 1 else 8000))
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
    log(f"PLACAR no ar: http://localhost:{port}")
    ThreadingHTTPServer(("", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
