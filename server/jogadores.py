# © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE).
"""PLACAR — jogadores: estatísticas por jogo e da temporada, mapa de calor com os lances reais e fotos com licença livre.

Fontes
- Lances com coordenadas (passes, desarmes, cruzamentos, finalizações...): feed de lances da ESPN
  (sports.core.api.espn.com .../plays), um registro por ação, com o jogador e o ponto do campo (x: 0 = o próprio gol,
  100 = o gol adversário; y: lado). É a base do mapa de calor: cada ação do jogador é um ponto no campo.
- Minutos, gols, assistências, finalizações e cartões de cada jogo: súmulas da ESPN (as mesmas do resto do site).
- Fotos: primeiro o Flickr, pela API oficial (chave FLICKR_API_KEY): fotos da temporada atual com licença que permite o uso
  (Creative Commons com atribuição ou domínio público), com o nome do jogador no título ou nas etiquetas, com crédito ao
  fotógrafo e link para a foto. "Todos os direitos reservados" (o padrão do Flickr) não entra: crédito não substitui a licença.
  Sem foto no Flickr (ou sem a chave), o Wikimedia Commons (licença livre, achada pelo Wikidata e conferida pelo nome e
  pelo ano de nascimento).
- Opta (Stats Perform): os termos do site optaplayerstats.statsperform.com proíbem usar o conteúdo em outro site sem
  autorização escrita, e o site bloqueia acesso automático. Com uma licença da API oficial do Opta, os dados entram
  por `fonte_opta()`, no mesmo formato.

Saída: js/jogadores/<clube>.js (um arquivo por clube, baixado só nas páginas de jogador e no "Bora pro jogo").
"""
import json
import os
import re
import time
import unicodedata
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

P = None  # módulo placar_api (helpers: get_json, log, CLUBS, COMP_NAME, match_extract...), ligado em placar_api.py

GX, GY = 24, 16  # grade do mapa de calor: 24 faixas de profundidade x 16 de largura
ESPN_CORE = "https://sports.core.api.espn.com/v2/sports/soccer/leagues"
LANCES_VERSAO = 2
# tipo de lance da ESPN -> número no site
ACOES = {"Pass": "passes", "Cross": "cruz", "Tackle": "desarmes", "Attempted tackle": "desarmesT", "Interception": "intercept",
         "Clear": "cortes", "Take On": "dribles", "Aerial": "aereos", "Dispossessed": "perdas", "Save": "defesas",
         "Ball touch": "toques1", "Blocked Pass": "passesBloq", "Shot Off Target": "fin", "Shot On Target": "fin", "Shot Blocked": "fin",
         "Goal": "fin", "Foul": "faltas", "Throw In": "laterais", "Corner Awarded": "escanteios", "Free Kick": "faltasCob", "Offside": "impedimentos"}
CAMPOS_JOGO = ["eid", "date", "comp", "opp", "home", "gf", "ga", "tit", "min", "g", "a", "ch", "alvo", "ca", "cv",
               "toques", "passes", "cruz", "desarmes", "intercept", "cortes", "dribles", "aereos", "defesas", "perdas"]
SOMA = ["j", "tit", "min", "g", "a", "ch", "alvo", "pen", "ca", "cv", "toques", "passes", "cruz", "desarmes", "intercept", "cortes", "dribles", "aereos", "defesas", "perdas", "jl"]
NIVEIS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"  # 62 níveis por célula


def _cache(nome):
    return os.path.join(P.HERE, "cache", nome)


def _ler(nome):
    try:
        return json.load(open(_cache(nome), encoding="utf-8"))
    except Exception:
        return {}


def _gravar(nome, dados):
    os.makedirs(os.path.dirname(_cache(nome)), exist_ok=True)
    tmp = _cache(nome) + ".tmp"
    json.dump(dados, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, _cache(nome))


# ---------------------------------------------------------------------------
# Lances com coordenadas de um jogo
# ---------------------------------------------------------------------------
ATLETA = re.compile(r"/athletes/(\d+)")


