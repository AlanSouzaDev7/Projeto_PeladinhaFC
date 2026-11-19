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
VERSAO = 2  # 2: carreira montada jogador por jogador (Wikipédia, Wikidata, ESPN)
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


POR_RODADA = 150  # pesquisas de jogador por rodada do robô (a primeira carga completa é feita fora do robô)
VALIDADE = 30 * 86400  # cada carreira é pesquisada de novo a cada 30 dias (ou quando o jogador muda de clube)


def _site_do_clube(titulo, nome, nomes_site):
    import carreiras_wiki as W
    for cid, oficial in nomes_site.items():
        if W.clube_bate(titulo, oficial) or W.clube_bate(nome, oficial):
            return cid
    return None


def _logo_da_espn(titulo, nome, espn):
    """Escudo exato pela lista de times da ESPN do próprio jogador (o nome do clube tem que bater)."""
    import carreiras_wiki as W
    alvo = W.distintivas(titulo) | W.distintivas(nome)
    for _i, _f, nm, logo in espn:
        pal = W.distintivas(nm)
        if logo and pal and len(pal & alvo) / len(pal) >= 0.6:
            return logo
    return None


def junta(lista):
    """Passagens seguidas pelo mesmo clube viram um trecho só (Corinthians 2014 + 2015–2026 = 2014–2026)."""
    out = []
    for x in lista:
        if out and out[-1]["q"] == x["q"]:
            a = out[-1]
            a["i"] = min(v for v in (a["i"], x["i"]) if v) if (a["i"] or x["i"]) else None
            a["f"] = None if (a["f"] is None or x["f"] is None) else max(a["f"], x["f"])
            a["e"] = a.get("e") and x.get("e")
        else:
            out.append(dict(x))
    return out


def monta_jogador(aid, nome, idade, cid, nomes_site, qid=None, wikidata=None, busca=None, ogol=None):
    """Carreira de um jogador: Wikipédia (pt/en) > ogol > Wikidata > ESPN; escudos do site, da ESPN, do ogol ou desenhados.
    ogol = {nome: (slug, id)} do elenco do clube no ogol (carreiras_ogol.elenco).
    Devolve (lista, fonte); lista vazia quando nenhuma fonte dá pelo menos 2 clubes com segurança."""
    import carreiras_wiki as W
    W.P = W.P or P
    espn = W.pela_espn(aid)
    wiki = W.pela_wikipedia(nome, idade, nomes_site[cid], W.titulo_do_wikidata(qid) if qid else None)
    if not wiki and qid:  # o item do Wikidata não tem artigo: tenta a busca
        wiki = W.pela_wikipedia(nome, idade, nomes_site[cid])
    lista, fonte = [], None
    if wiki and len(wiki["clubes"]) >= 2:
        fonte = wiki["fonte"]
        for i, f, titulo, nm, emp in wiki["clubes"]:
            site = _site_do_clube(titulo, nm, nomes_site)
            chave = site or " ".join(sorted(W.distintivas(titulo))) or titulo
            logo = None
            if not site:
                logo = _logo_da_espn(titulo, nm, espn)
                if not logo and busca is not None:
                    e = espn_por_nome(titulo, busca)
                    logo = f"https://a.espncdn.com/i/teamlogos/soccer/500/{e}.png" if e else None
            lista.append({"c": P.clean_text(nm, 50), "q": chave, "i": i, "f": f, "l": logo, "s": site, "e": 1 if emp else 0})
        lista = junta(lista)
    og = None
    if not lista and ogol:
        import carreiras_ogol as O
        O.P = O.P or P
        achado = O.acha(nome, ogol)
        if achado:
            trechos = O.carreira(*achado, nascido=(int(time.strftime("%Y")) - idade) if idade else None)
            if trechos and O.nome_bate(trechos[-1][2], nomes_site[cid], W.distintivas):  # a temporada mais recente é no clube do site
                og = trechos
    if og and len(og) >= 2:
        fonte = "ogol"
        for i, f, nm, _eq, logo_ogol in og:
            site = _site_do_clube(nm, nm, nomes_site) or (cid if O.nome_bate(nm, nomes_site[cid], W.distintivas) else None)
            logo = None
            if not site:
                logo = _logo_da_espn(nm, nm, espn)
                if not logo and busca is not None:
                    e = espn_por_nome(nm, busca)
                    logo = f"https://a.espncdn.com/i/teamlogos/soccer/500/{e}.png" if e else None
                logo = logo or logo_ogol
            lista.append({"c": nm, "q": site or " ".join(sorted(W.distintivas(nm))) or nm, "i": i, "f": f, "l": logo, "s": site, "e": 0})
        lista = junta(lista)
        if lista and lista[-1]["s"] == cid:
            lista[-1]["f"] = None  # o trecho atual continua aberto
    elif not lista and wikidata and len(wikidata) >= 2:
        fonte, lista = "wikidata", [dict(x) for x in wikidata]
    elif not lista and len(espn) >= 2:
        fonte = "espn"
        for i, f, nm, logo in espn:
            site = _site_do_clube(nm, nm, nomes_site)
            lista.append({"c": nm, "q": site or " ".join(sorted(W.distintivas(nm))) or nm, "i": i, "f": f, "l": None if site else logo, "s": site, "e": 0})
        lista = junta(lista)
    if lista and lista[-1]["s"] != cid:  # o clube atual fecha a linha (contratação recente que a fonte ainda não tem)
        lista.append({"c": nomes_site[cid], "q": cid, "i": None, "f": None, "l": None, "s": cid, "e": 0})
    return (lista if len(lista) >= 2 else []), fonte


