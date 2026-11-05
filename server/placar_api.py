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
  GET /api/retrospecto     [?club=id]     últimos 5 e próximos 5 jogos de cada clube, em todas as competições
  GET /api/jogadores       [?club=id]     pendurados, sequência de jogos, lesionados e minutagem dos reservas

Gera também o arquivo do site sem a API (GitHub Pages):  python server/placar_api.py --snapshot
  GET /api/news            [?club=id]     manchetes (título, fonte, data e link)
  GET /api/minuto-a-minuto/<id_espn>      narração completa do jogo até agora
  GET /api/minuto-a-minuto/<id_espn>/stream   o mesmo, ao vivo (Server-Sent Events)

Notícias: só título, fonte, data e link — o texto das matérias fica no site de origem.
"""
import calendar
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
COMP_NAME = {"bra.1": "Brasileirão", "bra.copa_do_brazil": "Copa do Brasil", "conmebol.libertadores": "Libertadores", "conmebol.sudamericana": "Sul-Americana",
             "conmebol.recopa": "Recopa", "bra.supercopa_do_brazil": "Supercopa", "bra.camp.carioca": "Carioca", "bra.camp.paulista": "Paulistão",
             "bra.camp.mineiro": "Mineiro", "bra.camp.gaucho": "Gauchão"}
# histórico da temporada: também estaduais e supercopas (a ESPN não cobre Paranaense, Baiano, Catarinense nem Paraense)
FORM_LEAGUES = list(COMP_NAME)

lock = threading.Lock()
state = {"updated": None, "standings": None, "round": None, "fixtures": None, "squads": None, "last": None, "news": {}, "players": None, "errors": []}


# situações do jogo em que o relógio da ESPN fica parado (ex.: "45'+7'" durante o intervalo)
STATUS_PT = {"STATUS_HALFTIME": "Intervalo", "STATUS_END_OF_REGULATION": "Fim do tempo normal", "STATUS_OVERTIME": "Prorrogação",
             "STATUS_HALFTIME_ET": "Intervalo da prorrogação", "STATUS_END_OF_EXTRATIME": "Fim da prorrogação", "STATUS_SHOOTOUT": "Pênaltis",
             "STATUS_DELAYED": "Paralisado", "STATUS_SUSPENDED": "Suspenso", "STATUS_ABANDONED": "Abandonado", "STATUS_POSTPONED": "Adiado"}


def clock_label(status):
    """Texto do relógio para o site: a situação do jogo quando ele está parado, senão o minuto."""
    return STATUS_PT.get(((status or {}).get("type") or {}).get("name")) or (status or {}).get("displayClock")


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
                    if st["state"] == "pre":  # a CBF pode marcar ou mudar o horário: acompanha o que a ESPN publica
                        t = time.gmtime(calendar.timegm(time.strptime(ev["date"][:16], "%Y-%m-%dT%H:%M")) - 3 * 3600)
                        g[4], g[5] = time.strftime("%Y-%m-%d", t), time.strftime("%H:%M", t) if comp.get("timeValid", True) else None
                    if st["state"] in ("in", "post"):
                        g[2], g[3] = int(teams[g[0]]["score"]), int(teams[g[1]]["score"])
                    g[8] = {"state": st["state"], "clock": clock_label(comp["status"]), "detail": st.get("shortDetail"), "gols": goals_of(comp)}
                    if st["state"] == "in":  # ainda em andamento: placar parcial, não final
                        g[8]["live"] = True
    add_new_cards(table, old, fixtures)
    try:
        add_upcoming_rounds(fixtures)
    except Exception as ex:  # sem as próximas rodadas, o resto continua
        log("próximas rodadas", ex)
    rnd = current_round(fixtures)
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


ESPN_WEB = "https://site.web.api.espn.com/apis"
LAST_ROUND = 38


def finished(g):
    return (len(g) > 8 and isinstance(g[8], dict) and g[8].get("state") == "post") or (g[2] is not None and not (len(g) > 8 and isinstance(g[8], dict) and g[8].get("state") == "in"))


def current_round(fixtures):
    """Rodada em andamento: a primeira que ainda tem jogo por terminar (ou a última, se todas acabaram)."""
    rounds = sorted(int(k) for k in fixtures)
    for r in rounds:
        if any(not finished(g) for g in fixtures[str(r)] if not (len(g) > 9 and g[9] == "adiado")):
            return r
    return rounds[-1]


def group_rounds(games, first):
    """Agrupa jogos futuros em rodadas pela data (a ESPN não informa o número da rodada).
    Uma rodada nova começa depois de mais de 3 dias sem jogo ou quando um time voltaria a jogar na mesma rodada.
    Blocos pequenos (jogos antecipados ou adiados) entram na rodada seguinte; se o time já joga nela, o jogo é marcado como adiado."""
    blocks, cur = [], None
    for g in sorted(games, key=lambda g: (g["date"], g["time"] or "")):
        day = time.strptime(g["date"], "%Y-%m-%d")
        if cur is None or (calendar.timegm(day) - calendar.timegm(cur["last"])) > 3 * 86400 or ({g["home"], g["away"]} & cur["teams"] and day != cur["last"]):
            cur = {"games": [], "teams": set(), "last": day}
            blocks.append(cur)
        cur["games"].append(g)
        cur["teams"] |= {g["home"], g["away"]}
        cur["last"] = day
    out = []
    for i, b in enumerate(blocks):
        if len(b["games"]) < 5 and i + 1 < len(blocks):
            nxt = {t for x in blocks[i + 1]["games"] for t in (x["home"], x["away"])}
            for g in b["games"]:
                g["adiado"] = bool({g["home"], g["away"]} & nxt)
            blocks[i + 1]["games"] = b["games"] + blocks[i + 1]["games"]
            continue
        out.append(b["games"])
    return {first + i: gs for i, gs in enumerate(out) if first + i <= LAST_ROUND}


def add_upcoming_rounds(fixtures):
    """Busca no calendário da ESPN os jogos que ainda não estão na tabela de jogos e monta as próximas rodadas."""
    known = {(g[0], g[1]) for gs in fixtures.values() for g in gs}
    last = max(int(k) for k in fixtures)
    if last >= LAST_ROUND:
        return
    cal = get_json(f"{ESPN_WEB}/site/v2/sports/soccer/bra.1/scoreboard")["leagues"][0].get("calendar", [])
    today = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 3 * 3600))
    new = []
    for day in sorted({c[:10] for c in cal if c[:10] >= today}):
        for ev in get_json(f"{ESPN_WEB}/site/v2/sports/soccer/bra.1/scoreboard?dates={day.replace('-', '')}").get("events", []):
            comp = ev["competitions"][0]
            side = {c.get("homeAway"): c for c in comp["competitors"]}
            h, a = BY_ESPN.get(side["home"]["team"]["id"]), BY_ESPN.get(side["away"]["team"]["id"])
            if not h or not a or (h, a) in known:
                continue
            # horário de Brasília (UTC-3)
            t = time.gmtime(calendar.timegm(time.strptime(ev["date"][:16], "%Y-%m-%dT%H:%M")) - 3 * 3600)
            st = comp["status"]["type"]["state"]
            new.append({"home": h, "away": a, "date": time.strftime("%Y-%m-%d", t), "time": time.strftime("%H:%M", t) if comp.get("timeValid", True) or st != "pre" else None,
                        "venue": (comp.get("venue") or {}).get("fullName"), "espn": ev["id"],
                        "hs": int(side["home"]["score"]) if st in ("in", "post") else None, "as": int(side["away"]["score"]) if st in ("in", "post") else None,
                        "live": {"state": st, "clock": clock_label(comp["status"]), "detail": comp["status"]["type"].get("shortDetail"), "live": st == "in"}})
            known.add((h, a))
    for rd, gs in group_rounds(new, last + 1).items():
        fixtures[str(rd)] = [[g["home"], g["away"], g["hs"], g["as"], g["date"], g["time"], g["venue"], g["espn"], g["live"]] + (["adiado"] if g.get("adiado") else []) for g in gs]
    if new:
        log("próximas rodadas:", ", ".join(f"{k}ª" for k in sorted(fixtures, key=int) if int(k) > last))


# ---------------------------------------------------------------------------
# Retrospecto: últimos 5 jogos e próximos 5 de cada clube, em todas as competições
# ---------------------------------------------------------------------------
STAGE_PT = {"Semifinals": "Semifinal", "Final": "Final", "Finals": "Final", "Quarterfinals": "Quartas de final", "Round of 16": "Oitavas de final",
            "Group Stage": "Fase de grupos", "Knockout Round Playoffs": "Playoffs", "Third Round": "3ª fase", "Fifth Round": "5ª fase", "Fourth Round": "4ª fase"}


def score_of(c):
    s = c.get("score")
    if isinstance(s, dict):
        return (int(s.get("value") or 0), s.get("shootoutScore"))
    return (int(s) if s not in (None, "") else None, None)


def form_event(ev, espn_id, lg):
    comp = ev["competitions"][0]
    me = [c for c in comp["competitors"] if c["team"]["id"] == espn_id][0]
    op = [c for c in comp["competitors"] if c["team"]["id"] != espn_id][0]
    st = comp["status"]["type"]
    t = time.gmtime(calendar.timegm(time.strptime(ev["date"][:16], "%Y-%m-%dT%H:%M")) - 3 * 3600)
    out = {"id": ev["id"], "date": time.strftime("%Y-%m-%d", t), "time": time.strftime("%H:%M", t), "comp": COMP_NAME[lg],
           "stage": STAGE_PT.get((ev.get("seasonType") or {}).get("name"), "") if lg != "bra.1" else "",
           "home": me.get("homeAway") == "home", "opp": op["team"].get("displayName"), "oppId": BY_ESPN.get(op["team"]["id"]),
           "oppLogo": ((op["team"].get("logos") or [{}])[0]).get("href"), "state": st.get("state"), "venue": (comp.get("venue") or {}).get("fullName")}
    if st.get("state") == "pre" and comp.get("timeValid") is False:
        out["time"] = None  # horário ainda não definido pela CBF/Conmebol: o site mostra "A definir"
    if st.get("state") == "in":
        out.update(gf=score_of(me)[0], ga=score_of(op)[0], clock=clock_label(comp["status"]))
    if st.get("state") == "post":
        (gf, pf), (ga, pa) = score_of(me), score_of(op)
        out.update(gf=gf, ga=ga, res="V" if gf > ga else "D" if gf < ga else "E")
        if pf is not None and pa is not None:
            out["pen"] = [int(pf), int(pa)]
    return out


def club_form(cid):
    espn = CLUBS[cid]["espn"]
    past, nxt = [], []
    for lg in FORM_LEAGUES:
        for fx in ("", "&fixture=true"):
            try:
                d = get_json(f"{ESPN_WEB}/site/v2/sports/soccer/{lg}/teams/{espn}/schedule?season={time.strftime('%Y')}{fx}")
            except Exception:
                continue
            for ev in d.get("events", []):
                try:
                    e = form_event(ev, espn, lg)
                except Exception:
                    continue
                (past if e["state"] == "post" else nxt).append(e)
    dedup = lambda xs: list({x["id"]: x for x in xs}.values())
    key = lambda x: x["date"] + (x["time"] or "99:99")
    past, nxt = sorted(dedup(past), key=key), sorted(dedup(nxt), key=key)
    # "all": a temporada inteira (resultados e jogos por vir), usada na aba Partidas
    return {"last": past[-5:][::-1], "next": nxt[:5], "all": past + nxt}


def update_form():
    out = {}
    for cid in CLUBS:
        try:
            out[cid] = club_form(cid)
        except Exception as ex:
            log("retrospecto", cid, ex)
    with lock:
        state["form"] = {"updated": time.strftime("%d/%m/%Y às %H:%M"), "clubs": out}
    log("retrospecto atualizado")


def kickoff(g):
    """Horário do apito em segundos (o horário da tabela é de Brasília, UTC-3)."""
    try:
        return calendar.timegm(time.strptime(f"{g[4]} {g[5]}", "%Y-%m-%d %H:%M")) + 3 * 3600
    except Exception:
        return None


def goals_of(comp):
    """Gols do jogo pelo placar da ESPN: [id do jogador, nome, clube, gol contra, pênalti]."""
    out = []
    for d in comp.get("details") or []:
        if not d.get("scoringPlay"):
            continue
        ath = (d.get("athletesInvolved") or [{}])[0]
        out.append([ath.get("id"), ath.get("displayName"), BY_ESPN.get((d.get("team") or {}).get("id")), bool(d.get("ownGoal")), bool(d.get("penaltyKick"))])
    return out


j_before = {}  # jogos da tabela de cada clube antes de cada jogo (id ESPN -> {clube: J})


def live_table():
    """Classificação em tempo real: a tabela da ESPN só conta jogos encerrados (e com atraso);
    soma o placar dos jogos em andamento e dos encerrados que ela ainda não contou."""
    with lock:
        table = [list(r) for r in state["standings"] or []]
        games = [g for gs in (state["fixtures"] or {}).values() for g in gs]
    by = {r[0]: r for r in table}
    pos0 = {r[0]: i + 1 for i, r in enumerate(table)}
    vivo = {}
    for g in games:
        st = g[8].get("state") if len(g) > 8 and isinstance(g[8], dict) else None
        base = j_before.get(g[7] if len(g) > 7 else None)
        if st not in ("in", "post") or g[2] is None or not base:
            continue
        for me, op, gf, ga in ((g[0], g[1], g[2], g[3]), (g[1], g[0], g[3], g[2])):
            r = by.get(me)
            if not r or base.get(me) is None or r[2] > base[me]:
                continue  # a ESPN já contou este jogo
            r[1] += 3 if gf > ga else 1 if gf == ga else 0
            r[2] += 1; r[3] += gf > ga; r[4] += gf == ga; r[5] += gf < ga; r[6] += gf; r[7] += ga
            vivo[me] = {"placar": [gf, ga], "contra": op, "relogio": g[8].get("clock"), "encerrado": st == "post"}
    if vivo:
        table.sort(key=lambda r: (-r[1], -r[3], -(r[6] - r[7]), -r[6]))
    return {"updated": time.strftime("%d/%m/%Y às %H:%M:%S"),
            "standings": table, "aoVivo": vivo, "variacao": {r[0]: pos0[r[0]] - (i + 1) for i, r in enumerate(table)}}


def live_scorers():
    """Artilharia em tempo real: gols das súmulas gravadas + gols dos jogos em andamento (ou encerrados e
    ainda fora das súmulas), com contra quem e por qual clube cada jogador marcou. Gol contra não conta."""
    with lock:
        pl = state.get("players") or {}
        games = [g for gs in (state["fixtures"] or {}).values() for g in gs]
    contados, base = set(pl.get("sumulas") or []), {}
    for cid, rows in (pl.get("golsClubes") or {}).items():
        for aid, name, g in rows:
            base.setdefault(aid, {"id": aid, "name": name, "club": cid, "gols": 0, "aoVivo": 0, "clubes": {}, "adversarios": {}})
            base[aid]["gols"] += g
            base[aid]["clubes"][cid] = base[aid]["clubes"].get(cid, 0) + g
    fichas = {f["id"]: f for f in pl.get("artilheiros") or [] if f.get("id")}
    for rows in (pl.get("artilhariaClubes") or {}).values():
        for f in rows:
            fichas.setdefault(f["id"], f)
    for aid, f in fichas.items():
        if aid in base:
            base[aid]["adversarios"] = dict(f.get("adversarios") or [])
    for g in games:
        st = g[8].get("state") if len(g) > 8 and isinstance(g[8], dict) else None
        if st not in ("in", "post") or (len(g) > 7 and g[7] in contados):
            continue
        for aid, name, cid, og, _pen in g[8].get("gols") or []:
            if og or not cid:
                continue
            key = aid or name
            q = base.setdefault(key, {"id": aid, "name": name, "club": cid, "gols": 0, "aoVivo": 0, "clubes": {}, "adversarios": {}})
            op = g[1] if cid == g[0] else g[0]
            q["gols"] += 1; q["aoVivo"] += 1
            q["clubes"][cid] = q["clubes"].get(cid, 0) + 1
            q["adversarios"][op] = q["adversarios"].get(op, 0) + 1
            q.setdefault("jogosAoVivo", {})[g[7] or f"{g[0]}|{g[1]}"] = st
    rows = sorted(base.values(), key=lambda q: -q["gols"])
    for q in rows:
        q["club"] = max(q["clubes"].items(), key=lambda x: x[1])[0] if q["clubes"] else q["club"]
        q["adversarios"] = sorted(([k, v] for k, v in q["adversarios"].items()), key=lambda x: -x[1])
        q["clubes"] = sorted(([k, v] for k, v in q["clubes"].items()), key=lambda x: -x[1])
    return {"updated": time.strftime("%d/%m/%Y às %H:%M:%S"), "artilharia": rows[:10],
            "aoVivo": [q for q in rows if q["aoVivo"]], "jogadores": {q["id"] or q["name"]: q for q in rows}}


def live_loop():
    """Placar ao vivo: a cada 30 s, enquanto houver jogo da rodada perto do horário ou em andamento.
    Quando um jogo termina, recalcula a tabela e as estatísticas dos jogadores (pendurados etc.)."""
    while True:
        try:
            with lock:
                fixtures, rnd = state["fixtures"], state["round"]
            # todas as rodadas: jogos adiados e antecipados também podem estar rolando
            games = [g for gs in (fixtures or {}).values() for g in gs]
            now = time.time()
            days = {g[4] for g in games if g[4] and g[5] and not (len(g) > 8 and isinstance(g[8], dict) and g[8].get("state") == "post")
                    and kickoff(g) and kickoff(g) - 900 < now < kickoff(g) + 3 * 3600}
            ended = False
            for day in days:
                sb = get_json(f"{ESPN}/site/v2/sports/soccer/bra.1/scoreboard?dates={day.replace('-', '')}")
                for ev in sb.get("events", []):
                    comp = ev["competitions"][0]
                    side = {c.get("homeAway"): c for c in comp["competitors"]}
                    h, a = BY_ESPN.get(side["home"]["team"]["id"]), BY_ESPN.get(side["away"]["team"]["id"])
                    with lock:
                        for g in games:
                            if g[0] == h and g[1] == a:
                                while len(g) < 9:
                                    g.append(None)
                                st = comp["status"]["type"]["state"]
                                was = g[8].get("state") if isinstance(g[8], dict) else None
                                g[7] = ev["id"]
                                if st in ("in", "post"):
                                    g[2], g[3] = int(side["home"]["score"]), int(side["away"]["score"])
                                g[8] = {"state": st, "clock": clock_label(comp["status"]), "detail": comp["status"]["type"].get("shortDetail"), "live": st == "in",
                                        "gols": goals_of(comp)}
                                ended |= st == "post" and was != "post"
                                if st != "post":  # jogo ainda não encerrado: a tabela de agora ainda não o conta
                                    j = {r[0]: r[2] for r in state["standings"] or []}
                                    j_before.setdefault(ev["id"], {h: j.get(h), a: j.get(a)})
            if ended:
                log("jogo encerrado: atualizando tabela e estatísticas dos jogadores")
                threading.Thread(target=lambda: (update_standings_and_fixtures(), update_players(), update_form(), persist()), daemon=True).start()
            time.sleep(30 if days else 60)
        except Exception as ex:
            log("placar ao vivo", ex)
            time.sleep(60)


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


MATCH_VERSION = 3  # 2: gols, assistências, finalizações e pênaltis · 3: posição em campo (formação, nº da posição e sigla da ESPN)


def match_extract(eid):
    """Resumo de um jogo encerrado: para cada time, quem jogou, quanto tempo, cartões, gols e finalizações.
    Linha: [id, nome, titular, minutos, amarelos, vermelhos, gols, assistências, finalizações, no alvo, gols de pênalti,
            posição: [formação, nº da posição (1–11), sigla da ESPN]] — quem entrou herda a posição de quem saiu"""
    d = get_json(f"{ESPN}/site/v2/sports/soccer/bra.1/summary?event={eid}")
    pens, subs = {}, []
    for k in d.get("keyEvents", []):
        if k.get("scoringPlay") and "penalty" in (k.get("type") or {}).get("type", "") and k.get("participants"):
            a = k["participants"][0]["athlete"].get("id")
            pens[a] = pens.get(a, 0) + 1
        # substituição na ESPN: primeiro quem entra, depois quem sai
        if (k.get("type") or {}).get("type") == "substitution" and len(k.get("participants") or []) >= 2:
            subs.append((k["participants"][0]["athlete"].get("id"), k["participants"][1]["athlete"].get("id")))
    out = {"v": MATCH_VERSION, "date": d["header"]["competitions"][0]["date"][:10], "teams": {}}
    for r in d.get("rosters", []):
        rows = []
        form = r.get("formation") or ""
        pos = {x["athlete"]["id"]: [form, int(x.get("formationPlace") or 0), (x.get("position") or {}).get("abbreviation") or ""]
               for x in r.get("roster", []) if x.get("starter")}
        for i_in, i_out in subs:  # em ordem: quem entra no lugar de um substituto herda a posição dele
            if i_out in pos and i_in not in pos:
                pos[i_in] = pos[i_out]
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
            aid = x["athlete"]["id"]
            rows.append([aid, x["athlete"]["displayName"], bool(x.get("starter")), max(0, (end or 90) - (start or 0)),
                         int(st.get("yellowCards", 0)), int(st.get("redCards", 0)), int(st.get("totalGoals", 0)), int(st.get("goalAssists", 0)),
                         int(st.get("totalShots", 0)), int(st.get("shotsOnTarget", 0)), pens.get(aid, 0), pos.get(aid)])
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
        if e["id"] not in matches or matches[e["id"]].get("v", 1) < MATCH_VERSION:
            try:
                matches[e["id"]] = match_extract(e["id"])
                time.sleep(0.25)
            except Exception as ex:
                log("súmula", e["id"], ex)
    games = [matches[e["id"]] for e in evs if e["id"] in matches]
    P = {}
    for gi, g in enumerate(games):
        for pid, nm, starter, mins, yc, rc, *_ in g["teams"].get(espn, []):
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


def strip_accents(x):
    import unicodedata
    return "".join(ch for ch in unicodedata.normalize("NFD", x or "") if unicodedata.category(ch) != "Mn")


def scorer_profiles(matches, scorers, squads):
    """Ficha de cada artilheiro do campeonato: dados do elenco e, pelas súmulas, jogos, minutos,
    assistências, finalizações, pênaltis e contra quais clubes (e por quais clubes) marcou."""
    club_of = {str(c["espn"]): cid for cid, c in CLUBS.items()}
    P = {}
    for m in sorted((m for m in matches.values() if m.get("v", 1) >= MATCH_VERSION), key=lambda m: m["date"]):
        tids = list(m["teams"])
        for tid, rows in m["teams"].items():
            me, opp = club_of.get(tid), next((club_of.get(t) for t in tids if t != tid), None)
            for pid, nm, starter, mins, yc, rc, g, a, sh, sot, pen, *_ in rows:
                q = P.setdefault(pid, {"name": nm, "jogos": 0, "titular": 0, "min": 0, "gols": 0, "assist": 0, "chutes": 0, "noAlvo": 0, "pen": 0,
                                       "amarelos": 0, "vermelhos": 0, "jogosComGol": 0, "ultimoGol": None, "adv": {}, "clubes": {}})
                q["jogos"] += 1; q["titular"] += starter; q["min"] += mins; q["gols"] += g; q["assist"] += a
                q["chutes"] += sh; q["noAlvo"] += sot; q["pen"] += pen; q["amarelos"] += yc; q["vermelhos"] += rc
                if me:
                    q["clubes"].setdefault(me, [0, 0])
                    q["clubes"][me][0] += 1; q["clubes"][me][1] += g
                if g:
                    q["jogosComGol"] += 1; q["ultimoGol"] = m["date"]
                    if opp:
                        q["adv"][opp] = q["adv"].get(opp, 0) + g
    squad = {row[4]: (cid, row) for cid, rows in squads.items() for row in rows if row[4]}

    def ficha(pid, name, cid, goals, pos):
        q = P[pid]
        sc, row = squad.get(pid, (None, None))
        return {"pos": pos, "id": pid, "name": name, "club": cid, "gols": goals, "golsSumulas": q["gols"],
                "golsClube": q["clubes"].get(cid, [0, 0])[1],
                "camisa": row[0] if row else None, "posicao": row[2] if row else None, "idade": row[3] if row else None,
                "jogos": q["jogos"], "titular": q["titular"], "min": q["min"], "assist": q["assist"], "chutes": q["chutes"], "noAlvo": q["noAlvo"],
                "pen": q["pen"], "amarelos": q["amarelos"], "vermelhos": q["vermelhos"], "jogosComGol": q["jogosComGol"], "ultimoGol": q["ultimoGol"],
                "adversarios": sorted(([k, v] for k, v in q["adv"].items()), key=lambda x: -x[1]),
                "clubes": sorted(([k, v[0], v[1]] for k, v in q["clubes"].items()), key=lambda x: (-x[2], -x[1]))}

    # A artilharia oficial usa o nome curto ("Calleri", "Rene", "Vinicius") e a súmula o nome da ESPN
    # ("Jonathan Calleri", "Renê", "Carlos Vinícius"): compara sem acento, por palavra inteira, e só entre
    # quem jogou pelo clube do artilheiro (há vários "Vinicius" no campeonato).
    def words(x):
        return re.sub(r"[^a-z ]", " ", strip_accents(x).lower()).split()

    def match(name, cid):
        w = words(name)
        pool = [(pid, q) for pid, q in P.items() if cid in q["clubes"]]
        for test in (lambda v: v == w, lambda v: " ".join(w) in " ".join(v) or " ".join(v) in " ".join(w), lambda v: set(w) & set(v)):
            hit = [(pid, q) for pid, q in pool if test(words(q["name"]))]
            if hit:
                return max(hit, key=lambda x: (x[1]["clubes"][cid][1], x[1]["min"]))[0]
        return None

    out, oficial = [], {}
    for pos, (name, cid, goals) in enumerate(scorers, 1):
        pid = match(name, cid)
        if not pid:
            out.append({"pos": pos, "name": name, "club": cid, "gols": goals})
            continue
        oficial[(pid, cid)] = (name, goals, pos)
        out.append(ficha(pid, name, cid, goals, pos))

    # Top 5 de cada clube pelos gols marcados com a camisa dele (súmulas); quem está na artilharia
    # oficial fica com o número oficial. Empate: menos minutos em campo vem antes.
    clubes = {}
    for cid in CLUBS:
        rows = []
        for pid, q in P.items():
            g = q["clubes"].get(cid, [0, 0])[1]
            name, goals, pos = oficial.get((pid, cid), (q["name"], g, None))
            if goals:
                rows.append((goals, -q["min"], pid, name, pos))
        rows.sort(reverse=True)
        clubes[cid] = [dict(ficha(pid, name, cid, goals, pos), rank=k) for k, (goals, _, pid, name, pos) in enumerate(rows[:5], 1)]
    # todos os que marcaram, por clube: [id ESPN, nome, gols pelo clube] (base da artilharia ao vivo do site)
    gols = {}
    for pid, q in P.items():
        for cid, (j, g) in q["clubes"].items():
            if g:
                name, goals, _ = oficial.get((pid, cid), (q["name"], g, None))
                gols.setdefault(cid, []).append([pid, name, goals, q["min"]])
    gols = {cid: [r[:3] for r in sorted(rows, key=lambda r: (-r[2], r[3]))] for cid, rows in gols.items()}
    sumulas = sorted(k for k, m in matches.items() if m.get("v", 1) >= MATCH_VERSION)
    return out, clubes, gols, sumulas


def position_profiles(matches):
    """Onde cada jogador atuou no Brasileirão: minutos em cada posição (formação + nº da posição + sigla da ESPN),
    jogos, minutos, gols e finalizações. É a base do mapa de calor estimado do "Bora pro jogo"."""
    P = {}
    for m in (m for m in matches.values() if m.get("v", 1) >= 3):
        for rows in m["teams"].values():
            for row in rows:
                pid, nm, starter, mins = row[:4]
                g, sh, where = row[6], row[8], (row[11] if len(row) > 11 else None)
                if not mins:
                    continue
                q = P.setdefault(pid, {"n": nm, "j": 0, "m": 0, "g": 0, "c": 0, "p": {}})
                q["j"] += 1; q["m"] += mins; q["g"] += g; q["c"] += sh
                if where:
                    key = f"{where[0]}|{where[1]}|{where[2]}"
                    q["p"][key] = q["p"].get(key, 0) + mins
    # posições ordenadas pelos minutos; corta o que tem menos de 3% do tempo (ruído)
    for q in P.values():
        tot = sum(q["p"].values()) or 1
        q["p"] = [[k, v] for k, v in sorted(q["p"].items(), key=lambda x: -x[1]) if v / tot >= 0.03]
    return P


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
        scorers = state.get("scorers") or []
    if not scorers:  # sem cache: usa a artilharia gravada no site
        try:
            src = open(LIVE_DATA_FILE, encoding="utf-8").read()
            scorers = json.loads(src[src.index("{"):src.rindex("}") + 1]).get("scorers") or []
        except Exception:
            scorers = []
    try:
        artilheiros, art_clubes, gols_clubes, sumulas = scorer_profiles(matches, scorers, squads)
    except Exception as ex:
        log("artilheiros", ex)
        artilheiros, art_clubes, gols_clubes, sumulas = [], {}, {}, []
    try:
        posicoes = position_profiles(matches)
    except Exception as ex:
        log("posições", ex)
        posicoes = {}
    with lock:
        state["players"] = {"updated": time.strftime("%d/%m/%Y às %H:%M"), "clubs": out, "artilheiros": artilheiros, "artilhariaClubes": art_clubes,
                            "golsClubes": gols_clubes, "sumulas": sumulas}
        state["positions"] = {"updated": time.strftime("%d/%m/%Y às %H:%M"), "players": posicoes}
    log("estatísticas de jogadores atualizadas")


LIVE_DATA_FILE = os.path.join(ROOT, "js", "live-data.js")


def write_js(name, var, data, comment):
    path = os.path.join(ROOT, "js", name)
    open(path, "w", encoding="utf-8").write(f"/* PLACAR — {comment} (gerado por: python server/placar_api.py --snapshot) */\n"
                                            f"window.{var} = " + json.dumps(data, ensure_ascii=False) + ";\n")
    log("gravado", path)


def write_snapshot():
    """Grava os dados que o site usa sem a API (GitHub Pages): tabela, jogos, notícias, estatísticas e histórico.
    Roda sozinho no GitHub Actions (.github/workflows/dados.yml) e pode ser rodado à mão."""
    # a última gravação é a base: mantém as rodadas já montadas e os placares conhecidos
    if os.path.exists(LIVE_DATA_FILE):
        try:
            src = open(LIVE_DATA_FILE, encoding="utf-8").read()
            old = json.loads(src[src.index("= ") + 2:].rstrip().rstrip(";"))
            state.update({k: old[k] for k in ("fixtures", "round") if old.get(k)})
        except Exception as ex:
            log("base anterior ignorada", ex)
    steps = [("tabela e jogos", update_standings_and_fixtures), ("notícias", update_news), ("jogadores", update_players), ("histórico", update_form)]
    for name, fn in steps:  # uma etapa que falhar não impede as outras
        try:
            fn()
        except Exception as ex:
            log("falha em", name, ex)
    with lock:
        live = {k: state.get(k) for k in ("updated", "standings", "round", "fixtures", "scorers")}
        live["news"] = {cid: [{k: x.get(k) for k in ("title", "link", "source", "ts", "tag")} for x in items[:8]] for cid, items in (state.get("news") or {}).items()}
        players, form, positions = state.get("players"), state.get("form"), state.get("positions")
    if live["standings"]:
        write_js("live-data.js", "LIVE_DATA", live, "tabela, jogos e manchetes (só título, fonte e link). Fontes: ESPN, CBF, Google Notícias")
    if players:
        write_js("player-stats.js", "PLAYER_STATS", players, "estatísticas de jogadores. Súmulas: ESPN · lesões: manchetes que citam o jogador")
    if form:
        write_js("club-form.js", "CLUB_FORM", form, "temporada de cada clube, últimos 5 e próximos 5 jogos. Fonte: ESPN")
    if positions and positions.get("players"):
        write_js("heatmaps.js", "HEATMAPS", positions, "posições de cada jogador no Brasileirão (minutos por posição), base do mapa de calor estimado. Fonte: escalações da ESPN")


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
    return {"event": eid, "state": st["type"]["state"], "clock": clock_label(st), "detail": st["type"].get("shortDetail"),
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
                    s = {k: state[k] for k in ("updated", "standings", "round", "fixtures", "squads", "last", "scorers", "players", "form") if k in state}
                if not s.get("standings"):
                    return self.send_json({"ok": False, "message": "carregando dados"}, 503)
                return self.send_json(s)
            if parts[1:] == ["artilharia-ao-vivo"]:
                r = live_scorers()
                jog = urllib.parse.parse_qs(u.query).get("jogador", [None])[0]
                return self.send_json(r["jogadores"].get(jog) or {"ok": False, "message": "jogador sem gols"} if jog else {k: r[k] for k in ("updated", "artilharia", "aoVivo")})
            if parts[1:] == ["tabela-ao-vivo"]:
                return self.send_json(live_table())
            if parts[1:] == ["rankings"]:
                tipo = (q.get("tipo") or [None])[0]
                if tipo and tipo not in RANK_ORDER:
                    return self.send_json({"ok": False, "message": f"tipo deve ser um de: {', '.join(RANK_ORDER)}"}, 400)
                r = rankings(tipo)
                return self.send_json(r) if r["rankings"] and r["updated"] else self.send_json({"ok": False, "message": "carregando dados"}, 503)
            if parts[1:] == ["retrospecto"]:
                with lock:
                    fm = state.get("form")
                if not fm:
                    return self.send_json({"ok": False, "message": "carregando dados"}, 503)
                club = (q.get("club") or [None])[0]
                return self.send_json({"updated": fm["updated"], "club": club, **fm["clubs"].get(club, {})} if club else fm)
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
    every(iv.get("retrospecto", 30), update_form)
    threading.Thread(target=live_loop, daemon=True).start()
    log(f"PLACAR no ar: http://localhost:{port}")
    ThreadingHTTPServer(("", port), Handler).serve_forever()


if __name__ == "__main__":
    if "--snapshot" in sys.argv:
        write_snapshot()
    else:
        main()
