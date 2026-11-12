# © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE).
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
  GET /api/calendario      ?club=id [&mes=AAAA-MM]   calendário do clube: a temporada inteira (ou um mês), todas as competições
  GET /api/jogo            ?event=id_espn&lg=liga   estatísticas rápidas de um jogo (placar, gols, posse, finalizações...)
  GET /api/elenco-temporada ?club=id      jogadores do clube: temporada por competição, cada jogo, mapa de calor (lances) e foto
  GET /api/jogador/<id>[-<clube>]         um jogador (o mesmo formato, com o clube)
  GET /api/em-alta                        clubes e jogadores mais buscados nas últimas 24 h (só contagens, nada pessoal)
  GET /api/competicao/<id>                Libertadores, Sul-Americana, Copa do Brasil e estaduais: fases, jogos, grupos, chave, artilharia
  POST /api/busca          {"t":"c"|"j","id":...}   conta uma busca (a única rota que aceita escrita; corpo de até 200 bytes)
  GET /api/jogadores       [?club=id]     pendurados, sequência de jogos, lesionados e minutagem dos reservas

Gera também o arquivo do site sem a API (GitHub Pages):  python server/placar_api.py --snapshot
  GET /api/news            [?club=id]     manchetes (título, fonte, data e link)
  GET /api/manchetes                      principais notícias do futebol (faixa embaixo do menu), a cada 30 min
  GET /api/departamento-medico [?club=id]  quem está no DM (com fontes) e quem já passou na temporada
  GET /api/arbitragem                     árbitro dos próximos jogos pelas manchetes dos veículos, a cada 30 min
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
import traceback
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zlib
from collections import OrderedDict, deque
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
state = {"updated": None, "standings": None, "round": None, "fixtures": None, "squads": None, "last": None, "news": {}, "manchetes": None, "arbitragem": None, "dm": None, "players": None, "errors": []}


# situações do jogo em que o relógio da ESPN fica parado (ex.: "45'+7'" durante o intervalo)
STATUS_PT = {"STATUS_HALFTIME": "Intervalo", "STATUS_END_OF_REGULATION": "Fim do tempo normal", "STATUS_OVERTIME": "Prorrogação",
             "STATUS_HALFTIME_ET": "Intervalo da prorrogação", "STATUS_END_OF_EXTRATIME": "Fim da prorrogação", "STATUS_SHOOTOUT": "Pênaltis",
             "STATUS_DELAYED": "Paralisado", "STATUS_SUSPENDED": "Suspenso", "STATUS_ABANDONED": "Abandonado", "STATUS_POSTPONED": "Adiado"}


def clock_label(status):
    """Texto do relógio para o site: a situação do jogo quando ele está parado, senão o minuto."""
    return STATUS_PT.get(((status or {}).get("type") or {}).get("name")) or (status or {}).get("displayClock")


def log(*a):
    print(time.strftime("[%H:%M:%S]"), *a, flush=True)


MAX_BYTES = 15 * 1024 * 1024   # nenhuma resposta de fonte de dados passa disso


