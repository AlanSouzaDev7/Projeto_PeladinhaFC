# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""CazéStats.TV — carreira de cada jogador do elenco (clubes por onde passou), para a linha do tempo da página do jogador.

Fonte: Wikidata (API oficial de consultas, dados CC0). A propriedade "jogou pelo time" (P54) traz cada clube com o ano
de entrada (P580) e de saída (P582). Seleções e times de base (sub-17, sub-20...) ficam de fora: a linha é de clubes.

Quem é quem: o mesmo cruzamento das fotos (server/jogadores.py): as pessoas ligadas ao clube atual no Wikidata, pelo nome
(ou todas as palavras do nome da ESPN dentro do nome completo) e pela idade (diferença de no máximo 1 ano).

Escudo de cada clube, nesta ordem (sempre por link; nenhum arquivo de escudo é copiado para o projeto):
  1. um dos 20 clubes do site: o escudo que o site já usa;
  2. o id do time na ESPN: pelo Wikidata (P13590) ou pela busca pública de times da ESPN (o nome tem que bater); o escudo
     vem do mesmo endereço da ESPN que o site usa para os outros clubes. Cada clube é buscado uma vez só (cache);
  3. o logotipo livre no Wikimedia Commons (P154);
  4. nada: o site desenha o escudo com as iniciais (GFX.crestOutro).