def lances(eid, lg):
    """Por jogador: grade de ações {célula: n} e contagem por tipo. Só jogos encerrados (o cache não muda depois).
    Em parte dos jogos a ESPN grava as coordenadas de 0 a 1 em vez de 0 a 100: a escala é detectada em cada jogo."""
    itens, pagina, paginas = [], 1, 1
    while pagina <= paginas and pagina <= 6:
        d = P.get_json(f"{ESPN_CORE}/{lg}/events/{eid}/competitions/{eid}/plays?limit=1000&page={pagina}")
        paginas = int(d.get("pageCount") or 1)
        itens.extend(d.get("items", []))
        pagina += 1
    xs = [pl.get("fieldPositionX") for pl in itens if isinstance(pl.get("fieldPositionX"), (int, float)) and pl.get("fieldPositionX")]
    ys = [pl.get("fieldPositionY") for pl in itens if isinstance(pl.get("fieldPositionY"), (int, float)) and pl.get("fieldPositionY")]
    escala = 100 if xs and max(xs + ys) <= 1.0001 else 1
    out = {}
    for pl in itens:
        tipo = (pl.get("type") or {}).get("text") or ""
        part = pl.get("participants") or []
        if not part:
            continue
        m = ATLETA.search(((part[0].get("athlete") or {}).get("$ref")) or "")
        if not m:
            continue
        q = out.setdefault(m.group(1), {"g": {}, "c": {}})
        k = ACOES.get(tipo)
        if k:
            q["c"][k] = q["c"].get(k, 0) + 1
        x, y = pl.get("fieldPositionX"), pl.get("fieldPositionY")
        # (0, 0) é "sem posição" na ESPN
        if isinstance(x, (int, float)) and isinstance(y, (int, float)) and (x or y):
            x, y = x * escala, y * escala
            # ESPN: y = 0 é o lado direito de quem ataca; no site, y = 0 é a esquerda
            ix, iy = min(GX - 1, max(0, int(x / 100 * GX))), min(GY - 1, max(0, int((100 - y) / 100 * GY)))
            cel = str(iy * GX + ix)
            q["g"][cel] = q["g"].get(cel, 0) + 1
            q["c"]["toques"] = q["c"].get("toques", 0) + 1
    return out


# ---------------------------------------------------------------------------
# Jogos da temporada de cada clube (todas as competições)
# ---------------------------------------------------------------------------
def jogos_temporada():
    """[(eid, lg, comp)] dos jogos encerrados dos 20 clubes, em todas as competições (do calendário do site)."""
    with P.lock:
        fm = (P.state.get("form") or {}).get("clubs") or {}
    vistos = {}
    for c in fm.values():
        for e in c.get("all", []):
            if e.get("state") == "post" and e.get("lg") and re.fullmatch(r"\d{4,12}", str(e.get("id"))):
                vistos[e["id"]] = (e["id"], e["lg"], e["comp"])
    return sorted(vistos.values())


def atualizar_partidas(matches):
    """Baixa o que falta: súmulas das outras competições e lances de todos os jogos encerrados (em paralelo)."""
    outras, lan = _ler("partidas-outras.json"), _ler("lances.json")
    jogos = jogos_temporada()
    falta_sum = [(e, lg, c) for e, lg, c in jogos if lg != "bra.1" and (e not in outras or outras[e].get("v", 0) < P.MATCH_VERSION)]
    falta_lan = [(e, lg, c) for e, lg, c in jogos if e not in lan or lan[e].get("v", 0) < LANCES_VERSAO]

    def sumula(item):
        e, lg, comp = item
        try:
            m = P.match_extract(e, lg)
            m.update(lg=lg, comp=comp)
            return e, m
        except Exception as ex:
            P.log("súmula (outras)", e, ex)
            return e, None

    def jogo_lances(item):
        e, lg, _ = item
        try:
            return e, {"v": LANCES_VERSAO, "p": lances(e, lg)}
        except Exception as ex:
            P.log("lances", e, ex)
            return e, None

    with ThreadPoolExecutor(max_workers=6) as ex:
        for e, m in ex.map(sumula, falta_sum):
            if m:
                outras[e] = m
        feitos = 0
        for e, m in ex.map(jogo_lances, falta_lan):
            if m:
                lan[e] = m
                feitos += 1
                if feitos % 40 == 0:
                    _gravar("lances.json", lan)  # não perde o trabalho se o robô parar no meio
    _gravar("partidas-outras.json", outras)
    _gravar("lances.json", lan)
    P.log(f"jogadores: {len(falta_sum)} súmulas e {len(falta_lan)} jogos de lances baixados")
    comp_de = {e: c for e, _, c in jogos}
    todas = {e: dict(m, comp="Brasileirão", lg="bra.1") for e, m in matches.items()}
    for e, m in outras.items():
        todas[e] = dict(m, comp=m.get("comp") or comp_de.get(e, "Outros"))
    return todas, lan


