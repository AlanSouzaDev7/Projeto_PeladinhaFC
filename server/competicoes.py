# © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE).
"""PLACAR — outras competições: Libertadores, Sul-Americana, Copa do Brasil e estaduais.

Para cada competição, da temporada atual:
- fases com datas (calendário da ESPN) e a fase em que o torneio está;
- todos os jogos (placar, pênaltis, local, fase, grupo), com os gols (autor e minuto) e os cartões de cada jogo;
- tabelas dos grupos (ESPN; sem elas, calculadas dos jogos);
- chaveamento do mata-mata (ida e volta somadas, pênaltis);
- artilharia, números de cada clube (gols, sofridos, cartões) e uma classificação geral de todos os jogos;
- manchetes da competição (Google Notícias: só título, veículo, data e link).
Fonte dos jogos: placar do dia da ESPN (um dia por consulta). Dias que já passaram ficam guardados para sempre;
os próximos dias são relidos de 12 em 12 h e os de hoje/ontem a cada execução.
Saída: js/competicoes/<id>.js (baixado só na página da competição).
"""
import json
import os
import re
import time
import calendar as cal
from concurrent.futures import ThreadPoolExecutor

P = None  # módulo placar_api, ligado em placar_api.py

COMPETICOES = {
    "libertadores": {"lg": "conmebol.libertadores", "nome": "Libertadores", "tipo": "copa"},
    "sul-americana": {"lg": "conmebol.sudamericana", "nome": "Sul-Americana", "tipo": "copa"},
    "copa-do-brasil": {"lg": "bra.copa_do_brazil", "nome": "Copa do Brasil", "tipo": "mata"},
    "paulistao": {"lg": "bra.camp.paulista", "nome": "Paulistão", "tipo": "estadual", "uf": "SP"},
    "carioca": {"lg": "bra.camp.carioca", "nome": "Carioca", "tipo": "estadual", "uf": "RJ"},
    "mineiro": {"lg": "bra.camp.mineiro", "nome": "Mineiro", "tipo": "estadual", "uf": "MG"},
    "gauchao": {"lg": "bra.camp.gaucho", "nome": "Gauchão", "tipo": "estadual", "uf": "RS"},
}
SB = "https://site.api.espn.com/apis/site/v2/sports/soccer"
ST = "https://site.web.api.espn.com/apis/v2/sports/soccer"

# fases: nome da ESPN -> nome em português e se é mata-mata
FASES = [
    (r"first[- ]stage|first[- ]round|1st", "1ª fase"), (r"second[- ]stage|second[- ]round", "2ª fase"), (r"third[- ]stage|third[- ]round", "3ª fase"),
    (r"fourth[- ]round", "4ª fase"), (r"fifth[- ]round", "5ª fase"), (r"knockout[- ]round[- ]playoffs|playoff", "Playoffs"),
    (r"round[- ]of[- ]16|rd of 16", "Oitavas de final"), (r"quarter", "Quartas de final"), (r"semi", "Semifinal"), (r"^finals?$|^final$", "Final"),
    (r"group|league[- ]phase|taca[- ]guanabara$|^first[- ]phase", "Fase de grupos"), (r"relegation", "Rebaixamento"),
]
FASE_ESPECIAL = {"league-phase": "Primeira fase", "regular-season": "Primeira fase", "relegation-stage": "Grupo do rebaixamento"}
# nomes próprios de taças e troféus dos estaduais (o que vem antes de "---" no nome da fase da ESPN)
TACAS = {"taca-guanabara": "Taça Guanabara", "taca-rio": "Taça Rio", "trofeu-inconfidencia": "Troféu Inconfidência", "farroupilha": "Taça Farroupilha",
         "interior": "Troféu do Interior", "trofeu-do-interior": "Troféu do Interior"}
MATA = re.compile(r"stage$|round|playoff|16|quarter|semi|final", re.I)


