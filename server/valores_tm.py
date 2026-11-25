# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""CazéStats.TV — monitor de valores de mercado, transferências, contratos, posições e fotos do Transfermarkt.

Fonte: transfermarkt-datasets (github.com/dcaribou/transfermarkt-datasets), dados do Transfermarkt publicados em domínio
público (CC0-1.0), com download aberto. Por que não o site do Transfermarkt direto: ele recusa robôs (403 / desafio
anti-robô, testado em 18/11/2026) e contornar bloqueio é invadir. O conjunto tem o valor de mercado de cada jogador, a
data da avaliação, o vencimento do contrato, a posição detalhada (zagueiro, lateral, volante, ponta...), o endereço da
foto e todas as transferências com o valor pago.

Ritmo: em toda rodada do robô (~10 min) e a cada 5 min no servidor ao vivo, um pedido HEAD confere a versão (ETag) dos
arquivos; só quando muda o arquivo é baixado de novo (~17 MB). AVISO HONESTO: o próprio conjunto parou de ser atualizado
em julho de 2026 ("current to 6 July 2026"); os valores são os do Transfermarkt naquela data e transferências depois disso
ainda não aparecem. Quando o mantenedor voltar a publicar, a ETag muda e o robô pega na mesma rodada.

Salário: nenhuma fonte pública e liberada tem o salário de cada jogador (o Capology recusa robôs). Ele continua uma
estimativa, agora calculada sobre o valor REAL do Transfermarkt, e o site diz isso.