# ---------------------------------------------------------------------------
# Fotos: Wikidata + Wikimedia Commons (licença livre), conferidas com o elenco
# ---------------------------------------------------------------------------
FOTOS_VERSAO = 4
UA = {"User-Agent": "placar-portfolio/1.0 (projeto de portfolio; https://alansouzadev7.github.io/Projeto_PeladinhaFC/)"}


def _norm(x):
    x = unicodedata.normalize("NFD", str(x or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]", " ", x).split()


def _wjson(url):
    return json.loads(P.get(url, headers={**UA, "Accept": "application/sparql-results+json, application/json"}, timeout=40))


# nome oficial (o curto, como "Cruzeiro", acha navio, cidade e cruz antes do clube)
NOME_OFICIAL = {"cruzeiro": "Cruzeiro Esporte Clube", "flamengo": "Clube de Regatas do Flamengo", "palmeiras": "Sociedade Esportiva Palmeiras",
                "vasco": "Club de Regatas Vasco da Gama", "botafogo": "Botafogo de Futebol e Regatas", "santos": "Santos Futebol Clube",
                "gremio": "Grêmio Foot-Ball Porto Alegrense", "internacional": "Sport Club Internacional", "bahia": "Esporte Clube Bahia",
                "vitoria": "Esporte Clube Vitória", "remo": "Clube do Remo", "mirassol": "Mirassol Futebol Clube", "coritiba": "Coritiba Foot Ball Club",
                "fluminense": "Fluminense Football Club", "corinthians": "Sport Club Corinthians Paulista", "sao-paulo": "São Paulo Futebol Clube",
                "atletico-mg": "Clube Atlético Mineiro", "athletico-pr": "Club Athletico Paranaense", "bragantino": "Red Bull Bragantino",
                "chapecoense": "Associação Chapecoense de Futebol"}


def qid_clube(cid):
    cache = _ler("wikidata-clubes.json")
    if cache.get(cid):
        return cache[cid]
    nome = NOME_OFICIAL.get(cid) or P.CLUBS[cid].get("busca") or cid
    # o item que é "clube de futebol" (Q476028) com esse nome, em português ou inglês (o masculino, não o time feminino)
    sparql = ('SELECT ?c WHERE { VALUES ?n { "%s"@pt "%s"@en } ?c rdfs:label ?n; wdt:P31 wd:Q476028. '
              'FILTER NOT EXISTS { ?c wdt:P2094 wd:Q1451227 } } LIMIT 3' % (nome, nome))
    d = _wjson("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": sparql}))
    achados = [b["c"]["value"].rsplit("/", 1)[-1] for b in d.get("results", {}).get("bindings", [])]
    q = achados[0] if achados else None
    cache[cid] = q
    _gravar("wikidata-clubes.json", cache)
    return q