def fase_pt(slug_ou_rotulo):
    s = str(slug_ou_rotulo or "").strip().lower()
    if s in FASE_ESPECIAL:
        return FASE_ESPECIAL[s]
    if s in TACAS:
        return TACAS[s]
    if "---" in s:  # "taca-rio---final" -> "Taça Rio · final"
        a, b = s.split("---", 1)
        return f"{TACAS.get(a, a.replace('-', ' ').capitalize())} · {fase_pt(b).lower()}"
    for rx, pt in FASES:
        if re.search(rx, s):
            return pt
    return s.replace("-", " ").strip().capitalize() or "Fase"


def eh_mata(slug):
    s = str(slug or "").lower()
    return bool(MATA.search(s)) and not re.search(r"group|league|relegation|taca-guanabara$", s)


def _cache(nome):
    return os.path.join(P.HERE, "cache", nome)


def _ler(nome):
    try:
        return json.load(open(_cache(nome), encoding="utf-8"))
    except Exception:
        return {}


def _gravar(nome, d):
    os.makedirs(os.path.dirname(_cache(nome)), exist_ok=True)
    tmp = _cache(nome) + ".tmp"
    json.dump(d, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, _cache(nome))


def _brt(iso):
    t = cal.timegm(time.strptime(iso[:16], "%Y-%m-%dT%H:%M")) - 3 * 3600
    return time.strftime("%Y-%m-%d", time.gmtime(t)), time.strftime("%H:%M", time.gmtime(t))


