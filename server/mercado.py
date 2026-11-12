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
# Elenco de um clube da Série A (com minutos da temporada e últimas transferências)
# ---------------------------------------------------------------------------
def _minutos(cid):
    try:
        src = open(os.path.join(P.ROOT, "js", "jogadores", f"{cid}.js"), encoding="utf-8").read()
        d = json.loads(src[src.index("= {") + 2:src.rindex("}") + 1])
        i = d["campos"].index("min")
        jogos = max((len(j.get("jogos") or []) for j in d["jogadores"].values()), default=1)
        return {aid: (sum(x[i] or 0 for x in j.get("jogos") or []), len(j.get("jogos") or []), j.get("foto")) for aid, j in d["jogadores"].items()}, max(jogos, 10)
    except Exception:
        return {}, 10


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


def elenco_clube(cid, ultimas=None):
    espn = P.CLUBS[cid]["espn"]
    r = P.get_json(f"{SB}/bra.1/teams/{espn}/roster")
    forca = _forcas("bra.1").get(espn, 1.0)
    mins, jogos = _minutos(cid)
    ultimas = ultimas or {}
    falta = [str(a.get("id")) for a in r.get("athletes", []) if str(a.get("id")) not in ultimas]
    with ThreadPoolExecutor(max_workers=8) as ex:
        for aid, t in zip(falta, ex.map(_transferencias, falta)):
            ultimas[aid] = t
    emp = emprestimos(cid) or {"fora": [], "dentro": [], "fonte": None}
    dentro = {_norm(x["nome"]): x for x in emp["dentro"]}
    elenco = []
    for a in r.get("athletes", []):
        aid = str(a.get("id"))
        pos = POS.get(((a.get("position") or {}).get("abbreviation") or "M")[:1], "M")
        mi, nj, foto = mins.get(aid, (0, 0, None))
        papel = 0.25 + 1.15 * min(1.0, mi / (jogos * 90 * 0.8))  # 0,25 (não joga) a 1,4 (titular absoluto)
        v = valor_estimado(a.get("age"), pos, LIGAS["bra.1"][2], forca, papel)
        emp_in = dentro.get(_norm(a.get("displayName") or "")) or next((x for k, x in dentro.items() if k and (k in _norm(a.get("fullName") or "") or _norm(a.get("displayName") or "") in k)), None)
        elenco.append({"id": aid, "nome": P.clean_text(a.get("displayName") or "", 40), "nomeCompleto": P.clean_text(a.get("fullName") or "", 60), "idade": a.get("age"),
                       "nasc": (a.get("dateOfBirth") or "")[:10], "pos": pos, "num": a.get("jersey"), "pais": _sigla_pais(a.get("flag")), "nac": P.clean_text(a.get("citizenship") or "", 30),
                       "lesao": bool(a.get("injuries")), "min": mi, "jogos": nj, "valor": int(v), "salario": salario_mensal_brl(v, LIGAS["bra.1"][2]),
                       "foto": foto, "ultima": ultimas.get(aid), "emprestadoDe": emp_in.get("de") if emp_in else None, "ateQuando": emp_in.get("ate") if emp_in else None})
    elenco.sort(key=lambda j: ("GDMA".index(j["pos"]), -j["valor"]))
    fora = []
    for x in emp["fora"]:
        v = valor_estimado(None, x["pos"], LIGAS["bra.1"][2], forca, 0.8)
        fora.append({**x, "id": "emp-" + _norm(x["nome"]), "valor": int(v), "salario": salario_mensal_brl(v, LIGAS["bra.1"][2])})
    folha = sum(j["salario"] for j in elenco)
    return {"clube": cid, "updated": time.strftime("%d/%m/%Y às %H:%M"), "elenco": elenco, "emprestados": fora, "folhaMensal": folha,
            "valorTotal": sum(j["valor"] for j in elenco), "eurBrl": EUR_BRL, "fonteEmprestimos": emp.get("fonte"),
            "fonte": "ESPN (elenco e transferências) · Wikipédia (emprestados, CC BY-SA 4.0) · valores e salários: estimativa do PLACAR"}, ultimas


def atualizar_clubes(clubes=None):
    cache = _ler("mercado-clubes.json")
    # a última transferência de cada jogador é relida a cada 3 dias (janela aberta muda rápido; fora dela, quase nada)
    if time.time() - cache.get("t_ultimas", 0) > 3 * 86400:
        ult, t = {}, time.time()
    else:
        ult, t = cache.get("ultimas", {}), cache["t_ultimas"]
    out = {}
    for cid in clubes or list(P.CLUBS):
        try:
            d, ult = elenco_clube(cid, ult)
            out[cid] = d
        except Exception as ex:
            P.log("mercado: clube", cid, ex)
    _gravar("mercado-clubes.json", {"ultimas": ult, "t_ultimas": t})
    return out


def gravar_js(clubes, glob=None):
    pasta = os.path.join(P.ROOT, "js", "mercado")
    os.makedirs(pasta, exist_ok=True)
    for cid, d in clubes.items():
        txt = (f"/* PLACAR — janela de transferências do {cid}: elenco, emprestados e folha. Fontes: ESPN, Wikipédia; valores e salários são estimativas. "
               f"Gerado por: python server/placar_api.py --snapshot */\nwindow.MERCADO = window.MERCADO || {{}};\nwindow.MERCADO[{json.dumps(cid)}] = "
               + json.dumps(P.clean_deep(d), ensure_ascii=False, separators=(",", ":")) + ";\n")
        open(os.path.join(pasta, f"{cid}.js"), "w", encoding="utf-8", newline="\n").write(txt)
    if glob:
        txt = ("/* PLACAR — mercado global: elencos das principais ligas (ESPN). Valores: estimativa do PLACAR. Gerado por: python server/placar_api.py --snapshot */\n"
               "window.MERCADO_GLOBAL = " + json.dumps(P.clean_deep(global_compacto(glob)), ensure_ascii=False, separators=(",", ":")) + ";\n")
        open(os.path.join(pasta, "global.js"), "w", encoding="utf-8", newline="\n").write(txt)
    P.log("mercado gravado em js/mercado/")