def fotos_clube(cid, elenco):
    """{id ESPN: {url, autor, licenca, pagina}} para os jogadores do elenco com foto livre no Commons."""
    q = qid_clube(cid)
    if not q:
        return {}
    sparql = ("SELECT ?p ?pLabel ?img ?nasc (GROUP_CONCAT(DISTINCT ?alt; separator='|') AS ?alts) WHERE { ?p wdt:P54 wd:%s; wdt:P18 ?img. "
              "OPTIONAL { ?p wdt:P569 ?nasc } OPTIONAL { ?p skos:altLabel ?alt FILTER(LANG(?alt) IN ('pt','en','es')) } "
              "SERVICE wikibase:label { bd:serviceParam wikibase:language 'pt,en,es'. } } GROUP BY ?p ?pLabel ?img ?nasc" % q)
    d = _wjson("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": sparql}))
    cand = []
    for b in d.get("results", {}).get("bindings", []):
        nomes = [b.get("pLabel", {}).get("value", "")] + [a for a in (b.get("alts", {}).get("value") or "").split("|") if a]
        ano = int(b["nasc"]["value"][:4]) if b.get("nasc", {}).get("value", "")[:4].isdigit() else None
        cand.append({"nomes": [" ".join(_norm(n)) for n in nomes if n], "ano": ano, "img": b["img"]["value"]})
    escolhidos, ano_atual = {}, int(time.strftime("%Y"))
    for num, nome, pos, idade, aid in elenco:
        if not aid:
            continue
        alvo = " ".join(_norm(nome))
        if not alvo:
            continue
        mesmo_ano = lambda c: bool(idade and c["ano"] and abs((ano_atual - c["ano"]) - idade) <= 1)
        exato = [c for c in cand if alvo in c["nomes"] and (not idade or not c["ano"] or mesmo_ano(c))]
        tk = set(alvo.split())
        # "Gerson" x "Gerson Santos da Silva": todas as palavras do nome da ESPN no nome completo, e o mesmo ano de nascimento
        contido = [c for c in cand if mesmo_ano(c) and any(tk <= set(n.split()) for n in c["nomes"])]
        if len(exato) == 1 and (exato[0]["ano"] or sum(1 for c in cand if alvo in c["nomes"]) == 1):
            escolhidos[aid] = exato[0]["img"]
        elif not exato and len(contido) == 1:
            escolhidos[aid] = contido[0]["img"]
    faltam = [(nome, idade, aid) for num, nome, pos, idade, aid in elenco if aid and aid not in escolhidos and idade and len(nome) > 3]
    for i in range(0, len(faltam), 60):
        lote = faltam[i:i + 60]
        vals = " ".join(f'"{n.replace(chr(34), "")}"@pt "{n.replace(chr(34), "")}"@en' for n, _, _ in lote)
        sp = ("SELECT ?n ?img ?nasc WHERE { VALUES ?n { %s } ?p rdfs:label ?n; wdt:P106 wd:Q937857; wdt:P18 ?img; wdt:P569 ?nasc. }" % vals)
        try:
            r = _wjson("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": sp}))
        except Exception as ex:
            P.log("fotos (nome)", cid, ex)
            continue
        por_nome = {}
        for b in r.get("results", {}).get("bindings", []):
            por_nome.setdefault(b["n"]["value"], []).append((int(b["nasc"]["value"][:4]) if b["nasc"]["value"][:4].isdigit() else None, b["img"]["value"]))
        for nome, idade, aid in lote:
            ok = {img for ano, img in por_nome.get(nome, []) if ano and abs((ano_atual - ano) - idade) <= 1}
            if len(ok) == 1:  # um só jogador com esse nome e essa idade
                escolhidos[aid] = ok.pop()
        time.sleep(1)
    if not escolhidos:
        return {}
    # crédito e miniatura de cada arquivo (Commons)
    arqs = {aid: urllib.parse.unquote(u.rsplit("/", 1)[-1]).replace("_", " ") for aid, u in escolhidos.items()}
    info = {}
    titulos = list(set(arqs.values()))
    for i in range(0, len(titulos), 40):
        lote = titulos[i:i + 40]
        r = _wjson("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
            "action": "query", "format": "json", "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 320,
            "titles": "|".join("File:" + t for t in lote)}))
        norm = {n["to"]: n["from"] for n in r.get("query", {}).get("normalized", [])}
        for pg in r.get("query", {}).get("pages", {}).values():
            ii = (pg.get("imageinfo") or [{}])[0]
            md = ii.get("extmetadata") or {}
            autor = re.sub(r"<[^>]+>", "", (md.get("Artist") or {}).get("value", "")).strip()
            lic = (md.get("LicenseShortName") or {}).get("value", "")
            if not ii.get("thumburl") or not re.search(r"CC|Public domain|domínio público|GFDL|CC0", lic, re.I):
                continue
            t = pg.get("title", "")[5:]
            info[norm.get("File:" + t, "File:" + t)[5:]] = {"url": ii["thumburl"], "autor": P.clean_text(autor, 80) or "autor não informado",
                                                            "licenca": P.clean_text(lic, 40), "pagina": ii.get("descriptionurl")}
    return {aid: info[t] for aid, t in arqs.items() if t in info}


# ---------------------------------------------------------------------------
# Fotos do Flickr (API oficial; só licenças que permitem o uso, só da temporada atual)
# ---------------------------------------------------------------------------
FLICKR_API = "https://api.flickr.com/services/rest/"
NOME_CURTO = {"atletico-mg": "Atlético Mineiro", "athletico-pr": "Athletico Paranaense", "sao-paulo": "São Paulo", "vasco": "Vasco", "bragantino": "Bragantino"}


def _flickr(metodo, **params):
    chave = os.environ.get("FLICKR_API_KEY", "").strip()
    if not chave:
        return None
    q = {"method": metodo, "api_key": chave, "format": "json", "nojsoncallback": 1, **params}
    d = json.loads(P.get(FLICKR_API + "?" + urllib.parse.urlencode(q), headers=UA, timeout=30))
    if d.get("stat") != "ok":
        raise ValueError(f"Flickr: {d.get('message') or d.get('stat')}")
    return d