# ---------------------------------------------------------------------------
# Jogos de um dia (placar do dia da ESPN)
# ---------------------------------------------------------------------------
def _num(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def jogo(ev, lg):
    c = ev["competitions"][0]
    lados = {x.get("homeAway"): x for x in c.get("competitors", [])}
    st = (c.get("status") or {}).get("type") or {}

    def time_(x):
        t = x.get("team") or {}
        tid = str(t.get("id") or "")
        sc = x.get("score")
        gols = _num(sc.get("value") if isinstance(sc, dict) else sc)
        pen = _num(sc.get("shootoutScore")) if isinstance(sc, dict) else _num(x.get("shootoutScore"))
        return {"id": tid, "clube": P.BY_ESPN.get(tid), "nome": P.clean_text(t.get("displayName") or t.get("name") or "", 40),
                "abrev": P.clean_text(t.get("abbreviation") or "", 6), "logo": ((t.get("logo") or "") if str(t.get("logo") or "").startswith("https://a.espncdn.com/") else None),
                "gols": gols if st.get("state") in ("in", "post") else None, "pen": pen, "venceu": bool(x.get("winner"))}
    data, hora = _brt(ev["date"])
    slug = (ev.get("season") or {}).get("slug") or ""
    grupo = c.get("group")
    grupo = (grupo.get("name") or grupo.get("shortName")) if isinstance(grupo, dict) else grupo
    det = []
    for x in c.get("details", []) or []:
        tipo = ((x.get("type") or {}).get("text") or "").lower()
        a = (x.get("athletesInvolved") or [{}])[0]
        base = {"min": P.clean_text((x.get("clock") or {}).get("displayValue") or "", 10), "nome": P.clean_text(a.get("displayName") or "", 40),
                "atleta": str(a.get("id") or ""), "time": str((x.get("team") or {}).get("id") or "")}
        if x.get("scoringPlay") or "goal" in tipo:
            det.append({**base, "t": "gol", "contra": bool(x.get("ownGoal")) or "own" in tipo, "pen": bool(x.get("penaltyKick")) or "penalty" in tipo})
        elif "red card" in tipo:
            det.append({**base, "t": "vermelho"})
        elif "yellow card" in tipo:
            det.append({**base, "t": "amarelo"})
    if (lados.get("home") or {}).get("team") is None or (lados.get("away") or {}).get("team") is None:
        return None
    return {"id": ev["id"], "lg": lg, "data": data, "hora": hora if c.get("timeValid", True) is not False else None, "estado": st.get("state"),
            "relogio": P.clock_label(c.get("status") or {}) if st.get("state") == "in" else None,
            "fase": slug, "faseNome": fase_pt(slug), "mata": eh_mata(slug), "grupo": P.clean_text(grupo or "", 30) or None,
            "local": P.clean_text((c.get("venue") or {}).get("fullName") or "", 60) or None,
            "cidade": P.clean_text(((c.get("venue") or {}).get("address") or {}).get("city") or "", 40) or None,
            "casa": time_(lados["home"]), "fora": time_(lados["away"]), "lances": det}


def dias_competicao(lg, sb0):
    """Dias em que pode haver jogo: datas do calendário (estaduais) ou todos os dias das janelas de cada fase (copas)."""
    calend = ((sb0.get("leagues") or [{}])[0]).get("calendar") or []
    fases, dias = [], set()
    if calend and isinstance(calend[0], dict):
        for f in calend[0].get("entries", []):
            ini, fim = f.get("startDate", "")[:10], f.get("endDate", "")[:10]
            if not ini or not fim:
                continue
            fases.append({"rotulo": fase_pt(f.get("label")), "detalhe": P.clean_text(f.get("detail") or "", 30), "ini": ini, "fim": fim, "valor": f.get("value")})
            t = cal.timegm(time.strptime(ini, "%Y-%m-%d"))
            while time.strftime("%Y-%m-%d", time.gmtime(t)) <= fim:
                dias.add(time.strftime("%Y%m%d", time.gmtime(t)))
                t += 86400
    else:
        for c in calend:
            if isinstance(c, str):
                dias.add(c[:10].replace("-", ""))
    return sorted(dias), fases


def jogos_temporada(cid, lg):
    """Todos os jogos da temporada (com cache por dia)."""
    sb0 = P.get_json(f"{SB}/{lg}/scoreboard")
    dias, fases = dias_competicao(lg, sb0)
    cache = _ler(f"comp-{cid}.json")
    if cache.get("ano") != time.strftime("%Y"):
        cache = {"ano": time.strftime("%Y"), "dias": {}}
    hoje = time.strftime("%Y%m%d", time.gmtime(time.time() - 3 * 3600))
    ontem = time.strftime("%Y%m%d", time.gmtime(time.time() - 27 * 3600))
    agora = time.time()

    def precisa(d):
        c = cache["dias"].get(d)
        if not c:
            return True
        if d in (hoje, ontem):
            return True
        if d > hoje:  # dias futuros: relidos de 12 em 12 h (jogos marcados, horário definido)
            return agora - c.get("t", 0) > 12 * 3600
        return c.get("t", 0) < cal.timegm(time.strptime(d, "%Y%m%d")) + 2 * 86400  # lido antes do jogo terminar de vez

    falta = [d for d in dias if precisa(d)]

    def ler(d):
        try:
            sb = P.get_json(f"{SB}/{lg}/scoreboard?dates={d}")
            return d, [j for j in (jogo(e, lg) for e in sb.get("events", [])) if j]
        except Exception as ex:
            P.log("competição", cid, d, ex)
            return d, None
    with ThreadPoolExecutor(max_workers=8) as ex:
        for d, js in ex.map(ler, falta):
            if js is not None:
                cache["dias"][d] = {"t": agora, "jogos": js}
    _gravar(f"comp-{cid}.json", cache)
    vistos = {}
    for d in sorted(cache["dias"]):
        for j in cache["dias"][d]["jogos"]:
            vistos[j["id"]] = j
    jogos = sorted(vistos.values(), key=lambda j: (j["data"], j["hora"] or "99:99"))
    P.log(f"competição {cid}: {len(falta)} dias lidos, {len(jogos)} jogos")
    return jogos, fases


# ---------------------------------------------------------------------------
# Tabelas, chave, artilharia, números
# ---------------------------------------------------------------------------
def tabelas(lg, jogos):
    """Grupos: da ESPN; sem eles, calculados dos jogos de grupo."""
    out = []
    try:
        d = P.get_json(f"{ST}/{lg}/standings")
        for g in d.get("children") or []:
            linhas = []
            for e in (g.get("standings") or {}).get("entries", []):
                t = e.get("team") or {}
                s = {x.get("name"): x.get("value") for x in e.get("stats", [])}
                tid = str(t.get("id") or "")
                logo = ((t.get("logos") or [{}])[0]).get("href") or ""
                linhas.append({"id": tid, "clube": P.BY_ESPN.get(tid), "nome": P.clean_text(t.get("displayName") or "", 40), "abrev": P.clean_text(t.get("abbreviation") or "", 6),
                               "logo": logo if logo.startswith("https://a.espncdn.com/") else None, "pos": _num(s.get("rank")), "p": _num(s.get("points")) or 0,
                               "j": _num(s.get("gamesPlayed")) or 0, "v": _num(s.get("wins")) or 0, "e": _num(s.get("ties")) or 0, "d": _num(s.get("losses")) or 0,
                               "gp": _num(s.get("pointsFor")) or 0, "gc": _num(s.get("pointsAgainst")) or 0})
            linhas.sort(key=lambda r: (r["pos"] or 99))
            nome = P.clean_text(g.get("name") or "", 40).replace("Group", "Grupo").replace("League Phase", "Primeira fase").replace("Relegation", "Rebaixamento")
            if linhas:
                out.append({"nome": nome, "linhas": linhas})
    except Exception as ex:
        P.log("tabelas", lg, ex)
    if out:
        return out
    grupos = {}
    for j in jogos:
        if j["mata"] or not j["grupo"] and j["fase"] not in ("league-phase",):
            continue
        grupos.setdefault(j["grupo"] or "Primeira fase", []).append(j)
    for nome, js in grupos.items():
        out.append({"nome": nome.replace("Group", "Grupo"), "linhas": classificar(js)})
    return out


def _linha(t):
    return {"id": t["id"], "clube": t["clube"], "nome": t["nome"], "abrev": t["abrev"], "logo": t["logo"], "p": 0, "j": 0, "v": 0, "e": 0, "d": 0, "gp": 0, "gc": 0, "ca": 0, "cv": 0}


def classificar(jogos):
    """Tabela pelos jogos encerrados (3 pontos por vitória): pontos, vitórias, saldo, gols pró."""
    T = {}
    for j in jogos:
        for t in (j["casa"], j["fora"]):
            T.setdefault(t["id"], _linha(t))
        if j["estado"] != "post" or j["casa"]["gols"] is None:
            continue
        for me, op in ((j["casa"], j["fora"]), (j["fora"], j["casa"])):
            r = T[me["id"]]
            r["j"] += 1; r["gp"] += me["gols"]; r["gc"] += op["gols"]
            if me["gols"] > op["gols"]:
                r["v"] += 1; r["p"] += 3
            elif me["gols"] == op["gols"]:
                r["e"] += 1; r["p"] += 1
            else:
                r["d"] += 1
        for l in j["lances"]:
            if l["t"] in ("amarelo", "vermelho") and l["time"] in T:
                T[l["time"]]["ca" if l["t"] == "amarelo" else "cv"] += 1
    linhas = sorted(T.values(), key=lambda r: (-r["p"], -r["v"], -(r["gp"] - r["gc"]), -r["gp"], r["nome"]))
    for i, r in enumerate(linhas):
        r["pos"] = i + 1
    return linhas


def chave(jogos, fases):
    """Mata-mata: confrontos de cada fase (ida e volta somadas), quem avançou e por quê."""
    out = []
    ordem = {f["rotulo"]: i for i, f in enumerate(fases)}
    por_fase = {}
    for j in jogos:
        if j["mata"]:
            por_fase.setdefault(j["faseNome"], []).append(j)
    for fase, js in sorted(por_fase.items(), key=lambda x: (ordem.get(x[0], 99), x[1][0]["data"])):
        conf = {}
        for j in js:
            k = tuple(sorted((j["casa"]["id"], j["fora"]["id"])))
            conf.setdefault(k, []).append(j)
        lista = []
        for k, legs in conf.items():
            legs.sort(key=lambda j: j["data"])
            a, b = legs[0]["casa"], legs[0]["fora"]
            ga = gb = 0
            fim = all(l["estado"] == "post" for l in legs)
            for l in legs:
                if l["casa"]["gols"] is None:
                    continue
                if l["casa"]["id"] == a["id"]:
                    ga += l["casa"]["gols"]; gb += l["fora"]["gols"]
                else:
                    ga += l["fora"]["gols"]; gb += l["casa"]["gols"]
            pen = None
            ult = legs[-1]
            if ult["casa"]["pen"] is not None and ult["fora"]["pen"] is not None:
                pen = [ult["casa"]["pen"], ult["fora"]["pen"]] if ult["casa"]["id"] == a["id"] else [ult["fora"]["pen"], ult["casa"]["pen"]]
            venc = None
            if fim and legs[-1]["casa"]["gols"] is not None:
                if ga != gb:
                    venc = a["id"] if ga > gb else b["id"]
                elif pen:
                    venc = a["id"] if pen[0] > pen[1] else b["id"]
                else:
                    venc = next((t["id"] for t in (ult["casa"], ult["fora"]) if t["venceu"]), None)
            pick = lambda t: {k2: t[k2] for k2 in ("id", "clube", "nome", "abrev", "logo")}
            lista.append({"a": pick(a), "b": pick(b), "ga": ga if any(l["casa"]["gols"] is not None for l in legs) else None, "gb": gb if any(l["casa"]["gols"] is not None for l in legs) else None,
                          "pen": pen, "vencedor": venc, "jogos": [l["id"] for l in legs], "pernas": len(legs), "data": legs[0]["data"]})
        lista.sort(key=lambda c: c["data"])
        out.append({"fase": fase, "confrontos": lista})
    return out


def artilharia(jogos):
    A = {}
    for j in jogos:
        tid = {j["casa"]["id"]: j["casa"], j["fora"]["id"]: j["fora"]}
        for l in j["lances"]:
            if l["t"] != "gol" or l.get("contra") or not l["nome"]:
                continue
            t = tid.get(l["time"]) or {}
            k = l["atleta"] or l["nome"]
            q = A.setdefault(k, {"atleta": l["atleta"], "nome": l["nome"], "time": l["time"], "clube": t.get("clube"), "timeNome": t.get("nome"), "logo": t.get("logo"), "gols": 0, "pen": 0, "jogos": set()})
            q["gols"] += 1; q["pen"] += 1 if l.get("pen") else 0; q["jogos"].add(j["id"])
    out = sorted(A.values(), key=lambda q: (-q["gols"], q["pen"], q["nome"]))[:30]
    for q in out:
        q["jogos"] = len(q["jogos"])
    return out


def noticias(nome):
    try:
        itens = P.news_query(f'"{nome}" futebol')
    except Exception as ex:
        P.log("notícias da competição", nome, ex)
        return []
    out, vistos = [], set()
    for x in itens:
        t = x.get("title") or ""
        if t in vistos or time.time() - (x.get("ts") or 0) > 4 * 86400:
            continue
        vistos.add(t)
        out.append({k: x.get(k) for k in ("title", "link", "source", "ts")})
        if len(out) >= 10:
            break
    return out


def fase_atual(fases, jogos):
    hoje = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 3 * 3600))
    for f in fases:
        if f["ini"] <= hoje <= f["fim"]:
            return f["rotulo"]
    prox = [j for j in jogos if j["estado"] != "post"]
    if prox:
        return prox[0]["faseNome"]
    return jogos[-1]["faseNome"] if jogos else None


