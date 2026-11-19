# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""CazéStats.TV — carreira de UM jogador, pesquisada individualmente (usado por server/carreiras.py).

Fontes, todas por API oficial ou endereço público já usado pelo site:
  1. Wikipédia (português; sem artigo, inglês): a caixa de informações do jogador lista todos os clubes com os anos,
     inclusive empréstimos ("→ ... (emp.)"). O artigo vem do link do Wikidata (quando o jogador já foi identificado)
     ou de uma busca restrita a artigos de futebolistas. Só vale se o CLUBE ATUAL da caixa for o clube do site e, quando
     a caixa traz o nascimento, se a idade bater (diferença de no máximo 1 ano): nada de carreira de um homônimo.
  2. ESPN (lista de times do atleta, pelo mesmo id da ESPN que o site usa): certeira, mas só cobre as ligas e temporadas
     que a ESPN acompanha. Serve de reserva e dá o escudo exato de cada clube estrangeiro.
Seleções e categorias de base ficam de fora (a linha do tempo é de clubes profissionais).
"""
import json
import re
import time
import unicodedata
import urllib.parse

P = None  # módulo placar_api
WP = {"pt": "https://pt.wikipedia.org/w/api.php?", "en": "https://en.wikipedia.org/w/api.php?"}
CAIXA = {"pt": "Info/Futebolista", "en": "Infobox football biography"}
ESPN_BIO = "https://site.web.api.espn.com/apis/common/v3/sports/soccer/athletes/{}/bio"
GENERICAS = {"clube", "club", "futebol", "football", "futbol", "sport", "sporting", "esporte", "regatas", "de", "do", "da", "e", "dos", "das",
             "associacao", "sociedade", "esportiva", "fc", "foot", "ball", "fbc", "sc", "ec", "cr", "ac", "afc", "the"}
SELECAO = re.compile(r"sele[cç][aã]o|national|\bsub[- ]?\d\d|\bu[- ]?\d\d\b|under[- ]?\d\d|ol[ií]mpic|olympic", re.I)


def _norm(x):
    x = unicodedata.normalize("NFD", str(x or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]", " ", x).split()


APELIDOS = {"atletico paranaense": "athletico paranaense", "atletico pr": "athletico paranaense", "al hilal": "al hilal"}


def _texto(x):
    t = " ".join(_norm(x))
    for velho, novo in APELIDOS.items():
        t = t.replace(velho, novo)
    return t.split()


def distintivas(nome):
    """Palavras que identificam um clube ("Clube Atlético Mineiro" -> {atletico, mineiro})."""
    return {p for p in _texto(nome) if p not in GENERICAS and len(p) > 1}


def _wp(lang, **p):
    p.update(format="json", formatversion=2)
    for n in range(3):
        try:
            r = json.loads(P.get(WP[lang] + urllib.parse.urlencode(p), timeout=30))
            time.sleep(0.25)  # ritmo baixo, como a Wikimedia pede
            return r
        except Exception:
            if n == 2:
                raise
            time.sleep(3 * (n + 1))


def titulo_do_wikidata(qid):
    """{'pt': título, 'en': título} do artigo do jogador, pelos links do item no Wikidata."""
    try:
        r = json.loads(P.get("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(
            {"action": "wbgetentities", "ids": qid, "props": "sitelinks", "sitefilter": "ptwiki|enwiki", "format": "json"}), timeout=30))
        links = (r.get("entities", {}).get(qid, {}) or {}).get("sitelinks", {}) or {}
        return {lang: links[f"{lang}wiki"]["title"] for lang in ("pt", "en") if f"{lang}wiki" in links}
    except Exception:
        return {}


def caixa(lang, titulo):
    """Parâmetros da caixa de informações (seção 0 do artigo): {nome: valor}."""
    try:
        w = _wp(lang, action="parse", page=titulo, prop="wikitext", section=0, redirects=1)["parse"]["wikitext"]
    except Exception:
        return {}
    if CAIXA[lang].lower() not in w.lower().replace("_", " "):
        return {}
    params = {}
    for linha in w.split("\n"):
        m = re.match(r"\s*\|\s*([^=|]+?)\s*=\s*(.*)$", linha)
        if m:
            params[m.group(1).strip().lower()] = m.group(2).strip()
    return params


def _expande(lang, textos):
    """Expande os modelos ({{Futebol Corinthians}}) de vários textos numa chamada só."""
    sep = "\n@@SEP@@\n"
    try:
        r = _wp(lang, action="expandtemplates", text=sep.join(textos), prop="wikitext")
        return r["expandtemplates"]["wikitext"].split(sep.strip())
    except Exception:
        return [""] * len(textos)


def _link(txt):
    """O clube de um item expandido: ([[Título|Nome]] ou [[Título]]) -> (título, nome); sem link, o texto limpo."""
    m = re.search(r"\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]", txt)
    if m:
        return m.group(1).strip(), (m.group(2) or m.group(1)).strip()
    t = re.sub(r"\{\{[^}]*\}\}|<[^>]+>|'''?|\(.*?\)|→", " ", txt)
    t = re.sub(r"\s+", " ", t).strip()
    return t, t


def _anos(txt):
    """'2006–2007' -> (2006, 2007); '2026–' -> (2026, None); '2013' -> (2013, 2013)."""
    m = re.search(r"((?:19|20)\d\d)\s*(?:[–—-]\s*((?:19|20)\d\d)?)?", txt or "")
    if not m:
        return None, None
    i = int(m.group(1))
    if m.group(2):
        return i, int(m.group(2))
    return (i, None) if re.search(r"[–—-]\s*$", txt.strip()) else (i, i)


def _nascimento(params):
    for k in ("datadenascimento", "nascimento", "birth_date", "data_nascimento"):
        m = re.search(r"((?:19|20)\d\d)", params.get(k, ""))
        if m:
            return int(m.group(1))
    return None


def clubes_da_caixa(lang, params):
    """[(ano ini, ano fim, título, nome, empréstimo)] na ordem da caixa (categorias de base ficam de fora)."""
    pares = []
    if lang == "pt" and params.get("clubes"):
        anos = re.split(r"<br\s*/?>", params.get("ano", ""), flags=re.I)
        clubes = re.split(r"<br\s*/?>", params["clubes"], flags=re.I)
        pares = list(zip(anos, clubes))
    else:
        for n in range(1, 41):
            c = params.get(f"clubs{n}") or params.get(f"clubes{n}")
            if c:
                pares.append((params.get(f"years{n}") or params.get(f"anos{n}") or "", c))
    if not pares:
        return []
    expandidos = _expande(lang, [c for _, c in pares])
    out = []
    for (anos, cru), exp in zip(pares, expandidos):
        titulo, nome = _link(exp or cru)
        if not titulo or SELECAO.search(titulo + " " + nome):
            continue
        i, f = _anos(anos)
        emp = bool(re.search(r"→|loan|empr[eé]stimo|\bemp\b", (exp or "") + cru, re.I))
        out.append((i, f, titulo, nome, emp))
    return out


def clube_bate(texto, nome_oficial):
    """O clube atual da caixa é o clube do site? (todas as palavras distintivas do nome oficial no texto)."""
    alvo = distintivas(nome_oficial)
    return bool(alvo) and alvo <= set(_texto(texto))


def pela_wikipedia(nome, idade, nome_oficial, titulos=None, ano_atual=None):
    """Carreira pela caixa da Wikipédia, conferindo clube atual e idade. None se não achar com segurança."""
    ano_atual = ano_atual or int(time.strftime("%Y"))
    tentativas = []
    for lang in ("pt", "en"):
        if titulos and titulos.get(lang):
            tentativas.append((lang, titulos[lang]))
    if not tentativas:
        clube = " ".join(sorted(distintivas(nome_oficial)))
        for lang in ("pt", "en"):
            for termo in (f'{nome} {clube} hastemplate:"{CAIXA[lang]}"', f'{nome} hastemplate:"{CAIXA[lang]}"'):  # com o clube primeiro ("Pedro" é comum)
                try:
                    r = _wp(lang, action="query", list="search", srsearch=termo, srlimit=6)
                except Exception:
                    continue
                for x in r.get("query", {}).get("search", []):
                    if (lang, x["title"]) not in tentativas:
                        tentativas.append((lang, x["title"]))
    palavras = set(_norm(nome))
    for lang, titulo in tentativas:
        if not titulos and not palavras <= set(_norm(titulo + " " + titulo)) and not (palavras & set(_norm(titulo))):
            continue  # o título nem lembra o nome procurado
        params = caixa(lang, titulo)
        if not params:
            continue
        nasc = _nascimento(params)
        if idade and nasc and abs((ano_atual - nasc) - idade) > 1:
            continue
        atual = params.get("actualclube") or params.get("clubeatual") or params.get("currentclub") or ""
        lista = clubes_da_caixa(lang, params)
        if not lista:
            continue
        atual_txt = (_expande(lang, [atual])[0] if atual else "") + " " + lista[-1][2] + " " + lista[-1][3]
        if not clube_bate(atual_txt, nome_oficial):
            continue  # a caixa é de outro jogador (ou está desatualizada demais para confiar)
        if not titulos and not nasc:
            continue  # achado só pela busca, sem nascimento para conferir: não arrisca
        return {"fonte": f"wikipedia-{lang}", "artigo": titulo, "clubes": lista}
    return None


def pela_espn(aid):
    """Lista de times da ESPN do atleta: [(ano ini, ano fim, nome, logo)], sem seleções, em ordem de entrada."""
    try:
        th = P.get_json(ESPN_BIO.format(aid)).get("teamHistory") or []
    except Exception:
        return []
    out = []
    for t in th:
        logo = str(t.get("logo") or "")
        nome = P.clean_text(t.get("displayName") or "", 50)
        if not nome or "/countries/" in logo or SELECAO.search(nome):
            continue
        anos = re.findall(r"(\d{4})(?:-(\d{4}|CURRENT))?", str(t.get("seasons") or ""))
        if not anos:
            continue
        ini = min(int(a) for a, _ in anos)
        fins = [b for _, b in anos if b]
        fim = None if "CURRENT" in fins else (max(int(b) for b in fins) if fins else ini)
        out.append((ini, fim, nome, logo if logo.startswith("https://a.espncdn.com/") else None))
    return sorted(out, key=lambda x: (x[0], x[1] or 9999))