def licencas_flickr():
    """{id: nome} das licenças que permitem usar a foto com crédito: Creative Commons com atribuição (inclusive não comercial;
    o site é um portfólio sem fins comerciais), CC0 e domínio público. Ficam de fora "todos os direitos reservados" e as
    "sem derivações" (o site recorta a foto num círculo). FLICKR_SEM_NC=1 tira também as não comerciais."""
    d = _flickr("flickr.photos.licenses.getInfo")
    ok = {}
    for l in (d or {}).get("licenses", {}).get("license", []):
        nome = l.get("name") or ""
        if re.search(r"NoDerivs|No Derivative|NoDerivatives|All Rights Reserved", nome, re.I):
            continue
        if os.environ.get("FLICKR_SEM_NC") == "1" and re.search(r"NonCommercial", nome, re.I):
            continue
        if re.search(r"Attribution|Public Domain|No known copyright|CC0", nome, re.I):
            ok[str(l["id"])] = nome
    return ok


def _sigla_licenca(nome):
    n = nome or ""
    if re.search(r"Public Domain Dedication|CC0", n, re.I):
        return "CC0"
    if re.search(r"Public Domain Mark|No known copyright", n, re.I):
        return "Domínio público"
    partes = ["CC BY"] + (["NC"] if re.search(r"NonCommercial", n, re.I) else []) + (["SA"] if re.search(r"ShareAlike", n, re.I) else [])
    ver = re.search(r"(\d\.\d)", n)
    return "-".join(partes).replace("CC BY-", "CC BY-") + (f" {ver.group(1)}" if ver else "")


def fotos_flickr(cid, elenco, licencas):
    """{id ESPN: foto} com a melhor foto da temporada de cada jogador no Flickr (licença livre, nome no título ou etiquetas)."""
    if not licencas:
        return {}
    clube = NOME_CURTO.get(cid) or (P.CLUBS[cid].get("busca") or cid)
    ano = time.strftime("%Y")
    out = {}
    for num, nome, pos, idade, aid in elenco:
        if not aid or not nome or len(nome) < 3:
            continue
        try:
            d = _flickr("flickr.photos.search", text=f'"{nome}" {clube}', license=",".join(licencas), min_taken_date=f"{ano}-01-01",
                        media="photos", content_types=0, safe_search=1, sort="relevance", per_page=15,
                        extras="license,owner_name,url_n,url_m,url_z,date_taken,tags")
        except Exception as ex:
            P.log("Flickr", cid, nome, ex)
            continue
        alvo = set(_norm(nome))
        for ph in (d or {}).get("photos", {}).get("photo", []):
            txt = set(_norm(ph.get("title", ""))) | set(_norm(ph.get("tags", "")))
            url = ph.get("url_z") or ph.get("url_m") or ph.get("url_n")
            # o nome inteiro do jogador no título ou nas etiquetas; foto desta temporada; licença conferida de novo
            if not url or not alvo <= txt or str(ph.get("license")) not in licencas or not str(ph.get("datetaken", "")).startswith(ano):
                continue
            if not re.match(r"^https://live\.staticflickr\.com/", url):
                continue
            out[str(aid)] = {"url": url, "autor": P.clean_text(ph.get("ownername") or "autor no Flickr", 80), "licenca": _sigla_licenca(licencas[str(ph["license"])]),
                             "pagina": f"https://www.flickr.com/photos/{urllib.parse.quote(str(ph.get('owner', '')))}/{int(ph['id'])}", "fonte": "Flickr",
                             "data": str(ph.get("datetaken", ""))[:10]}
            break
        time.sleep(0.4)  # bem abaixo do limite da API (3.600 consultas por hora)
    return out