def get(url, timeout=20, headers=None):
    if not str(url).startswith("https://"):
        raise ValueError("só endereços https")
    req = urllib.request.Request(url, headers={"User-Agent": "Placar/1.0", "Accept-Encoding": "gzip", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        if not r.geturl().startswith("https://"):
            raise ValueError("redirecionado para endereço sem https")
        data = r.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError("resposta grande demais")
        if r.headers.get("Content-Encoding") == "gzip":
            z = zlib.decompressobj(16 + zlib.MAX_WBITS)
            data = z.decompress(data, MAX_BYTES * 4)
            if z.unconsumed_tail:
                raise ValueError("resposta compactada grande demais")
        return data


# ---------------------------------------------------------------------------
# Limpeza do que vem de fora (manchetes, nomes, links): nada vira código no site
# ---------------------------------------------------------------------------
CONTROL = re.compile("[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]")


def clean_text(t, limit=600):
    t = CONTROL.sub("", str(t or ""))[:limit]
    return t.replace("<", "‹").replace(">", "›").strip()


def clean_link(u):
    u = CONTROL.sub("", str(u or "")).strip()
    try:
        x = urllib.parse.urlsplit(u)
    except ValueError:
        return None
    if x.scheme != "https" or not x.netloc or "@" in x.netloc or any(c in u for c in '"<>`\\ '):
        return None
    return u[:2000]


def clean_deep(d, depth=0):
    """Antes de gravar os arquivos de dados do site: tira marcação e caracteres de controle de todo texto."""
    if isinstance(d, str):
        return CONTROL.sub("", d).replace("<", "‹").replace(">", "›")
    if depth > 40:
        return d
    if isinstance(d, list):
        return [clean_deep(x, depth + 1) for x in d]
    if isinstance(d, dict):
        return {clean_deep(k, depth + 1) if isinstance(k, str) else k: clean_deep(v, depth + 1) for k, v in d.items() if k not in ("__proto__", "constructor", "prototype")}
    return d


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
VELHO_JOGO = 135 * 60   # um jogo dura ~2 h com intervalo e acréscimos


def jogos_parados(fixtures, agora=None):
    """Jogos que deveriam ter terminado (começaram há mais de 2h15, até 4 dias atrás) e ainda estão 'ao vivo' ou sem placar."""
    agora = agora or time.time()
    out = []
    for games in fixtures.values():
        for g in games:
            if not (g[4] and g[5]):
                continue
            try:
                k = calendar.timegm(time.strptime(f"{g[4]} {g[5]}", "%Y-%m-%d %H:%M")) + 3 * 3600   # horário de Brasília
            except ValueError:
                continue
            st = (g[8] or {}).get("state") if len(g) > 8 and isinstance(g[8], dict) else None
            encerrado = st == "post" or (st is None and g[2] is not None)
            if not encerrado and k + VELHO_JOGO < agora < k + 4 * 86400:
                out.append(g)
    return out


def vigia_jogos(fixtures):
    """Vigia: jogo parado no tempo (a consulta do dia falhou ou veio incompleta) é consultado de novo, pelo outro endereço da ESPN."""
    lista = jogos_parados(fixtures)
    if not lista:
        return 0
    log("vigia:", len(lista), "jogo(s) parado(s) no tempo:", ", ".join(f"{g[0]} x {g[1]}" for g in lista))
    corrigidos = 0
    for day in sorted({g[4] for g in lista}):
        for host in ("https://site.web.api.espn.com/apis", ESPN):
            try:
                sb = get_json(f"{host}/site/v2/sports/soccer/bra.1/scoreboard?dates={day.replace('-', '')}")
                break
            except Exception as ex:
                log("vigia", day, host, ex)
                sb = None
        for g in [g for g in lista if g[4] == day]:
            for ev in (sb or {}).get("events", []):
                comp = ev["competitions"][0]
                teams = {BY_ESPN.get(c["team"]["id"]): c for c in comp["competitors"]}
                if g[0] in teams and g[1] in teams:
                    st = comp["status"]["type"]
                    while len(g) < 9:
                        g.append(None)
                    g[7] = ev["id"]
                    if st["state"] in ("in", "post"):
                        g[2], g[3] = int(teams[g[0]]["score"]), int(teams[g[1]]["score"])
                    g[8] = {"state": st["state"], "clock": clock_label(comp["status"]), "detail": st.get("shortDetail"), "gols": goals_of(comp)}
                    if st["state"] == "in":
                        g[8]["live"] = True
                    corrigidos += st["state"] == "post"
    log("vigia:", corrigidos, "corrigido(s)")
    return corrigidos


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
    vigia_jogos(fixtures)
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
    out = {"id": ev["id"], "lg": lg, "date": time.strftime("%Y-%m-%d", t), "time": time.strftime("%H:%M", t), "comp": COMP_NAME[lg],
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
    # torneios que a ESPN não cobre (estaduais do PR, BA, SC e PA, Copa do Nordeste, Copa Verde, Fifa): API-Football,
    # só com a chave API_FOOTBALL_KEY configurada (sem ela, o calendário fica com o que a ESPN tem)
    for e in af_extra(cid):
        (past if e["state"] == "post" else nxt).append(e)
    dedup = lambda xs: list({x["id"]: x for x in xs}.values())
    key = lambda x: x["date"] + (x["time"] or "99:99")
    past, nxt = sorted(dedup(past), key=key), sorted(dedup(nxt), key=key)
    # "all": a temporada inteira (resultados e jogos por vir), usada na aba Partidas
    return {"last": past[-5:][::-1], "next": nxt[:5], "all": past + nxt}


# ---------------------------------------------------------------------------
# Calendário: competições fora da ESPN pela API-Football (opcional, com chave)
# ---------------------------------------------------------------------------
AF_BASE = "https://v3.football.api-sports.io"
AF_CACHE = os.path.join(ROOT, "server", "cache", "api-football-times.json")
# nomes da API-Football -> nome no site; as competições que a ESPN já traz ficam de fora (não duplica)
AF_NOMES = {"paranaense - 1": "Paranaense", "paranaense": "Paranaense", "baiano - 1": "Baiano", "baiano": "Baiano",
            "catarinense - 1": "Catarinense", "catarinense": "Catarinense", "paraense": "Paraense", "paraense - 1": "Paraense",
            "copa do nordeste": "Copa do Nordeste", "copa verde": "Copa Verde", "fifa club world cup": "Mundial de Clubes",
            "fifa intercontinental cup": "Intercontinental", "copa paulista": "Copa Paulista"}
AF_ESPN = {"serie a", "copa do brasil", "conmebol libertadores", "conmebol sudamericana", "recopa sudamericana", "super cup",
           "carioca - 1", "paulista - a1", "mineiro - 1", "gaucho - 1", "gaúcho - 1"}
AF_ESTADO = {"PST": None, "CANC": None, "ABD": None, "AWD": "post", "WO": "post", "FT": "post", "AET": "post", "PEN": "post",
             "1H": "in", "HT": "in", "2H": "in", "ET": "in", "BT": "in", "P": "in", "LIVE": "in", "SUSP": "in", "INT": "in", "NS": "pre", "TBD": "pre"}
_af_times = None


def af_get(path):
    key = os.environ.get("API_FOOTBALL_KEY", "").strip()
    if not key:
        return None
    return json.loads(get(f"{AF_BASE}{path}", headers={"x-apisports-key": key}))


def af_time(cid):
    """Número do clube na API-Football (procurado uma vez pelo nome e guardado em server/cache)."""
    global _af_times
    if _af_times is None:
        try:
            _af_times = json.load(open(AF_CACHE, encoding="utf-8"))
        except Exception:
            _af_times = {}
    if cid in _af_times:
        return _af_times[cid]
    nome = CLUBS[cid].get("busca") or cid
    d = af_get("/teams?" + urllib.parse.urlencode({"search": nome.split(" ")[0] if len(nome) > 20 else nome, "country": "Brazil"}))
    alvo = norm_txt(nome)
    achado = None
    for r in (d or {}).get("response", []):
        t = r.get("team") or {}
        if t.get("national"):
            continue
        n = norm_txt(t.get("name") or "")
        if n == alvo or alvo.startswith(n) or n.startswith(alvo):
            achado = t.get("id"); break
    _af_times[cid] = achado
    try:
        os.makedirs(os.path.dirname(AF_CACHE), exist_ok=True)
        json.dump(_af_times, open(AF_CACHE, "w", encoding="utf-8"))
    except Exception:
        pass
    return achado


def norm_txt(x):
    return re.sub(r"[^a-z0-9 ]", " ", unicodedata.normalize("NFD", str(x)).encode("ascii", "ignore").decode().lower()).strip()


def af_evento(fx, tid):
    """Um jogo da API-Football no formato do calendário (None se for competição que a ESPN já traz ou jogo cancelado)."""
    lg = fx.get("league") or {}
    nome = (lg.get("name") or "").strip()
    chave = norm_txt(nome).replace("  ", " ")
    if chave in AF_ESPN or nome.lower() in AF_ESPN:
        return None
    comp = AF_NOMES.get(nome.lower()) or AF_NOMES.get(chave)
    if not comp:
        if (lg.get("country") or "") not in ("Brazil", "World"):
            return None
        comp = clean_text(nome)[:40]
    f, tm = fx.get("fixture") or {}, fx.get("teams") or {}
    st = AF_ESTADO.get(((f.get("status") or {}).get("short") or "NS"), "pre")
    if st is None:
        return None
    casa = (tm.get("home") or {}).get("id") == tid
    me, op = (tm.get("home"), tm.get("away")) if casa else (tm.get("away"), tm.get("home"))
    data = str(f.get("date") or "")
    if not re.match(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", data):
        return None
    out = {"id": f"af{int(f.get('id') or 0)}", "lg": None, "src": "API-Football", "date": data[:10], "time": data[11:16], "comp": comp,
           "stage": clean_text(str(lg.get("round") or "")).replace("Regular Season - ", "Rodada ")[:40], "home": casa,
           "opp": clean_text((op or {}).get("name") or "")[:40], "oppId": None, "oppLogo": None, "state": st,
           "venue": clean_text(((f.get("venue") or {}).get("name")) or "")[:60] or None}
    alvo = norm_txt(out["opp"])
    out["oppId"] = next((k for k, v in CLUBS.items() if norm_txt(v.get("busca") or "") == alvo or alvo in [norm_txt(a) for a in v.get("apelidos", [])]), None)
    if st == "pre" and (f.get("status") or {}).get("short") == "TBD":
        out["time"] = None
    g = fx.get("goals") or {}
    gf, ga = (g.get("home"), g.get("away")) if casa else (g.get("away"), g.get("home"))
    if st in ("in", "post") and gf is not None and ga is not None:
        out.update(gf=int(gf), ga=int(ga))
        if st == "post":
            out["res"] = "V" if gf > ga else "D" if gf < ga else "E"
            pen = (fx.get("score") or {}).get("penalty") or {}
            if pen.get("home") is not None and pen.get("away") is not None:
                out["pen"] = [int(pen["home"]), int(pen["away"])] if casa else [int(pen["away"]), int(pen["home"])]
    return out


def af_extra(cid):
    try:
        tid = af_time(cid) if os.environ.get("API_FOOTBALL_KEY", "").strip() else None
        if not tid:
            return []
        d = af_get(f"/fixtures?team={int(tid)}&season={time.strftime('%Y')}&timezone=America/Sao_Paulo")
        return [e for e in (af_evento(fx, tid) for fx in (d or {}).get("response", [])) if e]
    except Exception as ex:
        log("calendário (API-Football)", cid, ex)
        return []


# ---------------------------------------------------------------------------
# Estatísticas rápidas de um jogo (resumo da ESPN), guardadas por 1 min (ao vivo) ou 6 h (encerrado)
# ---------------------------------------------------------------------------
STATS_JOGO = [("possessionPct", "Posse de bola", "%"), ("totalShots", "Finalizações", ""), ("shotsOnTarget", "Finalizações no gol", ""),
              ("wonCorners", "Escanteios", ""), ("foulsCommitted", "Faltas", ""), ("offsides", "Impedimentos", ""), ("saves", "Defesas do goleiro", ""),
              ("passPct", "Passes certos", "%"), ("yellowCards", "Cartões amarelos", ""), ("redCards", "Cartões vermelhos", "")]
GOL_TIPOS = {"goal", "penalty---scored", "own-goal", "goal---header", "goal---free-kick", "goal---volley"}
_jogos_cache = {}


def match_stats(eid, lg):
    hit = _jogos_cache.get((eid, lg))
    if hit and time.time() < hit[0]:
        return hit[1]
    d = get_json(f"{ESPN_WEB}/site/v2/sports/soccer/{lg}/summary?event={eid}")
    comp = ((d.get("header") or {}).get("competitions") or [{}])[0]
    lados = {c.get("homeAway"): c for c in comp.get("competitors", [])}
    cid_de = lambda c: BY_ESPN.get(((c or {}).get("team") or {}).get("id"))
    st = (comp.get("status") or {}).get("type") or {}
    times = {}
    for t in (d.get("boxscore") or {}).get("teams", []):
        side = "home" if ((t.get("team") or {}).get("id") == ((lados.get("home") or {}).get("team") or {}).get("id")) else "away"
        times[side] = {x.get("name"): x.get("displayValue") for x in t.get("statistics", [])}
    def num(v, unid):
        try:
            f = float(v)
        except (TypeError, ValueError):
            return None
        if unid == "%" and f <= 1:
            f *= 100
        return round(f) if unid == "%" else int(f)
    stats = []
    for k, rot, unid in STATS_JOGO:
        h, a = num((times.get("home") or {}).get(k), unid), num((times.get("away") or {}).get(k), unid)
        if h is not None and a is not None:
            stats.append([rot, h, a, unid])
    ida = {((lados.get(x) or {}).get("team") or {}).get("id"): x for x in ("home", "away")}
    gols, vermelhos = [], []
    for k in d.get("keyEvents", []):
        tipo = (k.get("type") or {}).get("type") or ""
        quem = ((k.get("athletesInvolved") or k.get("participants") or [{}])[0])
        nome = clean_text((quem.get("athlete") or quem).get("displayName") or "")[:40]
        lado = ida.get((k.get("team") or {}).get("id"))
        minuto = clean_text((k.get("clock") or {}).get("displayValue") or "")[:10]
        if tipo in GOL_TIPOS or (k.get("scoringPlay") and "goal" in tipo):
            gols.append({"min": minuto, "nome": nome, "lado": lado, "pen": "penalty" in tipo, "contra": tipo == "own-goal"})
        elif tipo == "red-card":
            vermelhos.append({"min": minuto, "nome": nome, "lado": lado})
    info = d.get("gameInfo") or {}
    ven = info.get("venue") or {}
    out = {"event": eid, "lg": lg, "comp": COMP_NAME.get(lg), "state": st.get("state"), "clock": clock_label(comp.get("status") or {}) if st.get("state") == "in" else None,
           "home": {"club": cid_de(lados.get("home")), "nome": clean_text((((lados.get("home") or {}).get("team")) or {}).get("displayName") or ""), "gols": score_of(lados.get("home") or {})[0]},
           "away": {"club": cid_de(lados.get("away")), "nome": clean_text((((lados.get("away") or {}).get("team")) or {}).get("displayName") or ""), "gols": score_of(lados.get("away") or {})[0]},
           "estadio": clean_text(ven.get("fullName") or "")[:80] or None, "cidade": clean_text(((ven.get("address") or {}).get("city")) or "")[:40] or None,
           "publico": info.get("attendance") or None, "arbitro": clean_text(((info.get("officials") or [{}])[0]).get("displayName") or "")[:60] or None,
           "stats": stats, "gols": gols, "vermelhos": vermelhos, "fonte": "ESPN"}
    _jogos_cache[(eid, lg)] = (time.time() + (60 if st.get("state") == "in" else 6 * 3600), out)
    if len(_jogos_cache) > 400:
        _jogos_cache.pop(next(iter(_jogos_cache)))
    return out


# ---------------------------------------------------------------------------
# Jogadores (server/jogadores.py): temporada, cada jogo, mapa de calor com os lances e fotos livres
# ---------------------------------------------------------------------------
import jogadores as JOG  # noqa: E402
import competicoes as COMP  # noqa: E402
JOG.P = sys.modules[__name__]
COMP.P = sys.modules[__name__]
import escudos as ESC  # noqa: E402
import mercado as MERC  # noqa: E402
import fontes_elenco as FE  # noqa: E402
import financas as FIN  # noqa: E402
import escalacoes as ESCL  # noqa: E402
MERC.P = FE.P = FIN.P = ESCL.P = sys.modules[__name__]
MERC.FE, MERC.FIN = FE, FIN
import wiki_series as WIKI  # noqa: E402
ESC.P = sys.modules[__name__]
WIKI.P = sys.modules[__name__]


def update_competicoes():
    d = COMP.atualizar()
    with lock:
        state["competicoes"] = d
    log("competições (Libertadores, Sul-Americana, Copa do Brasil, estaduais e Séries B, C e D) atualizadas")


def update_fontes_elenco():
    """A cada rodada do robô, mais algumas buscas no TheSportsDB (cadastro, posição e fotos privadas), até cobrir
    todos os elencos; com tudo coberto, só revalida quem passou do prazo (21 dias; 7 para quem não foi achado)."""
    with lock:
        mc = state.get("mercado") or {}
    if not mc:
        return
    FE.atualizar({cid: [(j["id"], j["nome"]) for j in d["elenco"]] + [(e["id"], e["nome"], e.get("clube"), e.get("clubeEspn")) for e in d["emprestados"]]
                  for cid, d in mc.items()}, max_buscas=int(os.environ.get("TSDB_POR_RODADA", "30")), fotos=(os.environ.get("FOTOS_PRIVADAS", "1") != "0" and os.environ.get("MODO_VENDA") != "1"))
    # as fotos achadas nesta rodada já entram no arquivo da janela (sem esperar o mercado ser relido no dia seguinte)
    if os.environ.get("FOTOS_PRIVADAS", "1") != "0" and os.environ.get("MODO_VENDA") != "1":
        fe = FE._ler()
        with lock:
            for d in mc.values():
                for j in d.get("elenco", []) + d.get("emprestados", []):
                    fp = FE.foto_privada(j["id"], fe)
                    j["fotoPrivada"] = fp["url"] if fp else None
                    j["fotoInfo"] = {k: v for k, v in fp.items() if k != "url" and v} if fp and fp["fonte"] != "TheSportsDB" else None


def update_escalacoes():
    """Escalação anunciada do próximo jogo (ESPN; X e Instagram oficiais com as chaves): a cada rodada, e a cada 5 min no
    servidor ao vivo (só consulta quem tem jogo em até 3 h ou rolando)."""
    d = ESCL.atualizar()
    with lock:
        state["escalacoes"] = d
    n = sum(1 for x in d.values() if x.get("confirmada"))
    if n:
        log(f"escalações anunciadas: {n} clubes")


def update_mercado():
    """Janela de transferências: elenco e emprestados de cada clube (todo dia) e o mercado global (cache de 7 dias por time)."""
    with lock:
        ult = state.get("mercado_t", 0)
    mc = state.get("mercado") or {}
    # cache feito por uma versão anterior do código (sem o elenco conferido): relê já
    if time.time() - ult < 20 * 3600 and mc and all((d or {}).get("v", 1) >= MERC.VERSAO for d in mc.values()):
        return
    cl = MERC.atualizar_clubes()
    g = MERC.atualizar_global()
    for cid, d in cl.items():
        try:
            MERC.enriquecer(cid, d)
        except Exception as ex:
            log("mercado: enriquecer", cid, ex)
    with lock:
        state["mercado"] = cl
        state["mercado_global"] = MERC.global_compacto(g)
        state["mercado_t"] = time.time()
    log(f"mercado: {len(cl)} clubes e {len(state['mercado_global']['jogadores'])} jogadores no mercado global")


def squads_atuais():
    with lock:
        sq = state.get("squads")
    try:
        src = open(os.path.join(ROOT, "js", "squads.js"), encoding="utf-8").read()
        site = json.loads(src[src.index("window.SQUADS = ") + 16:src.index("window.SQUADS_LAST")].strip().rstrip(";"))
    except Exception:
        site = {}
    if not sq:
        return site
    # quem está no arquivo do site e sumiu da lista da ESPN continua (com o número de camisa)
    out = {cid: [list(r) for r in rows] for cid, rows in sq.items()}
    for cid, rows in site.items():
        ids = {str(r[4]) for r in out.get(cid, []) if r[4]}
        out.setdefault(cid, []).extend(list(r) for r in rows if r[4] and str(r[4]) not in ids)
    return out


# ---------------------------------------------------------------------------
# Elenco no site sem servidor (js/squads.js): o robô baixa da ESPN uma vez por hora
# (o robô roda a cada 30 min; o elenco só é baixado quando a última gravação tem mais de 55 min)
# ---------------------------------------------------------------------------
SQUADS_FILE = os.path.join(ROOT, "js", "squads.js")
ELENCO_MINUTOS = 55
ELENCO_MINIMO = 15  # lista da ESPN com menos jogadores que isso é falha da fonte: o clube fica com a lista anterior


def _ler_squads_js():
    try:
        src = open(SQUADS_FILE, encoding="utf-8").read()
        sq = json.loads(src[src.index("window.SQUADS = ") + 16:src.index("window.SQUADS_LAST")].strip().rstrip(";"))
        last = json.loads(src[src.index("window.SQUADS_LAST = ") + 21:src.index("window.SQUADS_META")].strip().rstrip(";"))
        meta = json.loads(src[src.index("window.SQUADS_META = ") + 21:].strip().rstrip(";"))
        return sq, last, meta
    except Exception:
        return {}, {}, {}


def update_squads_horario():
    """Baixa o elenco da ESPN se a gravação em js/squads.js tiver mais de 55 min (no robô de 30 em 30 min: 1 vez por hora)."""
    _, _, meta = _ler_squads_js()
    if time.time() - float(meta.get("quando") or 0) < ELENCO_MINUTOS * 60:
        log("elenco: gravado há menos de 1 hora, fica como está")
        return False
    update_squads()
    return True


def _compacto(sq):
    """Um clube por bloco e um jogador por linha: legível e sem espaço sobrando (o arquivo carrega em toda página)."""
    blocos = []
    for cid, rows in sq.items():
        linhas = ",".join("\n  " + json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows)
        blocos.append(f"\n{json.dumps(cid)}:[{linhas}]")
    return "{" + ",".join(blocos) + "\n}"


def gravar_elenco():
    """Grava js/squads.js com o elenco da ESPN + quem jogou pelo clube nos últimos 45 dias e sumiu da lista da ESPN
    (a ESPN às vezes tira da lista quem continua jogando, como no caso dos dois Matheus Pereira)."""
    with lock:
        novo, last, jg = state.get("squads"), state.get("last") or {}, state.get("jogadores") or {}
    if not novo:
        return False
    antigo, last_antigo, _ = _ler_squads_js()
    limite = time.strftime("%Y-%m-%d", time.localtime(time.time() - 45 * 86400))
    out = {}
    for cid in CLUBS:
        rows = [list(r) for r in novo.get(cid, [])]
        if len(rows) < ELENCO_MINIMO and antigo.get(cid):
            log("elenco:", cid, f"só {len(rows)} jogadores na ESPN; fica a lista anterior")
            rows = [list(r) for r in antigo[cid]]
        ids = {str(r[4]) for r in rows if r[4]}
        d = (jg.get(cid) or {}).get("jogadores") or {}
        recentes = {aid for aid, j in d.items() if any(str(x[1] or "") >= limite for x in j.get("jogos", []))}
        for r in antigo.get(cid, []):  # quem estava no arquivo e jogou há pouco pelo clube continua, com o número de camisa
            if r[4] and str(r[4]) not in ids and str(r[4]) in recentes:
                rows.append(list(r)); ids.add(str(r[4]))
        for aid in sorted(recentes - ids):  # jogou há pouco e não está em lista nenhuma
            j = d[aid]
            rows.append([j.get("num"), j.get("n"), j.get("pos") or "M", j.get("idade"), aid]); ids.add(aid)
        out[cid] = rows
    for cid in CLUBS:
        if cid not in last and cid in last_antigo:
            last[cid] = last_antigo[cid]
    agora = time.time()
    meta = {"source": "ESPN", "updated": time.strftime("%d/%m/%Y às %H:%M"), "quando": round(agora)}
    txt = ("/* ==========================================================================\n"
           f"   PLACAR — elencos reais da temporada {time.strftime('%Y')}\n"
           f"   Fonte: ESPN (site.api.espn.com), atualizado em {meta['updated']} pelo robô (uma vez por hora).\n"
           "   Linha: [número da camisa, nome, posição (G goleiro · D defensor · M meio-campo · F atacante), idade, id ESPN]\n"
           "   Número null = ainda sem numeração no cadastro. Quem jogou pelo clube nos últimos 45 dias e sumiu da lista da ESPN continua.\n"
           "   SQUADS_LAST: escalação titular e reservas do último jogo de cada clube, tirada da súmula da partida na ESPN.\n"
           "   ========================================================================== */\n"
           "window.SQUADS = " + _compacto(clean_deep(out)) + ";\n"
           "window.SQUADS_LAST = " + json.dumps(clean_deep(last), ensure_ascii=False, separators=(",", ":")) + ";\n"
           "window.SQUADS_META = " + json.dumps(meta, ensure_ascii=False) + ";\n")
    tmp = SQUADS_FILE + ".tmp"
    open(tmp, "w", encoding="utf-8", newline="\n").write(txt)
    os.replace(tmp, SQUADS_FILE)
    log("gravado", SQUADS_FILE, f"({sum(len(v) for v in out.values())} jogadores)")
    return True


def update_jogadores():
    clubes = JOG.atualizar(squads_atuais(), load_matches())
    with lock:
        state["jogadores"] = clubes
    log("jogadores (temporada, lances e fotos) atualizados")


def update_jogadores_ao_vivo():
    """Com algum jogo dos 20 clubes em andamento: estatísticas, mapas de calor e notas refeitos (a cada 5 min no servidor;
    a cada rodada de 30 min no robô do GitHub). Quando o jogo acaba, a próxima rodada relê tudo com os números finais."""
    if not any(v for *_, v in JOG.jogos_temporada()):
        return
    update_jogadores()


# ---------------------------------------------------------------------------
# Em alta: o que mais se busca no site (só contagens por clube/jogador; nada de quem buscou)
# ---------------------------------------------------------------------------
BUSCA_HORAS = 24
_buscas = {}  # hora (aaaammddhh) -> {"c:flamengo": n, "j:216098": n}


def ids_validos():
    ids = {"c:" + c for c in CLUBS}
    for cid, rows in (squads_atuais() or {}).items():
        ids.update("j:" + str(r[4]) for r in rows if r[4])
        ids.update(f"j:{r[4]}-{cid}" for r in rows if r[4])  # chave do site: id da ESPN + clube
    return ids


_validos = {"t": 0, "ids": set()}


def contar_busca(t, i):
    if time.time() - _validos["t"] > 3600:
        _validos.update(t=time.time(), ids=ids_validos())
    k = f"{t}:{i}"
    if k not in _validos["ids"]:
        return False
    h = time.strftime("%Y%m%d%H", time.gmtime())
    with lock:
        b = _buscas.setdefault(h, {})
        b[k] = b.get(k, 0) + 1
        for velha in sorted(_buscas)[:-BUSCA_HORAS]:
            _buscas.pop(velha, None)
    return True


def em_alta(n=8):
    agora = time.time()
    peso = {}
    with lock:
        horas = dict(_buscas)
    for h, b in horas.items():
        idade = (agora - calendar.timegm(time.strptime(h, "%Y%m%d%H"))) / 3600
        f = 0.5 ** (idade / 6)  # meia-vida de 6 h: o que se busca agora pesa mais
        for k, v in b.items():
            peso[k] = peso.get(k, 0) + v * f
    top = sorted(peso.items(), key=lambda x: -x[1])[:n]
    return {"updated": time.strftime("%d/%m/%Y às %H:%M"), "horas": BUSCA_HORAS, "itens": [{"t": k[0], "id": k[2:], "peso": round(v, 2)} for k, v in top]}


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


MATCH_VERSION = 4  # 2: gols, assistências, finalizações e pênaltis · 3: posição em campo (formação, nº da posição e sigla da ESPN)
#                   4: números do time (posse, passes, finalizações...), placar e minuto de cada gol, para o Raio-X


def match_extract(eid, lg="bra.1"):
    """Resumo de um jogo encerrado: para cada time, quem jogou, quanto tempo, cartões, gols e finalizações.
    Linha: [id, nome, titular, minutos, amarelos, vermelhos, gols, assistências, finalizações, no alvo, gols de pênalti,
            posição: [formação, nº da posição (1–11), sigla da ESPN]] — quem entrou herda a posição de quem saiu"""
    d = get_json(f"{ESPN}/site/v2/sports/soccer/{lg}/summary?event={eid}")
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
    out.update(match_box(d))
    out["nomes"] = {str(c["team"]["id"]): clean_text(c["team"].get("displayName") or "", 40) for c in d["header"]["competitions"][0].get("competitors", [])}
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
    # só quem ainda está no clube: no elenco atual da ESPN ou em campo num dos 3 últimos jogos
    # (quem foi vendido no meio da temporada sai das listas; garoto da base que já joga e ainda não está no cadastro fica)
    recentes = set(range(max(0, n - 3), n))
    for q in P.values():
        if q["id"] not in squad_names and not (q["played"] & recentes):
            continue
        if q["yc"] and q["yc"] % SUSPENSAO_AMARELOS == SUSPENSAO_AMARELOS - 1:
            pend.append({"id": q["id"], "name": q["name"], "amarelos": q["yc"], "ultimo": q["last_yc"]})
        sp, ss = streak(q["played"]), streak(q["started"])
        if sp >= 2:
            seq.append({"id": q["id"], "name": q["name"], "jogos": sp, "titular": ss})
        # reserva: entrou saindo do banco pelo menos tantas vezes quanto foi titular
        # (titular que perdeu jogos por lesão ou que chegou no meio do ano não é reserva)
        banco = q["apps"] - q["starts"]
        if banco >= 2 and banco >= q["starts"]:
            res.append({"id": q["id"], "name": q["name"], "minutos": q["min"], "jogos": q["apps"], "titular": q["starts"], "banco": banco, "media": round(q["min"] / q["apps"])})
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
    if reps(c):
        items += [dict(x, tag="setorista") for x in news_query(f'({reps_query(c)}) "{c["busca"]}" {terms} when:21d')]
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
    # quem jogou um dos 3 últimos jogos do clube ainda está lá (mesmo fora do cadastro da ESPN)
    recentes = {}
    for tid in {t for m in matches.values() for t in m.get("teams", {})}:
        jogos = sorted((m for m in matches.values() if tid in m.get("teams", {})), key=lambda m: m["date"])[-3:]
        recentes[club_of.get(tid)] = {r[0] for m in jogos for r in m["teams"][tid]}

    def ficha(pid, name, cid, goals, pos):
        q = P[pid]
        sc, row = squad.get(pid, (None, None))
        return {"pos": pos, "id": pid, "name": name, "club": cid, "gols": goals, "golsSumulas": q["gols"],
                "noClube": sc == cid or pid in recentes.get(cid, ()),   # False: saiu do clube (os gols pelo clube continuam valendo)
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


def pos_pt(form, abbr):
    """Sigla da ESPN (com a formação) -> posição em português: GOL, ZAG, LD, LE, ALD, ALE, VOL, MC, MD, ME, MEI, PD, PE, CA.
    A mesma tabela está em js/campo.js (o campinho usa para dizer onde o jogador costuma jogar)."""
    a = (abbr or "").upper()
    tres = str(form or "").startswith(("3", "5"))
    if a == "G":
        return "GOL"
    if a in ("CD", "CD-L", "CD-R", "SW", "D"):
        return "ZAG"
    if a == "LB":
        return "ALE" if tres else "LE"
    if a == "RB":
        return "ALD" if tres else "LD"
    if a == "DM":
        return "VOL"
    if a in ("CM", "CM-L", "CM-R", "M"):
        return "VOL" if "-2-" in str(form or "") else "MC"
    if a == "AM":
        return "MEI"
    if a == "AM-L":
        return "PE"
    if a == "AM-R":
        return "PD"
    f = str(form or "")
    if a in ("LM", "RM"):
        lado = "E" if a == "LM" else "D"
        if tres:
            return "AL" + lado
        if f.startswith(("4-2-3", "4-2-2", "4-2-1")):
            return "VOL"  # na ESPN, os dois volantes do 4-2-3-1 aparecem como LM/RM
        if f.startswith(("4-3-", "4-1-2")):
            return "MC"
        return "M" + lado
    if a == "LF":
        return "PE"
    if a == "RF":
        return "PD"
    if a in ("F", "CF", "CF-L", "CF-R", "RCF", "LCF", "SS"):
        return "CA"
    return None


def position_profiles(matches):
    """Onde cada jogador atuou no Brasileirão: minutos em cada posição (formação + nº da posição + sigla da ESPN),
    jogos, minutos, gols e finalizações. É a base do mapa de calor estimado do "Bora pro jogo".
    "s": por posição em português, [jogos, minutos, gols, assistências, jogos como titular]; "f": a posição de origem
    (a de mais minutos). O campinho da janela de transferências usa isso para a prévia "como ele jogou ali"."""
    P = {}
    for m in (m for m in matches.values() if m.get("v", 1) >= 3):
        for rows in m["teams"].values():
            for row in rows:
                pid, nm, starter, mins = row[:4]
                g, a, sh, where = row[6], row[7], row[8], (row[11] if len(row) > 11 else None)
                if not mins:
                    continue
                q = P.setdefault(pid, {"n": nm, "j": 0, "m": 0, "g": 0, "c": 0, "p": {}, "s": {}})
                q["j"] += 1; q["m"] += mins; q["g"] += g; q["c"] += sh
                if where:
                    key = f"{where[0]}|{where[1]}|{where[2]}"
                    q["p"][key] = q["p"].get(key, 0) + mins
                    pt = pos_pt(where[0], where[2])
                    if pt:
                        s = q["s"].setdefault(pt, [0, 0, 0, 0, 0])
                        s[0] += 1; s[1] += mins; s[2] += g; s[3] += a; s[4] += 1 if starter else 0
    # posições ordenadas pelos minutos; corta o que tem menos de 3% do tempo (ruído)
    for q in P.values():
        tot = sum(q["p"].values()) or 1
        q["p"] = [[k, v] for k, v in sorted(q["p"].items(), key=lambda x: -x[1]) if v / tot >= 0.03]
        if q["s"]:
            q["f"] = max(q["s"].items(), key=lambda x: x[1][1])[0]
    return P


# ---------------------------------------------------------------------------
# Setoristas: o que os jornalistas que cobrem o dia a dia de cada clube publicam
#   - Google Notícias: matérias e publicações indexadas que citam o setorista e o clube;
#   - YouTube: feed oficial (RSS) dos canais dos setoristas e dos canais nacionais (CazéTV), só os títulos;
#   - X e Instagram: só pelas APIs oficiais, e só se as chaves estiverem configuradas (X_BEARER_TOKEN;
#     IG_USER_ID e IG_ACCESS_TOKEN). Os termos de uso do Instagram, do X e do TikTok proíbem coleta
#     automática fora das APIs oficiais, e o TikTok não oferece API pública para isso: nada é raspado.
#   Do que vem das redes, o site mostra só "publicação de @perfil", a data e o link; o texto serve só para
#   reconhecer o jogador e a situação.
# ---------------------------------------------------------------------------
YT_ID = re.compile(r"^UC[A-Za-z0-9_-]{22}$")
X_HANDLE = re.compile(r"^[A-Za-z0-9_]{1,15}$")
IG_HANDLE = re.compile(r"^[A-Za-z0-9._]{1,30}$")
SETOR_TERMOS = "(lesão OR lesionado OR DM OR desconforto OR dores OR cirurgia OR desfalque OR vetado OR liberado OR transição OR dúvida)"
_setor_cache = {}


def reps(c):
    return [r if isinstance(r, dict) else {"nome": str(r)} for r in c.get("setoristas", [])]


def reps_query(c):
    return " OR ".join(f'"{r["nome"]}"' for r in reps(c)[:8])


def cached(key, ttl, fn):
    hit = _setor_cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    try:
        val = fn()
    except Exception as ex:
        log("setoristas", key[0], ex)
        val = hit[1] if hit else []
    _setor_cache[key] = (time.time(), val)
    return val


def youtube_feed(channel_id, nome):
    """Títulos dos vídeos mais recentes de um canal, pelo feed oficial do YouTube."""
    if not YT_ID.match(channel_id or ""):
        return []

    def load():
        raw = get(f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}")
        if re.search(rb"<!(DOCTYPE|ENTITY)", raw, re.I):
            raise ValueError("feed com declarações não permitidas")
        ns = {"a": "http://www.w3.org/2005/Atom"}
        out = []
        for e in ET.fromstring(raw).findall("a:entry", ns):
            t = e.findtext("a:title", default="", namespaces=ns)
            a = e.find("a:link", ns)
            pub = e.findtext("a:published", default="", namespaces=ns)
            try:
                ts = calendar.timegm(time.strptime(pub[:19], "%Y-%m-%dT%H:%M:%S"))
            except Exception:
                ts = 0
            link = clean_link(a.get("href") if a is not None else "")
            if t and link:
                out.append({"title": clean_text(t, 300), "link": link, "source": f"{nome} (YouTube)", "ts": ts, "canal": "YouTube"})
        return out
    return cached(("youtube", channel_id), 25 * 60, load)


def x_posts(handles, termos):
    """Publicações recentes dos perfis no X (API oficial v2, busca recente). Sem chave: nada."""
    tok = os.environ.get("X_BEARER_TOKEN", "").strip()
    hs = [h for h in handles if X_HANDLE.match(h or "")][:10]
    if not tok or not hs:
        return []

    def load():
        q = f'({" OR ".join("from:" + h for h in hs)}) -is:retweet {termos}'[:512]
        url = ("https://api.x.com/2/tweets/search/recent?" + urllib.parse.urlencode(
            {"query": q, "max_results": 50, "tweet.fields": "created_at,author_id", "expansions": "author_id", "user.fields": "username,name"}))
        d = json.loads(get(url, headers={"Authorization": f"Bearer {tok}"}))
        users = {u["id"]: u for u in (d.get("includes") or {}).get("users", [])}
        out = []
        for p in d.get("data", []):
            u = users.get(p.get("author_id"), {})
            h = u.get("username", "")
            try:
                ts = calendar.timegm(time.strptime(p.get("created_at", "")[:19], "%Y-%m-%dT%H:%M:%S"))
            except Exception:
                ts = 0
            if X_HANDLE.match(h) and re.fullmatch(r"\d{1,25}", p.get("id", "")):
                out.append({"title": f"Publicação de @{h} no X", "texto": clean_text(p.get("text", ""), 500), "link": f"https://x.com/{h}/status/{p['id']}",
                            "source": f"{u.get('name') or h} (X)", "ts": ts, "canal": "X", "perfil": h})
        return out
    return cached(("x", ",".join(hs)), 60 * 60, load)


def ig_posts(username, nome):
    """Publicações recentes de um perfil profissional do Instagram (Graph API, Business Discovery). Sem chave: nada."""
    uid, tok = os.environ.get("IG_USER_ID", "").strip(), os.environ.get("IG_ACCESS_TOKEN", "").strip()
    if not (uid and tok) or not re.fullmatch(r"\d{5,25}", uid) or not IG_HANDLE.match(username or ""):
        return []

    def load():
        fields = f"business_discovery.username({username}){{media.limit(12){{caption,timestamp,permalink}}}}"
        d = json.loads(get(f"https://graph.facebook.com/v21.0/{uid}?" + urllib.parse.urlencode({"fields": fields}), headers={"Authorization": f"Bearer {tok}"}))
        out = []
        for m in ((d.get("business_discovery") or {}).get("media") or {}).get("data", []):
            try:
                ts = calendar.timegm(time.strptime(m.get("timestamp", "")[:19], "%Y-%m-%dT%H:%M:%S"))
            except Exception:
                ts = 0
            link = clean_link(m.get("permalink"))
            if link:
                out.append({"title": f"Publicação de @{username} no Instagram", "texto": clean_text(m.get("caption", ""), 800), "link": link,
                            "source": f"{nome} (Instagram)", "ts": ts, "canal": "Instagram", "perfil": username})
        return out
    return cached(("instagram", username), 60 * 60, load)


def setorista_items(cid):
    """Tudo o que os setoristas do clube (e os canais nacionais, quando citam o clube) publicaram nas últimas semanas."""
    c = CLUBS[cid]
    rs = reps(c)
    out = []
    for r in rs:
        if r.get("youtube"):
            out += [dict(x, setorista=r["nome"]) for x in youtube_feed(r["youtube"], r.get("canal") or r["nome"])]
        if r.get("instagram"):
            out += [dict(x, setorista=r["nome"]) for x in ig_posts(r["instagram"], r["nome"])]
    por_x = {r["x"].lower(): r["nome"] for r in rs if r.get("x")}
    out += [dict(x, setorista=por_x.get(x["perfil"].lower(), x["perfil"])) for x in x_posts(list(por_x), SETOR_TERMOS)]
    # canais nacionais (CazéTV): só os vídeos que citam o clube
    palavras = [fold(w) for w in (c["busca"], *HEADLINE_NAMES.get(cid, []), *c.get("apelidos", []))]
    for canal in CONFIG.get("canais_nacionais", []):
        for x in youtube_feed(canal.get("youtube"), canal["nome"]):
            ft = fold(x["title"])
            if any(re.search(rf"(?<![a-z]){re.escape(w)}(?![a-z])", ft) for w in palavras):
                out.append(dict(x, nacional=canal["nome"]))
    return out


# ---------------------------------------------------------------------------
# Departamento médico: monitor da temporada inteira
#   Quem pode estar no DM: titular/reserva frequente que não jogou nem foi relacionado no último jogo,
#   quem já está no DM e quem foi citado numa manchete de lesão do clube.
#   Para cada um, busca no Google Notícias o nome do jogador + clube + termos médicos (o índice do Google
#   lê o texto das matérias; o site só guarda título, veículo, data e link). Fontes: imprensa nacional,
#   imprensa local (onde estão os setoristas), site oficial do clube e os setoristas configurados.
#   Sai do DM: entrou em campo ou foi relacionado depois da última notícia de lesão, ou uma manchete
#   diz que foi liberado/voltou a treinar com o grupo. O histórico da temporada fica gravado.
# ---------------------------------------------------------------------------
DM_FILE = os.path.join(ROOT, "js", "departamento-medico.js")
DM_MED = re.compile(r"les[ãa]o|lesion|departamento m[ée]dico|\bDM\b|cirurgi|contus|estiramento|entorse|fratur|ruptur|ligamento|menisco|edema|h[ée]rnia|"
                    r"desconforto|\bdor(es)?\b|problema (f[íi]sico|muscular)|machuc|inc[ôo]modo (na|no|muscular|f[íi]sico)|trauma|pancada|virose|concuss|"
                    r"deixa (o )?campo|sai (de campo )?machucado|tratamento|fisioterap|transi[çc][ãa]o|recupera[çc][ãa]o|boletim m[ée]dico", re.I)
DM_OUT = re.compile(r"desfalc|desfalque|\bfora\b|vetad|n[ãa]o (joga|enfrenta|viaja|treina|atua)|poupad|\bperde\b|aus[êe]n|d[úu]vida|preocupa", re.I)
DM_NAO = re.compile(r"stjd|julga|puni[çc]|gancho|tribunal|denunci|suspens|suspenso|cart[ãa]o|amarel|expuls|vermelho|convoca|sele[çc][ãa]o|negocia|proposta|vend[ae]|transfer|empr[ée]st|contrato|"
                    r"renova|multa|europa|interesse|sondad|indisciplina|por op[çc][ãa]o|luto|nascimento|casamento|f[ée]rias", re.I)
DM_EVOL = re.compile(r"treina no campo|corrida no campo|primeira corrida|reta final de recupera|transi[çc][ãa]o|avan[çc]a|evolu|em recupera[çc][ãa]o|segue (em )?recupera|treina (em campo|separad|à parte|a parte)|"
                     r"volta a treinar em campo|trabalho (f[íi]sico|espec[íi]fico)|fisioterap|academia", re.I)
DM_VOLTA = re.compile(r"\blibera\b|volta de\b|(?<!n[ãa]o )\bjoga\b(?! mais)|vem jogando|jogando no|atua com|no sacrif[íi]cio|operar[áa] (ap[óo]s|depois)|liberad|recuperad[oa]\b|treina com o grupo|com o elenco|treina normal|volta aos treinos com|retorna|retorno|de volta|reaparece|"
                      r"alta m[ée]dica|relacionad|[àa] disposi|reintegrad|est[áa] pronto|refor[çc]o (para|contra)|ganha refor[çc]o|volta ao time|volta a jogar", re.I)
DM_GRAVE = re.compile(r"cirurgi|operad|ruptur|ligamento|fratur|meses|longo prazo|grave|fora da temporada|n[ãa]o joga mais|s[óo] volta em 20", re.I)
DM_FORA_TEMP = re.compile(r"(fora|n[ãa]o (joga|volta|atua)( mais)?|perde|encerra|restante|resto)\b[^.;]*\b(temporada|em 20[2-9]\d)|s[óo] volta em 20[2-9]\d|fora da temporada", re.I)
DM_HOSPITAL = re.compile(r"alta hospitalar|libera(do|da)? (do )?hospital|deixa o hospital|sai do hospital", re.I)
DM_DUV = re.compile(r"d[úu]vida|desconforto|preocupa|inc[ôo]modo (na|no|muscular|f[íi]sico)|poupad", re.I)
DM_PARTES = [(r"joelho", "joelho"), (r"posterior", "posterior da coxa"), (r"coxa", "coxa"), (r"panturrilha", "panturrilha"), (r"tornozelo", "tornozelo"),
             (r"adutor|virilha|pubalgia", "adutor"), (r"ombro", "ombro"), (r"quadril", "quadril"), (r"lombar|coluna|costas", "coluna"), (r"costela", "costela"),
             (r"t[íi]bia|f[íi]bula|perna", "perna"), (r"\bp[ée]\b|metatarso", "pé"), (r"menisco", "menisco"), (r"m[ãa]o|punho|dedo", "mão"),
             (r"cabe[çc]a|concuss|rosto|nariz|olho", "cabeça"), (r"virose|febre|gripe|doen[çc]a|infec", "doença"), (r"muscul|m[úu]scul|estiramento", "muscular")]
DM_TERMS = ('(lesão OR lesionado OR "departamento médico" OR DM OR desconforto OR dores OR cirurgia OR estiramento OR fratura OR entorse OR edema '
            'OR desfalque OR vetado OR dúvida OR recuperação OR transição OR liberado OR "volta a treinar" OR relacionado)')
DM_JANELA = 35          # dias de notícia buscados a cada passada (o histórico mais antigo fica gravado)
DM_ESQUECE = 30         # lesão leve sem notícia nova e sem jogo há mais disso sai da lista ("sem notícias")
DM_GRAVE_DIAS = 200     # lesão grave (cirurgia, fora da temporada) fica até o jogador voltar a jogar
DM_MAX_BUSCAS = 14      # jogadores pesquisados por clube em cada passada


def fold(t):
    """Nome para comparação: sem acento, minúsculo e com as grafias que variam juntas (Morais/Moraes, Souza/Sousa...)."""
    t = strip_accents(t or "").lower()
    for a, b in (("moraes", "morais"), ("souza", "sousa"), ("luiz", "luis"), ("thiago", "tiago"), ("matheus", "mateus"),
                 ("kaique", "kaiki"), ("walace", "wallace"), ("y", "i"), ("w", "v"), ("ph", "f")):
        t = t.replace(a, b)
    return re.sub(r"([a-z])\1", r"\1", t)


DM_LIGA = {"o", "a", "os", "as", "e", "de", "do", "da", "dos", "das", "com", "sem", "para", "pra", "por", "no", "na", "nos", "nas", "em", "ao",
           "x", "vs", "que", "se", "mas", "apos", "sobre", "contra", "diz", "ve", "tem", "um", "uma", "volta", "vira", "sente", "segue"}
_TOK = re.compile(r"[0-9A-Za-zÀ-ÿ'’-]+")


def has_name(title, ftoks, nomes=None):
    """O nome (já em fold) aparece inteiro na manchete, sem outro nome próprio colado antes ou depois
    ("Lucas" não é "Lucas Paquetá"; "Santos" não é "Nilton Santos"; "Marcelo" não é "João Marcelo")."""
    toks = [(m.start(), m.end(), m.group(0)) for m in _TOK.finditer(title or "")]
    f = [fold(t[2]) for t in toks]
    n = len(ftoks)
    letras = [ch for ch in title or "" if ch.isalpha()]
    caps = len(letras) > 8 and sum(ch.isupper() for ch in letras) / len(letras) > 0.6

    def nome_colado(k):
        if f[k] in DM_LIGA:
            return False
        return (f[k] in (nomes or ())) if caps else toks[k][2][:1].isupper()
    for i in range(len(toks) - n + 1):
        if f[i:i + n] != ftoks:
            continue
        if i > 0 and title[toks[i - 1][1]:toks[i][0]].strip() == "" and nome_colado(i - 1):
            continue
        j = i + n
        if j < len(toks) and title[toks[j - 1][1]:toks[j][0]].strip() == "" and nome_colado(j):
            continue
        return (toks[i][0], toks[j - 1][1])
    return None


def name_variants(nm):
    out = [nm]
    for a, b in (("Morais", "Moraes"), ("Souza", "Sousa"), ("Luiz", "Luis"), ("Matheus", "Mateus"), ("Thiago", "Tiago")):
        for x, y in ((a, b), (b, a)):
            if re.search(rf"\b{x}\b", nm):
                out.append(re.sub(rf"\b{x}\b", y, nm))
    return list(dict.fromkeys(out))[:3]


DM_CONFIAVEIS = None


def dm_fonte(src, cid):
    """(oficial, confiável): site do clube ou veículo da lista que confirma sozinho."""
    global DM_CONFIAVEIS
    if DM_CONFIAVEIS is None:
        DM_CONFIAVEIS = {fold(x) for x in CONFIG.get("fontes_dm", []) + CONFIG.get("fontes_nomes", [])}
    s = fold(src).strip()
    c = CLUBS[cid]
    dom = fold((c.get("oficial") or "").split(".")[0])
    oficial = bool(dom) and dom in s.replace(" ", "") or (fold(c["busca"]) in s and re.search(r"\b(site|clube|esporte|regatas|sport|club|futebol|oficial|fc|ec)\b", s) is not None
                                                            and not re.search(r"noticias|torcida|blog|fala|mais|portal|central|coluna", s))
    return oficial, oficial or s in DM_CONFIAVEIS


def dm_load():
    try:
        src = open(DM_FILE, encoding="utf-8").read()
        d = json.loads(src[src.index("{"):src.rindex("}") + 1])
        return d if d.get("temporada") == int(time.strftime("%Y")) else None
    except Exception:
        return None


def club_games(espn_id, matches):
    """Jogos do clube nas súmulas, do mais antigo ao mais novo: (data, id do jogo, quem jogou)."""
    g = [(m["date"], eid, {r[0] for r in m["teams"].get(str(espn_id), [])}) for eid, m in matches.items() if str(espn_id) in m.get("teams", {})]
    return sorted(g)


_roster_cache = {}


def relacionados(eid, espn_id):
    """Todos os relacionados do clube num jogo (titulares, quem entrou e o banco), pela súmula da ESPN."""
    key = (eid, str(espn_id))
    if key not in _roster_cache:
        ids = set()
        try:
            d = get_json(f"{ESPN}/site/v2/sports/soccer/bra.1/summary?event={eid}")
            for r in d.get("rosters", []):
                if str(r["team"]["id"]) == str(espn_id):
                    ids = {x["athlete"]["id"] for x in r.get("roster", [])}
        except Exception as ex:
            log("relacionados", eid, ex)
        _roster_cache[key] = ids
    return _roster_cache[key]


DM_CLASSES = None


def dm_classify(t, span):
    """Tipo de notícia para um jogador: lesao, duvida, evol(ução), ausencia, volta, citado — ou None.
    Com o nome na manchete, vale a palavra mais próxima dele ("libera Ruan, mas perde Victor":
    Ruan foi liberado, Victor é desfalque)."""
    global DM_CLASSES
    if DM_CLASSES is None:
        DM_CLASSES = [("volta", DM_VOLTA), ("evol", DM_EVOL), ("med", DM_MED), ("out", DM_OUT)]
    t = DM_HOSPITAL.sub(lambda m: " " * len(m.group(0)), t)   # alta do hospital não é alta médica
    med = DM_MED.search(t)
    if DM_NAO.search(t) and not med:
        return None
    if not span:
        return "citado" if (med or DM_OUT.search(t)) and not DM_VOLTA.search(t) else None
    a, b = span
    # a oração do nome (entre vírgulas, ponto e vírgula, dois-pontos ou "mas"): o que está fora dela pesa menos
    cuts = [0] + [m.end() for m in re.finditer(r"[,;:|]|\smas\s|\senquanto\s", t)] + [len(t)]
    ini = max(c for c in cuts if c <= a)
    fim = min([c for c in cuts if c >= b] or [len(t)])
    if re.search(r"sacrif[íi]cio|vem jogando|jogando com|atua com|operar[áa] (ap[óo]s|depois)", t[ini:fim], re.I):
        return "volta"   # joga mesmo com o problema: está à disposição
    best = None
    for lab, rx in DM_CLASSES:
        for m in rx.finditer(t):
            fora = 0 if ini <= m.start() and m.end() <= fim + 1 else 100
            if m.start() >= b:
                d = m.start() - b            # depois do nome (sujeito + verbo): preferido
            elif m.end() <= a:
                d = (a - m.end()) * 1.3
            else:
                d = 0
            d += fora
            if best is None or d < best[0]:
                best = (d, lab)
    if not best:
        return None
    lab = best[1]
    if lab in ("volta", "evol"):
        return lab
    if lab == "med":
        return "duvida" if DM_DUV.search(t) and not re.search(r"les[ãa]o|lesion|cirurgi|fratur|ruptur|estiramento|edema|entorse", t, re.I) else "lesao"
    return "duvida" if DM_DUV.search(t) else "ausencia"


def club_dm(cid, matches, squad, old, news_extra, extra_base=None):
    c = CLUBS[cid]
    espn = c["espn"]
    hoje = time.strftime("%Y-%m-%d")
    names = {pid: nm for pid, nm in squad.items()}
    base_ids = {pid for pid in squad if pid in (extra_base or ())}
    folded = {pid: fold(nm) for pid, nm in names.items()}
    tokset = {w for f in folded.values() for w in f.split()}
    lastw = {}
    for pid, f in folded.items():
        parts = [w for w in f.split() if len(w) >= 5]
        if len(f.split()) >= 2 and parts:
            lastw.setdefault(parts[-1], set()).add(pid)
    club_words = [fold(w) for w in (c["busca"], *HEADLINE_NAMES.get(cid, []), *c.get("apelidos", []))]

    def named(t, pid):
        sp = has_name(t, folded[pid].split(), tokset)
        if sp:
            return sp
        # sobrenome sozinho ("Arroyo"): só se ninguém mais do elenco tem esse sobrenome e a manchete cita o clube
        parts = [w for w in folded[pid].split() if len(w) >= 5]
        ft = fold(t)
        if (bool(parts) and len(folded[pid].split()) >= 2 and len(lastw.get(parts[-1], ())) == 1
                and any(re.search(rf"(?<![a-z]){re.escape(w)}(?![a-z])", ft) for w in club_words)):
            return has_name(t, [parts[-1]], tokset)
        return None

    games = club_games(espn, matches)
    jogou = {}
    for d, eid, ps in games:
        for p in ps:
            jogou[p] = d
    # relacionados (com o banco) nos dois últimos jogos
    lista = {}
    for d, eid, _ in games[-2:]:
        for p in relacionados(eid, espn):
            lista[p] = max(lista.get(p, ""), d)
    ultimo = games[-1][0] if games else None
    ult_ps = (games[-1][2] | {p for p, d in lista.items() if d == ultimo}) if games else set()
    disp = {p: max(jogou.get(p, ""), lista.get(p, "")) for p in names}   # última vez à disposição do treinador

    ativos_old = {a["id"]: a for a in (old or {}).get("ativos", [])}
    hist = list((old or {}).get("historico", []))

    # 1) manchetes do clube (imprensa geral, site oficial e setoristas): quem é citado com lesão vira candidato
    itens = list(news_extra)
    consultas = [f'"{c["busca"]}" (lesão OR lesionado OR "departamento médico" OR desconforto OR dores OR cirurgia OR desfalque OR vetado OR "boletim médico") when:14d']
    if c.get("oficial"):
        consultas.append(f'site:{c["oficial"]} (lesão OR "departamento médico" OR "boletim médico" OR cirurgia OR recuperação OR transição OR atualização) when:60d')
    if reps(c):
        consultas.append(f'({reps_query(c)}) "{c["busca"]}" (lesão OR "departamento médico" OR desfalque OR desconforto OR dores OR liberado) when:21d')
    for q in consultas:
        try:
            itens += [dict(x, oficial=q.startswith("site:")) for x in news_query(q)]
        except Exception as ex:
            log("DM", cid, ex)
        time.sleep(0.25)
    itens += setorista_items(cid)   # canais dos setoristas (YouTube), CazéTV e, com chave, X e Instagram
    itens = [x for x in itens if (x.get("ts") or 0) >= time.time() - (DM_JANELA + 5) * 86400]
    txt_of = lambda it: it.get("texto") or it["title"]
    # jogador da base que ainda não está no elenco da ESPN: nome que aparece como "joia/cria/garoto... Fulano" numa notícia de lesão
    novos = {}
    for it in itens:
        t = txt_of(it)
        if not DM_MED.search(t):
            continue
        for m in re.finditer(r"\b(?:[Jj]oia|[Cc]ria|[Gg]aroto|[Jj]ovem|[Pp]romessa|[Rr]evela[çc][ãa]o)(?: da base)?(?: d[oa] [A-ZÀ-Ý][\w-]+)?,? ([A-ZÀ-Ý][a-zà-ÿ]{2,}(?: [A-ZÀ-Ý][a-zà-ÿ]{2,})?)", t):
            nm = m.group(1)
            fn = fold(nm)
            if fn in club_words or any(fn == f or fn in f.split() for f in folded.values()) or len(novos) >= 3:
                continue
            novos.setdefault("base-" + re.sub(r"[^a-z0-9]+", "-", fn), nm)
    for pid, nm in novos.items():
        names[pid] = nm
        folded[pid] = fold(nm)
        tokset.update(folded[pid].split())
        base_ids.add(pid)
    citados = {pid for it in itens for pid in names if named(txt_of(it), pid) and DM_MED.search(txt_of(it)) and not DM_NAO.search(txt_of(it))}

    # 2) candidatos: frequentes que não estavam no último jogo, quem já está no DM e quem foi citado
    recentes = games[-10:]
    freq = {p for p in names if sum(p in ps for _, _, ps in recentes) >= 2}
    cand = (freq - ult_ps) | (set(ativos_old) & set(names)) | citados
    ordem = sorted(cand, key=lambda p: (p not in ativos_old, p not in citados, disp.get(p, "")), reverse=False)[:DM_MAX_BUSCAS]

    ativos, saidas = [], []
    for pid in ordem:
        nm = names[pid]
        q = " OR ".join(f'"{v}"' for v in name_variants(nm))
        try:
            res = news_query(f'({q}) "{c["busca"]}" {DM_TERMS} when:{DM_JANELA}d')
        except Exception as ex:
            log("DM", nm, ex)
            res = []
        time.sleep(0.25)
        ev, vistos = [], set()
        for it in res + [x for x in itens if named(txt_of(x), pid)]:
            k = it["link"] if it.get("texto") else headline_key(it["title"])
            if k in vistos or not it.get("link"):
                continue
            vistos.add(k)
            nmd = named(txt_of(it), pid)
            tipo = dm_classify(txt_of(it), nmd)
            if not tipo or (it.get("ts") or 0) < time.time() - (DM_JANELA + 5) * 86400:
                continue
            of, conf = dm_fonte(it.get("source", ""), cid)
            conf = conf or bool(it.get("setorista") or it.get("nacional"))   # setorista cadastrado e CazéTV confirmam
            ev.append({"setorista": it.get("setorista"), "canal": it.get("canal"), "data": time.strftime("%Y-%m-%d", time.localtime(it.get("ts") or 0)), "tipo": tipo, "nomeado": bool(nmd),
                       "manchete": it["title"], "fonte": it.get("source", ""), "link": it["link"], "oficial": of or bool(it.get("oficial")), "confiavel": conf or bool(it.get("oficial"))})
        prev = ativos_old.get(pid)
        if prev:  # o que já foi apurado antes continua valendo (a busca só olha as últimas semanas)
            ev += [x for x in prev.get("noticias", []) if headline_key(x["manchete"]) not in vistos]
        base = disp.get(pid, "")   # última vez em campo ou no banco
        dmy = lambda d: f"{d[8:10]}/{d[5:7]}"
        # já estava no DM e depois entrou em campo ou foi relacionado: está à disposição, sai
        if prev and base and base > prev["desde"]:
            saidas.append(dict(prev, ate=base, motivo=f"voltou a jogar em {dmy(base)}" if jogou.get(pid) == base else f"relacionado para o jogo de {dmy(base)}"))
            prev = None
        # notícias depois da última vez à disposição (a do próprio dia do jogo conta se citar o jogador: lesão na partida)
        les = [x for x in ev if x["tipo"] != "volta" and (x["data"] >= base if x["nomeado"] and x["tipo"] == "lesao" else x["data"] > base)]
        fortes = [x for x in les if x["nomeado"] and x["tipo"] in ("lesao", "duvida", "evol")]
        medias = [x for x in les if x not in fortes]
        dentro = (bool(fortes) or (len({fold(x["fonte"]) for x in medias}) >= 2 and any(DM_MED.search(x["manchete"]) for x in medias))
                  or (bool(prev) and bool(les)))
        if not les:
            if prev:   # sem notícia nova e sem jogo: continua como estava
                ativos.append(prev)
            continue
        ult = max(x["data"] for x in les)
        # a liberação com o nome só é desmentida por notícia nova que também cite o jogador
        ult_nome = max(x["data"] for x in fortes) if fortes else min(x["data"] for x in les)
        volta = sorted((x for x in ev if x["tipo"] == "volta" and x["data"] >= ult_nome), key=lambda x: x["data"])
        grave = any(DM_GRAVE.search(x["manchete"]) for x in fortes)
        idade = (time.mktime(time.strptime(hoje, "%Y-%m-%d")) - time.mktime(time.strptime(ult, "%Y-%m-%d"))) / 86400
        fim = None
        if volta:
            fim = (volta[0]["data"], f"liberado · {volta[0]['fonte']}: {volta[0]['manchete']}")
        elif idade > (DM_GRAVE_DIAS if grave else DM_ESQUECE):
            fim = (hoje, f"sem notícias desde {dmy(ult)}")
        if fim or not dentro:
            if prev:
                saidas.append(dict(prev, ate=fim[0] if fim else hoje, motivo=fim[1] if fim else "sem confirmação"))
            continue
        les.sort(key=lambda x: x["data"])
        top = sorted(fortes or medias, key=lambda x: x["data"])[-1]
        txt = " ".join(x["manchete"] for x in fortes)
        parte = next((nome for rx, nome in DM_PARTES if re.search(rx, txt, re.I)), None)
        status = ("fora da temporada" if DM_FORA_TEMP.search(txt) else "longo prazo" if DM_GRAVE.search(txt)
                  else "em transição" if top["tipo"] == "evol" else "lesionado" if any(x["tipo"] == "lesao" for x in fortes) or top["tipo"] != "duvida" else "dúvida")
        desde = (prev or {}).get("desde") or les[0]["data"]
        fora = sum(1 for d, _, ps in games if d >= desde and pid not in ps)   # jogos do Brasileirão perdidos desde a lesão
        if status == "dúvida" and fora >= 2:
            status = "lesionado"   # "dúvida" que já perdeu dois jogos não é mais dúvida
        noticias = sorted(les, key=lambda x: (x["nomeado"], x["data"]), reverse=True)[:8]
        ativos.append({"id": pid, "name": nm, "base": pid in base_ids, "setoristas": sorted({x["setorista"] for x in les if x.get("setorista")}), "status": status, "parte": parte, "desde": desde, "jogosFora": fora,
                       "ultimoJogo": base or None, "atualizado": max(x["data"] for x in les),
                       "fontes": sorted({x["fonte"] for x in les}), "confirmado": bool(fortes) and (len({fold(x["fonte"]) for x in les}) >= 2 or any(x["confiavel"] for x in les)),
                       "oficial": any(x["oficial"] for x in les), "noticias": noticias})
    # quem estava no DM e não foi pesquisado desta vez continua (a fila de buscas tem limite)
    feitos = set(ordem)
    for pid, a in ativos_old.items():
        if pid not in feitos and pid in names:
            base = disp.get(pid, "")
            if base and base >= a["desde"]:
                saidas.append(dict(a, ate=base, motivo=f"voltou a jogar em {base[8:10]}/{base[5:7]}" if jogou.get(pid) == base else f"relacionado para o jogo de {base[8:10]}/{base[5:7]}"))
            else:
                ativos.append(a)
    for s in saidas:
        hist.insert(0, {k: s.get(k) for k in ("id", "name", "status", "parte", "desde", "ate", "motivo", "fontes")})
    ordem_st = {"fora da temporada": 0, "longo prazo": 1, "lesionado": 2, "em transição": 3, "dúvida": 4}
    ativos.sort(key=lambda a: (ordem_st.get(a["status"], 9), not a["confirmado"], a["desde"]))
    return {"ativos": ativos, "historico": hist[:80], "monitorados": len(ordem), "ultimoJogo": ultimo,
            "setoristas": [{k: r[k] for k in ("nome", "veiculo", "x", "instagram", "canal") if r.get(k)} for r in reps(c)]}


def update_dm():
    """Departamento médico de todos os clubes (temporada inteira, com histórico)."""
    with lock:
        squads = state["squads"] or {}
        club_news = dict(state["news"])
        old = state.get("dm") or dm_load() or {}
    if not squads:
        src = open(os.path.join(ROOT, "js", "squads.js"), encoding="utf-8").read()
        squads = json.loads(src[src.index("window.SQUADS = ") + 16:src.index("window.SQUADS_LAST")].strip().rstrip(";"))
    matches = load_matches()
    out = {}
    for cid in CLUBS:
        squad = {row[4]: row[1] for row in squads.get(cid, []) if row[4]}
        sumula = {}
        for m in matches.values():
            for r in m.get("teams", {}).get(str(CLUBS[cid]["espn"]), []):
                if r[0] and r[0] not in squad:
                    sumula[r[0]] = r[1]
        squad.update(sumula)
        try:
            extra = [dict(x, source=x.get("source", "")) for x in club_news.get(cid, [])]
            out[cid] = club_dm(cid, matches, squad, (old.get("clubs") or {}).get(cid), extra, set(sumula))
        except Exception as ex:
            log("DM", cid, ex)
            if (old.get("clubs") or {}).get(cid):
                out[cid] = old["clubs"][cid]
    dm = {"updated": time.strftime("%d/%m %H:%M"), "temporada": int(time.strftime("%Y")), "clubs": out,
          "fontes": "imprensa nacional e local, sites oficiais dos clubes, setoristas e súmulas da ESPN (relacionados e quem entrou em campo)"}
    with lock:
        state["dm"] = dm
    log("departamento médico:", sum(len(v["ativos"]) for v in out.values()), "jogadores no DM")
    return dm


# ---------------------------------------------------------------------------
# Raio-X: estatísticas táticas de cada clube no Brasileirão, calculadas das súmulas da ESPN,
# com a posição do clube em cada número (1º a 20º) e a média da liga
# ---------------------------------------------------------------------------
# estatística da ESPN -> nome curto no site
BOX_KEYS = {"possessionPct": "posse", "totalShots": "chutes", "shotsOnTarget": "noAlvo", "wonCorners": "escanteios", "foulsCommitted": "faltas",
            "totalPasses": "passes", "accuratePasses": "passesCertos", "totalCrosses": "cruzamentos", "accurateCrosses": "cruzCertos",
            "totalLongBalls": "lancamentos", "accurateLongBalls": "lancCertos", "effectiveTackles": "desarmes", "interceptions": "interceptacoes",
            "saves": "defesas", "offsides": "impedimentos", "yellowCards": "amarelos", "redCards": "vermelhos", "effectiveClearance": "cortes"}
FAIXAS = ["0–15", "16–30", "31–45", "46–60", "61–75", "76–90"]


def _num(v):
    try:
        return float(str(v).replace(",", "."))
    except Exception:
        return None


def match_box(d):
    """Números do time no jogo (posse, finalizações, passes...), o placar e cada gol com o minuto."""
    comp = d["header"]["competitions"][0]
    placar = {str(c["team"]["id"]): int(c.get("score") or 0) for c in comp.get("competitors", []) if str(c.get("score", "")).isdigit()}
    home = next((str(c["team"]["id"]) for c in comp.get("competitors", []) if c.get("homeAway") == "home"), None)
    box = {}
    for t in (d.get("boxscore") or {}).get("teams", []):
        st = {s["name"]: s.get("displayValue") for s in t.get("statistics", [])}
        box[str(t["team"]["id"])] = {v: _num(st.get(k)) for k, v in BOX_KEYS.items()}
    gols = []
    for k in d.get("keyEvents", []):
        if not k.get("scoringPlay"):
            continue
        tp = (k.get("type") or {}).get("type", "")
        clock = k.get("clock") or {}
        quem = ((k.get("participants") or [{}])[0].get("athlete") or {}).get("id")
        # o time do lance é o beneficiado (no gol contra, quem ganhou o gol)
        gols.append([minute(clock.get("displayValue")), int(clock.get("value") or 0), str((k.get("team") or {}).get("id") or ""), quem,
                     "c" if "own" in tp else "p" if "penalty" in tp else ""])
    gols.sort(key=lambda g: g[1])
    return {"home": home, "placar": placar, "box": box, "gols": gols}


def _faixa(m):
    if m is None:
        return None
    return min(5, max(0, (m - 1) // 15)) if m > 0 else 0


def raio_x(matches, squads):
    """Para cada clube: médias por jogo, quando marca e sofre, como reage ao placar, sequências e destaques individuais.
    Cada número vem com a posição do clube entre os 20 e a média da liga."""
    by_espn = {str(c["espn"]): cid for cid, c in CLUBS.items()}
    acc = {cid: {"jogos": [], "box": [], "contra": []} for cid in CLUBS}
    for eid, m in matches.items():
        if m.get("v", 1) < 4 or not m.get("placar") or len(m["placar"]) != 2:
            continue
        ids = list(m["placar"])
        for e in ids:
            cid = by_espn.get(e)
            if not cid:
                continue
            o = ids[1] if ids[0] == e else ids[0]
            gf, ga = m["placar"][e], m["placar"][o]
            gols = m.get("gols") or []
            ok = sum(1 for g in gols if g[2] == e) == gf and sum(1 for g in gols if g[2] == o) == ga   # os lances batem com o placar
            acc[cid]["jogos"].append({"id": eid, "date": m["date"], "casa": m.get("home") == e, "gf": gf, "ga": ga, "op": by_espn.get(o), "gols": gols if ok else None, "e": e})
            if m.get("box", {}).get(e):
                acc[cid]["box"].append(m["box"][e])
            if m.get("box", {}).get(o):
                acc[cid]["contra"].append(m["box"][o])

    def media(lst, k):
        vs = [b[k] for b in lst if b.get(k) is not None]
        return round(sum(vs) / len(vs), 2) if vs else None

    def pct(a, b):
        return round(100 * a / b, 1) if b else None

    out = {}
    for cid, a in acc.items():
        js = sorted(a["jogos"], key=lambda j: j["date"])
        if not js:
            continue
        n = len(js)
        res = ["V" if j["gf"] > j["ga"] else "E" if j["gf"] == j["ga"] else "D" for j in js]
        pts = lambda rs: sum(3 if r == "V" else 1 if r == "E" else 0 for r in rs)
        casa = [r for j, r in zip(js, res) if j["casa"]]
        fora = [r for j, r in zip(js, res) if not j["casa"]]
        # quando marca e quando sofre (só os jogos em que os lances batem com o placar)
        pro, contra = [0] * 6, [0] * 6
        frente = {"V": 0, "E": 0, "D": 0}
        atras = {"V": 0, "E": 0, "D": 0}
        pen = gc_fav = tarde = tarde_dec = 0
        com_lances = 0
        for j, r in zip(js, res):
            if j["gols"] is None:
                continue
            com_lances += 1
            e = j["e"]
            for g in j["gols"]:
                f = _faixa(g[0])
                if f is None:
                    continue
                (pro if g[2] == e else contra)[f] += 1
                if g[2] == e:
                    pen += g[4] == "p"
                    gc_fav += g[4] == "c"
                    tarde += (g[0] or 0) >= 80
            if j["gols"]:
                (frente if j["gols"][0][2] == e else atras)[r] += 1
            # pontos que vieram de gols depois dos 80': o resultado final menos o que seria sem esses gols
            sem = j["gf"] - sum(1 for g in j["gols"] if g[2] == e and (g[0] or 0) >= 80)
            p_sem = 3 if sem > j["ga"] else 1 if sem == j["ga"] else 0
            tarde_dec += (3 if r == "V" else 1 if r == "E" else 0) - p_sem
        # sequências
        def seq(cond):
            best = cur = 0
            for r in res:
                cur = cur + 1 if cond(r) else 0
                best = max(best, cur)
            return best
        atual_inv = 0
        for r in reversed(res):
            if r == "D":
                break
            atual_inv += 1
        maior = max(js, key=lambda j: (j["gf"] - j["ga"], j["gf"]))
        b = a["box"]
        passes, certos = sum(x.get("passes") or 0 for x in b), sum(x.get("passesCertos") or 0 for x in b)
        chutes, alvo = sum(x.get("chutes") or 0 for x in b), sum(x.get("noAlvo") or 0 for x in b)
        gf, ga = sum(j["gf"] for j in js), sum(j["ga"] for j in js)
        out[cid] = {
            "jogos": n, "pontos": pts(res), "aprov": pct(pts(res), 3 * n), "gf": gf, "ga": ga,
            "casa": {"j": len(casa), "pts": pts(casa), "aprov": pct(pts(casa), 3 * len(casa))},
            "fora": {"j": len(fora), "pts": pts(fora), "aprov": pct(pts(fora), 3 * len(fora))},
            "media": {k: media(b, k) for k in ("posse", "chutes", "noAlvo", "escanteios", "faltas", "passes", "desarmes", "interceptacoes", "defesas", "impedimentos", "cortes", "amarelos")},
            "sofre": {"chutes": media(a["contra"], "chutes"), "noAlvo": media(a["contra"], "noAlvo")},
            "precisaoPasse": pct(certos, passes), "conversao": pct(gf, chutes), "pontaria": pct(alvo, chutes),
            "golsPorJogo": round(gf / n, 2), "sofridosPorJogo": round(ga / n, 2),
            "faixas": {"pro": pro, "contra": contra, "rotulos": FAIXAS}, "comLances": com_lances,
            "tempos": {"pro": [sum(pro[:3]), sum(pro[3:])], "contra": [sum(contra[:3]), sum(contra[3:])]},
            "saiuNaFrente": frente, "saiuAtras": atras, "pontosBuscados": 3 * atras["V"] + atras["E"],
            "semSofrer": sum(1 for j in js if j["ga"] == 0), "semMarcar": sum(1 for j in js if j["gf"] == 0),
            "penaltis": pen, "golsContraAFavor": gc_fav, "golsApos80": tarde, "pontosApos80": tarde_dec,
            "sequencias": {"vitorias": seq(lambda r: r == "V"), "invicta": seq(lambda r: r != "D"), "invictaAtual": atual_inv, "semVencer": seq(lambda r: r != "V")},
            "maiorVitoria": {"gf": maior["gf"], "ga": maior["ga"], "op": maior["op"], "date": maior["date"], "casa": maior["casa"]} if maior["gf"] > maior["ga"] else None,
            "ultimos": res[-10:],
        }
        out[cid]["destaques"] = raio_x_jogadores(cid, matches, squads)

    # posição do clube em cada número e a média da liga
    METRICAS = {  # caminho no dicionário e se "mais é melhor"
        "posse": (("media", "posse"), True), "chutes": (("media", "chutes"), True), "noAlvo": (("media", "noAlvo"), True),
        "escanteios": (("media", "escanteios"), True), "passes": (("media", "passes"), True), "precisaoPasse": (("precisaoPasse",), True),
        "desarmes": (("media", "desarmes"), True), "interceptacoes": (("media", "interceptacoes"), True), "defesas": (("media", "defesas"), True),
        "faltas": (("media", "faltas"), False), "amarelos": (("media", "amarelos"), False), "chutesSofridos": (("sofre", "chutes"), False),
        "noAlvoSofridos": (("sofre", "noAlvo"), False), "conversao": (("conversao",), True), "pontaria": (("pontaria",), True),
        "golsPorJogo": (("golsPorJogo",), True), "sofridosPorJogo": (("sofridosPorJogo",), False), "semSofrer": (("semSofrer",), True),
        "pontosBuscados": (("pontosBuscados",), True), "golsApos80": (("golsApos80",), True), "aprovCasa": (("casa", "aprov"), True),
        "aprovFora": (("fora", "aprov"), True), "cortes": (("media", "cortes"), True), "pontosApos80": (("pontosApos80",), True),
    }

    def val(d, path):
        for k in path:
            d = (d or {}).get(k)
        return d

    liga = {}
    for nome, (path, alto) in METRICAS.items():
        vs = {cid: val(d, path) for cid, d in out.items() if val(d, path) is not None}
        if not vs:
            continue
        liga[nome] = {"media": round(sum(vs.values()) / len(vs), 2), "max": max(vs.values()), "min": min(vs.values()), "maisEMelhor": alto}
        ordem = sorted(vs, key=lambda c: vs[c], reverse=alto)
        for cid in vs:
            # empate: mesma posição
            out[cid].setdefault("ranks", {})[nome] = 1 + sum(1 for c in ordem if (vs[c] > vs[cid] if alto else vs[c] < vs[cid]))
    return {"updated": time.strftime("%d/%m/%Y às %H:%M"), "clubs": out, "liga": liga, "fonte": "súmulas e estatísticas das partidas da ESPN (Brasileirão)"}


def raio_x_jogadores(cid, matches, squads):
    """Destaques individuais no Brasileirão: quem mais finaliza, quem converte melhor, participações em gol e minutos por gol."""
    espn = str(CLUBS[cid]["espn"])
    no_clube = {r[4] for r in squads.get(cid, [])}
    acc = {}
    for m in matches.values():
        for r in m.get("teams", {}).get(espn, []):
            p = acc.setdefault(r[0], {"id": r[0], "name": r[1], "jogos": 0, "min": 0, "gols": 0, "assist": 0, "chutes": 0, "noAlvo": 0})
            p["jogos"] += 1
            p["min"] += r[3] or 0
            p["gols"] += r[6] or 0
            p["assist"] += r[7] or 0
            p["chutes"] += r[8] or 0
            p["noAlvo"] += r[9] or 0
    ps = [dict(p, noClube=p["id"] in no_clube) for p in acc.values()]
    top = lambda key, filtro, n=3: [p for p in sorted([p for p in ps if filtro(p)], key=key)][:n]
    pick = lambda p, *ks: {k: p[k] for k in ("id", "name", "noClube", *ks)}
    return {
        "finalizadores": [pick(p, "chutes", "noAlvo", "jogos") for p in top(lambda p: (-p["chutes"], -p["noAlvo"]), lambda p: p["chutes"] > 0)],
        "participacoes": [pick(p, "gols", "assist", "jogos") for p in top(lambda p: (-(p["gols"] + p["assist"]), -p["gols"]), lambda p: p["gols"] + p["assist"] > 0)],
        "conversao": [dict(pick(p, "gols", "chutes"), pct=round(100 * p["gols"] / p["chutes"], 1)) for p in top(lambda p: -p["gols"] / p["chutes"], lambda p: p["chutes"] >= 15 and p["gols"] >= 2)],
        "minutosPorGol": [dict(pick(p, "gols", "min"), mpg=round(p["min"] / p["gols"])) for p in top(lambda p: p["min"] / p["gols"], lambda p: p["gols"] >= 3)],
        "garcons": [pick(p, "assist", "jogos") for p in top(lambda p: (-p["assist"], -p["jogos"]), lambda p: p["assist"] > 0)],
    }


AGREGADORES = re.compile(r"fotmob|365scores|sofascore|flashscore|soccerway|transfermarkt|ogol|footystats|fbref|whoscored|besoccer|espn|onefootball", re.I)


def paginas_torcida():
    """Páginas de estatística mantidas por torcedores (créditos no site): o perfil, o que a imprensa publicou citando a página
    (só título, fonte, data e link) e, com a chave da API oficial do X, as publicações recentes."""
    cfg = CONFIG.get("paginas_estatistica") or {}
    out = {}
    for cid, paginas in cfg.items():
        if cid not in CLUBS:
            continue
        lst = []
        for p in paginas:
            if not X_HANDLE.match(p.get("x") or ""):
                continue
            imprensa = []
            try:
                busca = p.get("busca") or p["nome"]
                # só reportagens que citam a página (não agregadores de resultados, que usam "stats" como palavra comum)
                for it in news_query(f'"{busca}" (segundo OR levantamento OR dados OR perfil OR página OR apontou OR números) when:120d'):
                    if "x.com" in (it.get("link") or "") or AGREGADORES.search(it.get("source") or "") or len(imprensa) >= 3:
                        continue
                    imprensa.append({k: it.get(k) for k in ("title", "link", "source", "ts")})
            except Exception as ex:
                log("páginas da torcida", cid, ex)
            time.sleep(0.3)
            posts = []
            try:
                posts = [{k: x.get(k) for k in ("texto", "link", "ts")} for x in x_posts([p["x"]], "")][:3]
            except Exception as ex:
                log("X", p["x"], ex)
            lst.append({"nome": p["nome"], "x": p["x"], "sobre": p.get("sobre", ""), "imprensa": imprensa, "posts": posts})
        out[cid] = lst
    return out


def update_raiox():
    with lock:
        squads = state["squads"] or {}
    if not squads:
        src = open(os.path.join(ROOT, "js", "squads.js"), encoding="utf-8").read()
        squads = json.loads(src[src.index("window.SQUADS = ") + 16:src.index("window.SQUADS_LAST")].strip().rstrip(";"))
    rx = raio_x(load_matches(), squads)
    try:
        rx["torcida"] = paginas_torcida()
    except Exception as ex:
        log("páginas da torcida", ex)
        rx["torcida"] = {}
    rx["gerais"] = [{k: p.get(k) for k in ("nome", "x", "sobre")} for p in CONFIG.get("paginas_estatistica_gerais", []) if X_HANDLE.match(p.get("x") or "")]
    with lock:
        state["raiox"] = rx
    log("raio-x:", len(rx["clubs"]), "clubes")
    return rx


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
                                            f"window.{var} = " + json.dumps(clean_deep(data), ensure_ascii=False) + ";\n")
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
    elenco_novo = False
    try:
        elenco_novo = update_squads_horario()
    except Exception as ex:
        log("falha em elenco", ex)
    steps = [("tabela e jogos", update_standings_and_fixtures), ("notícias", update_news), ("manchetes", update_headlines), ("arbitragem", update_referees), ("jogadores", update_players), ("raio-x", update_raiox), ("departamento médico", update_dm), ("histórico", update_form), ("jogadores da temporada", update_jogadores), ("competições", update_competicoes), ("mercado", update_mercado), ("fontes do elenco", update_fontes_elenco), ("escalações anunciadas", update_escalacoes)]
    for name, fn in steps:  # uma etapa que falhar não impede as outras
        try:
            fn()
        except Exception as ex:
            log("falha em", name, ex)
    with lock:
        live = {k: state.get(k) for k in ("updated", "standings", "round", "fixtures", "scorers")}
        live["manchetes"] = state.get("manchetes")
        live["arbitragem"] = state.get("arbitragem")
        live["news"] = {cid: [{k: x.get(k) for k in ("title", "link", "source", "ts", "tag")} for x in items[:8]] for cid, items in (state.get("news") or {}).items()}
        players, form, positions, dm, raiox = state.get("players"), state.get("form"), state.get("positions"), state.get("dm"), state.get("raiox")
    if live["standings"]:
        write_js("live-data.js", "LIVE_DATA", live, "tabela, jogos e manchetes (só título, fonte e link). Fontes: ESPN, CBF, Google Notícias")
    if players:
        write_js("player-stats.js", "PLAYER_STATS", players, "estatísticas de jogadores. Súmulas: ESPN · lesões: manchetes que citam o jogador")
    if raiox and raiox.get("clubs"):
        write_js("raio-x.js", "RAIO_X", raiox, "Raio-X tático de cada clube no Brasileirão e as páginas de estatística da torcida (créditos). Fonte: súmulas da ESPN")
    if dm and dm.get("clubs"):
        write_js("departamento-medico.js", "DM", dm, "departamento médico da temporada (quem está e quem já passou). Fontes: imprensa nacional e local, sites oficiais, setoristas e súmulas da ESPN")
    if form:
        write_js("club-form.js", "CLUB_FORM", form, "temporada de cada clube, últimos 5 e próximos 5 jogos. Fonte: ESPN")
    with lock:
        jg = state.get("jogadores")
    if jg:
        JOG.gravar_js(jg)
    with lock:
        cp = state.get("competicoes")
    if cp:
        COMP.gravar_js(cp)
    with lock:
        mc = state.get("mercado")
        escl = state.get("escalacoes")
    if mc:
        MERC.gravar_js(mc, MERC._ler("mercado-global.json"))
    if escl is not None:
        ESCL.gravar_js(escl)
    if elenco_novo:
        try:
            gravar_elenco()
        except Exception as ex:
            log("falha ao gravar o elenco", ex)
    if positions and positions.get("players"):
        write_js("heatmaps.js", "HEATMAPS", positions, "posições de cada jogador no Brasileirão (minutos por posição), base do mapa de calor estimado. Fonte: escalações da ESPN")


def news_query(q):
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": q, "hl": "pt-BR", "gl": "BR", "ceid": "BR:pt-419"})
    raw = get(url)
    if re.search(rb"<!(DOCTYPE|ENTITY)", raw, re.I):
        raise ValueError("RSS com declarações não permitidas")
    root = ET.fromstring(raw)
    out = []
    for it in root.iter("item"):
        src = it.find("source")
        pub = it.findtext("pubDate")
        try:
            ts = email.utils.parsedate_to_datetime(pub).timestamp()
        except Exception:
            ts = 0
        link = clean_link(it.findtext("link"))
        if not link:
            continue
        out.append({"title": clean_text((it.findtext("title") or "").rsplit(" - ", 1)[0], 300), "link": link,
                    "source": clean_text(src.text if src is not None else "", 80), "ts": ts})
    return out


# palavras que viram "falso positivo" no título: "Inter de Milão", "Danilo Santos" (sobrenome), "vitória" (a palavra)...
NOT_CLUB = {
    "internacional": r"Inter (de Mil[aã]o|Miami)|Internacional de Lime",
    "santos": r"\b(?!(?:O|A|E|Do|Da|Dos|No|Na|Ao|Pelo|Pela|Contra|Sobre|Para|Com|Até)\b)[A-ZÁÉÍÓÚÂÊÔÃÕ][a-záéíóúâêôãõç]+ Santos\b|Nilton Santos|\bd[oa]s Santos\b|\bSantos \(SP\)|Todos os Santos",
    "sao-paulo": r"(Prefeitura|Estado|Governo|cidade|Grande|Bienal|metrô) d?e? ?São Paulo|Marginal",
    "bahia": r"(Governo|Estado|interior) da Bahia",
}


# nomes que também são palavra, cidade ou estado: além do nome, o título precisa falar de futebol
AMBIGUOUS = {"santos", "vitoria", "sao-paulo", "remo"}
FOOTBALL = (r"\b(x|vence|venceu|vencer|perde|perdeu|empata|empatam|empate|gols?|técnico|treinador|interino|elenco|jogador(es)?|atacante|zagueiro|volante|meia|goleiro|"
            r"lateral|reforços?|contrata[rç]?|contratação|Brasileirão|Série [AB]|Copa|campeonato|clássico|torcida|torcedores|rodada|escalaç(ão|ões)|ao vivo|placar|time|clube|"
            r"STJD|CBF|Libertadores|Sul-Americana|rebaixa(mento|do|da)?|Z-?4|G-?\d|tabela|partida|jogo|estádio|treinos?|treina|lesão|desfalques?|vitória|derrota|virada|"
            r"contrato|salários?|direitos de imagem|patrocin\w*|camisa|uniforme|sócios?|ingressos?|renova\w*|negocia\w*|proposta|multa|dívidas?|estreia|torneio|FPF|Paulistão|estadual|fora d[oa]|"
            r"Neymar|Vila Belmiro|Barradão|Morumbi|MorumBIS|Baenão|Fonte Nova|Ba-Vi|Re-Pa|Majestoso|San-São|Choque-Rei|boletim|diretoria|presidente|SAF|base|sub-\d+)\b")


def about_club(cid, title):
    """A notícia é do clube? O título tem de falar dele (nome ou apelido próprio, palavra inteira, com maiúscula).
    Fica de fora quem só cita o clube como passado de alguém ("ex-Flamengo") ou um homônimo."""
    import re
    c = CLUBS[cid]
    names = c.get("apelidos") or [c["busca"]]
    t = title
    if NOT_CLUB.get(cid):
        t = re.sub(NOT_CLUB[cid], " ", t)
    if cid in AMBIGUOUS:
        ctx = t
        for n in names:
            ctx = re.sub(rf"(?<![\wÀ-ÿ]){re.escape(n)}(?![\wÀ-ÿ])", " ", ctx)
        if not re.search(FOOTBALL, ctx, re.I):
            return False
    for n in names:
        for m in re.finditer(rf"(?<![\wÀ-ÿ]){re.escape(n)}(?![\wÀ-ÿ])", t):
            # "Botafogo-SP", "Botafogo-PB": outro clube com o mesmo nome
            if re.match(r"-[A-Z]{2}\b", t[m.end():]) and not re.search(r"-[A-Z]{2}$", n):
                continue
            # "ex-Flamengo" e também "ex-Flamengo e Atlético-MG" (o "ex" vale para os dois)
            if re.search(r"ex-(?:[\wÀ-ÿ-]+(?:,| e) )*$", t[:m.start()], re.I):
                continue
            # "vitória" como palavra: só conta o clube quando não é "vitória do/da/de/sobre..." (a vitória de alguém)
            if cid == "vitoria" and re.match(r"\s+(d[oae]s?|sobre|no|na|em|por|contra|fora|em casa|magra|suada|histórica)\b", t[m.end():], re.I):
                continue
            return True
    return False


def update_news():
    sites = " OR ".join(f"site:{s}" for s in CONFIG["fontes"])
    for cid, c in CLUBS.items():
        items = []
        try:
            # busca pelo nome (no título, quando dá) e filtra: só fica o que é do clube
            terms = " OR ".join(f'intitle:"{n}"' for n in (c.get("apelidos") or [c["busca"]])[:3])
            items += [dict(x, tag="clube") for x in news_query(f'({terms}) ({sites}) when:3d')]
            if reps(c):
                items += [dict(x, tag="setorista") for x in news_query(f'({reps_query(c)}) "{c["busca"]}" when:3d')]
            items = [x for x in items if about_club(cid, x["title"])]
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


# ---------------------------------------------------------------------------
# Manchetes do futebol (a faixa de notícias embaixo do menu)
# ---------------------------------------------------------------------------
HEADLINE_QUERIES = [
    "Brasileirão OR \"Série A\" OR \"Série B\"",
    "\"Copa do Brasil\" OR Libertadores OR \"Sul-Americana\"",
    "\"Seleção Brasileira\" OR Ancelotti OR \"Copa do Mundo\"",
    "futebol OR técnico OR contratação OR reforço",
]


def headline_key(title):
    """Duas manchetes sobre o mesmo fato costumam repetir as primeiras palavras: compara as 6 primeiras, sem acento."""
    w = re.sub(r"[^a-z0-9 ]", " ", strip_accents(title).lower()).split()
    return " ".join(x for x in w if len(x) > 2)[:48]


def update_headlines():
    """As principais notícias do futebol nas últimas 24 h, dos portais configurados: as mais recentes primeiro,
    sem repetir o mesmo fato, no máximo 3 por portal (para a faixa não ficar só com um site) e só de futebol."""
    sites = " OR ".join(f"site:{x}" for x in CONFIG["fontes"])
    items = []
    for q in HEADLINE_QUERIES:
        try:
            items += news_query(f"({q}) ({sites}) when:1d")
        except Exception as ex:
            log("manchetes", q, ex)
        time.sleep(1)
    names = [n for c in CLUBS.values() for n in (c.get("apelidos") or [c["busca"]])]
    clubs_re = r"\b(" + "|".join(re.escape(n) for n in names) + r")\b"
    seen, per_site, out = set(), {}, []
    for x in sorted(items, key=lambda x: -x["ts"]):
        t = x["title"]
        # só os portais configurados (o Google às vezes inclui outros sites na busca)
        if CONFIG.get("fontes_nomes") and x["source"] not in CONFIG["fontes_nomes"]:
            continue
        if not t or not (re.search(FOOTBALL, t, re.I) or re.search(clubs_re, t)):
            continue
        k = headline_key(t)
        if k in seen or per_site.get(x["source"], 0) >= 3:
            continue
        seen.add(k)
        per_site[x["source"]] = per_site.get(x["source"], 0) + 1
        clubs = sorted({cid for cid in CLUBS if about_club(cid, t)})
        out.append({**{k2: x[k2] for k2 in ("title", "link", "source", "ts")}, "clubes": clubs})
        if len(out) >= 14:
            break
    if out:
        with lock:
            state["manchetes"] = {"updated": time.strftime("%d/%m/%Y às %H:%M"), "items": out}
    log("manchetes atualizadas:", len(out))


# ---------------------------------------------------------------------------
# Arbitragem dos próximos jogos (pelas manchetes)
# A escala oficial é da CBF, cujos termos de uso proíbem reutilizar os dados do site. Por isso a API acompanha
# as manchetes dos veículos (só título, fonte, data e link) e, quando o título traz o nome do árbitro,
# mostra o nome. Um nome só vale se estiver na lista de árbitros aprendida com manchetes do tipo
# "Fulano apita...", "CBF escala Fulano..." ou "com Fulano no apito" (não confunde com jogador ou técnico).
# ---------------------------------------------------------------------------
UP = "A-ZÁÉÍÓÚÂÊÔÃÕÇ"
LOW = "a-záéíóúâêôãõçü"
NAME = rf"([{UP}][{LOW}]+(?:\s+(?:d[aeo]s?\s+)?[{UP}][{LOW}]+){{1,4}})"
REF_PATTERNS = [
    rf"{NAME}\s+(?:vai\s+)?apita(?:rá|r)?\b",
    rf"{NAME}\s+(?:é|foi|está)\s+escalad[oa]\b",
    rf"{NAME}\s+será\s+o\s+árbitro\b",
    rf"{NAME}\s+(?:comanda|comandará|vai comandar|volta a comandar|volta a apitar)\b",
    rf"(?:CBF\s+)?(?:escala|define|confirma|sorteia)\s+{NAME}\s+(?:para|no|na|em|como)\b",
    rf"\b(?:árbitro|árbitra|arbitragem de|apito de)\s+{NAME}",
    rf"\b[Cc]om\s+{NAME}\s+no\s+apito\b",
    rf"\bterá\s+{NAME}\s+(?:no\s+apito|no\s+comando|como\s+árbitro)\b",
    rf"\breencontra\s+(?:o\s+árbitro\s+)?{NAME}",
]
NOT_REF = {"CBF", "VAR", "Brasileirão", "Série", "Copa", "Campeonato", "Onde", "Veja", "Saiba", "Confira", "Comissão", "Arbitragem",
           "Ao", "Rodada", "Libertadores", "Brasil", "Seleção", "Árbitro", "Árbitra", "Técnico", "Presidente", "Torcida", "Clássico", "Jogo", "Santa", "Estádio", "Arena"}
REF_WORDS = r"\b(apit\w*|árbitr[oa]s?|arbitragem|escala(?!ç)\w*|comandar?\w*|reencontra|apito|VAR|juiz|juíza)\b"
REF_QUERIES = ["(apita OR \"vai apitar\" OR \"no apito\") (Brasileirão OR \"Série A\")",
               "(\"escala de arbitragem\" OR \"define arbitragem\" OR \"árbitro escalado\") Brasileirão"]


def ref_names(title):
    """Nomes de árbitro que o título apresenta como árbitro ("Fulano apita...", "com Fulano no apito")."""
    out = []
    for pat in REF_PATTERNS:
        for m in re.finditer(pat, title):
            n = m.group(1).strip()
            alias = [x for c in CLUBS.values() for x in (c.get("apelidos") or [c["busca"]])]
            if n.split()[0] in NOT_REF or any(x in n for x in alias) or len(n) < 8:
                continue
            out.append(n)
    return out


def known_refs():
    """Lista de árbitros aprendida com as manchetes (guardada entre as atualizações)."""
    refs = set(state.get("arbitros") or [])
    if refs and time.time() - state.get("arbitros_em", 0) < 6 * 3600:
        return refs
    if not refs and os.path.exists(LIVE_DATA_FILE):  # sem cache: a última lista gravada no site
        try:
            src = open(LIVE_DATA_FILE, encoding="utf-8").read()
            refs = set((json.loads(src[src.index("{"):src.rindex("}") + 1]).get("arbitragem") or {}).get("arbitros") or [])
        except Exception:
            pass
    # busca geral e uma por clube ("Fulano apita o Flamengo..."): a lista cresce a cada atualização
    qs = [f"{q} when:120d" for q in REF_QUERIES] + [f'"{(c.get("apelidos") or [c["busca"]])[0]}" (apita OR "no apito" OR "árbitro escalado" OR "escala de arbitragem") when:90d' for c in CLUBS.values()]
    refs = {r for r in refs if r.split()[0] not in NOT_REF}
    for q in qs:
        try:
            for x in news_query(q):
                refs.update(ref_names(x["title"]))
        except Exception as ex:
            log("árbitros", ex)
        time.sleep(1)
    state["arbitros"] = sorted(refs)
    state["arbitros_em"] = time.time()
    return refs


def update_referees():
    """Para cada jogo dos próximos 8 dias, as manchetes sobre a arbitragem dele e, se o título trouxer, o árbitro."""
    with lock:
        fixtures = state["fixtures"] or {}
    refs = known_refs()
    games = [g for gs in fixtures.values() for g in gs]
    now = time.time()
    # último jogo de cada clube antes deste: manchete mais antiga que ele fala de outro jogo
    played = {}
    for g in games:
        k = kickoff(g)
        if k and k < now:
            for c in g[:2]:
                played[c] = max(played.get(c, 0), k)
    out = {}
    for g in games:
        k = kickoff(g)
        if not k or k < now - 3 * 3600 or k > now + 8 * 86400:
            continue
        h, a = g[0], g[1]
        H, A = CLUBS[h], CLUBS[a]
        nh, na = (H.get("apelidos") or [H["busca"]])[0], (A.get("apelidos") or [A["busca"]])[0]
        try:
            items = news_query(f'"{nh}" "{na}" (arbitragem OR árbitro OR apita OR apito OR "escala de arbitragem") when:10d')
        except Exception as ex:
            log("arbitragem", h, a, ex)
            continue
        since = max(played.get(h, 0), played.get(a, 0)) - 6 * 3600
        found, names = [], {}
        for x in sorted(items, key=lambda x: -x["ts"]):
            t = x["title"]
            if x["ts"] < since or not re.search(REF_WORDS, t, re.I):
                continue
            both, one = about_club(h, t) and about_club(a, t), about_club(h, t) or about_club(a, t)
            who = [n for n in refs if n in t]
            if not (both or (one and who)):
                continue
            for n in who:
                names[n] = names.get(n, 0) + (2 if both else 1)
            found.append({"title": t, "link": x["link"], "source": x["source"], "ts": x["ts"], "nome": bool(who)})
        uniq = {}
        found.sort(key=lambda f: (not f["nome"], -f["ts"]))  # a manchete que traz o nome do árbitro vem primeiro
        for f in found:
            uniq.setdefault(headline_key(f["title"]), f)
        ref = max(names.items(), key=lambda x: x[1])[0] if names else None
        out[g[7] or f"{h}|{a}"] = {"arbitro": ref, "confirmacoes": names.get(ref, 0) if ref else 0, "manchetes": list(uniq.values())[:4]}
        time.sleep(1)
    with lock:
        state["arbitragem"] = {"updated": time.strftime("%d/%m/%Y às %H:%M"), "jogos": out, "arbitros": state.get("arbitros", [])}
    log("arbitragem:", sum(1 for v in out.values() if v["arbitro"]), "árbitros em", len(out), "jogos")


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
summary_cache = OrderedDict()
SUMMARY_MAX = 300


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
    summary_cache.move_to_end(eid)
    while len(summary_cache) > SUMMARY_MAX:
        summary_cache.popitem(last=False)
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
        # a ESPN às vezes repete o mesmo lance no mesmo minuto
        if text and not (lines and lines[-1]["text"] == text and lines[-1]["min"] == clock):
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
# endereço em que o servidor escuta: só este computador, a não ser que HOST diga outro (ex.: HOST=0.0.0.0 num servidor)
HOST = os.environ.get("HOST", "127.0.0.1")
# sites que podem ler a API de outro endereço (a própria página do servidor sempre pode)
ORIGENS = {o.strip().rstrip("/") for o in os.environ.get(
    "ORIGENS", "https://alansouzadev7.github.io,http://localhost:8000,http://127.0.0.1:8000").split(",") if o.strip()}
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; "
       "img-src 'self' data: blob: https://a.espncdn.com https://*.wikimedia.org https://*.wikipedia.org https://live.staticflickr.com https://media.api-sports.io https://r2.thesportsdb.com; "
       "connect-src 'self' https://site.web.api.espn.com https://site.api.espn.com https://*.workers.dev; media-src 'self' blob:; manifest-src 'self'; "
       "worker-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
SEC_HEADERS = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "X-Permitted-Cross-Domain-Policies": "none",
}
# só isto é servido como arquivo; o resto da pasta (código do servidor, cache, .git, testes, chaves locais) nunca sai
STATIC_OK = re.compile(r"^/(?:|index\.html|manifest\.webmanifest|(?:css|js|assets|prints)/[A-Za-z0-9._\-/%]+)$")
MAX_URL = 2048
EVENT_OK = re.compile(r"^\d{4,12}$")
# limites por endereço de quem acessa (janela de 60 s)
LIMITE_API, LIMITE_ARQUIVOS = 120, 900
STREAMS_MAX, STREAMS_POR_IP, STREAM_HORAS = 40, 3, 4
_hits, _hits_lock = {}, threading.Lock()
_streams, _streams_ip = threading.BoundedSemaphore(STREAMS_MAX), {}


def allow(ip, kind, limit):
    """Janela deslizante de 60 s por endereço: True se ainda cabe."""
    now = time.monotonic()
    with _hits_lock:
        q = _hits.setdefault((ip, kind), deque())
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        if len(_hits) > 20000:   # memória limitada: esquece quem não acessa há mais de 1 min
            for k in [k for k, v in _hits.items() if not v or now - v[-1] > 60]:
                _hits.pop(k, None)
        return True


class Handler(SimpleHTTPRequestHandler):
    server_version = "PLACAR"
    sys_version = ""
    timeout = 20                      # conexão parada (ataque de conexão lenta) cai em 20 s
    error_content_type = "text/plain; charset=utf-8"
    error_message_format = "%(code)d %(message)s\n"

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        line = CONTROL.sub("", fmt % args)[:500]
        if "/api/" in line or '" 4' in line or '" 5' in line:
            log(self.client_address[0], line)

    # ---- cabeçalhos de segurança em toda resposta
    def end_headers(self):
        for k, v in SEC_HEADERS.items():
            self.send_header(k, v)
        if self.headers and self.headers.get("X-Forwarded-Proto", "") == "https":
            self.send_header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        origin = ((self.headers.get("Origin") if self.headers else "") or "").rstrip("/")
        if origin and origin in ORIGENS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        super().end_headers()

    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def list_directory(self, path):   # sem listagem de pastas
        self.send_error(404)
        return None

    def static_ok(self, path):
        dec = urllib.parse.unquote(path)
        if any(c in dec for c in ("\\", "\x00", ":")) or "/." in dec or ".." in dec:
            return False
        return bool(STATIC_OK.match(path))

    def guard(self):
        """Comum a toda requisição: tamanho do endereço e limite de acessos. False = já respondeu."""
        if len(self.path) > MAX_URL:
            self.send_error(414)
            return False
        api = self.path.startswith("/api/") or self.path == "/api"
        if not allow(self.client_address[0], "api" if api else "arq", LIMITE_API if api else LIMITE_ARQUIVOS):
            self.send_response(429)
            self.send_header("Retry-After", "60")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return False
        return True

    def do_HEAD(self):
        self.do_GET()

    def do_OPTIONS(self):
        if not self.guard():
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def refuse(self):
        self.send_response(405)
        self.send_header("Allow", "GET, HEAD, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        """Só /api/busca: conta uma busca (clube ou jogador conhecido). Corpo JSON de até 200 bytes, sem cookies nem dados pessoais."""
        if not self.guard():
            return
        if urllib.parse.urlparse(self.path).path != "/api/busca":
            return self.refuse()
        if not allow(self.client_address[0], "busca", 30):
            return self.send_json({"ok": False, "message": "muitas buscas"}, 429)
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = -1
        if n <= 0 or n > 200:
            return self.send_json({"ok": False, "message": "corpo inválido"}, 400)
        try:
            d = json.loads(self.rfile.read(n).decode("utf-8"))
            t, i = d.get("t"), str(d.get("id"))
        except Exception:
            return self.send_json({"ok": False, "message": "corpo inválido"}, 400)
        if t not in ("c", "j") or not re.fullmatch(r"[a-z0-9-]{1,30}", i):
            return self.send_json({"ok": False, "message": "busca inválida"}, 400)
        return self.send_json({"ok": contar_busca(t, i)}, 200)

    do_PUT = do_DELETE = do_PATCH = do_TRACE = do_CONNECT = refuse

    def do_GET(self):
        if not self.guard():
            return
        u = urllib.parse.urlparse(self.path)
        try:
            q = urllib.parse.parse_qs(u.query, max_num_fields=10)
        except ValueError:
            return self.send_json({"ok": False, "message": "consulta inválida"}, 400)
        parts = [p for p in u.path.split("/") if p]
        if not parts or parts[0] != "api":
            if not self.static_ok(u.path):
                return self.send_error(404)
            if self.command == "HEAD":
                return super().do_HEAD()
            return super().do_GET()
        one = lambda k: (q.get(k) or [None])[0]
        club = one("club")
        if club is not None and club not in CLUBS:
            return self.send_json({"ok": False, "message": "clube desconhecido"}, 400)
        try:
            if parts[1:] == ["health"]:
                with lock:
                    return self.send_json({"ok": True, "updated": state["updated"], "erros": len(state["errors"])})
            if parts[1:] == ["state"]:
                with lock:
                    s = {k: state[k] for k in ("updated", "standings", "round", "fixtures", "squads", "last", "scorers", "players", "form", "arbitragem", "dm") if k in state}
                if not s.get("standings"):
                    return self.send_json({"ok": False, "message": "carregando dados"}, 503)
                return self.send_json(s)
            if parts[1:] == ["artilharia-ao-vivo"]:
                jog = one("jogador")
                if jog is not None and not re.fullmatch(r"\d{1,12}", jog):
                    return self.send_json({"ok": False, "message": "jogador inválido"}, 400)
                r = live_scorers()
                return self.send_json(r["jogadores"].get(jog) or {"ok": False, "message": "jogador sem gols"} if jog else {k: r[k] for k in ("updated", "artilharia", "aoVivo")})
            if parts[1:] == ["tabela-ao-vivo"]:
                return self.send_json(live_table())
            if parts[1:] == ["rankings"]:
                tipo = one("tipo")
                if tipo and tipo not in RANK_ORDER:
                    return self.send_json({"ok": False, "message": f"tipo deve ser um de: {', '.join(RANK_ORDER)}"}, 400)
                r = rankings(tipo)
                return self.send_json(r) if r["rankings"] and r["updated"] else self.send_json({"ok": False, "message": "carregando dados"}, 503)
            if parts[1:] == ["retrospecto"]:
                with lock:
                    fm = state.get("form")
                if not fm:
                    return self.send_json({"ok": False, "message": "carregando dados"}, 503)
                return self.send_json({"updated": fm["updated"], "club": club, **fm["clubs"].get(club, {})} if club else fm)
            if parts[1:] == ["calendario"]:
                if not club:
                    return self.send_json({"ok": False, "message": "informe o clube (?club=id)"}, 400)
                mes = one("mes")
                if mes is not None and not re.fullmatch(r"20\d{2}-(0[1-9]|1[0-2])", mes):
                    return self.send_json({"ok": False, "message": "mês inválido (use AAAA-MM)"}, 400)
                with lock:
                    fm = state.get("form")
                if not fm:
                    return self.send_json({"ok": False, "message": "carregando dados"}, 503)
                jogos = (fm["clubs"].get(club) or {}).get("all", [])
                if mes:
                    jogos = [j for j in jogos if j["date"].startswith(mes)]
                comps = sorted({j["comp"] for j in jogos})
                return self.send_json({"updated": fm["updated"], "club": club, "mes": mes, "competicoes": comps, "jogos": jogos,
                                       "fontes": ["ESPN"] + (["API-Football"] if any(j.get("src") == "API-Football" for j in jogos) else [])})
            if parts[1:] == ["jogo"]:
                eid, lg = one("event"), one("lg")
                if not eid or not EVENT_OK.match(eid) or lg not in COMP_NAME:
                    return self.send_json({"ok": False, "message": "informe event (número do jogo na ESPN) e lg (liga)"}, 400)
                try:
                    return self.send_json(match_stats(eid, lg))
                except Exception as ex:
                    log("jogo", eid, ex)
                    return self.send_json({"ok": False, "message": "estatísticas indisponíveis"}, 502)
            if len(parts) == 3 and parts[1] == "competicao":
                if parts[2] not in COMP.COMPETICOES:
                    return self.send_json({"ok": False, "message": "competição desconhecida"}, 404)
                with lock:
                    cpd = (state.get("competicoes") or {}).get(parts[2])
                return self.send_json(cpd) if cpd else self.send_json({"ok": False, "message": "carregando dados"}, 503)
            if len(parts) == 3 and parts[1] == "mercado":
                if parts[2] not in CLUBS:
                    return self.send_json({"ok": False, "message": "clube desconhecido"}, 404)
                with lock:
                    md = (state.get("mercado") or {}).get(parts[2])
                return self.send_json(md) if md else self.send_json({"ok": False, "message": "carregando dados"}, 503)
            if len(parts) == 3 and parts[1] == "escalacoes":
                if parts[2] not in CLUBS:
                    return self.send_json({"ok": False, "message": "clube desconhecido"}, 404)
                with lock:
                    ed = (state.get("escalacoes") or {}).get(parts[2])
                return self.send_json(ed or {"confirmada": False, "fontes": [], "message": "sem jogo nas próximas 3 h"})
            if parts[1:] == ["mercado-global"]:
                with lock:
                    mg = state.get("mercado_global")
                return self.send_json(mg) if mg else self.send_json({"ok": False, "message": "carregando dados"}, 503)
            if parts[1:] == ["em-alta"]:
                return self.send_json(em_alta())
            if len(parts) == 3 and parts[1] == "jogador":
                # "216098" ou "216098-cruzeiro" (a ESPN às vezes usa o mesmo número para homônimos de clubes diferentes)
                m = re.fullmatch(r"(\d{1,12})(?:-([a-z-]{2,20}))?", parts[2])
                if not m or (m.group(2) and m.group(2) not in CLUBS):
                    return self.send_json({"ok": False, "message": "jogador inválido"}, 400)
                aid, so = m.group(1), m.group(2)
                with lock:
                    jg = state.get("jogadores") or {}
                for cid, d in jg.items():
                    if (not so or cid == so) and aid in d.get("jogadores", {}):
                        return self.send_json({"updated": d["updated"], "club": cid, "grade": d["grade"], "campos": d["campos"], "fontes": d["fontes"], "id": aid, **d["jogadores"][aid]})
                return self.send_json({"ok": False, "message": "jogador não encontrado"}, 404)
            if parts[1:] == ["elenco-temporada"]:
                if not club:
                    return self.send_json({"ok": False, "message": "informe o clube (?club=id)"}, 400)
                with lock:
                    d = (state.get("jogadores") or {}).get(club)
                return self.send_json(d) if d else self.send_json({"ok": False, "message": "carregando dados"}, 503)
            if parts[1:] == ["jogadores"]:
                with lock:
                    pl = state.get("players")
                if not pl:
                    return self.send_json({"ok": False, "message": "carregando dados"}, 503)
                if club:
                    return self.send_json({"updated": pl["updated"], "club": club, **pl["clubs"].get(club, {})})
                return self.send_json(pl)
            if parts[1:] == ["arbitragem"]:
                with lock:
                    m = state.get("arbitragem")
                return self.send_json(m) if m else self.send_json({"ok": False, "message": "carregando arbitragem"}, 503)
            if parts[1:] == ["departamento-medico"]:
                with lock:
                    m = state.get("dm") or dm_load()
                if not m:
                    return self.send_json({"ok": False, "message": "carregando departamento médico"}, 503)
                return self.send_json({"updated": m["updated"], "club": club, **m["clubs"].get(club, {})} if club else m)
            if parts[1:] == ["manchetes"]:
                with lock:
                    m = state.get("manchetes")
                return self.send_json(m) if m else self.send_json({"ok": False, "message": "carregando manchetes"}, 503)
            if parts[1:] == ["news"]:
                with lock:
                    return self.send_json({"club": club, "items": state["news"].get(club, []) if club else state["news"]})
            if len(parts) in (3, 4) and parts[1] == "minuto-a-minuto":
                eid = parts[2]
                if not EVENT_OK.match(eid):
                    return self.send_json({"ok": False, "message": "jogo inválido"}, 400)
                if len(parts) == 4:
                    if parts[3] != "stream":
                        return self.send_json({"ok": False, "message": "rota não encontrada"}, 404)
                    return self.stream(eid)
                n = narrate(eid)
                return self.send_json(n) if n else self.send_json({"ok": False, "message": "jogo não encontrado"}, 404)
            self.send_json({"ok": False, "message": "rota não encontrada"}, 404)
        except Exception:
            # o detalhe do erro fica só no registro do servidor; quem acessa recebe uma mensagem genérica
            log("erro em", CONTROL.sub("", self.path)[:200], traceback.format_exc(limit=3))
            self.send_json({"ok": False, "message": "erro interno"}, 500)

    def stream(self, eid):
        """Server-Sent Events: manda cada lance novo assim que aparece (com limite de conexões e de duração)."""
        ip = self.client_address[0]
        with _hits_lock:
            if _streams_ip.get(ip, 0) >= STREAMS_POR_IP:
                return self.send_json({"ok": False, "message": "conexões demais"}, 429)
            if not _streams.acquire(blocking=False):
                return self.send_json({"ok": False, "message": "servidor ocupado"}, 503)
            _streams_ip[ip] = _streams_ip.get(ip, 0) + 1
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            sent, fim = set(), time.monotonic() + STREAM_HORAS * 3600
            while time.monotonic() < fim:
                n = narrate(eid)
                if not n:
                    break
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
        except (BrokenPipeError, ConnectionResetError, TimeoutError, OSError):
            pass
        finally:
            with _hits_lock:
                _streams_ip[ip] = max(0, _streams_ip.get(ip, 1) - 1)
            _streams.release()


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
    every(iv.get("manchetes", 30), update_headlines)
    every(iv.get("arbitragem", 30), update_referees)
    every(iv.get("jogadores", 60), update_players)
    every(iv.get("departamento_medico", 60), update_dm)
    every(iv.get("retrospecto", 30), update_form)
    every(iv.get("jogadores_temporada", 60), update_jogadores)
    every(iv.get("jogadores_ao_vivo", 5), update_jogadores_ao_vivo)
    every(iv.get("competicoes", 15), update_competicoes)
    every(iv.get("mercado", 60), update_mercado)
    every(iv.get("escalacoes", 5), update_escalacoes)
    threading.Thread(target=live_loop, daemon=True).start()
    log(f"PLACAR no ar: http://{'localhost' if HOST in ('127.0.0.1', 'localhost') else HOST}:{port}")
    srv = ThreadingHTTPServer((HOST, port), Handler)
    srv.daemon_threads = True
    srv.request_queue_size = 64
    srv.serve_forever()


if __name__ == "__main__":
    if "--snapshot" in sys.argv:
        write_snapshot()
    else:
        main()