def gravar(forcar=False, limite=POR_RODADA, refazer_vazios=False):
    """Atualiza dados/carreiras/*.json, jogador por jogador (limite de pesquisas por rodada; None = todos)."""
    import jogadores as J
    J.P = J.P or P
    squads = (json.loads((RAIZ / "dados" / "squads.json").read_text(encoding="utf-8")) or {}).get("SQUADS") or {}
    cache = {} if forcar else _ler_cache()
    agora = time.time()
    if cache.get("v") != VERSAO:
        cache = {"busca_espn": cache.get("busca_espn") or {}, "clubes_wd": {}, "jogadores": {}}
        if not forcar and SAIDA.exists():
            # primeira vez com esta versão (ou robô sem cache): parte dos arquivos publicados, que valem por 30 dias
            for f in SAIDA.glob("*.json"):
                try:
                    for aid, lista in json.loads(f.read_text(encoding="utf-8")).items():
                        cache["jogadores"][aid] = {"cid": f.stem, "t": agora, "fonte": "arquivo", "lista": lista}
                except ValueError:
                    continue
    busca = dict(cache.get("busca_espn") or {})
    busca["_feitas"] = 0
    jog = cache.setdefault("jogadores", {})
    wd = cache.setdefault("clubes_wd", {})
    nomes_site = {cid: J.NOME_OFICIAL.get(cid, cid) for cid in P.CLUBS}
    site_por_qid = {}
    for cid in P.CLUBS:
        try:
            q = J.qid_clube(cid)
            if q:
                site_por_qid[q] = cid
        except Exception as ex:
            P.log("carreiras (clube)", cid, ex)
    feitas = 0
    for cid, elenco in squads.items():
        pendentes = [r for r in elenco if r[4] and (forcar or not jog.get(str(r[4])) or jog[str(r[4])].get("cid") != cid or jog[str(r[4])].get("t", 0) < agora - VALIDADE
                                                    or (refazer_vazios and len(jog[str(r[4])].get("lista") or []) < 2))]
        if not pendentes or (limite is not None and feitas >= limite):
            continue
        # Wikidata do clube (uma consulta por clube): dá o item de cada jogador (link do artigo) e a carreira de reserva
        ids = sorted(str(r[4]) for r in elenco if r[4])
        if wd.get(cid, {}).get("ids") != ids or wd.get(cid, {}).get("t", 0) < agora - VALIDADE:
            q = next((k for k, v in site_por_qid.items() if v == cid), None)
            try:
                achados = casar(candidatos(q), elenco) if q else {}
                faltam = [(r[1], r[3], str(r[4])) for r in elenco if r[4] and str(r[4]) not in achados and r[3] and len(r[1]) > 3]
                achados.update(por_nome(faltam))
                car = carreiras(sorted(set(achados.values())), site_por_qid, busca)
                wd[cid] = {"ids": ids, "t": agora, "qids": achados, "listas": {a: car.get(qq, []) for a, qq in achados.items()}}
            except Exception as ex:
                P.log("carreiras (Wikidata)", cid, ex)
                wd.setdefault(cid, {"ids": [], "t": 0, "qids": {}, "listas": {}})
        import carreiras_ogol as O
        O.P = O.P or P
        try:
            ogol = O.elenco(cid)
        except Exception as ex:
            P.log("carreiras (ogol)", cid, ex)
            ogol = {}
        for num, nome, pos, idade, aid in pendentes:
            if limite is not None and feitas >= limite:
                break
            aid = str(aid)
            try:
                lista, fonte = monta_jogador(aid, nome, idade, cid, nomes_site, wd[cid]["qids"].get(aid), wd[cid]["listas"].get(aid), busca, ogol)
            except Exception as ex:
                P.log("carreiras (jogador)", nome, ex)
                continue
            jog[aid] = {"cid": cid, "t": agora, "fonte": fonte, "lista": lista}
            feitas += 1
        # progresso gravado a cada clube: se a pesquisa for interrompida, a próxima continua daqui (não recomeça do zero)
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps({**cache, "v": VERSAO, "busca_espn": {k: v for k, v in busca.items() if k != "_feitas"}}, ensure_ascii=False), encoding="utf-8")
        print(f"carreiras: {cid} pronto ({feitas} jogadores pesquisados nesta rodada)", flush=True)
    busca.pop("_feitas", None)
    cache.update(v=VERSAO, busca_espn=busca)
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    SAIDA.mkdir(parents=True, exist_ok=True)
    total = 0
    for cid, elenco in squads.items():
        saida = {}
        for r in elenco:
            x = jog.get(str(r[4]))
            if x and x.get("cid") == cid and len(x.get("lista") or []) >= 2:
                saida[str(r[4])] = x["lista"]
        (SAIDA / f"{cid}.json").write_text(json.dumps(saida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        total += len(saida)
    return total