Também aqui (Série A): o índice de retorno defensivo (desarmes + interceptações + cortes por 90 min, comparado com quem
joga na mesma posição) e a zona de atuação (lado e altura no campo), dos lances reais da ESPN (dados/jogadores/).
"""
import csv
import gzip
import io
import json
import os
import re
import time
import unicodedata
from datetime import date

P = None  # módulo placar_api
BASE = "https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/"
ARQS = ("players", "player_valuations", "transfers")
CACHE = "valores-tm.json"
FORMATO = 2  # muda quando o índice ganha campos: o robô refaz o índice uma vez, mesmo sem arquivo novo
FOTO_TM = "https://img.a.transfermarkt.technology/portrait/header/"

# posição detalhada do Transfermarkt -> código do site (js/campo.js); "SA" = segundo atacante
SUB = {"Goalkeeper": "GOL", "Centre-Back": "ZAG", "Left-Back": "LE", "Right-Back": "LD", "Defensive Midfield": "VOL",
       "Central Midfield": "MC", "Attacking Midfield": "MEI", "Left Midfield": "ME", "Right Midfield": "MD",
       "Left Winger": "PE", "Right Winger": "PD", "Second Striker": "SA", "Centre-Forward": "CA"}
# liga da ESPN -> competição do Transfermarkt (só desempata; o clube e o nome é que decidem)
LIGA_TM = {"eng.1": "GB1", "esp.1": "ES1", "ita.1": "IT1", "ger.1": "L1", "fra.1": "FR1", "por.1": "PO1", "ned.1": "NL1",
           "tur.1": "TR1", "ksa.1": "SA1", "bra.1": "BRA1", "usa.1": "MLS1", "mex.1": "MEX1", "arg.1": "ARG1", "bra.2": "BRA2",
           "col.1": "COL1", "uru.1": "URU1", "chi.1": "CLPD"}
GENERICAS = set("fc cf sc ac as ss ssc rc cd ud sd sa saf afc cfc club clube de da do del la le los futbol futebol football "
                "esporte esportiva sport sporting associacao asociacion atletico athletic 1 04 05 1899 1846 1909 1913 1907 "
                "calcio s a f u e v bc bk if fk sk nk ca cr ec se cs".split())


# letras sem decomposição no Unicode (o NFD apagaria): Kadıoğlu, Ødegaard, Szczęsny/Łukasz, Æ, ß, Đ
LETRAS = str.maketrans({"ı": "i", "İ": "I", "ø": "o", "Ø": "O", "ł": "l", "Ł": "L", "æ": "ae", "Æ": "Ae", "ß": "ss", "đ": "d", "Đ": "D", "þ": "th", "œ": "oe"})


def _norm(x):
    x = unicodedata.normalize("NFD", str(x or "").translate(LETRAS)).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", x).split())


SIGLA = {"pr": "paranaense", "mg": "mineiro", "go": "goianiense", "rj": "", "sp": "", "athletico": "", "bragantino": "bragantino"}


def tokens_clube(nome):
    """Palavras que distinguem o clube: 'Paris Saint-Germain' -> {paris, saint, germain}; 'S. A. F. Botafogo' -> {botafogo};
    'Athletico-PR' (ESPN) -> {paranaense}, como 'Clube Atlético Paranaense' (Transfermarkt)."""
    out = set()
    for t in _norm(nome).split():
        t = SIGLA.get(t, t)
        if t and t not in GENERICAS and len(t) > 1:
            out.add(t)
    return out


def mesmo_clube(a, b):
    ta, tb = tokens_clube(a), tokens_clube(b)
    if not ta or not tb:
        return False
    inter = ta & tb
    return bool(inter) and (len(inter) >= min(len(ta), len(tb)) or len(inter) >= 2)


def idade_em(nasc, hoje=None):
    try:
        d, h = date.fromisoformat(nasc[:10]), hoje or date.today()
        return h.year - d.year - ((h.month, h.day) < (d.month, d.day))
    except Exception:
        return None


def pontua(alvo, tm, hoje=None):
    """Quanto o registro do Transfermarkt parece ser o jogador da ESPN. alvo: {nome, idade?, nasc?, clube?, liga?}."""
    na = _norm(alvo["nome"])
    pa = na.split()
    if not pa:
        return -99

    def nota_nome(nt):
        pt = nt.split()
        if not pt:
            return -99
        if na == nt:
            return 4
        if set(pa) <= set(pt) or set(pt) <= set(pa):
            return 3
        if pa[-1] == pt[-1] and pa[0][0] == pt[0][0]:
            return 2
        return -99
    # o nome do Transfermarkt ("Gabriel") ou o nome e sobrenome registrados lá ("Gabriel Magalhães")
    s = max(nota_nome(tm["n"]), nota_nome(tm.get("n2") or ""))
    if s < 0:
        return -99
    pt = (tm.get("n2") if nota_nome(tm.get("n2") or "") == s else tm["n"]).split()
    if alvo.get("nasc") and tm.get("d"):
        if alvo["nasc"][:10] == tm["d"]:
            s += 5
        elif alvo["nasc"][:4] != tm["d"][:4]:
            return -99  # nascimento diferente: outra pessoa
    ia, it = alvo.get("idade"), idade_em(tm.get("d") or "", hoje)
    if ia is not None and it is not None:
        dif = abs(ia - it)
        s += 2 if dif <= 1 else (-1 if dif == 2 else -8)
    # clube diferente não tira ponto: os elencos da ESPN já são da temporada nova e o conjunto ainda mostra o clube de
    # julho (Goretzka no Bayern, Bruno Guimarães no Newcastle). Mas nome de uma palavra só ("Allan") sem o clube nem o
    # nascimento para conferir é arriscado demais: fica de fora.
    bate_clube = bool(alvo.get("clube") and tm.get("c") and mesmo_clube(alvo["clube"], tm["c"]))
    if bate_clube:
        s += 4
    elif len(pa) < 2 and not (alvo.get("nasc") and alvo["nasc"][:10] == tm.get("d")):
        return -99
    if alvo.get("liga") and LIGA_TM.get(alvo["liga"]) == tm.get("lg"):
        s += 1
    return s


def casa(alvo, indice, hoje=None):
    """O registro do Transfermarkt do jogador, ou None. Precisa de nome + (clube ou nascimento) e ninguém empatado."""
    na = _norm(alvo["nome"])
    cands = indice["porNome"].get(na, []) + indice["porSobrenome"].get(na.split()[-1] if na else "", [])
    vistos, notas = set(), []
    for tid in cands:
        if tid in vistos:
            continue
        vistos.add(tid)
        notas.append((pontua(alvo, indice["j"][tid], hoje), tid))
    notas.sort(reverse=True)
    if not notas or notas[0][0] < 6:  # 6 = nome completo igual + idade batendo (ou mais: clube, nascimento, liga)
        return None
    if len(notas) > 1 and notas[1][0] == notas[0][0]:
        return None  # dois iguais: não chuta
    return notas[0][1]


# ---------------------------------------------------------------------------
# download e índice
# ---------------------------------------------------------------------------
def _arq(nome=CACHE):
    return os.path.join(P.ROOT, "server", "cache", nome)


def _ler():
    try:
        return json.load(open(_arq(), encoding="utf-8"))
    except Exception:
        return {}


def _gravar(c):
    os.makedirs(os.path.dirname(_arq()), exist_ok=True)
    json.dump(c, open(_arq() + ".tmp", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    os.replace(_arq() + ".tmp", _arq())


def _etag(nome):
    import urllib.request
    r = urllib.request.urlopen(urllib.request.Request(BASE + nome + ".csv.gz", method="HEAD", headers={"User-Agent": "CazeStats/1.0"}), timeout=30)
    return r.headers.get("ETag", "").strip('"'), r.headers.get("Last-Modified", "")


def _csv(nome):
    dados = P.get(BASE + nome + ".csv.gz", timeout=180)
    return csv.DictReader(io.TextIOWrapper(gzip.GzipFile(fileobj=io.BytesIO(dados)), encoding="utf-8"))


def monta_indice(jogadores, avaliacoes, transferencias, hoje=None):
    """Índice compacto: só quem jogou de 2023 para cá. j[id] = {n, d, c, lg, s, v, vm, ct, f, pe, al, vd, t}."""
    hoje = (hoje or date.today()).isoformat()
    j = {}
    for x in jogadores:
        if (x.get("last_season") or "0") < "2023":
            continue
        img = x.get("image_url") or ""
        m = re.search(r"/portrait/header/([^?]+)", img)
        n2 = _norm(f"{x.get('first_name') or ''} {x.get('last_name') or ''}")
        j[x["player_id"]] = {
            "n": _norm(x.get("name")), "nome": x.get("name"), **({"n2": n2} if n2 and n2 != _norm(x.get("name")) and len(n2.split()) > 1 else {}), "d": (x.get("date_of_birth") or "")[:10], "c": x.get("current_club_name") or "",
            "lg": x.get("current_club_domestic_competition_id") or "", "s": SUB.get(x.get("sub_position") or "", ""),
            "v": int(float(x["market_value_in_eur"])) if x.get("market_value_in_eur") else None,
            "vm": int(float(x["highest_market_value_in_eur"])) if x.get("highest_market_value_in_eur") else None,
            "ct": (x.get("contract_expiration_date") or "")[:10], "f": m.group(1) if m and "default" not in m.group(1) else None,
            "pe": {"right": "D", "left": "E", "both": "A"}.get(x.get("foot") or "", ""), "al": int(float(x["height_in_cm"])) if x.get("height_in_cm") else None,
        }
    for x in avaliacoes:  # data da última avaliação de cada um
        r = j.get(x.get("player_id"))
        if r and (x.get("date") or "") > r.get("vd", ""):
            r["vd"] = x["date"][:10]
    for x in transferencias:  # a última transferência que já aconteceu (o conjunto tem algumas com data futura)
        r = j.get(x.get("player_id"))
        d = (x.get("transfer_date") or "")[:10]
        if not r or not d or d > hoje or d <= (r.get("t") or [""])[0]:
            continue
        fee = x.get("transfer_fee")
        r["t"] = [d, x.get("from_club_name") or "", x.get("to_club_name") or "", int(float(fee)) if fee not in (None, "") else None]
    por_nome, por_sob = {}, {}
    for tid, r in j.items():
        for n in {r["n"], r.get("n2") or ""} - {""}:
            por_nome.setdefault(n, []).append(tid)
            por_sob.setdefault(n.split()[-1], []).append(tid)
    return {"j": j, "porNome": por_nome, "porSobrenome": por_sob}


def atualizar(forcar=False):
    """Confere a versão dos arquivos e, se mudou, baixa e refaz o índice. Devolve o índice (ou o guardado)."""
    c = _ler()
    try:
        versoes = {n: _etag(n) for n in ARQS}
    except Exception as ex:
        P.log("valores: não deu para conferir a versão do Transfermarkt", ex)
        return c.get("indice")
    c["conferido"] = time.time()
    if not forcar and c.get("indice") and c.get("formato") == FORMATO and all(c.get("versoes", {}).get(n, [None])[0] == versoes[n][0] for n in ARQS):
        _gravar(c)
        return c["indice"]
    t0 = time.time()
    try:
        ind = monta_indice(_csv("players"), _csv("player_valuations"), _csv("transfers"))
    except Exception as ex:
        P.log("valores: falha ao baixar o conjunto do Transfermarkt", ex)
        return c.get("indice")
    c.update({"indice": ind, "versoes": versoes, "baixado": time.time(), "formato": FORMATO})
    _gravar(c)
    P.log(f"valores: conjunto do Transfermarkt baixado ({len(ind['j'])} jogadores, {time.time() - t0:.0f} s, versão {versoes['players'][1]})")
    return ind


def versao():
    c = _ler()
    v = (c.get("versoes") or {}).get("players") or [None, ""]
    return {"arquivo": v[1], "conferido": c.get("conferido"), "baixado": c.get("baixado")}


# ---------------------------------------------------------------------------
# Série A: retorno defensivo e zona de atuação pelos lances reais
# ---------------------------------------------------------------------------
NIV = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"


def zona(calor, gx=24, gy=16):
    """(terços [def, meio, ataque], lados [esq, centro, dir]) em % das ações, da grade do mapa de calor."""
    t, l, s = [0.0] * 3, [0.0] * 3, 0.0
    for k, ch in enumerate((calor or "")[:gx * gy]):
        v = NIV.find(ch)
        if v <= 0:
            continue
        w = (v / 61) ** 2
        x, y = k % gx, k // gx
        t[min(2, x * 3 // gx)] += w
        l[min(2, y * 3 // gy)] += w
        s += w
    if not s:
        return None
    return [round(a / s * 100) for a in t], [round(a / s * 100) for a in l]


def perfis_serie_a(pasta=None):
    """{id: {"def": 0-100, "z": [terços, lados], "min": minutos}}: índice de retorno defensivo (percentil das ações
    defensivas por 90 min entre quem joga na mesma posição, mínimo 450 min) e a zona de atuação."""
    pasta = pasta or os.path.join(P.ROOT, "dados", "jogadores")
    try:
        hm = json.load(open(os.path.join(P.ROOT, "dados", "heatmaps.json"), encoding="utf-8")).get("players", {})
    except Exception:
        hm = {}
    brutos = {}
    for nome in os.listdir(pasta) if os.path.isdir(pasta) else []:
        try:
            d = json.load(open(os.path.join(pasta, nome), encoding="utf-8"))
        except Exception:
            continue
        for aid, j in (d.get("jogadores") or {}).items():
            comps = (j.get("comps") or {}).values()
            mi = sum(c.get("min", 0) for c in comps)
            acoes = sum(c.get("desarmes", 0) + c.get("intercept", 0) + c.get("cortes", 0) for c in comps)
            pos = (hm.get(aid) or {}).get("f") or {"G": "GOL", "D": "ZAG", "M": "MC", "F": "CA", "A": "CA"}.get(j.get("pos"), "MC")
            z = zona(j.get("calor"), *(d.get("grade") or [24, 16]))
            if mi > (brutos.get(aid) or {}).get("min", -1):
                brutos[aid] = {"min": mi, "p90": acoes * 90 / mi if mi else 0, "pos": pos, "z": z}
    grupo = {}
    for aid, r in brutos.items():
        if r["min"] >= 450:
            grupo.setdefault(r["pos"], []).append(r["p90"])
    out = {}
    for aid, r in brutos.items():
        g = sorted(grupo.get(r["pos"], []))
        idx = None
        if r["min"] >= 450 and len(g) >= 5:
            abaixo = sum(1 for x in g if x < r["p90"])
            idx = round(abaixo / (len(g) - 1) * 100) if len(g) > 1 else 50
        out[aid] = {"def": idx, "z": r["z"], "min": r["min"], "p90": round(r["p90"], 2), "pos": r["pos"]}
    return out


# ---------------------------------------------------------------------------
# aplicar: mercado global (reforços) e elencos da janela
# ---------------------------------------------------------------------------
def enriquecer_global(comp, ind, perfis=None, hoje=None, nascs=None):
    """Acrescenta às linhas do mercado global (gravado por mercado.global_compacto) o que veio do Transfermarkt e o perfil
    da Série A. Linha: [... lesao, real, sub, foto, contrato, tm, def, zona]. Devolve (comp, detalhes por id)."""
    perfis = perfis or {}
    times = comp.get("times", {})
    detalhes, casados, razoes = {}, 0, {}
    for r in comp.get("jogadores", []):
        tid = r[6]
        t = times.get(tid) or ["", None, ""]
        # o nascimento (elencos da Série A) confirma de vez quem é quem
        tm_id = casa({"nome": r[1], "idade": r[2], "clube": t[0], "liga": t[2], "nasc": (nascs or {}).get(str(r[0]))}, ind, hoje) if ind else None
        x = ind["j"][tm_id] if tm_id else None
        pf = perfis.get(str(r[0])) or {}
        real = 0
        if x and x.get("v"):
            if r[8]:
                razoes.setdefault(t[2], []).append(x["v"] / r[8])
            r[8] = x["v"]  # valor de mercado REAL (Transfermarkt)
            real = 1
        if x:
            casados += 1
            detalhes[str(r[0])] = {k: x[k] for k in ("vd", "vm", "ct", "t", "pe", "al", "c") if x.get(k)} | {"tm": tm_id}
        zz = pf.get("z")
        r.extend([real, (x or {}).get("s") or pf.get("pos") or "", (x or {}).get("f") or "", ((x or {}).get("ct") or "")[:7],
                  tm_id or "", pf.get("def"), zona_txt(zz) if zz else ""])
    # quem não casou continua com a estimativa, corrigida pela relação real/estimado dos que casaram na mesma liga
    # (mediana, entre 0,15 e 2,5 vezes): a estimativa deixa de ficar sistematicamente acima ou abaixo do mercado de lá
    fator = {}
    for lg, rs in razoes.items():
        if len(rs) >= 20:
            rs = sorted(rs)
            fator[lg] = max(0.15, min(2.5, rs[len(rs) // 2]))
    for r in comp.get("jogadores", []):
        if not r[10] and r[8]:
            f = fator.get((times.get(r[6]) or ["", None, ""])[2])
            if f:
                r[8] = int(round(r[8] * f / 25000) * 25000) or 25000
    comp["campos"] = comp.get("campos", [])[:10] + ["real", "sub", "foto", "contrato", "tm", "def", "zona"]
    comp["fotoBase"] = FOTO_TM
    comp["fonte"] = ("ESPN (elencos) · valores, contratos, posições e fotos: Transfermarkt (transfermarkt-datasets, CC0) · "
                     "retorno defensivo e zona: lances reais da ESPN (Série A) · salário: estimativa")
    comp["valores"] = {**versao(), "casados": casados, "total": len(comp.get("jogadores", [])), "fatorEstimativa": {k: round(v, 2) for k, v in fator.items()}}
    return comp, detalhes


def zona_txt(z):
    """'ED' = terço (D defesa, M meio, A ataque) onde mais age + lado (E, C, D): o resumo da zona de atuação."""
    tercos, lados = z
    return "DMA"[max(range(3), key=lambda i: tercos[i])] + "ECD"[max(range(3), key=lambda i: lados[i])] + f"{tercos[0]:02d}"


def enriquecer_elencos(mercado, ind, hoje=None):
    """Elencos da janela: valor real, contrato, última transferência e posição detalhada do Transfermarkt."""
    n = 0
    for cid, d in mercado.items():
        nome_clube = (P.CLUBS.get(cid) or {}).get("busca") or cid
        for j in d.get("elenco", []):
            tm_id = casa({"nome": j.get("nome"), "idade": j.get("idade"), "nasc": j.get("nasc"), "clube": nome_clube, "liga": "bra.1"}, ind, hoje)
            if not tm_id:
                tm_id = casa({"nome": j.get("nomeCompleto") or "", "idade": j.get("idade"), "nasc": j.get("nasc"), "clube": nome_clube, "liga": "bra.1"}, ind, hoje)
            x = ind["j"].get(tm_id) if tm_id else None
            if not x:
                j.pop("tm", None)
                continue
            n += 1
            j["tm"] = {k: x[k] for k in ("vd", "vm", "ct", "t", "s", "f") if x.get(k)} | {"id": tm_id}
            if x.get("v"):
                j["valorEstimado"] = j.get("valorEstimado") or j.get("valor")
                j["valor"] = x["v"]
                j["valorReal"] = True
    return n


def rodar():
    """Uma rodada do monitor: confere a versão, aplica nos elencos e guarda o índice para o mercado global."""
    ind = atualizar()
    if not ind:
        return None
    with P.lock:
        mercado = P.state.get("mercado") or {}
    n = enriquecer_elencos(mercado, ind) if mercado else 0
    P.log(f"valores: {n} jogadores dos elencos com o valor do Transfermarkt")
    return {"elencos": n, **versao()}


ESPN_FOTO = "https://a.espncdn.com/i/headshots/soccer/players/full/{}.png"
ESPN_POR_RODADA = 500


def fotos_espn(ids, agora=None):
    """{id: True/False}: a ESPN tem a foto (headshot) do jogador? HEAD com cache (positivo 30 dias, negativo 7), no máximo
    ESPN_POR_RODADA pedidos novos por rodada; os outros ficam para as próximas."""
    import urllib.request
    from concurrent.futures import ThreadPoolExecutor
    agora = agora or time.time()
    c = _ler()
    cache = c.setdefault("espnFoto", {})
    falta = [i for i in ids if not (cache.get(i) and agora - cache[i][1] < (30 if cache[i][0] else 7) * 86400)][:ESPN_POR_RODADA]

    def testa(i):
        try:
            r = urllib.request.urlopen(urllib.request.Request(ESPN_FOTO.format(i), method="HEAD", headers={"User-Agent": "CazeStats/1.0"}), timeout=15)
            return i, r.status == 200 and "image" in (r.headers.get("Content-Type") or "")
        except Exception as ex:
            return i, (False if getattr(ex, "code", None) == 404 else None)
    with ThreadPoolExecutor(max_workers=16) as ex:
        for i, ok in ex.map(testa, falta):
            if ok is not None:
                cache[i] = [ok, agora]
    _gravar(c)
    return {i: bool(cache.get(i, [False])[0]) for i in ids}


TSDB_POR_RODADA = 40


def fotos_tsdb(linhas, times, agora=None):
    """{id: endereço}: foto do TheSportsDB pela busca do nome, só quando o time do cadastro de lá bate com o da ESPN.
    Para quem não tem foto no Transfermarkt nem na ESPN, dos mais valiosos para os menos; TSDB_POR_RODADA buscas por
    rodada (a API grátis aceita pouco por minuto), cache de 30 dias (achou) ou 10 (não achou)."""
    agora = agora or time.time()
    c = _ler()
    cache = c.setdefault("tsdbFoto", {})
    fila = sorted(linhas, key=lambda r: -(r[8] or 0))
    feitos = 0
    for r in fila:
        i = str(r[0])
        x = cache.get(i)
        if x and agora - x[1] < (30 if x[0] else 10) * 86400:
            continue
        if feitos >= TSDB_POR_RODADA:
            break
        feitos += 1
        time.sleep(1.5)  # a chave grátis do TheSportsDB aceita cerca de 30 pedidos por minuto
        try:
            d = P.get_json("https://www.thesportsdb.com/api/v1/json/123/searchplayers.php?p=" + _norm(r[1]).replace(" ", "_"))
        except Exception:
            continue
        time_ = (times.get(r[6]) or [""])[0]
        achado = None
        for p in d.get("player") or []:
            foto = p.get("strCutout") or p.get("strThumb") or ""
            if foto.startswith("https://r2.thesportsdb.com/") and _norm(p.get("strPlayer")) == _norm(r[1]) and mesmo_clube(time_, p.get("strTeam") or ""):
                achado = foto
                break
        cache[i] = [achado, agora]
    _gravar(c)
    return {i: v[0] for i, v in cache.items() if v and v[0]}


def global_real(comp):
    """Chamado por mercado.gravar_js: mercado global com os valores reais. Grava também os detalhes por jogador
    (dados/mercado/global-detalhes.json, lidos só quando a pessoa abre a ficha do jogador nos reforços)."""
    ind = _ler().get("indice")
    try:
        perfis = perfis_serie_a()
    except Exception as ex:
        P.silencioso("valores:perfis", ex)
        perfis = {}
    with P.lock:
        mercado = P.state.get("mercado") or {}
    nascs = {str(j["id"]): j["nasc"] for d in mercado.values() for j in d.get("elenco", []) if j.get("nasc")}
    comp, det = enriquecer_global(comp, ind or {"j": {}, "porNome": {}, "porSobrenome": {}}, perfis, nascs=nascs)
    # foto: a do Transfermarkt; sem ela, a da ESPN quando existe ("e"); a guardada pelo monitor (Série A) o site acha sozinho
    try:
        sem = [str(r[0]) for r in comp["jogadores"] if not r[12]]
        tem = fotos_espn(sem)
        for r in comp["jogadores"]:
            if not r[12] and tem.get(str(r[0])):
                r[12] = "e"
        # sem Transfermarkt e sem ESPN: TheSportsDB pelo nome, com o time conferido ("s:<caminho>")
        achadas = fotos_tsdb([r for r in comp["jogadores"] if not r[12]], comp.get("times", {}))
        for r in comp["jogadores"]:
            u = achadas.get(str(r[0]))
            if not r[12] and u:
                r[12] = "s:" + u.split("/images/media/player/", 1)[-1]
    except Exception as ex:
        P.silencioso("valores:fotos-espn", ex)
    pasta = os.path.join(P.ROOT, "dados", "mercado")
    os.makedirs(pasta, exist_ok=True)
    json.dump({"atualizado": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "fonte": "Transfermarkt (transfermarkt-datasets, CC0)", "valores": comp["valores"],
               "perfis": {k: v for k, v in perfis.items() if v.get("def") is not None or v.get("z")}, "jogadores": det},
              open(os.path.join(pasta, "global-detalhes.json"), "w", encoding="utf-8", newline="\n"), ensure_ascii=False, separators=(",", ":"))
    return comp
