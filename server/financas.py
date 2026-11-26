# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Autor: Alan Evangelista de Souza Martins. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE).
"""CazéStats.TV — situação financeira de cada clube da Série A para a janela de transferências.

Fontes: só o ge (ge.globo.com) e a ESPN (espn.com.br), para o balancete ficar coerente entre os clubes.
- folha salarial mensal: a base é o ranking do ge de 14/10/2026 (atualizado em 16/10 com os valores oficiais que
  Flamengo, Bahia, Internacional e Remo informaram). Não há folha oficial em tempo real, então ela NÃO é relida todo
  dia: o robô consulta as manchetes do ge e da ESPN uma vez por janela, nos dias antes de a janela abrir (datas do
  calendário da CBF, publicado pelo ge). Número achado só vale se a manchete for de folha mensal do clube (nunca
  "reduzir a folha em R$ 5 milhões", "aumento de R$ 2 milhões" e parecidos: isso é a variação, não a folha).
- caixa disponível: nenhum clube publica. A base é a média do que o clube gastou em reforços por janela no último
  ano, pelos balanços do ge (2026: as duas janelas). O site mostra essa observação ao lado do caixa. Orçamento divulgado em manchete do ge/ESPN (consultada junto com a folha) tem
  preferência.
- câmbio euro/real: cotação PTAX oficial do Banco Central do Brasil (API pública Olinda), do último dia útil.
Tudo vai para o site com a origem e a data de cada número.
"""
import json
import os
import re
import time
import urllib.parse

P = None  # módulo placar_api

GE_RANKING = "https://ge.globo.com/sp/futebol/noticia/2026/10/14/quanto-seu-time-gasta-com-salarios-veja-ranking-e-entenda-por-que-e-tao-dificil-responder.ghtml"
# folha mensal em R$ (ranking do ge, 14/10/2026, com a atualização de 16/10: Flamengo, Bahia, Internacional e Remo
# passaram ao valor oficial informado pelo clube)
FOLHA_BASE = {
    "flamengo": 37.5e6, "palmeiras": 30e6, "corinthians": 30e6, "cruzeiro": 30e6, "atletico-mg": 27e6, "santos": 25e6,
    "fluminense": 20e6, "gremio": 20e6, "sao-paulo": 18e6, "vasco": 16e6, "botafogo": 15e6, "athletico-pr": 14e6,
    "bahia": 14e6, "internacional": 12.5e6, "bragantino": 10e6, "vitoria": 9e6, "coritiba": 8e6, "mirassol": 6e6,
    "remo": 5.5e6, "chapecoense": 3.8e6,
}
FOLHA_BASE_DATA = "2026-10-14"

# janelas de transferência (calendário da CBF de 2027, publicado pelo ge em 09/10/2026)
CALENDARIO = "https://ge.globo.com/futebol/noticia/2026/10/09/cbf-divulga-calendario-de-2027-veja-detalhes.ghtml"
JANELAS = [
    {"id": "2027-1", "rotulo": "1ª janela de 2027", "abre": "2027-01-04", "fecha": "2027-03-02", "fonte": "CBF (calendário 2027, via ge)", "link": CALENDARIO},
    {"id": "2027-2", "rotulo": "2ª janela de 2027", "abre": "2027-07-19", "fecha": "2027-09-10", "fonte": "CBF (calendário 2027, via ge)", "link": CALENDARIO},
]
CONSULTA_ANTES_DIAS = 10  # a folha é conferida nos 10 dias antes de a janela abrir (e no dia em que abre)