Grava dados/carreiras/<clube>.json = {id ESPN do jogador: [{c, q, i, f, l, s}, ...]} (clube, item do Wikidata, ano de
entrada, ano de saída ou null, link do escudo, id do clube no site). Atualiza uma vez por semana, ou quando o elenco muda.
"""
import json
import re
import time
import unicodedata
import urllib.parse
from pathlib import Path

P = None  # módulo placar_api, ligado em placar_api.py
RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "dados" / "carreiras"
CACHE = RAIZ / "server" / "cache" / "carreiras.json"
VERSAO = 1
SPARQL = "https://query.wikidata.org/sparql?"
# seleções, olímpicos e times de base não entram na linha do tempo de clubes
FORA = re.compile(r"\b(sele[cç][aã]o|national|nacional|ol[ií]mpic|olympic|sub[- ]?\d\d|u[- ]?\d\d|under[- ]?\d\d)\b|\s(B|II)$", re.I)
# palavras genéricas tiradas do nome antes de buscar na ESPN ("Chelsea Football Club" -> "Chelsea")
GENERICO = re.compile(r"\b(f\.?c\.?|a\.?f\.?c\.?|a\.?c\.?|s\.?c\.?|c\.?f\.?|football club|futebol clube|f[uú]tbol club|club de f[uú]tbol|"
                      r"associazione calcio|calcio|esporte clube|sport club|club atl[eé]tico|clube atl[eé]tico|club|clube|sociedade esportiva)\b", re.I)
BUSCAS_POR_RODADA = 300


def _norm(x):
    x = unicodedata.normalize("NFD", str(x or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]", " ", x).split()


def _consulta(sparql, tentativas=3):
    """Consulta ao Wikidata com nova tentativa (o serviço responde 502/503 de vez em quando)."""
    import jogadores as J  # helpers do Wikidata (identificador, cabeçalhos) já usados pelas fotos
    J.P = J.P or P
    for n in range(tentativas):
        try:
            r = J._wjson(SPARQL + urllib.parse.urlencode({"query": sparql}))
            time.sleep(1)  # a Wikimedia pede ritmo baixo
            return r.get("results", {}).get("bindings", [])
        except Exception:
            if n == tentativas - 1:
                raise
            time.sleep(5 * (n + 1))


def _qid(uri):
    return str(uri or "").rsplit("/", 1)[-1]


def _ano(v):
    v = str((v or {}).get("value") or "")
    return int(v[:4]) if v[:4].isdigit() else None


def candidatos(q_clube):
    """Pessoas que o Wikidata liga ao clube (em qualquer época), com nomes e ano de nascimento."""
    sp = ("SELECT ?p ?pLabel ?nasc (GROUP_CONCAT(DISTINCT ?alt; separator='|') AS ?alts) WHERE { ?p wdt:P54 wd:%s; wdt:P106 wd:Q937857. "
          "OPTIONAL { ?p wdt:P569 ?nasc } OPTIONAL { ?p skos:altLabel ?alt FILTER(LANG(?alt) IN ('pt','en','es')) } "
          "SERVICE wikibase:label { bd:serviceParam wikibase:language 'pt,en,es'. } } GROUP BY ?p ?pLabel ?nasc" % q_clube)
    out = []
    for b in _consulta(sp):
        nomes = [b.get("pLabel", {}).get("value", "")] + [a for a in (b.get("alts", {}).get("value") or "").split("|") if a]
        out.append({"q": _qid(b["p"]["value"]), "nomes": [" ".join(_norm(n)) for n in nomes if n], "ano": _ano(b.get("nasc"))})
    return out


def casar(cand, elenco, ano_atual=None):
    """{id ESPN: item do Wikidata} só quando há um único candidato com o nome e a idade certos."""
    ano_atual = ano_atual or int(time.strftime("%Y"))
    achados = {}
    for _num, nome, _pos, idade, aid in elenco:
        alvo = " ".join(_norm(nome))
        if not aid or not alvo:
            continue

        def mesma_idade(c):
            return bool(idade and c["ano"] and abs((ano_atual - c["ano"]) - idade) <= 1)

        # com a idade do jogador conhecida, o candidato precisa ter nascimento conhecido e compatível (sem data não vale)
        exato = {c["q"] for c in cand if alvo in c["nomes"] and (mesma_idade(c) if idade else True)}
        exato_idade = {c["q"] for c in cand if alvo in c["nomes"] and mesma_idade(c)}
        palavras = set(alvo.split())
        contido = {c["q"] for c in cand if mesma_idade(c) and any(palavras <= set(n.split()) for n in c["nomes"])}
        if len(exato_idade) == 1:  # nome e idade: o mais seguro ("Fábio" de 46 anos, entre vários Fábios do clube)
            achados[aid] = exato_idade.pop()
        elif len(exato) == 1:
            achados[aid] = exato.pop()
        elif not exato and len(contido) == 1:
            achados[aid] = contido.pop()
    return achados


def por_nome(faltam, ano_atual=None):
    """Quem o Wikidata ainda não liga ao clube atual (contratação recente): nome exato + jogador de futebol + idade.
    faltam = [(nome, idade, id ESPN)]. Só aceita quando há uma única pessoa com aquele nome e aquela idade."""
    ano_atual = ano_atual or int(time.strftime("%Y"))
    achados = {}
    for i in range(0, len(faltam), 40):
        lote = faltam[i:i + 40]
        vals = " ".join(f'"{n}"@pt "{n}"@en' for n in {x[0].replace(chr(34), "") for x in lote})
        sp = ("SELECT ?n ?p ?nasc WHERE { VALUES ?n { %s } { ?p rdfs:label ?n } UNION { ?p skos:altLabel ?n } "
              "?p wdt:P106 wd:Q937857; wdt:P569 ?nasc. }" % vals)
        try:
            linhas = _consulta(sp)
        except Exception as ex:
            P.log("carreiras (nome)", ex)
            continue
        pessoas = {}
        for b in linhas:
            pessoas.setdefault(b["n"]["value"], set()).add((_qid(b["p"]["value"]), _ano(b.get("nasc"))))
        for nome, idade, aid in lote:
            ok = {q for q, ano in pessoas.get(nome.replace(chr(34), ""), set()) if ano and abs((ano_atual - ano) - idade) <= 1}
            if len(ok) == 1:
                achados[aid] = ok.pop()
    return achados


def _logo_commons(uri):
    if not uri:
        return None
    arquivo = urllib.parse.unquote(str(uri).rsplit("/", 1)[-1]).replace(" ", "_")
    import escudos as ESC
    return ESC.thumb(arquivo, 120)


def espn_por_nome(nome, busca_cache):
    """Id do time na ESPN pela busca pública de times, só se o nome bater (palavras da ESPN dentro do nome do clube)."""
    chave = " ".join(_norm(nome))
    if chave in busca_cache:
        return busca_cache[chave]
    if busca_cache.get("_feitas", 0) >= BUSCAS_POR_RODADA:
        return None  # o resto fica para a próxima rodada
    busca_cache["_feitas"] = busca_cache.get("_feitas", 0) + 1
    termo = re.sub(r"\s+", " ", GENERICO.sub(" ", nome)).strip() or nome
    achado = None
    try:
        d = P.get_json("https://site.web.api.espn.com/apis/common/v3/search?" + urllib.parse.urlencode({"query": termo, "limit": 8, "type": "team"}))
        alvo = set(_norm(nome)) | set(_norm(termo))
        for it in d.get("items") or []:
            nm = it.get("displayName") or ""
            if it.get("sport") != "soccer" or not str(it.get("id") or "").isdigit() or re.search(r"women|feminin|femenin", nm, re.I):
                continue
            pal = set(_norm(GENERICO.sub(" ", nm))) or set(_norm(nm))
            if pal and len(pal & alvo) / len(pal) >= 0.6:
                achado = str(it["id"])
                break
    except Exception as ex:
        P.log("carreiras (busca ESPN)", nome, ex)
        return None  # erro de rede: tenta de novo noutra rodada
    busca_cache[chave] = achado
    time.sleep(0.3)
    return achado


def carreiras(qids, site_por_qid, busca_cache=None):
    """{item do jogador: [clubes em ordem]} para uma lista de itens do Wikidata."""
    out = {}
    for i in range(0, len(qids), 40):
        lote = qids[i:i + 40]
        sp = ("SELECT ?p ?st ?club ?clubLabel ?en ?ini ?fim ?espn ?logo WHERE { VALUES ?p { %s } ?p p:P54 ?st. ?st ps:P54 ?club. "
              "FILTER NOT EXISTS { ?st wikibase:rank wikibase:DeprecatedRank } FILTER NOT EXISTS { ?club wdt:P31 wd:Q6979593 } "
              "OPTIONAL { ?st pq:P580 ?ini } OPTIONAL { ?st pq:P582 ?fim } OPTIONAL { ?club wdt:P13590 ?espn } OPTIONAL { ?club wdt:P154 ?logo } "
              "OPTIONAL { ?club rdfs:label ?en FILTER(LANG(?en) = 'en') } "
              "SERVICE wikibase:label { bd:serviceParam wikibase:language 'pt,en,es'. } }" % " ".join(f"wd:{q}" for q in lote))
        linhas = _consulta(sp)  # falhou mesmo depois das tentativas: o clube inteiro fica para a próxima rodada
        por_st = {}
        for b in linhas:
            st = b["st"]["value"]
            if st in por_st:
                continue  # o mesmo vínculo repete quando o clube tem mais de um id/logotipo
            nome = P.clean_text(b.get("clubLabel", {}).get("value", ""), 50)
            q = _qid(b["club"]["value"])
            if not nome or re.fullmatch(r"Q\d+", nome) or FORA.search(nome):
                continue
            espn = str(b.get("espn", {}).get("value") or "")
            site = site_por_qid.get(q)
            if not site and not espn.isdigit() and busca_cache is not None:
                espn = espn_por_nome(b.get("en", {}).get("value") or nome, busca_cache) or ""

            logo = None if site else (f"https://a.espncdn.com/i/teamlogos/soccer/500/{espn}.png" if espn.isdigit() else _logo_commons(b.get("logo", {}).get("value")))
            por_st[st] = (_qid(b["p"]["value"]), {"c": nome, "q": q, "i": _ano(b.get("ini")), "f": _ano(b.get("fim")), "l": logo, "s": site})
        for p, x in por_st.values():
            out.setdefault(p, []).append(x)
    return {p: ordena(v) for p, v in out.items()}


def ordena(lista):
    """Em ordem de entrada; vínculos sem data nenhuma saem; idas e voltas seguidas ao mesmo clube viram um só trecho."""
    com_data = [x for x in lista if x["i"] or x["f"]]
    com_data.sort(key=lambda x: (x["i"] or x["f"], x["f"] or 9999))
    for a, b in zip(com_data, com_data[1:]):
        if a["f"] is None and a["q"] != b["q"] and b["i"]:
            a["f"] = b["i"]  # vínculo sem data de saída termina quando começa o seguinte
    final = []
    for x in com_data:
        if final and final[-1]["q"] == x["q"]:
            a = final[-1]
            a["i"] = min(v for v in (a["i"], x["i"]) if v) if (a["i"] or x["i"]) else None
            a["f"] = None if (a["f"] is None or x["f"] is None) else max(a["f"], x["f"])
        else:
            final.append(dict(x))
    return final


def _ler_cache():
    try:
        return json.loads(CACHE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def gravar(forcar=False):
    """Atualiza dados/carreiras/*.json (semanal, ou quando o elenco de um clube muda)."""
    import jogadores as J
    J.P = J.P or P
    squads = (json.loads((RAIZ / "dados" / "squads.json").read_text(encoding="utf-8")) or {}).get("SQUADS") or {}
    cache = _ler_cache() if not forcar else {}
    velho = cache.get("v") != VERSAO or cache.get("quando", 0) < time.time() - 7 * 86400
    clubes = {} if velho else dict(cache.get("clubes") or {})
    if not cache and not forcar and SAIDA.exists():
        # sem cache (robô do GitHub na primeira vez): parte dos arquivos já publicados em dados/carreiras/, como se
        # tivessem sido feitos agora; só os clubes com elenco diferente do arquivo são refeitos (evita 13 min de uma vez)
        for f in SAIDA.glob("*.json"):
            cid = f.stem
            try:
                jog = json.loads(f.read_text(encoding="utf-8"))
            except ValueError:
                continue
            elenco_ids = sorted(str(r[4]) for r in squads.get(cid, []) if r[4])
            if set(jog) <= set(elenco_ids):
                clubes[cid] = {"ids": elenco_ids, "jogadores": jog}
        velho, cache = False, {"quando": time.time()}
        mudou_semente = True
    else:
        mudou_semente = False
    busca = dict(cache.get("busca_espn") or {})  # nome do clube -> id na ESPN (ou null): permanente
    busca["_feitas"] = 0
    site_por_qid = {}
    for cid in P.CLUBS:
        try:
            q = J.qid_clube(cid)
            if q:
                site_por_qid[q] = cid
        except Exception as ex:
            P.log("carreiras (clube)", cid, ex)
    mudou = False
    for cid, elenco in squads.items():
        ids = sorted(str(r[4]) for r in elenco if r[4])
        if clubes.get(cid, {}).get("ids") == ids:
            continue
        q = next((k for k, v in site_por_qid.items() if v == cid), None)
        if not q:
            continue
        try:
            achados = casar(candidatos(q), elenco)
            faltam = [(r[1], r[3], str(r[4])) for r in elenco if r[4] and str(r[4]) not in achados and r[3] and len(r[1]) > 3]
            achados.update(por_nome(faltam))
            car = carreiras(sorted(set(achados.values())), site_por_qid, busca)
        except Exception as ex:
            P.log("carreiras", cid, ex)
            continue
        jog = {}
        for aid, pq in achados.items():
            lista = [dict(x) for x in car.get(pq, [])]
            if not lista or lista[-1]["s"] != cid:
                lista.append({"c": J.NOME_OFICIAL.get(cid, cid), "q": q, "i": None, "f": None, "l": None, "s": cid})  # o clube atual fecha a linha
            jog[aid] = lista
        clubes[cid] = {"ids": ids, "jogadores": jog}
        mudou = True
    busca.pop("_feitas", None)
    if mudou or velho or mudou_semente:
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps({"v": VERSAO, "quando": time.time() if velho else cache.get("quando", time.time()), "clubes": clubes, "busca_espn": busca},
                                    ensure_ascii=False), encoding="utf-8")
    SAIDA.mkdir(parents=True, exist_ok=True)
    total = 0
    for cid, d in clubes.items():
        (SAIDA / f"{cid}.json").write_text(json.dumps(d["jogadores"], ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        total += len(d["jogadores"])
    return total
