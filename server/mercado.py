# © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE).
"""PLACAR — Janela de transferências: elenco de cada clube da Série A, emprestados e o mercado global.

Fontes (todas de uso permitido):
- elencos: ESPN (lista de jogadores de cada time: idade, nascimento, posição, nacionalidade, camisa, lesão);
- histórico de transferências do jogador: ESPN (data, de onde, para onde, tipo: compra, empréstimo, livre; valor quando divulgado);
- emprestados (para fora e para dentro): artigo do clube na Wikipédia em inglês, seções "Current squad" e "Out on loan"
  (CC BY-SA 4.0), lido pela API oficial do MediaWiki;
- minutos jogados na temporada (clubes da Série A): os dados do próprio PLACAR (server/jogadores.py).

O Transfermarkt NÃO é usado: os termos de uso dele (cláusula 11.1) proíbem acessar ou copiar o conteúdo com robôs.
Por isso, o valor de mercado e o salário são ESTIMATIVAS do PLACAR (fórmula aberta abaixo), sempre mostradas como tal.
Com um provedor licenciado (API-Football, Sportmonks, Opta), basta trocar valor_estimado() pelo valor dele.

Saída: js/mercado/global.js (mercado das ligas) e js/mercado/<clube>.js (elenco, emprestados, folha) e a API
/api/mercado/<clube> e /api/mercado-global.
"""
import json
import os
import re
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

P = None  # módulo placar_api
FE = None  # server/fontes_elenco.py (ligado pelo placar_api)
FIN = None  # server/financas.py
FOTO = None  # server/fotos.py (monitor das fotos; ligado pelo placar_api)
VERSAO = 2  # sobe quando o formato do elenco muda (o robô relê o cache antigo)

SB = "https://site.api.espn.com/apis/site/v2/sports/soccer"
CORE = "https://sports.core.api.espn.com/v2/sports/soccer"
# ligas do mercado global: código ESPN -> (nome, país, peso da liga no valor)
LIGAS = {
    "eng.1": ("Premier League", "Inglaterra", 1.00), "esp.1": ("LaLiga", "Espanha", 0.78), "ita.1": ("Serie A", "Itália", 0.74),
    "ger.1": ("Bundesliga", "Alemanha", 0.74), "fra.1": ("Ligue 1", "França", 0.58), "por.1": ("Liga Portugal", "Portugal", 0.38),
    "ned.1": ("Eredivisie", "Holanda", 0.36), "tur.1": ("Süper Lig", "Turquia", 0.30), "ksa.1": ("Saudi Pro League", "Arábia Saudita", 0.30),
    "bra.1": ("Brasileirão Série A", "Brasil", 0.22), "usa.1": ("MLS", "Estados Unidos", 0.24), "mex.1": ("Liga MX", "México", 0.24),
    "arg.1": ("Liga Profesional", "Argentina", 0.16), "bra.2": ("Brasileirão Série B", "Brasil", 0.05), "col.1": ("Liga BetPlay", "Colômbia", 0.08),
    "uru.1": ("Primera División", "Uruguai", 0.07), "chi.1": ("Primera División", "Chile", 0.07),
}
POS = {"G": "G", "D": "D", "M": "M", "F": "A"}  # A = atacante
EUR_BRL = 6.0  # câmbio usado na folha (fixo; mostrado na página)


def _cache(nome):
    return os.path.join(P.ROOT, "server", "cache", nome)


def _ler(nome):
    try:
        return json.load(open(_cache(nome), encoding="utf-8"))
    except Exception:
        return {}


def _gravar(nome, d):
    os.makedirs(os.path.dirname(_cache(nome)), exist_ok=True)
    json.dump(d, open(_cache(nome), "w", encoding="utf-8"), ensure_ascii=False)


# ---------------------------------------------------------------------------
# Valor de mercado e salário estimados (fórmula do PLACAR)
# ---------------------------------------------------------------------------
def fator_idade(idade):
    if not idade:
        return 0.6
    if idade < 17:
        return 0.35
    if idade <= 23:
        return 0.55 + 0.45 * (idade - 17) / 6 + (0.12 if idade <= 21 else 0)  # promessa vale mais
    if idade <= 27:
        return 1.0
    if idade <= 33:
        return 0.85 ** (idade - 27)
    return max(0.05, 0.85 ** 6 * 0.6 ** (idade - 33))