# quanto cada clube gastou em reforços (R$), pelos balanços de janela do ge (atualizar depois de cada janela)
GASTOS = [
    {"id": "2026-1", "rotulo": "1ª janela de 2026", "link": "https://ge.globo.com/gato-mestre/noticia/2026/03/04/flamengo-palmeiras-e-cruzeiro-lideram-gastos-com-reforcos-veja-balanco-da-janela-na-serie-a.ghtml",
     "valores": {"flamengo": 341.444e6, "palmeiras": 192.132e6, "cruzeiro": 174.141e6, "fluminense": 151.284e6, "atletico-mg": 133.285e6, "vasco": 122.068e6,
                 "gremio": 109.735e6, "santos": 93.507e6, "bahia": 79.115e6, "bragantino": 74.210e6, "internacional": 37.835e6, "sao-paulo": 29.926e6,
                 "botafogo": 24.273e6, "athletico-pr": 23.292e6, "vitoria": 19.357e6, "coritiba": 15e6, "remo": 10.293e6, "mirassol": 9.370e6,
                 "corinthians": 4.898e6, "chapecoense": 0}},
    {"id": "2026-2", "rotulo": "2ª janela de 2026 (julho a setembro)", "link": "https://ge.globo.com/gato-mestre/noticia/2026/09/12/fred-gabriel-pec-santiago-sosa-hulk-e-cebolinha-veja-quem-seu-time-contratou-na-2a-janela.ghtml",
     "valores": {"cruzeiro": 110.296e6, "vasco": 106.491e6, "flamengo": 65.980e6, "botafogo": 48.976e6, "athletico-pr": 36.124e6, "bragantino": 35.654e6,
                 "atletico-mg": 32.5e6, "palmeiras": 20.028e6, "sao-paulo": 17.399e6, "vitoria": 6.871e6, "mirassol": 6.618e6, "bahia": 5.526e6,
                 "gremio": 3e6, "internacional": 1.808e6, "chapecoense": 0.15e6, "remo": 0, "coritiba": 0, "santos": 0, "fluminense": 0, "corinthians": 0}},
]
# manchete só conta se for do ge ou da ESPN
FONTE_OK = re.compile(r"^(ge|globoesporte|ge\.globo\.com|globoesporte\.globo\.com|espn|espn brasil|espn\.com\.br|www\.espn\.com\.br)$", re.I)
VERSAO = 3  # sobe quando a regra do balancete muda: o robô recalcula a janela de todos os clubes na rodada seguinte
EUR_BRL_PADRAO = 6.0
CACHE = "financas.json"

_NUM = re.compile(r"R\$\s?(\d{1,3}(?:[.,]\d{1,3})?)\s?(bilh[õo]es|bilh[ãa]o|bi|milh[õo]es|milh[ãa]o|mi)\b", re.I)


def _ler():
    try:
        return json.load(open(os.path.join(P.ROOT, "server", "cache", CACHE), encoding="utf-8"))
    except Exception as ex:
        P.silencioso("financas:40", ex)
        return {}


def _gravar(d):
    os.makedirs(os.path.join(P.ROOT, "server", "cache"), exist_ok=True)
    json.dump(d, open(os.path.join(P.ROOT, "server", "cache", CACHE), "w", encoding="utf-8"), ensure_ascii=False)


def valor_reais(txt):
    """'R$ 32,5 milhões' -> 32_500_000. Só o primeiro número em reais do texto."""
    m = _NUM.search(txt or "")
    if not m:
        return None
    n = float(m.group(1).replace(".", "").replace(",", ".") if re.search(r",\d", m.group(1)) else m.group(1).replace(",", "."))
    return n * (1e9 if m.group(2).lower().startswith("bi") else 1e6)


def classifica(titulo):
    """Que número a manchete traz: 'folha' (salários por mês), 'orcamento' (para reforços) ou None."""
    t = P.norm_txt(titulo)
    # "reduzir a folha em R$ 5 milhões", "aumento de R$ 2 mi na folha", "economiza R$ 1 milhão": é a variação, não a folha
    if re.search(r"reduz|reducao|corte|cortar|enxug|economi|aument|acrescimo|acrescent|\bmais r\b|\bem r\b|aliviar|alivio|diminu|impacto", t):
        return None
    if re.search(r"folha|salari", t) and re.search(r"por mes|mensa|/mes|folha", t) and not re.search(r"\bano\b|anual|temporada", t):
        return "folha"
    if re.search(r"orcamento|verba|investir|investimento|caixa", t) and re.search(r"reforc|contrata|janela|mercado", t):
        return "orcamento"
    return None


FUTEBOL = re.compile(r"jogador|elenco|folha|clube|\bsaf\b|reforc|contrat|tecnico|treinador|\btime\b|futebol|brasileirao|patrocin|salari|atleta|janela|orcamento", re.I)


def numero_do_clube(cid, titulo):
    """O número da manchete é deste clube? O clube tem de ser citado antes do número e ser o primeiro clube da
    Série A citado ("Atlético gasta R$ 27 mi por mês, mas Cruzeiro..." é do Atlético, não do Cruzeiro)."""
    m = _NUM.search(titulo or "")
    if not m:
        return False
    antes = P.norm_txt(titulo[:m.start()])
    primeiro, pos1 = None, 10 ** 9
    for c, nomes in P.HEADLINE_NAMES.items():
        for n in nomes[:2]:
            mm = re.search(r"\b" + re.escape(P.norm_txt(n)) + r"\b", antes)
            if mm and mm.start() < pos1:
                primeiro, pos1 = c, mm.start()
    return primeiro == cid


