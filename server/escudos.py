# © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE).
"""PLACAR — escudos dos clubes que a ESPN não tem (estaduais, Copa do Brasil, Séries C e D).

Caminho: artigo do clube na Wikipédia -> item do Wikidata -> propriedade "logotipo" (P154) -> arquivo no
Wikimedia Commons. O Commons só aceita imagens livres ou de domínio público (marcas simples, como a maioria dos
escudos, entram como "PD-textlogo"/"PD-Brazil"), então o site pode mostrá-las. Sem P154, fica o escudo desenhado
pelo site (iniciais nas cores do clube, cores tiradas da propriedade "cores" P6364 quando existe).
Cache: server/cache/escudos.json (nome -> {logo, arquivo, cores, artigo, t}); clubes sem escudo são relidos a cada 7 dias.
"""
import hashlib
import json
import os
import re
import time
import urllib.parse

P = None  # módulo placar_api

WP = "https://pt.wikipedia.org/w/api.php"
WD = "https://www.wikidata.org/w/api.php"
CLUBE = {"Q476028", "Q103229495", "Q847017", "Q15944511", "Q1194951", "Q20639856"}  # clube de futebol, clube esportivo...
# cores (itens do Wikidata) -> hex, para o escudo desenhado
CORES = {"Q23444": "#ffffff", "Q23445": "#111111", "Q3142": "#d21f2b", "Q1088": "#1f4fbf", "Q3133": "#1a9a4a", "Q943": "#f2c400",
         "Q39338": "#f28c00", "Q3257809": "#7a1f2b", "Q42491": "#8a8f98", "Q1341656": "#13235b", "Q5354": "#3fa0e0", "Q3307864": "#6a2c91",
         "Q1072195": "#0b2b6b", "Q2722041": "#0a4d2a", "Q47071": "#5a3a1a", "Q208045": "#ffd23f", "Q2104589": "#3fa0e0"}
_cache = None
_buscas = [0]  # buscas por nome feitas nesta execução


def _arq():
    return os.path.join(P.ROOT, "server", "cache", "escudos.json")


def _ler():
    global _cache
    if _cache is None:
        try:
            _cache = json.load(open(_arq(), encoding="utf-8"))
        except Exception:
            _cache = {}
    return _cache


def _gravar():
    try:
        os.makedirs(os.path.dirname(_arq()), exist_ok=True)
        json.dump(_cache, open(_arq(), "w", encoding="utf-8"), ensure_ascii=False)
    except Exception as ex:
        P.log("escudos: não gravou o cache", ex)


def thumb(arquivo, largura=120):  # o Commons só serve larguras padrão (120, 250, 330...)
    """URL direta da miniatura PNG no Commons (o mesmo esquema de pastas que o MediaWiki usa)."""
    nome = arquivo.replace(" ", "_")
    h = hashlib.md5(nome.encode("utf-8")).hexdigest()
    q = urllib.parse.quote(nome)
    if nome.lower().endswith(".svg"):
        return f"https://upload.wikimedia.org/wikipedia/commons/thumb/{h[0]}/{h[:2]}/{q}/{largura}px-{q}.png"
    return f"https://upload.wikimedia.org/wikipedia/commons/thumb/{h[0]}/{h[:2]}/{q}/{largura}px-{q}"


_ult = [0.0]


def _api(base, **p):
    """Consulta às APIs da Wikimedia em fila, no máximo ~2 por segundo, esperando e repetindo se pedirem calma (429)."""
    p.update(format="json", formatversion=2, maxlag=5)
    url = base + "?" + urllib.parse.urlencode(p)
    for tentativa in range(4):
        espera = _ult[0] + 0.6 - time.time()
        if espera > 0:
            time.sleep(espera)
        _ult[0] = time.time()
        try:
            return json.loads(P.get(url, headers={"User-Agent": "PlacarBot/1.0 (escudos de clubes de futebol)"}))
        except Exception as ex:
            if "429" in str(ex) or "503" in str(ex):
                time.sleep(5 * (tentativa + 1))
                continue
            raise
    raise RuntimeError("Wikimedia ocupada (429)")


def _itens(artigos):
    """artigo da Wikipédia -> QID do Wikidata (até 50 por consulta)."""
    out = {}
    for i in range(0, len(artigos), 50):
        d = _api(WP, action="query", titles="|".join(artigos[i:i + 50]), prop="pageprops", ppprop="wikibase_item", redirects=1)
        q = d.get("query", {})
        mapa = {x["from"]: x["to"] for x in q.get("normalized", []) + q.get("redirects", [])}
        por_titulo = {pg["title"]: (pg.get("pageprops") or {}).get("wikibase_item") for pg in q.get("pages", [])}
        for a in artigos[i:i + 50]:
            t = a
            for _ in range(3):
                t = mapa.get(t, t)
            out[a] = por_titulo.get(t)
    return out


def _dados(qids):
    """QID -> {logo, arquivo, cores, clube(bool)}."""
    out = {}
    qids = [q for q in qids if q]
    for i in range(0, len(qids), 50):
        d = _api(WD, action="wbgetentities", ids="|".join(qids[i:i + 50]), props="claims")
        for q, e in (d.get("entities") or {}).items():
            c = e.get("claims") or {}
            val = lambda p: [((x.get("mainsnak") or {}).get("datavalue") or {}).get("value") for x in c.get(p, []) if x.get("rank") != "deprecated"]
            tipos = {v.get("id") for v in val("P31") if isinstance(v, dict)}
            logos = [v for v in val("P154") if isinstance(v, str)]
            cores = [CORES.get(v.get("id")) for v in val("P6364") if isinstance(v, dict)]
            out[q] = {"arquivo": logos[0] if logos else None, "cores": [x for x in cores if x][:3], "clube": bool(tipos & CLUBE) or not tipos}
    return out