def valor_estimado(idade, pos, peso_liga, forca_time=1.0, papel=1.0):
    """Euros. Base: atacante de 25 anos, titular de time médio da Premier League = 40 milhões."""
    pos_f = {"G": 0.6, "D": 0.85, "M": 1.0, "A": 1.15}.get(pos, 0.9)
    v = 40e6 * peso_liga * fator_idade(idade) * pos_f * forca_time * papel
    if v >= 1e6:
        return round(v / 1e5) * 1e5
    return max(25e3, round(v / 25e3) * 25e3)


def salario_mensal_brl(valor, peso_liga):
    """Salário mensal estimado (R$). Proporção salário/valor maior nas ligas que vendem menos (como o Brasil)."""
    r = 0.15 if peso_liga <= 0.3 else 0.10 if peso_liga <= 0.6 else 0.09  # salário anual / valor de mercado
    return max(15000, round(valor * r * EUR_BRL / 12 / 1000) * 1000)


# ---------------------------------------------------------------------------
# Mercado global: elencos das ligas (cache de 7 dias por time)
# ---------------------------------------------------------------------------
def _sigla_pais(flag):
    m = re.search(r"/countries/\d+/([a-z]{2,3})\.png", (flag or {}).get("href") or "")
    return m.group(1) if m else ""


def _forcas(lg):
    """Força de cada time pela posição na tabela da liga (1º = 1,6; último = 0,7)."""
    try:
        d = P.get_json(f"https://site.web.api.espn.com/apis/v2/sports/soccer/{lg}/standings")
        ent = []
        for g in d.get("children") or [d]:
            ent += ((g.get("standings") or {}).get("entries") or [])
        n = len(ent) or 1
        out = {}
        for i, e in enumerate(sorted(ent, key=lambda e: next((s.get("value") for s in e.get("stats", []) if s.get("name") == "rank"), 99) or 99)):
            out[str((e.get("team") or {}).get("id"))] = round(1.6 - 0.9 * i / max(1, n - 1), 2)
        return out
    except Exception as ex:
        P.log("mercado: tabela", lg, ex)
        return {}


def _jogador(a, lg, tid, peso, forca):
    pos = POS.get(((a.get("position") or {}).get("abbreviation") or "M")[:1], "M")
    try:
        num = int(a.get("jersey") or 0)
    except ValueError:
        num = 0
    papel = 1.15 if 1 <= num <= 11 else 0.35 if num >= 40 else 0.85  # camisa de titular x número de base (aproximação)
    idade = a.get("age")
    v = valor_estimado(idade, pos, peso, forca, papel)
    lesao = bool(a.get("injuries"))
    return [str(a.get("id")), P.clean_text(a.get("displayName") or "", 40), idade, pos, _sigla_pais(a.get("flag")), P.clean_text(a.get("citizenship") or "", 30),
            tid, num or None, int(v), 1 if lesao else 0]


def atualizar_global(forcar=False):
    cache = _ler("mercado-global.json")
    times = cache.get("times", {})
    agora = time.time()
    tarefas = []
    for lg, (nome, pais, peso) in LIGAS.items():
        try:
            d = P.get_json(f"{SB}/{lg}/teams")
            lista = (((d.get("sports") or [{}])[0].get("leagues") or [{}])[0].get("teams") or [])
        except Exception as ex:
            P.log("mercado: times", lg, ex)
            continue
        forca = _forcas(lg)
        for t in lista:
            t = t.get("team") or {}
            tid = str(t.get("id"))
            antigo = times.get(tid)
            if antigo and not forcar and agora - antigo.get("t", 0) < 7 * 86400:
                continue
            logo = ((t.get("logos") or [{}])[0]).get("href") or ""
            tarefas.append((lg, tid, P.clean_text(t.get("displayName") or "", 40), logo if logo.startswith("https://a.espncdn.com/") else None, peso, forca.get(tid, 1.0)))

    def ler(tf):
        lg, tid, nome, logo, peso, forca = tf
        try:
            r = P.get_json(f"{SB}/{lg}/teams/{tid}/roster")
            js = [_jogador(a, lg, tid, peso, forca) for a in r.get("athletes", [])]
            return tid, {"lg": lg, "nome": nome, "logo": logo, "forca": forca, "t": agora, "jogadores": js}
        except Exception as ex:
            P.log("mercado: elenco", lg, tid, ex)
            return tid, None
    with ThreadPoolExecutor(max_workers=8) as ex:
        for tid, t in ex.map(ler, tarefas):
            if t:
                times[tid] = t
    cache = {"times": times, "updated": time.strftime("%d/%m/%Y às %H:%M")}
    _gravar("mercado-global.json", cache)
    P.log(f"mercado global: {len(tarefas)} elencos lidos, {sum(len(t['jogadores']) for t in times.values())} jogadores")
    return cache