def cita_clube(cid, titulo):
    nomes = P.HEADLINE_NAMES.get(cid, [])[:2]
    t = P.norm_txt(titulo)
    return bool(FUTEBOL.search(t)) and any(re.search(r"\b" + re.escape(P.norm_txt(n)) + r"\b", t) for n in nomes if n)


def cambio_ptax():
    """Último euro PTAX (venda) do Banco Central, dos últimos 10 dias."""
    fim = time.strftime("%m-%d-%Y")
    ini = time.strftime("%m-%d-%Y", time.localtime(time.time() - 10 * 86400))
    url = ("https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?"
           + urllib.parse.urlencode({"@moeda": "'EUR'", "@dataInicial": f"'{ini}'", "@dataFinalCotacao": f"'{fim}'", "$format": "json", "$select": "cotacaoVenda,dataHoraCotacao"}))
    v = [x for x in (P.get_json(url).get("value") or []) if x.get("cotacaoVenda")]
    if not v:
        return None
    u = v[-1]
    return {"valor": round(float(u["cotacaoVenda"]), 4), "data": str(u.get("dataHoraCotacao") or "")[:10], "fonte": "Banco Central do Brasil (PTAX)"}


def fonte_ok(fonte):
    return bool(FONTE_OK.match(str(fonte or "").strip()))


def janela_atual_ou_proxima(hoje=None):
    """A janela aberta agora ou a próxima a abrir (pelas datas da CBF)."""
    hoje = hoje or time.strftime("%Y-%m-%d")
    for j in JANELAS:
        if hoje <= j["fecha"]:
            return j
    return None


def janela_para_consultar(hoje=None, consultadas=()):
    """A janela cuja folha deve ser conferida agora: faltam até CONSULTA_ANTES_DIAS dias para ela abrir (ou abre hoje)
    e ela ainda não foi consultada. Fora disso, None: a folha não é relida."""
    hoje = hoje or time.strftime("%Y-%m-%d")
    j = janela_atual_ou_proxima(hoje)
    if not j or j["id"] in consultadas:
        return None
    falta = (time.mktime(time.strptime(j["abre"], "%Y-%m-%d")) - time.mktime(time.strptime(hoje, "%Y-%m-%d"))) / 86400
    return j if -1 < falta <= CONSULTA_ANTES_DIAS else None


def gasto_janelas(cid):
    """Caixa pela média do ano: o que o clube gastou em reforços, em média, nas janelas do último ano dos balanços do ge
    (2026: a de janeiro a março e a de julho a setembro). Só a última janela deixava quem gastou pouco no meio do ano
    (Internacional, Grêmio, Bahia) quase sem caixa. Devolve {valor, obs, link}."""
    ult = GASTOS[-1]
    ano = [g for g in GASTOS if g["id"][:4] == ult["id"][:4]]
    vals = [g["valores"].get(cid) or 0 for g in ano]
    media = sum(vals) / len(vals) if vals else 0
    mi = lambda x: f"R$ {x / 1e6:.1f} mi".replace(".", ",")
    partes = "; ".join(f"{g['rotulo'].split(' (')[0]}: {mi(v)}" for g, v in zip(ano, vals))
    return {"valor": media, "obs": f"média do que o clube gastou em reforços por janela em {ult['id'][:4]}: {mi(media)} ({partes}; ge)", "link": ult["link"]}


def manchetes(cid):
    nome = (P.HEADLINE_NAMES.get(cid) or [cid])[0]
    vistos, out = set(), []
    for q in (f'"{nome}" folha salarial', f'"{nome}" orçamento reforços', f'"{nome}" salários por mês'):
        try:
            for it in P.news_query(q + " (site:ge.globo.com OR site:espn.com.br) when:120d"):
                if it["link"] in vistos or not fonte_ok(it.get("source")) or not cita_clube(cid, it["title"]):
                    continue
                vistos.add(it["link"])
                out.append(it)
        except Exception as ex:
            P.log("finanças: notícias", cid, ex)
    return sorted(out, key=lambda x: -x["ts"])