def nome_grupo(n):
    n = str(n or "")
    if re.search(r"relegation|rebaixamento", n, re.I):
        return "Grupo do rebaixamento"
    if re.search(r"campeonato|league phase|^\d{4}\b", n, re.I) or n.strip() in ("Grupo", "Group"):
        return "Primeira fase"
    return n.replace("Group", "Grupo")


def montar(cid):
    c = COMPETICOES[cid]
    jogos, fases = jogos_temporada(cid, c["lg"])
    for j in jogos:  # o nome da fase é traduzido aqui (o cache guarda o jogo como veio)
        j["faseNome"] = fase_pt(j["fase"])
        if j.get("grupo"):
            j["grupo"] = nome_grupo(j["grupo"])
    if not fases:  # estaduais: fases tiradas dos próprios jogos, na ordem em que aconteceram
        vistos = {}
        for j in jogos:
            f = vistos.setdefault(j["faseNome"], {"rotulo": j["faseNome"], "ini": j["data"], "fim": j["data"], "detalhe": ""})
            f["fim"] = max(f["fim"], j["data"])
        fases = list(vistos.values())
    # mata-mata pelos próprios jogos: numa fase eliminatória cada clube joga no máximo 2 vezes (ida e volta)
    por_fase = {}
    for j in jogos:
        por_fase.setdefault(j["fase"], []).append(j)
    for slug, js in por_fase.items():
        cont = {}
        for j in js:
            for t in (j["casa"]["id"], j["fora"]["id"]):
                cont[t] = cont.get(t, 0) + 1
        mata = max(cont.values()) <= 2 and not re.search(r"group|league|regular|relegation", slug or "")
        for j in js:
            j["mata"] = mata
    for f in fases:  # quantos jogos e se é ida e volta (para o "como funciona")
        js = [j for j in jogos if j["faseNome"] == f["rotulo"]]
        f["jogos"] = len(js)
        if js:  # datas de verdade: do primeiro ao último jogo da fase (a janela da ESPN começa em 1º de janeiro)
            f["ini"], f["fim"] = js[0]["data"], js[-1]["data"]
        pares = {}
        for j in js:
            k = tuple(sorted((j["casa"]["id"], j["fora"]["id"])))
            pares[k] = pares.get(k, 0) + 1
        f["idaVolta"] = bool(pares) and max(pares.values()) >= 2 and any(j["mata"] for j in js)
        f["mata"] = any(j["mata"] for j in js) if js else bool(MATA.search(f["rotulo"]))
    grupos = tabelas(c["lg"], jogos)
    for g in grupos:
        g["nome"] = nome_grupo(g["nome"])
    ch = chave(jogos, fases)
    hoje = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 3 * 3600))
    encerrado = bool(jogos) and all(j["estado"] == "post" for j in jogos) and jogos[-1]["data"] < hoje
    campeao = None
    # campeão só pela fase chamada exatamente "Final" (os estaduais têm finais de taças e troféus secundários)
    final = next((c for c in reversed(ch) if c["fase"] == "Final" and c["confrontos"]), None)
    if encerrado and final:
        fin = final["confrontos"][-1]
        v = fin.get("vencedor")
        campeao = next(({k: t[k] for k in ("id", "clube", "nome", "logo")} for t in (fin["a"], fin["b"]) if t["id"] == v), None)
    return {"id": cid, "nome": c["nome"], "tipo": c["tipo"], "uf": c.get("uf"), "lg": c["lg"], "temporada": time.strftime("%Y"),
            "updated": time.strftime("%d/%m/%Y às %H:%M"), "fases": fases, "faseAtual": "Encerrado" if encerrado else fase_atual(fases, jogos),
            "encerrado": encerrado, "campeao": campeao, "jogos": jogos, "grupos": grupos, "chave": ch, "geral": classificar(jogos), "artilharia": artilharia(jogos),
            "noticias": noticias({"libertadores": "Libertadores", "sul-americana": "Sul-Americana", "copa-do-brasil": "Copa do Brasil"}.get(cid, c["nome"])),
            "fonte": "ESPN (jogos, tabelas, gols e cartões) · Google Notícias (manchetes)"}


def atualizar():
    out = {}
    for cid in COMPETICOES:
        try:
            out[cid] = montar(cid)
        except Exception as ex:
            P.log("competição", cid, ex)
    return out


def gravar_js(dados):
    pasta = os.path.join(P.ROOT, "js", "competicoes")
    os.makedirs(pasta, exist_ok=True)
    for cid, d in dados.items():
        txt = (f"/* PLACAR — {d['nome']} {d['temporada']}: fases, jogos, tabelas, chave, artilharia e manchetes. Fonte: ESPN e Google Notícias. "
               f"Gerado por: python server/placar_api.py --snapshot */\nwindow.COMPETICOES = window.COMPETICOES || {{}};\n"
               f"window.COMPETICOES[{json.dumps(cid)}] = " + json.dumps(P.clean_deep(d), ensure_ascii=False, separators=(",", ":")) + ";\n")
        open(os.path.join(pasta, f"{cid}.js"), "w", encoding="utf-8", newline="\n").write(txt)
    P.log("competições gravadas em js/competicoes/")