def global_compacto(cache):
    """Forma enxuta para o site: tabela de times + lista de jogadores [id, nome, idade, pos, país, nacionalidade, time, camisa, valor, lesão]."""
    times, jog, paises = {}, [], {}
    for tid, t in cache.get("times", {}).items():
        times[tid] = [t["nome"], t["logo"], t["lg"]]
        for j in t["jogadores"]:
            paises[j[4]] = j[5]
            jog.append(j[:5] + [""] + j[6:])  # o nome do país fica uma vez só, em "paises"
    return {"updated": cache.get("updated"), "ligas": {k: [v[0], v[1], v[2]] for k, v in LIGAS.items()}, "times": times, "paises": paises,
            "campos": ["id", "nome", "idade", "pos", "pais", "nac", "time", "num", "valor", "lesao"], "jogadores": jog,
            "eurBrl": EUR_BRL, "fonte": "ESPN (elencos) · valores: estimativa do PLACAR"}


# ---------------------------------------------------------------------------
# Emprestados: Wikipédia em inglês ("Current squad" e "Out on loan")
# ---------------------------------------------------------------------------
_artigos_en = None


def artigo_en(cid):
    global _artigos_en
    if _artigos_en is None:
        _artigos_en = _ler("mercado-artigos-en.json")
    if cid in _artigos_en:
        return _artigos_en[cid]
    qid = _ler("wikidata-clubes.json").get(cid)
    tit = None
    if qid:
        try:
            d = P.get_json("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({"action": "wbgetentities", "ids": qid, "props": "sitelinks", "sitefilter": "enwiki", "format": "json"}))
            tit = (((d.get("entities") or {}).get(qid) or {}).get("sitelinks") or {}).get("enwiki", {}).get("title")
        except Exception as ex:
            P.log("mercado: artigo", cid, ex)
            return None
    _artigos_en[cid] = tit
    _gravar("mercado-artigos-en.json", _artigos_en)
    return tit


MESES = {m: i + 1 for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"])}


def _limpa_link(x):
    x = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", x or "")
    x = re.sub(r"\{\{[^{}]*\}\}", "", x)
    return re.sub(r"<[^>]+>|'''?", "", x).strip()


def _data_en(txt):
    m = re.search(r"(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})", txt or "", re.I)
    if m:
        return f"{m.group(3)}-{MESES[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"
    m = re.search(r"end of (?:the )?(\d{4})", txt or "", re.I)
    return f"{m.group(1)}-12-31" if m else None


def emprestimos(cid):
    """{"fora": [...emprestados a outros clubes], "dentro": [...chegaram emprestados]} pelo artigo em inglês."""
    tit = artigo_en(cid)
    if not tit:
        return {"fora": [], "dentro": [], "fonte": None}
    try:
        d = P.get_json("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode({"action": "parse", "page": tit, "prop": "wikitext", "format": "json", "formatversion": 2, "redirects": 1}))
        w = d["parse"]["wikitext"]
    except Exception as ex:
        P.log("mercado: Wikipédia", cid, ex)
        return None
    secoes = re.split(r"\n(={2,4})\s*([^=\n]+?)\s*\1", w)
    fora, dentro = [], []
    for i in range(2, len(secoes) - 1, 3):
        nome_sec, corpo = secoes[i].strip().lower(), secoes[i + 1]
        for m in re.finditer(r"\{\{\s*fs player\s*\|(.*?)\}\}(?=\s*(?:\n|\{\{|$))", corpo, re.I | re.S):
            campos = {}
            for parte in re.split(r"\|(?![^\[]*\]\])", m.group(1)):
                if "=" in parte:
                    k, v = parte.split("=", 1)
                    campos[k.strip().lower()] = v.strip()
            nome = _limpa_link(campos.get("name", ""))
            outro = campos.get("other", "")
            reg = {"nome": nome, "pos": {"GK": "G", "DF": "D", "MF": "M", "FW": "A"}.get(campos.get("pos", "").upper(), "M"), "nac": campos.get("nat", "")}
            if "on loan" in nome_sec or "out on loan" in nome_sec:
                ate = _data_en(outro)
                clube = _limpa_link(re.sub(r"\buntil\b.*", "", re.sub(r"^\s*at\s+", "", outro, flags=re.I), flags=re.I))
                fora.append({**reg, "clube": clube, "ate": ate})
            elif "current squad" in nome_sec and re.search(r"on loan from", outro, re.I):
                de = _limpa_link(re.sub(r".*on loan from\s+", "", outro, flags=re.I))
                dentro.append({**reg, "de": re.sub(r"\s*until.*", "", de, flags=re.I), "ate": _data_en(outro)})
    return {"fora": fora, "dentro": dentro, "fonte": "https://en.wikipedia.org/wiki/" + urllib.parse.quote(tit.replace(" ", "_"))}


# ---------------------------------------------------------------------------
# Elenco de um clube da Série A (com minutos da temporada, posição de origem, situação e últimas transferências)
# ---------------------------------------------------------------------------
def _js_obj(caminho, marca):
    src = open(os.path.join(P.ROOT, *caminho), encoding="utf-8").read()
    i = src.index(marca) + len(marca)
    return json.loads(src[src.index("{", i):src.rindex("}") + 1])


def _jogadores_clube(cid):
    """Dados do próprio PLACAR (server/jogadores.py): por jogador, minutos, jogos e jogos como titular em TODAS as
    competições da temporada, e titular/reserva/fora nos últimos 5 jogos do time."""
    try:
        d = _js_obj(("js", "jogadores", f"{cid}.js"), f'window.JOGADORES_CLUBE["{cid}"] =')
    except Exception:
        return {}, []
    cp = d.get("campos") or []
    i_eid, i_dt, i_tit, i_min = (cp.index(x) if x in cp else None for x in ("eid", "date", "tit", "min"))
    jogos_time = {}
    for j in d.get("jogadores", {}).values():
        for r in j.get("jogos") or []:
            if i_eid is not None and i_dt is not None:
                jogos_time[r[i_eid]] = r[i_dt]
    ult5 = [e for e, _ in sorted(jogos_time.items(), key=lambda x: x[1])][-5:]
    out = {}
    for aid, j in d.get("jogadores", {}).items():
        comps = j.get("comps") or {}
        mi = sum((c.get("min") or 0) for c in comps.values())
        nj = sum((c.get("j") or 0) for c in comps.values())
        tit = sum((c.get("tit") or 0) for c in comps.values())
        por_eid = {r[i_eid]: r for r in (j.get("jogos") or [])} if i_eid is not None else {}
        u5 = [(bool(por_eid[e][i_tit]) if e in por_eid else None) for e in ult5] if i_tit is not None else []
        out[str(aid)] = {"min": mi, "jogos": nj, "tit": tit, "ult5": u5, "foto": j.get("foto"), "comps": {k: [c.get("j") or 0, c.get("min") or 0, c.get("g") or 0, c.get("a") or 0] for k, c in comps.items()}}
    return out, ult5


def _minutos(cid):
    """Compatível com a versão anterior: {id: (minutos, jogos, foto)} e o nº de jogos do time."""
    js, ult5 = _jogadores_clube(cid)
    return {aid: (x["min"], x["jogos"], x["foto"]) for aid, x in js.items()}, max(10, max((x["jogos"] for x in js.values()), default=10))


def _posicoes():
    try:
        return _js_obj(("js", "heatmaps.js"), "window.HEATMAPS =").get("players", {})
    except Exception:
        return {}


def _ultimo_xi(cid):
    try:
        src = open(os.path.join(P.ROOT, "js", "squads.js"), encoding="utf-8").read()
        resto = src[src.index("window.SQUADS_LAST") + len("window.SQUADS_LAST"):]
        last = json.JSONDecoder().raw_decode(resto[resto.index("{"):])[0]
        x = last.get(cid) or {}
        return {str(i[1] if isinstance(i, list) else i) for i in (x.get("xi") or x.get("titulares") or [])}
    except Exception:
        return None


def _transferencias(aid):
    """Última mudança de clube do jogador (ESPN): data, tipo e valor divulgado."""
    try:
        d = P.get_json(f"{CORE}/athletes/{aid}/transactions?limit=50")
        it = sorted(d.get("items") or [], key=lambda x: x.get("date") or "")
        if not it:
            return None
        u = it[-1]
        tipo = (u.get("type") or "").lower()
        return {"data": (u.get("date") or "")[:10], "tipo": "empréstimo" if "loan" in tipo else "livre" if "free" in tipo else "compra" if (u.get("amount") or 0) > 0 or "fee" in tipo else "não divulgado",
                "valor": u.get("amount") or None, "texto": P.clean_text(u.get("displayAmount") or "", 20)}
    except Exception:
        return None


def _norm(x):
    return P.norm_txt(x).replace(" ", "")


FUNCAO_PADRAO = {"G": "GOL", "D": "ZAG", "M": "MC", "A": "CA"}


def _overview_espn(aid, team_id):
    """Jogos como titular, gols e assistências na temporada pelo clube onde ele está (ESPN, por competição)."""
    try:
        d = P.get_json(f"https://site.web.api.espn.com/apis/common/v3/sports/soccer/athletes/{aid}/overview")
        st = d.get("statistics") or {}
        nomes = st.get("names") or []
        tot = {"tit": 0, "g": 0, "a": 0, "comps": []}
        ano = time.strftime("%Y")
        for s in st.get("splits") or []:
            if str(s.get("teamId")) != str(team_id) or ano not in (s.get("displayName") or ""):
                continue
            v = dict(zip(nomes, s.get("stats") or []))
            tot["tit"] += int(float(v.get("starts") or 0)); tot["g"] += int(float(v.get("totalGoals") or 0)); tot["a"] += int(float(v.get("goalAssists") or 0))
            tot["comps"].append(P.clean_text(re.sub(r"^\d{4}(-\d{2})?\s*", "", s.get("displayName") or ""), 40))
        return tot
    except Exception:
        return None


def _acha_global(nome, pos, glob):
    """Procura o emprestado no mercado global (elencos da ESPN): confirma onde ele está e traz id, idade, camisa."""
    alvo = P.norm_txt(nome).split()
    melhor = None
    for tid, t in (glob or {}).get("times", {}).items():
        for j in t["jogadores"]:
            n = P.norm_txt(j[1]).split()
            if not n or not alvo:
                continue
            if n == alvo or (len(alvo) >= 2 and all(p in n for p in alvo)) or (len(n) >= 2 and all(p in alvo for p in n)):
                cand = {"id": j[0], "idade": j[2], "pos": j[3], "pais": j[4], "num": j[7], "time": tid, "timeNome": t["nome"], "timeLogo": t["logo"], "lg": t["lg"]}
                if j[3] == pos:
                    return cand
                melhor = melhor or cand
    return melhor


def elenco_clube(cid, ultimas=None, emp_cache=None):
    espn = P.CLUBS[cid]["espn"]
    r = P.get_json(f"{SB}/bra.1/teams/{espn}/roster")
    forca = _forcas("bra.1").get(espn, 1.0)
    mins, jogos = _minutos(cid)
    ultimas = ultimas or {}
    falta = [str(a.get("id")) for a in r.get("athletes", []) if str(a.get("id")) not in ultimas]
    with ThreadPoolExecutor(max_workers=8) as ex:
        for aid, t in zip(falta, ex.map(_transferencias, falta)):
            ultimas[aid] = t
    emp = emprestimos(cid)
    antigo = (emp_cache or {}).get(cid)
    # a Wikipédia às vezes falha ou devolve a página no meio de uma edição: fica a última leitura boa (até 30 dias)
    if (not emp or not (emp["fora"] or emp["dentro"])) and antigo and time.time() - antigo.get("t", 0) < 30 * 86400:
        emp = antigo["d"]
    elif emp and (emp["fora"] or emp["dentro"]) and emp_cache is not None:
        emp_cache[cid] = {"t": time.time(), "d": emp}
    emp = emp or {"fora": [], "dentro": [], "fonte": None}
    dentro = {_norm(x["nome"]): x for x in emp["dentro"]}
    elenco = []
    for a in r.get("athletes", []):
        aid = str(a.get("id"))
        pos = POS.get(((a.get("position") or {}).get("abbreviation") or "M")[:1], "M")
        mi, nj, foto = mins.get(aid, (0, 0, None))
        papel = 0.25 + 1.15 * min(1.0, mi / (jogos * 90 * 0.8))  # 0,25 (não joga) a 1,4 (titular absoluto)
        v = valor_estimado(a.get("age"), pos, LIGAS["bra.1"][2], forca, papel)
        emp_in = dentro.get(_norm(a.get("displayName") or "")) or dentro.get(_norm(a.get("fullName") or ""))  # só nome idêntico ("Wesley" não é "Wesley Ribeiro")
        elenco.append({"id": aid, "nome": P.clean_text(a.get("displayName") or "", 40), "nomeCompleto": P.clean_text(a.get("fullName") or "", 60), "idade": a.get("age"),
                       "nasc": (a.get("dateOfBirth") or "")[:10], "pos": pos, "num": a.get("jersey"), "pais": _sigla_pais(a.get("flag")), "nac": P.clean_text(a.get("citizenship") or "", 30),
                       "lesao": bool(a.get("injuries")), "min": mi, "jogos": nj, "valor": int(v), "salario": salario_mensal_brl(v, LIGAS["bra.1"][2]),
                       "foto": foto, "ultima": ultimas.get(aid), "emprestadoDe": emp_in.get("de") if emp_in else None, "ateQuando": emp_in.get("ate") if emp_in else None})
    # quem a ESPN tirou do cadastro mas segue no clube (jogou nos últimos 45 dias: js/squads.js) entra também
    ids = {j["id"] for j in elenco}
    try:
        extras = [r for r in (P.squads_atuais().get(cid) or []) if r[4] and str(r[4]) not in ids]
    except Exception:
        extras = []
    for num, nome, pe, idade, aid in (r[:5] for r in extras):
        aid = str(aid)
        pos = POS.get(str(pe or "M")[:1], "M")
        mi, nj, foto = mins.get(aid, (0, 0, None))
        papel = 0.25 + 1.15 * min(1.0, mi / (jogos * 90 * 0.8))
        v = valor_estimado(idade, pos, LIGAS["bra.1"][2], forca, papel)
        emp_in = dentro.get(_norm(nome))
        elenco.append({"id": aid, "nome": P.clean_text(nome, 40), "nomeCompleto": P.clean_text(nome, 60), "idade": idade, "nasc": "", "pos": pos, "num": str(num) if num else None,
                       "pais": "bra", "nac": "", "lesao": False, "min": mi, "jogos": nj, "valor": int(v), "salario": salario_mensal_brl(v, LIGAS["bra.1"][2]), "foto": foto,
                       "ultima": None, "emprestadoDe": emp_in.get("de") if emp_in else None, "ateQuando": emp_in.get("ate") if emp_in else None, "cadastro": "súmulas recentes"})
    elenco.sort(key=lambda j: ("GDMA".index(j["pos"]), -j["valor"]))
    glob = _ler("mercado-global.json")
    fora = []
    for x in emp["fora"]:
        g = _acha_global(x["nome"], x["pos"], glob)
        v = valor_estimado(g["idade"] if g else None, x["pos"], LIGAS["bra.1"][2], forca, 0.8)
        reg = {**x, "id": "emp-" + _norm(x["nome"]), "valor": int(v), "salario": salario_mensal_brl(v, LIGAS["bra.1"][2])}
        if g:
            reg.update({"espn": g["id"], "idade": g["idade"], "pais": g["pais"], "num": g["num"], "clubeEspn": g["timeNome"], "clubeLogo": g["timeLogo"], "lgClube": g["lg"],
                        "confirmado": bool(x.get("clube")) and (P.norm_txt(x["clube"])[:5] in P.norm_txt(g["timeNome"]) or P.norm_txt(g["timeNome"])[:5] in P.norm_txt(x["clube"]))})
            ov = _overview_espn(g["id"], g["time"])
            if ov:
                reg["temporada"] = ov
        fora.append(reg)
    return {"v": VERSAO, "clube": cid, "updated": time.strftime("%d/%m/%Y às %H:%M"), "elenco": elenco, "emprestados": fora,
            "eurBrl": EUR_BRL, "fonteEmprestimos": emp.get("fonte")}, ultimas


def enriquecer(cid, d):
    """Junta, na hora de gravar, o que muda a todo momento: minutos e titularidade (súmulas), posição de origem e o
    histórico por posição (escalações), fotos privadas e cadastro (TheSportsDB), situação (3+ fontes), finanças."""
    js, _ = _jogadores_clube(cid)
    pos = _posicoes()
    xi = _ultimo_xi(cid)
    try:
        noticias = FE.noticias_escalacao(cid) if FE and os.environ.get("PLACAR_OFFLINE") != "1" else []
    except Exception:
        noticias = []
    fotos_ok = (os.environ.get("FOTOS_PRIVADAS", "1") != "0" and os.environ.get("MODO_VENDA") != "1")
    fe_cache = FE._ler() if FE else {}
    fm_cache = FOTO._ler() if FOTO else None
    jogos_time = max([x["jogos"] for x in js.values()] + [1])
    for j in d["elenco"]:
        x = js.get(j["id"]) or {}
        j["min"], j["jogos"], j["tit"] = x.get("min", j.get("min") or 0), x.get("jogos", j.get("jogos") or 0), x.get("tit", 0)
        j["comps"] = x.get("comps", {})
        if x.get("foto"):
            j["foto"] = x["foto"]
        hp = pos.get(j["id"]) or {}
        t = FE.do_jogador(j["id"]) if FE else {}
        j["funcao"] = hp.get("f") or t.get("pos") or FUNCAO_PADRAO.get(j["pos"], "MC")
        j["hist"] = hp.get("s") or {}
        j["fontes"] = ["ESPN (cadastro)"] + (["TheSportsDB (cadastro)"] if t else []) + (["súmulas"] if j["jogos"] else [])
        if t.get("posTxt"):
            j["posTxt"] = t["posTxt"]
        if fm_cache and (fm_cache.get("j") or {}).get(str(j["id"])):
            j["fotoPrivada"], j["fotoInfo"] = FOTO.campos_mercado(j["id"], fm_cache)
        else:
            fp = FE.foto_privada(j["id"], fe_cache) if (FE and fotos_ok) else None
            j["fotoPrivada"] = fp["url"] if fp else None
            j["fotoInfo"] = {k: v for k, v in fp.items() if k != "url" and v} if fp and fp["fonte"] != "TheSportsDB" else None
        j["situacao"] = FE.situacao(x.get("ult5") or [], (j["id"] in xi) if xi is not None else None, noticias, j["nome"]) if FE else None
    d["jogosTime"] = jogos_time
    # emprestados: minutos de quem está num clube da Série A (dados do próprio PLACAR)
    for e in d.get("emprestados", []):
        if not e.get("espn"):
            continue
        destino = next((c for c, v in P.CLUBS.items() if e.get("lgClube") == "bra.1" and str(v.get("espn")) and _forca_nome(c, e.get("clubeEspn"))), None)
        if destino:
            jd, _ = _jogadores_clube(destino)
            xx = jd.get(str(e["espn"]))
            if xx:
                e["min"], e["jogos"], e["titular"] = xx["min"], xx["jogos"], xx["tit"]
        hp = pos.get(str(e["espn"])) or {}
        e["funcao"] = hp.get("f") or FUNCAO_PADRAO.get(e["pos"], "MC")
        t = FE.do_jogador(e["id"]) if FE else {}
        if fm_cache and (fm_cache.get("j") or {}).get(str(e["id"])):
            e["fotoPrivada"], e["fotoInfo"] = FOTO.campos_mercado(e["id"], fm_cache)
        else:
            fp = FE.foto_privada(e["id"], fe_cache) if (FE and fotos_ok) else None
            e["fotoPrivada"] = fp["url"] if fp else None
            e["fotoInfo"] = {k: v for k, v in fp.items() if k != "url" and v} if fp and fp["fonte"] != "TheSportsDB" else None
    # salários: a soma bate com a folha divulgada (o que cada um ganha é estimado pela proporção do valor)
    fin = FIN.do_clube(cid, sum(j["salario"] for j in d["elenco"])) if FIN else None
    if fin:
        d["financas"] = fin
        d["eurBrl"] = fin["cambio"]["valor"]
        vmax = max([j["valor"] for j in d["elenco"]] + [1])
        mmax = max([j.get("min") or 0 for j in d["elenco"]] + [1])
        for j in d["elenco"] + d.get("emprestados", []):
            j["_w"] = peso_salario(j.get("idade"), (j.get("min") or 0) / mmax if j in d["elenco"] else 0.45, j["valor"] / vmax)
        soma = sum(j["_w"] for j in d["elenco"]) or 1
        k = fin["folha"]["valor"] / soma
        for j in d["elenco"] + d.get("emprestados", []):
            j["salario"] = max(15000, round(j.pop("_w") * k / 1000) * 1000)
    d["folhaMensal"] = sum(j["salario"] for j in d["elenco"])
    d["valorTotal"] = sum(j["valor"] for j in d["elenco"])
    d["fonte"] = ("ESPN (cadastro, súmulas e transferências) · TheSportsDB (cadastro e posição) · Wikipédia (emprestados, CC BY-SA 4.0) · "
                  "ge e Google Notícias (folha) · Banco Central (câmbio) · valores de mercado: estimativa do PLACAR")
    return d


def peso_salario(idade, uso, valor_rel):
    """Peso de cada jogador na folha: tempo de carreira (veterano ganha mais que a revenda dele indica), quanto joga e
    quanto vale. A soma do elenco é ajustada para bater com a folha divulgada do clube."""
    i = idade or 24
    car = 0.18 if i <= 19 else 0.35 if i <= 21 else 0.7 if i <= 24 else 1.0 if i <= 33 else 0.95
    return car * (0.35 + 0.65 * min(1.0, uso)) * (0.55 + 0.45 * min(1.0, valor_rel))


def _forca_nome(cid, nome):
    return any(P.norm_txt(n)[:6] in P.norm_txt(nome or "") for n in (P.HEADLINE_NAMES.get(cid) or [])[:1])


def atualizar_clubes(clubes=None):
    cache = _ler("mercado-clubes.json")
    # a última transferência de cada jogador é relida a cada 3 dias (janela aberta muda rápido; fora dela, quase nada)
    if time.time() - cache.get("t_ultimas", 0) > 3 * 86400:
        ult, t = {}, time.time()
    else:
        ult, t = cache.get("ultimas", {}), cache["t_ultimas"]
    emp_cache = cache.get("emprestimos", {})
    out = {}
    for cid in clubes or list(P.CLUBS):
        try:
            d, ult = elenco_clube(cid, ult, emp_cache)
            out[cid] = d
        except Exception as ex:
            P.log("mercado: clube", cid, ex)
    _gravar("mercado-clubes.json", {"ultimas": ult, "t_ultimas": t, "emprestimos": emp_cache})
    if FE:
        try:
            FE.atualizar({cid: [(j["id"], j["nome"]) for j in d["elenco"]] + [(e["id"], e["nome"], e.get("clube"), e.get("clubeEspn")) for e in d["emprestados"]] for cid, d in out.items()},
                         fotos=(os.environ.get("FOTOS_PRIVADAS", "1") != "0" and os.environ.get("MODO_VENDA") != "1"))
        except Exception as ex:
            P.log("mercado: fontes do elenco", ex)
    if FIN:
        try:
            FIN.atualizar(list(out))
        except Exception as ex:
            P.log("mercado: finanças", ex)
    return out


def gravar_js(clubes, glob=None):
    pasta = os.path.join(P.ROOT, "js", "mercado")
    os.makedirs(pasta, exist_ok=True)
    for cid, d in clubes.items():
        try:
            d = enriquecer(cid, d)
        except Exception as ex:
            P.log("mercado: enriquecer", cid, ex)
        txt = (f"/* PLACAR — janela de transferências do {cid}: elenco, emprestados e folha. Fontes: ESPN, TheSportsDB, Wikipédia, ge, Banco Central; valores de mercado são estimativas. "
               f"Gerado por: python server/placar_api.py --snapshot */\nwindow.MERCADO = window.MERCADO || {{}};\nwindow.MERCADO[{json.dumps(cid)}] = "
               + json.dumps(P.clean_deep(d), ensure_ascii=False, separators=(",", ":")) + ";\n")
        open(os.path.join(pasta, f"{cid}.js"), "w", encoding="utf-8", newline="\n").write(txt)
    if glob:
        txt = ("/* PLACAR — mercado global: elencos das principais ligas (ESPN). Valores: estimativa do PLACAR. Gerado por: python server/placar_api.py --snapshot */\n"
               "window.MERCADO_GLOBAL = " + json.dumps(P.clean_deep(global_compacto(glob)), ensure_ascii=False, separators=(",", ":")) + ";\n")
        open(os.path.join(pasta, "global.js"), "w", encoding="utf-8", newline="\n").write(txt)
    P.log("mercado gravado em js/mercado/")