def atualizar_fotos(squads):
    """Uma vez por semana (as fotos quase não mudam). Flickr (temporada atual) primeiro; sem ele, Wikimedia Commons."""
    cache = _ler("fotos-jogadores.json")
    com_flickr = bool(os.environ.get("FLICKR_API_KEY", "").strip())
    if cache.get("v") == FOTOS_VERSAO and cache.get("flickr") == com_flickr and cache.get("quando", 0) > time.time() - 7 * 86400 and cache.get("clubes"):
        return cache["clubes"]
    try:
        licencas = licencas_flickr() if com_flickr else {}
    except Exception as ex:
        P.log("Flickr (licenças)", ex)
        licencas = {}
    out = {}
    for cid in P.CLUBS:
        try:
            out[cid] = {k: dict(v, fonte=v.get("fonte") or "Wikimedia Commons") for k, v in fotos_clube(cid, squads.get(cid, [])).items()}
        except Exception as ex:
            P.log("fotos", cid, ex)
            out[cid] = (cache.get("clubes") or {}).get(cid, {})
        try:
            out[cid].update(fotos_flickr(cid, squads.get(cid, []), licencas))  # a do Flickr (desta temporada) vale mais
        except Exception as ex:
            P.log("fotos (Flickr)", cid, ex)
        time.sleep(1)
    _gravar("fotos-jogadores.json", {"v": FOTOS_VERSAO, "flickr": com_flickr, "quando": time.time(), "clubes": out})
    return out


# ---------------------------------------------------------------------------
# Rosto centrado: o círculo da foto é recortado em volta do rosto (OpenCV, detector de rostos que vem com ela)
# Sem a OpenCV instalada, nada muda: o site usa o recorte padrão (um pouco acima do centro).
# ---------------------------------------------------------------------------
ROSTO_VERSAO = 2
_detectores = None


def _cv():
    global _detectores
    if _detectores is None:
        try:
            import cv2  # opencv-python-headless
            base = cv2.data.haarcascades
            cc = lambda n: cv2.CascadeClassifier(base + n)
            _detectores = (cv2, cc("haarcascade_frontalface_default.xml"), cc("haarcascade_frontalface_alt2.xml"), cc("haarcascade_profileface.xml"),
                           cc("haarcascade_eye.xml"))
        except Exception as ex:
            P.log("rosto: OpenCV indisponível", ex)
            _detectores = False
    return _detectores


def _sobrepoe(a, b):
    ax, ay, aw, ah = a; bx, by, bw, bh = b
    ix, iy = max(0, min(ax + aw, bx + bw) - max(ax, bx)), max(0, min(ay + ah, by + bh) - max(ay, by))
    return ix * iy / float(min(aw * ah, bw * bh) or 1) > 0.4


