# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""CazéStats.TV — verificação dos jogadores e das fotos (roda em toda rodada do robô, a cada ~10 min).

Responde três perguntas sobre cada jogador do elenco da janela de transferências:
  1) Ele está mesmo no clube? Cruza o cadastro da ESPN, o elenco atual do ogol.com.br e as súmulas (jogou pelo clube
     nos últimos 60 dias). Duas fontes = "confirmado"; uma = "provável".
  2) A foto é dele? A ESPN às vezes usa o MESMO número para duas pessoas (o Lucas Villalba zagueiro do Cruzeiro e o
     Lucas Villalba atacante do Botafogo têm o id 176810; o Matheus Pereira do Cruzeiro e o do Corinthians, o 216098).
     Como as fotos são guardadas pelo id, um clube mostrava a foto do outro. Aqui:
       - o mesmo id em dois elencos com jogos intercalados no mesmo período (ou número, posição, país e nascimento
         diferentes) é HOMÔNIMO: cada clube só mostra a foto baixada para ele (a pasta img/jogadores/<clube>/); o outro
         ganha a do TheSportsDB quando ele lista alguém com esse nome NAQUELE clube, ou fica com o número da camisa;
       - o mesmo id em dois elencos com jogos em épocas separadas é a MESMA pessoa que trocou de clube: fica só no clube
         onde jogou por último (no outro ele "saiu"). Foto com a camisa antiga, nesse caso, não tem problema.
  3) Ele é cria da casa? A carreira no ogol marca os times de base ([S20], [S17]...). Base no clube atual ganha o rótulo
     do clube (Cria da Toca, Cria do Ninho...); base em outro clube da Série A, "Revelado pelo <clube>".

Fontes que NÃO entram, e por quê (testadas em 18/11/2026 e de novo agora): SofaScore e FlashScore recusam robôs (403 ou
desafio anti-robô), FotMob proíbe /api no robots.txt e o Google só pela API oficial (chave adiada pelo dono). Contornar
bloqueio é invadir, então ficam de fora. O ogol também mostra às vezes um desafio anti-robô: nesse caso a rodada segue sem
ele (o cache das leituras anteriores continua valendo) e tenta de novo na próxima.