def _imagens_commons(artigos):
    """Imagem principal de cada artigo (caixa do clube), só se o arquivo estiver no Commons (livre)."""
    out = {}
    for i in range(0, len(artigos), 50):
        d = _api(WP, action="query", titles="|".join(artigos[i:i + 50]), prop="pageimages", piprop="name", redirects=1)
        q = d.get("query", {})
        mapa = {x["from"]: x["to"] for x in q.get("normalized", []) + q.get("redirects", [])}
        img = {pg["title"]: pg.get("pageimage") for pg in q.get("pages", [])}
        for a in artigos[i:i + 50]:
            t = a
            for _ in range(3):
                t = mapa.get(t, t)
            if img.get(t):
                out[a] = img[t].replace("_", " ")
    arqs = list(set(out.values()))
    no_commons = set()
    for i in range(0, len(arqs), 50):
        d = _api("https://commons.wikimedia.org/w/api.php", action="query", titles="|".join("File:" + x for x in arqs[i:i + 50]), prop="info")
        for pg in d.get("query", {}).get("pages", []):
            if not pg.get("missing") and pg.get("pageid"):
                no_commons.add(pg["title"].split(":", 1)[1])
    return {a: f for a, f in out.items() if f in no_commons and re.search(r"(logo|escudo|emblema|crest|bras[aã]o|badge|[.]svg$)", f, re.I)}


def por_artigos(artigos):
    """{artigo: {logo, arquivo, cores}} — com cache."""
    c = _ler()
    agora = time.time()
    falta = [a for a in dict.fromkeys(artigos) if a and (a not in c or (not c[a].get("logo") and agora - c[a].get("t", 0) > 7 * 86400))]
    if falta:
        try:
            qs = _itens(falta)
            dd = _dados(list(set(qs.values())))
            sem = [a for a in falta if not (dd.get(qs.get(a)) or {}).get("arquivo")]
            extra = _imagens_commons(sem) if sem else {}
            for a in extra:
                if qs.get(a) in dd:
                    dd[qs[a]]["arquivo"] = extra[a]
                else:
                    dd[f"_{a}"] = {"arquivo": extra[a], "cores": []}; qs[a] = f"_{a}"
            for a in falta:
                x = dd.get(qs.get(a)) or {}
                arq = x.get("arquivo")
                c[a] = {"logo": thumb(arq) if arq else None, "arquivo": arq, "cores": x.get("cores") or [], "qid": qs.get(a), "t": agora}
            _gravar()
        except Exception as ex:
            P.log("escudos (artigos)", ex)
    return {a: c.get(a) or {} for a in artigos if a}


def _norm(x):
    return P.norm_txt(x)


def artigo_por_nome(nome, uf=None):
    """Procura o artigo do clube na Wikipédia pelo nome que a ESPN usa (com cache)."""
    c = _ler()
    k = f"@{nome}|{uf or ''}"
    if k in c and time.time() - c[k].get("t", 0) < (30 if c[k].get("artigo") else 3) * 86400:
        return c[k].get("artigo")
    limpo = re.sub(r"\b(U20|U-20|Sub-20)\b", "", nome).strip()
    limpo = re.sub(r"\s+\(([A-Z]{2})\)$|\s+([A-Z]{2})$", "", limpo).strip() if re.search(r"\s\(?[A-Z]{2}\)?$", limpo) else limpo
    art = None
    try:
        busca = f'{limpo} clube futebol {uf or ""}'.strip()
        d = _api(WP, action="query", list="search", srsearch=busca, srlimit=5, srnamespace=0)
        cand = [x["title"] for x in d.get("query", {}).get("search", [])]
        qs = _itens(cand) if cand else {}
        dd = _dados(list(set(v for v in qs.values() if v))) if qs else {}
        alvo = set(_norm(limpo).split()) - {"fc", "ec", "sc", "ac", "clube", "esporte", "futebol"}
        for t in cand:
            info = dd.get(qs.get(t)) or {}
            if not info.get("clube"):
                continue
            if alvo and not alvo & set(_norm(t).split()):
                continue
            art = t
            break
    except Exception as ex:
        P.log("escudos (busca)", nome, ex)
        return None
    c[k] = {"artigo": art, "t": time.time()}
    _gravar()
    return art


def completar(times, uf=None):
    """Preenche "logo" (e "cores") dos times sem escudo. times: lista de dicts com "nome" (e "artigo" opcional)."""
    sem = [t for t in times if not t.get("logo")]
    if not sem:
        return
    for t in sem:
        if not t.get("artigo"):
            # no máximo 40 buscas novas por execução do robô (a Wikimedia limita o ritmo; o resto fica para a próxima)
            k = f"@{t['nome']}|{t.get('uf') or uf or ''}"
            if k not in _ler() and _buscas[0] >= 40:
                continue
            if k not in _ler():
                _buscas[0] += 1
            t["artigo"] = artigo_por_nome(t["nome"], t.get("uf") or uf)
    info = por_artigos([t["artigo"] for t in sem if t.get("artigo")])
    for t in sem:
        x = info.get(t.get("artigo")) or {}
        if x.get("logo"):
            t["logo"] = x["logo"]
            t["logoFonte"] = "Wikimedia Commons"
        if x.get("cores"):
            t["cores"] = x["cores"]