def recorte_rosto(dados):
    """[x, y, lado_x, lado_y] do quadrado em volta do rosto, em frações da imagem (ou None se não achar um rosto).
    Um rosto só vale se for confirmado: olho achado dentro dele, ou dois detectores diferentes concordando
    (evita recortar uma bola, uma placa ou a torcida desfocada)."""
    d = _cv()
    if not d:
        return None
    cv2, frontal, alt, perfil, olho = d
    import numpy as np
    img = cv2.imdecode(np.frombuffer(dados, np.uint8), cv2.IMREAD_GRAYSCALE)
    if img is None:
        return None
    H, W = img.shape[:2]
    img = cv2.equalizeHist(img)
    minimo = (max(18, W // 14), max(18, W // 14))
    fr = [tuple(r) for r in frontal.detectMultiScale(img, 1.08, 5, minSize=minimo)]
    al = [tuple(r) for r in alt.detectMultiScale(img, 1.08, 4, minSize=minimo)]
    pe = [tuple(r) for r in perfil.detectMultiScale(img, 1.08, 5, minSize=minimo)]
    esp = cv2.flip(img, 1)
    pe += [(W - x - w, y, w, h) for x, y, w, h in perfil.detectMultiScale(esp, 1.08, 5, minSize=minimo)]

    def olhos(r):
        x, y, w, h = r
        parte = img[y:y + int(h * 0.6), x:x + w]
        return len(olho.detectMultiScale(parte, 1.1, 4, minSize=(max(6, w // 9), max(6, w // 9)))) if parte.size else 0
    cand = []
    for r in set(fr + al + pe):
        votos = sum(1 for grupo in (fr, al, pe) if any(_sobrepoe(r, q) for q in grupo))
        if votos >= 2 or olhos(r) >= 1:
            cand.append(r)
    if not cand:
        return None
    # o maior rosto confirmado (em foto com mais gente, o jogador costuma estar em primeiro plano)
    x, y, w, h = max(cand, key=lambda r: r[2] * r[3])
    lado = min(W, H, int(max(w, h) * 2.3))  # o rosto ocupa ~40% do círculo, com cabelo e queixo
    cx, cy = x + w / 2, y + h / 2 + h * 0.08
    x0 = min(max(0, cx - lado / 2), W - lado)
    y0 = min(max(0, cy - lado / 2), H - lado)
    return [round(x0 / W, 4), round(y0 / H, 4), round(lado / W, 4), round(lado / H, 4)]


def rostos_fotos(fotos):
    """Põe o recorte do rosto em cada foto (guardado por endereço: cada foto é analisada uma vez)."""
    cache = _ler("rostos.json")
    if cache.get("v") != ROSTO_VERSAO:
        cache = {"v": ROSTO_VERSAO, "fotos": {}}
    if not _cv():
        return fotos
    novos = 0
    for cl in fotos.values():
        for f in cl.values():
            url = str(f.get("url") or "").split("?")[0]
            if not url:
                continue
            if url not in cache["fotos"]:
                try:
                    cache["fotos"][url] = recorte_rosto(P.get(url, headers=UA, timeout=30)) or 0
                except Exception as ex:
                    P.log("rosto", url[-60:], ex)
                    continue
                novos += 1
                time.sleep(0.2)
            r = cache["fotos"][url]
            if r:
                f["rosto"] = r
            else:
                f.pop("rosto", None)
    if novos:
        _gravar("rostos.json", cache)
        achados = sum(1 for v in cache["fotos"].values() if v)
        P.log(f"rostos: {novos} fotos analisadas; rosto achado em {achados} de {len(cache['fotos'])}")
    return fotos


# ---------------------------------------------------------------------------
# Montagem por clube
# ---------------------------------------------------------------------------
def _grade_txt(g):
    if not g:
        return ""
    mx = max(g.values()) or 1
    cel = ["0"] * (GX * GY)
    for k, v in g.items():
        # raiz quadrada: o calor das áreas pouco frequentadas continua visível
        cel[int(k)] = NIVEIS[max(1, round((v / mx) ** 0.5 * 61))]
    return "".join(cel)


def _soma(dst, src):
    for k, v in src.items():
        dst[k] = dst.get(k, 0) + v


def montar(squads, todas, lan, fotos):
    by_espn = {str(c["espn"]): cid for cid, c in P.CLUBS.items()}
    por_jogador = {}  # aid -> lista de (data, linha do jogo, grade)
    for eid, m in todas.items():
        placar, casa = m.get("placar") or {}, m.get("home")
        ids = list((m.get("teams") or {}).keys())
        for tid, rows in (m.get("teams") or {}).items():
            outro = next((t for t in ids if t != tid), None)
            cid = by_espn.get(str(tid))
            if not cid:
                continue
            for row in rows:
                aid, nome, tit, mins, ca, cv, g, a, ch, alvo, pen = row[:11]
                if not mins:
                    continue
                L = ((lan.get(eid) or {}).get("p") or {}).get(str(aid)) or {"g": {}, "c": {}}
                c = L["c"]
                jogo = {"eid": eid, "date": m.get("date"), "comp": m.get("comp"), "opp": by_espn.get(str(outro)) or (m.get("nomes") or {}).get(str(outro)) or None,
                        "home": 1 if str(casa) == str(tid) else 0, "gf": placar.get(str(tid)), "ga": placar.get(str(outro)), "tit": 1 if tit else 0, "min": mins,
                        "g": g, "a": a, "ch": ch, "alvo": alvo, "pen": pen, "ca": ca, "cv": cv, "toques": c.get("toques", 0),
                        "passes": c.get("passes", 0), "cruz": c.get("cruz", 0), "desarmes": c.get("desarmes", 0), "intercept": c.get("intercept", 0),
                        "cortes": c.get("cortes", 0), "dribles": c.get("dribles", 0), "aereos": c.get("aereos", 0), "defesas": c.get("defesas", 0),
                        "perdas": c.get("perdas", 0), "_g": L["g"], "_l": 1 if L["g"] else 0, "_cid": cid, "_nome": nome}
                por_jogador.setdefault(str(aid), []).append(jogo)
    # a ESPN às vezes usa o mesmo número para dois jogadores de clubes diferentes (homônimos) ou tira do elenco
    # quem ainda joga: cada clube leva quem está no elenco e quem jogou por ele na temporada
    vistos_clube = {}
    for aid, lista in por_jogador.items():
        for j in lista:
            vistos_clube.setdefault(j["_cid"], {}).setdefault(aid, j["_nome"])
    clubes = {}
    for cid in P.CLUBS:
        jog = {}
        elenco = [list(r) for r in squads.get(cid, [])]
        no_elenco = {str(r[4]) for r in elenco if r[4]}
        for aid, nome in vistos_clube.get(cid, {}).items():
            if aid not in no_elenco:
                elenco.append([None, nome, "M", None, aid])
        for num, nome, pos, idade, aid in elenco:
            if not aid:
                continue
            lista = sorted((j for j in por_jogador.get(str(aid), []) if j["_cid"] == cid), key=lambda j: j["date"] or "")
            outros = sorted((j for j in por_jogador.get(str(aid), []) if j["_cid"] != cid), key=lambda j: j["date"] or "")
            comps, grade, grade10 = {}, {}, {}
            for j in lista:
                t = comps.setdefault(j["comp"], {k: 0 for k in SOMA})
                t["j"] += 1
                t["jl"] += j["_l"]
                for k in SOMA[1:-1]:
                    t[k] += j.get(k, 0) or 0
                _soma(grade, j["_g"])
            for j in lista[-10:]:
                _soma(grade10, j["_g"])
            r = {"n": nome, "num": num, "pos": pos, "idade": idade, "comps": comps,
                 "jogos": [[j[k] for k in CAMPOS_JOGO] for j in lista],
                 "calor": _grade_txt(grade), "calor10": _grade_txt(grade10), "lances": sum(grade.values())}
            # jogou por outro clube da Série A nesta temporada (transferência): só quando os períodos não se cruzam;
            # se se cruzam, é a ESPN usando o mesmo número para dois jogadores diferentes
            if outros and lista:
                ini, fim = lista[0]["date"] or "", lista[-1]["date"] or ""
                ant = {}
                for x in outros:
                    ant.setdefault(x["_cid"], []).append(x["date"] or "")
                r["antes"] = [[k, len(v)] for k, v in ant.items() if max(v) < ini or min(v) > fim]
                if not r["antes"]:
                    del r["antes"]
            if fotos.get(cid, {}).get(str(aid)):
                f = fotos[cid][str(aid)]
                r["foto"] = dict(f, url=str(f.get("url") or "").split("?")[0], fonte=f.get("fonte") or "Wikimedia Commons")  # sem os parâmetros de rastreamento do Commons
            jog[str(aid)] = r
        clubes[cid] = {"updated": time.strftime("%d/%m/%Y às %H:%M"), "club": cid, "grade": [GX, GY], "campos": CAMPOS_JOGO,
                       "fontes": {"lances": "ESPN (lances com coordenadas)", "sumulas": "ESPN", "fotos": "Flickr (licença livre, temporada atual) e Wikimedia Commons"}, "jogadores": jog}
    return clubes


def fonte_opta():
    """Ponto de troca para a API oficial do Opta (Stats Perform). Exige contrato de licença; sem ele não há o que ler.
    Com a licença, este é o lugar de trocar lances() e as súmulas pelo feed do Opta, no mesmo formato de saída."""
    return None


def atualizar(squads, matches):
    """Tudo: partidas que faltam, fotos e os arquivos por clube. Devolve {clube: dados}."""
    todas, lan = atualizar_partidas(matches)
    try:
        fotos = atualizar_fotos(squads)
    except Exception as ex:
        P.log("fotos", ex)
        fotos = (_ler("fotos-jogadores.json").get("clubes")) or {}
    try:
        fotos = rostos_fotos(fotos)
    except Exception as ex:
        P.log("rostos", ex)
    return montar(squads, todas, lan, fotos)


def gravar_js(clubes):
    pasta = os.path.join(P.ROOT, "js", "jogadores")
    os.makedirs(pasta, exist_ok=True)
    for cid, d in clubes.items():
        txt = (f"/* PLACAR — jogadores do clube: estatísticas por jogo, temporada, mapa de calor (lances da ESPN) e fotos livres (Wikimedia Commons). "
               f"Gerado por: python server/placar_api.py --snapshot */\nwindow.JOGADORES_CLUBE = window.JOGADORES_CLUBE || {{}};\n"
               f"window.JOGADORES_CLUBE[{json.dumps(cid)}] = " + json.dumps(P.clean_deep(d), ensure_ascii=False, separators=(",", ":")) + ";\n")
        open(os.path.join(pasta, f"{cid}.js"), "w", encoding="utf-8", newline="\n").write(txt)
    P.log("jogadores gravados em js/jogadores/")