Saída: dados/verificacao-jogadores.json (a API pública, servida pelo site) e os campos "verif" e "base" no elenco de
dados/mercado/<clube>.json. Cache: server/cache/verificacao.json.
"""
import json
import os
import re
import time
import unicodedata
from datetime import date, timedelta

P = None  # módulo placar_api
FOTO = None  # módulo fotos
OG = None  # módulo carreiras_ogol

CACHE = "verificacao.json"
OGOL_ELENCO_H = 6  # elenco atual do ogol: relido a cada 6 horas
BASE_DIAS = 30  # carreira de cada jogador (base): relida a cada 30 dias
BASE_POR_RODADA = 30  # páginas de jogador no ogol por rodada (1 por segundo: ~30 s)
RECENTE_DIAS = 60  # "jogou pelo clube há pouco" nas súmulas
SOBREPOE_DIAS = 21  # dois clubes jogando com o mesmo id por mais que isso ao mesmo tempo: duas pessoas

# como a torcida chama quem veio da base de cada clube. As do Cruzeiro, Flamengo e Palmeiras foram pedidas pelo dono;
# as outras são os apelidos mais usados pela imprensa e pela torcida. Onde não há um consagrado, "Cria da base".
APELIDO_BASE = {
    "cruzeiro": "Cria da Toca", "flamengo": "Cria do Ninho", "palmeiras": "Cria da Academia",
    "sao-paulo": "Made in Cotia", "santos": "Menino da Vila", "fluminense": "Cria de Xerém",
    "corinthians": "Cria do Terrão", "internacional": "Cria do Celeiro", "atletico-mg": "Cria do Galo",
    "vasco": "Cria da Colina", "bahia": "Cria do Fazendão", "athletico-pr": "Cria do Caju",
    "vitoria": "Cria da Toca do Leão", "coritiba": "Cria do Coxa",
}


def nome_clube(cid):
    return (P.CLUBS.get(cid) or {}).get("busca") or cid


def rotulo_base(cid):
    return APELIDO_BASE.get(cid, "Cria da base")


# ---------------------------------------------------------------------------
# cache
# ---------------------------------------------------------------------------
def _arq():
    return os.path.join(P.ROOT, "server", "cache", CACHE)


def _ler():
    try:
        return json.load(open(_arq(), encoding="utf-8"))
    except Exception:
        return {}


def _gravar(c):
    os.makedirs(os.path.dirname(_arq()), exist_ok=True)
    tmp = _arq() + ".tmp"
    json.dump(c, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
    os.replace(tmp, _arq())


def _norm(x):
    x = unicodedata.normalize("NFD", str(x or "")).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", x).split())


# ---------------------------------------------------------------------------
# fontes
# ---------------------------------------------------------------------------
def datas_jogos():
    """{clube: {id do jogo: 'AAAA-MM-DD'}} de todos os jogos da temporada (dados/club-form.json)."""
    try:
        cf = json.load(open(os.path.join(P.ROOT, "dados", "club-form.json"), encoding="utf-8"))["clubs"]
    except Exception:
        return {}
    return {cid: {str(g["id"]): g.get("date") for g in (d.get("all") or []) + (d.get("last") or []) if g.get("date")} for cid, d in cf.items()}


def aparicoes(datas):
    """{clube: {id do jogador: ['AAAA-MM-DD', ...]}}: em que dias cada um jogou (titular ou entrou) pelo clube."""
    out = {}
    pasta = os.path.join(P.ROOT, "dados", "escalacoes-jogos")
    for cid, dj in datas.items():
        try:
            jogos = json.load(open(os.path.join(pasta, f"{cid}.json"), encoding="utf-8"))
        except Exception:
            continue
        o = out.setdefault(cid, {})
        for gid, g in jogos.items():
            d = dj.get(str(gid))
            if not d:
                continue
            ids = [str(x[1]) for x in g.get("xi") or [] if len(x) > 1] + [str(x[0]) for x in g.get("entraram") or [] if x]
            for aid in ids:
                o.setdefault(aid, []).append(d)
    for o in out.values():
        for aid in o:
            o[aid].sort()
    return out


def rosters_espn():
    """{clube: {ids}} do cadastro da ESPN (None no clube em que a ESPN falhou)."""
    out = {}
    for cid, c in P.CLUBS.items():
        try:
            d = P.get_json(f"{P.ESPN}/site/v2/sports/soccer/bra.1/teams/{c['espn']}/roster")
            out[cid] = {str(a.get("id")) for a in d.get("athletes", [])} or None
        except Exception as ex:
            P.silencioso("verifica:roster", ex)
            out[cid] = None
    return out


class Bloqueado(Exception):
    """O ogol respondeu com o desafio anti-robô: não insiste nesta rodada."""


def _ogol(caminho):
    try:
        h = OG._pagina(caminho)
    except Exception as ex:
        # 403/429/503: o ogol recusa este computador (os servidores do GitHub recebem 403). Não insiste nem contorna.
        if getattr(ex, "code", None) in (403, 429, 503):
            raise Bloqueado(f"{caminho}: HTTP {ex.code}") from ex
        raise
    if "Just a moment" in h[:3000] or "challenge-platform" in h[:6000] or len(h) < 20000:
        raise Bloqueado(caminho)
    return h


def elenco_ogol(cid):
    """{nome normalizado: (slug, id)} do elenco ATUAL do clube no ogol (os links da temporada, com ?epoca_id=)."""
    caminho = OG.CLUBES.get(cid)
    if not caminho:
        return {}
    h = _ogol(f"/equipe/{caminho}")
    achados = re.findall(r"/jogador/([a-z0-9-]+)/(\d+)\?epoca_id=", h)
    return {" ".join(slug.split("-")): [slug, pid] for slug, pid in achados}


def acha_ogol(nome, mapa):
    """[slug, id] do jogador no elenco do ogol: nome igual ao endereço, ou um único endereço com todas as palavras."""
    if not mapa:
        return None
    alvo = _norm(nome)
    if alvo in mapa:
        return mapa[alvo]
    pal = set(alvo.split())
    cands = {tuple(v) for k, v in mapa.items() if pal and pal <= set(k.split())}
    return list(cands.pop()) if len(cands) == 1 else None


SLUG_CID = {}  # slug do ogol -> clube; preenchido em ligar()


def base_da_carreira(html, cid_atual):
    """Da página do jogador no ogol: ([clube formador], a temporada mais recente é no clube atual?).
    Linha de base = time marcado [S20], [S17], [Jun]... (o ogol usa o nome do clube e um id próprio para a base).
    Formador = o clube da ÚLTIMA categoria de base antes do profissional: o Pedro jogou no Flamengo do Sub-11 ao Sub-15,
    mas terminou a base no Fluminense (Sub-17 e Sub-20) e é cria de Xerém. Formador fora da Série A: sem rótulo."""
    atual = (OG.CLUBES.get(cid_atual) or "").split("/")
    bases, recente_ok, viu_profissional, viu_base = [], None, False, False
    for corpo in re.findall(r"tpstats=club&epoca_id=\d+&equipa_id=\d+';\">(.*?)</tr>", html, re.S):
        m = re.search(r'<a href="/equipe/([a-z0-9-]+)(?:/(\d+))?[?"]', corpo)
        if not m:
            continue
        slug, num = m.group(1), m.group(2)
        juvenil = bool(re.search(r"\[(?:S\d\d|Jun|Juv)[^\]]*\]", corpo)) or bool(OG.BASE_TIME.search(re.sub(r"<[^>]+>", " ", corpo)))
        if juvenil:
            if not viu_base:  # a página vem do mais recente para o mais antigo: a primeira linha de base é a última
                viu_base = True
                cid = SLUG_CID.get(slug)
                if cid and "flag:BR" in corpo:
                    bases.append(cid)
            continue
        if not viu_profissional:  # a página vem do mais recente para o mais antigo
            viu_profissional = True
            recente_ok = slug == atual[0] and (len(atual) < 2 or num == atual[1])
    return bases, bool(recente_ok)


def base_da_wikipedia(params, cid_atual, site_do_clube, nome_oficial):
    """Da caixa de informações da Wikipédia: ([clube formador], o clube atual da caixa é o do site?).
    Formador = o ÚLTIMO dos clubes de base (youth_clubs1..n vêm em ordem): mesma regra do ogol."""
    juvenis = []
    for n in range(1, 21):
        v = params.get(f"youth_clubs{n}") or params.get(f"youthclubs{n}")
        if v:
            juvenis.append(v)
    atual = params.get("currentclub") or params.get("current_club") or params.get("clubeatual") or params.get("actualclube") or ""
    atual_ok = bool(atual) and site_do_clube(atual) == cid_atual
    if not juvenis:
        return [], atual_ok
    cid = site_do_clube(juvenis[-1])
    return ([cid] if cid else []), atual_ok


def busca_tsdb(nome, cid):
    """Foto e dados do TheSportsDB de alguém com esse nome QUE ESTEJA no clube (o time do cadastro tem de bater)."""
    try:
        d = P.get_json(f"https://www.thesportsdb.com/api/v1/json/123/searchplayers.php?p={_norm(nome).replace(' ', '_')}")
    except Exception as ex:
        P.silencioso("verifica:tsdb", ex)
        return None
    clube = P.CLUBS[cid]
    nomes_clube = {_norm(x) for x in [clube.get("busca"), *(clube.get("apelidos") or [])]} - {""}
    for p in d.get("player") or []:
        if _norm(p.get("strPlayer")) != _norm(nome):
            continue
        time_ = _norm(p.get("strTeam"))
        if not any(time_ and (time_ == n or (len(n) > 4 and (n in time_ or time_ in n))) for n in nomes_clube):
            continue
        foto = p.get("strCutout") or p.get("strThumb")
        return {"foto": foto if foto and foto.startswith("https://r2.thesportsdb.com/") else None,
                "nasc": (p.get("dateBorn") or "")[:10], "pais": p.get("strNationality") or "", "time": p.get("strTeam")}
    return None


# ---------------------------------------------------------------------------
# análise (sem rede: testada em tests/verifica_jogadores.py)
# ---------------------------------------------------------------------------
def _pasta(u):
    m = re.match(r"img/jogadores/([a-z0-9-]+)/", str(u or ""))
    return m.group(1) if m else None


def _dias(a, b):
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def _difere(a, b):
    """Duas pessoas? Nascimento ou país diferentes (não mudam numa transferência), ou camisa E posição diferentes.
    Quem entrou no elenco pela súmula ("súmulas recentes") não tem país de verdade (fica "bra"): o país dele não conta."""
    def real(j, k):
        return None if (k == "pais" and j.get("cadastro")) else (str(j.get(k)) if j.get(k) else None)
    fortes = sum(1 for k in ("nasc", "pais") if real(a, k) and real(b, k) and real(a, k) != real(b, k))
    fracos = sum(1 for k in ("num", "pos") if real(a, k) and real(b, k) and real(a, k) != real(b, k))
    return fortes >= 1 or fracos >= 2


def classifica_colisao(regs, apar):
    """regs: [(clube, jogador)] com o mesmo id em mais de um elenco. Devolve ("homonimo"|"transferencia"|"duvida", atual).
    atual: na transferência, o clube onde ele jogou por último."""
    datas = {cid: apar.get(cid, {}).get(str(j["id"])) or [] for cid, j in regs}
    com = {cid: d for cid, d in datas.items() if d}
    if len(com) >= 2:
        # dias intercalados: a mesma pessoa troca de clube uma vez (duas, se voltar de empréstimo); homônimos se alternam
        seq = sorted((d, cid) for cid, ds in com.items() for d in ds)
        trocas = sum(1 for x, y in zip(seq, seq[1:]) if x[1] != y[1])
        ini = max(ds[0] for ds in com.values())
        fim = min(ds[-1] for ds in com.values())
        sobre = _dias(ini, fim) if ini <= fim else -1
        if trocas >= 3 or sobre >= SOBREPOE_DIAS:
            return "homonimo", None
        return "transferencia", max(com, key=lambda c: com[c][-1])
    js = [j for _, j in regs]
    if any(_difere(a, b) for i, a in enumerate(js) for b in js[i + 1:]):
        return "homonimo", None
    return "duvida", None


def analisa(mercado, apar, rosters, ogol, hoje=None):
    """Situação de cada jogador de cada elenco. Devolve {clube: {id: registro}} e a lista de colisões.
    registro: {"st": confirmado|provavel|sem-fonte|saiu, "fontes": [...], "homonimo": [outros clubes]?, "fotoDe": pasta?}"""
    hoje = hoje or date.today().isoformat()
    corte = (date.fromisoformat(hoje) - timedelta(days=RECENTE_DIAS)).isoformat()
    por_id = {}
    for cid, d in mercado.items():
        for j in d.get("elenco", []):
            por_id.setdefault(str(j["id"]), []).append((cid, j))
    out, colisoes = {}, []
    for cid, d in mercado.items():
        o = out.setdefault(cid, {})
        rs, og = rosters.get(cid), ogol.get(cid)
        for j in d.get("elenco", []):
            aid = str(j["id"])
            fontes = []
            if rs is not None and aid in rs:
                fontes.append("ESPN (cadastro)")
            if og and acha_ogol(j.get("nome"), og):
                fontes.append("ogol (elenco atual)")
            ds = apar.get(cid, {}).get(aid) or []
            if ds and ds[-1] >= corte:
                fontes.append("súmulas (últimos 60 dias)")
            o[aid] = {"st": "confirmado" if len(fontes) >= 2 else "provavel" if fontes else "sem-fonte", "fontes": fontes,
                      **({"ultimoJogo": ds[-1]} if ds else {})}
    for aid, regs in por_id.items():
        if len({c for c, _ in regs}) < 2:
            continue
        tipo, atual = classifica_colisao(regs, apar)
        clubes = sorted({c for c, _ in regs})
        colisoes.append({"id": aid, "nome": regs[0][1].get("nome"), "clubes": clubes, "tipo": tipo, **({"atual": atual} if atual else {})})
        for cid, j in regs:
            r = out[cid][aid]
            if tipo == "transferencia" and cid != atual and not j.get("emprestadoDe"):
                r["st"], r["foiPara"] = "saiu", atual
            elif tipo in ("homonimo", "duvida"):
                r["homonimo" if tipo == "homonimo" else "mesmoId"] = [c for c in clubes if c != cid]
    return out, colisoes


def foto_permitida(cid, reg, url):
    """A foto guardada (pasta img/jogadores/<x>/) pode aparecer neste clube? Num homônimo, só a baixada para ele."""
    if not url:
        return False
    if reg.get("homonimo"):
        return _pasta(url) == cid
    if reg.get("mesmoId"):
        # mesmo id em dois clubes sem prova de que são duas pessoas: a foto baixada para o OUTRO clube não serve aqui
        return _pasta(url) in (cid, None) or _pasta(url) not in reg["mesmoId"]
    return True


# ---------------------------------------------------------------------------
# rodada
# ---------------------------------------------------------------------------
def ligar(p, foto, og):
    global P, FOTO, OG, SLUG_CID
    P, FOTO, OG = p, foto, og
    OG.P = p
    SLUG_CID = {v.split("/")[0]: k for k, v in OG.CLUBES.items()}


def _elencos_ogol(c, agora):
    """Elenco atual de cada clube no ogol (cache de 6 h). Para no primeiro desafio anti-robô."""
    cache = c.setdefault("ogolElenco", {})
    bloqueado = False
    for cid in P.CLUBS:
        r = cache.get(cid) or {}
        if r.get("nomes") and agora - r.get("t", 0) < OGOL_ELENCO_H * 3600:
            continue
        if bloqueado:
            continue
        try:
            nomes = elenco_ogol(cid)
            if len(nomes) >= 15:  # menos que isso é página incompleta: fica a leitura anterior
                cache[cid] = {"t": agora, "nomes": nomes}
        except Bloqueado:
            bloqueado = True
            P.log("verificação: o ogol pediu o desafio anti-robô; segue sem ele nesta rodada")
        except Exception as ex:
            P.silencioso("verifica:ogol-elenco", ex)
    # vale a última leitura boa por até 3 dias (o elenco quase não muda de um dia para o outro)
    return {cid: r["nomes"] for cid, r in cache.items() if r.get("nomes") and agora - r.get("t", 0) < 3 * 86400}, bloqueado


def _qids():
    """{id do jogador: código do Wikidata} guardado pelas carreiras (server/cache/carreiras.json)."""
    try:
        cw = json.load(open(os.path.join(P.ROOT, "server", "cache", "carreiras.json"), encoding="utf-8")).get("clubes_wd") or {}
    except Exception:
        return {}
    return {aid: q for d in cw.values() for aid, q in (d.get("qids") or {}).items() if q}


def _wiki_base(qid, cid):
    """Base pela Wikipédia (fonte liberada, funciona também nos servidores do GitHub): ([formador], clube atual bate?)."""
    import carreiras_wiki as CW
    import jogadores as J
    CW.P = P
    nomes = {c: J.NOME_OFICIAL.get(c, c) for c in P.CLUBS}

    def site_do_clube(txt):
        exp = CW._expande("en", [txt])[0] or txt
        titulo, nome = CW._link(exp)
        for c, oficial in nomes.items():
            if CW.clube_bate(titulo, oficial) or CW.clube_bate(nome, oficial):
                return c
        return None
    titulos = CW.titulo_do_wikidata(qid)
    if not titulos.get("en"):
        return None
    params = CW.caixa("en", titulos["en"])
    if not params:
        return None
    return base_da_wikipedia(params, cid, site_do_clube, nomes.get(cid)) + (titulos["en"],)


def _bases(c, mercado, ogol, agora, bloqueado):
    """Base de cada jogador (cache de 30 dias; BASE_POR_RODADA leituras por rodada). Fonte 1: carreira no ogol, quando
    ele responde. Fonte 2: caixa de informações da Wikipédia em inglês (youth_clubs), pelo código do Wikidata."""
    cache = c.setdefault("base", {})
    qids = _qids()
    feitos = 0
    fila = sorted(((cid, j) for cid, d in mercado.items() for j in d.get("elenco", [])), key=lambda t: -(t[1].get("min") or 0))
    for cid, j in fila:
        k = f"{cid}:{j['id']}"
        r = cache.get(k)
        if r and agora - r.get("t", 0) < BASE_DIAS * 86400:
            continue
        if feitos >= BASE_POR_RODADA:
            break
        alvo = None if bloqueado else (acha_ogol(j.get("nome"), ogol.get(cid)) or acha_ogol(j.get("nomeCompleto"), ogol.get(cid)))
        if alvo:
            feitos += 1
            try:
                bases, ok = base_da_carreira(_ogol(f"/jogador/{alvo[0]}/{alvo[1]}"), cid)
                cache[k] = {"t": agora, "ogol": alvo, "bases": bases, "recenteNoClube": ok}
                continue
            except Bloqueado:
                P.log("verificação: o ogol recusou o acesso; as bases seguem pela Wikipédia nesta rodada")
                bloqueado = True
            except Exception as ex:
                P.silencioso("verifica:ogol-jogador", ex)
        qid = qids.get(str(j["id"]))
        if qid:
            feitos += 1
            try:
                w = _wiki_base(qid, cid)
            except Exception as ex:
                P.silencioso("verifica:wiki-base", ex)
                w = None
            if w:
                cache[k] = {"t": agora, "wiki": w[2], "bases": w[0], "recenteNoClube": w[1]}
                continue
        cache[k] = {"t": agora - (BASE_DIAS - 3) * 86400, "achou": False}  # nenhuma fonte agora: tenta de novo em 3 dias
    return cache


def _troca_foto(c, cid, j, agora):
    """Foto própria para o homônimo que não tem a dele: TheSportsDB com o mesmo nome no mesmo clube (cache de 7 dias)."""
    k = f"{cid}:{j['id']}"
    t = c.setdefault("trocas", {}).get(k)
    if t and agora - t.get("t", 0) < 7 * 86400 and (not t.get("u") or FOTO._existe(t["u"])):
        return t
    achado = busca_tsdb(j.get("nome"), cid)
    reg = {"t": agora, "u": None, "dados": {k2: achado[k2] for k2 in ("nasc", "pais", "time") if achado and achado.get(k2)}}
    if achado and achado.get("foto") and FOTO.privadas_ligadas():
        dados = FOTO.baixar(achado["foto"])
        # nome próprio (<id>-h): o monitor de fotos guarda <id>.webp e poderia sobrescrever com a do outro homônimo
        u = FOTO.guardar(cid, f"{j['id']}-h", dados) if dados else None
        if u:
            reg.update({"u": u, "f": "TheSportsDB", "src": achado["foto"]})
    c["trocas"][k] = reg
    return reg


_ULTIMO = [None]


def ultimo():
    """O resultado da última rodada (memória ou dados/verificacao-jogadores.json): base da rota /api/verificacao."""
    if _ULTIMO[0] is None:
        try:
            _ULTIMO[0] = json.load(open(os.path.join(P.ROOT, "dados", "verificacao-jogadores.json"), encoding="utf-8"))
        except Exception:
            return None
    return _ULTIMO[0]


PAIS = {"argentina": "arg", "uruguay": "uru", "brazil": "bra", "paraguay": "par", "colombia": "col", "chile": "chi",
        "ecuador": "ecu", "venezuela": "ven", "peru": "per", "bolivia": "bol", "portugal": "por", "spain": "esp"}


def rodar():
    """Uma rodada: verifica, aplica no elenco (estado do robô) e grava dados/verificacao-jogadores.json."""
    agora = time.time()
    c = _ler()
    with P.lock:
        mercado = P.state.get("mercado") or {}
    if not mercado:
        return None
    apar = aparicoes(datas_jogos())
    rosters = rosters_espn()
    ogol, bloqueado = _elencos_ogol(c, agora)
    sit, colisoes = analisa(mercado, apar, rosters, ogol)
    bases = _bases(c, mercado, ogol, agora, bloqueado)
    fotos_cache = FOTO._ler()
    subst, removidos, n_cria, trocadas = {}, [], 0, []
    for cid, d in mercado.items():
        for j in d.get("elenco", []):
            aid, reg = str(j["id"]), sit[cid][str(j["id"])]
            # foto: a do monitor só se for desta pessoa; senão a troca própria do homônimo; senão nenhuma (número)
            if reg.get("homonimo") or reg.get("mesmoId"):
                atual = (FOTO.foto_de(aid, fotos_cache) or {}) if FOTO.privadas_ligadas() else {}
                if foto_permitida(cid, reg, atual.get("u")):
                    subst[(cid, aid)] = atual or None
                else:
                    t = _troca_foto(c, cid, j, agora)
                    subst[(cid, aid)] = {"u": t["u"], "f": "TheSportsDB"} if t.get("u") else None
                    trocadas.append({"clube": cid, "id": aid, "nome": j.get("nome"), "antes": _pasta(atual.get("u")), "agora": "TheSportsDB" if t.get("u") else "número da camisa"})
                    # o cadastro do homônimo veio da súmula (sem nascimento nem país): completa com o TheSportsDB do clube
                    dd = t.get("dados") or {}
                    if dd.get("nasc") and not j.get("nasc"):
                        j["nasc"] = dd["nasc"]
                        try:
                            j["idade"] = int((date.today() - date.fromisoformat(dd["nasc"])).days // 365.25)
                        except Exception:
                            pass
                    if dd.get("pais") and _norm(dd["pais"]) in PAIS and j.get("cadastro"):
                        j["pais"] = PAIS[_norm(dd["pais"])]
                f = subst[(cid, aid)]
                j["fotoPrivada"] = f["u"] if f and f.get("f") != "Wikimedia" else None
                j["fotoInfo"] = {"fonte": f["f"]} if f and f.get("f") not in ("TheSportsDB", "Wikimedia") else None
            b = bases.get(f"{cid}:{aid}") or {}
            if b.get("bases") and b.get("recenteNoClube"):
                if cid in b["bases"]:
                    j["base"] = {"clube": cid, "rotulo": rotulo_base(cid)}
                else:
                    o = b["bases"][0]
                    j["base"] = {"clube": o, "rotulo": f"Revelado pelo {nome_clube(o)}"}
                n_cria += j["base"]["clube"] == cid
            else:
                j.pop("base", None)
            j["verif"] = {k: reg[k] for k in ("st", "fontes", "homonimo", "foiPara") if reg.get(k)}
        # quem trocou de clube e só ficou no cadastro antigo sai do elenco deste
        fora = [j for j in d.get("elenco", []) if sit[cid][str(j["id"])]["st"] == "saiu"]
        if fora:
            with P.lock:
                d["elenco"] = [j for j in d["elenco"] if j not in fora]
            removidos += [{"clube": cid, "id": str(j["id"]), "nome": j.get("nome"), "foiPara": sit[cid][str(j["id"])].get("foiPara")} for j in fora]
    FOTO.SUBST = subst
    _gravar(c)
    resumo = {
        "atualizado": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "frequencia": "a cada rodada do robô (cerca de 10 minutos)",
        "fontes": ["ESPN (cadastro e súmulas)", "ogol.com.br (elenco atual e carreira)" + (" — nesta rodada só o cache: desafio anti-robô" if bloqueado else ""), "TheSportsDB (foto e dados do homônimo)", "sites oficiais dos clubes (fotos, pelo monitor de fotos)"],
        "fora": "SofaScore, FlashScore e FotMob recusam robôs ou proíbem o acesso no robots.txt; Google só pela API oficial",
        "totais": {
            "jogadores": sum(len(v) for v in sit.values()),
            "confirmados": sum(1 for v in sit.values() for r in v.values() if r["st"] == "confirmado"),
            "provaveis": sum(1 for v in sit.values() for r in v.values() if r["st"] == "provavel"),
            "semFonte": sum(1 for v in sit.values() for r in v.values() if r["st"] == "sem-fonte"),
            "crias": n_cria,
            "basesConferidas": sum(1 for k in bases if bases[k].get("ogol") or bases[k].get("wiki")),
        },
        "colisoes": colisoes,
        "fotosTrocadas": trocadas,
        "removidos": removidos,
        "clubes": {cid: {aid: {k: r[k] for k in ("st", "fontes", "homonimo", "foiPara", "ultimoJogo") if r.get(k)} for aid, r in v.items()} for cid, v in sit.items()},
    }
    pasta = os.path.join(P.ROOT, "dados")
    os.makedirs(pasta, exist_ok=True)
    json.dump(resumo, open(os.path.join(pasta, "verificacao-jogadores.json"), "w", encoding="utf-8", newline="\n"), ensure_ascii=False, separators=(",", ":"))
    _ULTIMO[0] = resumo
    P.log(f"verificação: {resumo['totais']['confirmados']} confirmados, {len(colisoes)} ids repetidos, {len(trocadas)} fotos trocadas, {len(removidos)} saíram, {n_cria} crias")
    return resumo