def atualizar(clubes=None, forcar=False, hoje=None):
    """Câmbio a cada 6 h. Folha e orçamento: só uma consulta por janela, nos dias antes de ela abrir (forcar=True
    consulta agora). Devolve o cache."""
    c = _ler()
    if not forcar and time.time() - c.get("t", 0) < 6 * 3600 and c.get("clubes"):
        return c
    try:
        cb = cambio_ptax()
        if cb:
            c["cambio"] = cb
    except Exception as ex:
        P.log("finanças: câmbio", ex)
    c["t"] = time.time()
    consultadas = c.setdefault("consultadas", [])
    j = janela_para_consultar(hoje, consultadas)
    if not j and not forcar:
        _gravar(c)
        return c
    base_ts = time.mktime(time.strptime(FOLHA_BASE_DATA, "%Y-%m-%d"))
    cl = c.get("clubes", {})
    for cid in clubes or list(P.CLUBS):
        reg = cl.get(cid, {})
        noticias = manchetes(cid)
        achados = {}
        for it in noticias:
            tipo = classifica(it["title"])
            v = valor_reais(it["title"])
            if tipo and v and tipo not in achados and it["ts"] > base_ts and numero_do_clube(cid, it["title"]):
                # folha plausível de clube da Série A: entre R$ 1 mi e R$ 120 mi por mês
                if tipo == "folha" and not 1e6 <= v <= 120e6:
                    continue
                if tipo == "orcamento" and not 1e6 <= v <= 1.5e9:
                    continue
                achados[tipo] = {"valor": v, "fonte": it["source"], "link": it["link"], "data": time.strftime("%Y-%m-%d", time.localtime(it["ts"])), "titulo": it["title"]}
        reg["noticias"] = [{"titulo": x["title"], "fonte": x["source"], "link": x["link"], "data": time.strftime("%Y-%m-%d", time.localtime(x["ts"]))} for x in noticias[:6]]
        for tipo, a in achados.items():
            if not reg.get(tipo) or a["data"] >= reg[tipo].get("data", ""):
                reg[tipo] = a
        cl[cid] = reg
    c["clubes"] = cl
    if j:
        consultadas.append(j["id"])
        P.log(f"finanças: folha e orçamento conferidos no ge e na ESPN antes da {j['rotulo']}")
    _gravar(c)
    return c


def do_clube(cid, folha_estimada_brl=None):
    """O que a janela usa: folha mensal (R$), orçamento para reforços (R$), câmbio, origem de cada número."""
    c = _ler()
    reg = (c.get("clubes") or {}).get(cid, {})
    cambio = c.get("cambio") or {"valor": EUR_BRL_PADRAO, "data": None, "fonte": "câmbio de referência do PLACAR"}
    valida = lambda x: x and fonte_ok(x.get("fonte")) and (x.get("data") or "") >= FOLHA_BASE_DATA
    if valida(reg.get("folha")):
        folha = {**reg["folha"], "tipo": "noticia"}
    elif cid in FOLHA_BASE:
        folha = {"valor": FOLHA_BASE[cid], "fonte": "ge (ranking das folhas da Série A)", "link": GE_RANKING, "data": FOLHA_BASE_DATA, "tipo": "levantamento"}
    else:
        folha = {"valor": folha_estimada_brl or 0, "fonte": "estimativa do PLACAR", "link": None, "data": None, "tipo": "estimativa"}
    if valida(reg.get("orcamento")):
        orc = {**reg["orcamento"], "tipo": "noticia"}
    elif cid in GASTOS[-1]["valores"]:
        g = gasto_janelas(cid)
        orc = {"valor": round(g["valor"] / 1e5) * 1e5, "fonte": "ge (balanços das janelas de 2026)", "obs": g["obs"], "link": g["link"], "data": None, "tipo": "ultima-janela"}
    else:
        orc = {"valor": round(folha["valor"] * 2 / 1e5) * 1e5, "fonte": "estimativa do CazéStats.TV: duas folhas mensais", "link": None, "data": None, "tipo": "estimativa"}
    j = janela_atual_ou_proxima()
    return {"v": VERSAO, "folha": folha, "orcamento": orc, "cambio": cambio, "noticias": [x for x in reg.get("noticias", []) if fonte_ok(x.get("fonte"))],
            "janela": {k: j[k] for k in ("rotulo", "abre", "fecha", "fonte", "link")} if j else None,
            "atualizado": time.strftime("%d/%m/%Y às %H:%M", time.localtime(c.get("t") or time.time()))}
