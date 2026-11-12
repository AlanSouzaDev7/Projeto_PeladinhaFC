# © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE).
"""PLACAR — situação financeira de cada clube da Série A para a janela de transferências.

O que existe de público e confiável (e o que NÃO existe):
- folha salarial mensal: não há fonte oficial em tempo real. A base é o levantamento do ge publicado em 14/10/2026
  (valores aproximados que os próprios clubes e a imprensa divulgaram), com o link da matéria. O robô procura todo
  dia, nas manchetes do Google Notícias (só título, fonte, data e link), números mais novos do tipo
  "folha de R$ 32 milhões por mês" ao lado do nome do clube; achando, o número mais recente substitui a base.
- caixa para contratações: nenhum clube publica "caixa disponível" atualizado. Quando uma manchete traz o orçamento
  de reforços ("orçamento de R$ 80 milhões para reforços"), ele é usado; sem isso, o PLACAR estima duas folhas
  mensais (o que os clubes brasileiros costumam reservar para a janela) e mostra que é estimativa.
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
# folha mensal em R$ (levantamento do ge, 14/10/2026; valores aproximados)
FOLHA_BASE = {
    "flamengo": 50e6, "palmeiras": 30e6, "corinthians": 30e6, "cruzeiro": 30e6, "atletico-mg": 27e6, "santos": 25e6,
    "bahia": 22e6, "internacional": 20.5e6, "fluminense": 20e6, "gremio": 20e6, "sao-paulo": 18e6, "vasco": 16e6,
    "botafogo": 15e6, "athletico-pr": 14e6, "bragantino": 10e6, "remo": 10e6, "vitoria": 9e6, "coritiba": 8e6,
    "mirassol": 6e6, "chapecoense": 3.8e6,
}
EUR_BRL_PADRAO = 6.0
CACHE = "financas.json"

_NUM = re.compile(r"R\$\s?(\d{1,3}(?:[.,]\d{1,3})?)\s?(bilh[õo]es|bilh[ãa]o|bi|milh[õo]es|milh[ãa]o|mi)\b", re.I)


def _ler():
    try:
        return json.load(open(os.path.join(P.ROOT, "server", "cache", CACHE), encoding="utf-8"))
    except Exception:
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


def manchetes(cid):
    nome = (P.HEADLINE_NAMES.get(cid) or [cid])[0]
    vistos, out = set(), []
    for q in (f'"{nome}" folha salarial', f'"{nome}" orçamento reforços', f'"{nome}" salários por mês'):
        try:
            for it in P.news_query(q + " when:120d"):
                if it["link"] in vistos or not cita_clube(cid, it["title"]):
                    continue
                vistos.add(it["link"])
                out.append(it)
        except Exception as ex:
            P.log("finanças: notícias", cid, ex)
    return sorted(out, key=lambda x: -x["ts"])


def atualizar(clubes=None, forcar=False):
    """Atualiza o cache de finanças (a cada 6 h). Devolve {clube: {...}}."""
    c = _ler()
    if not forcar and time.time() - c.get("t", 0) < 6 * 3600 and c.get("clubes"):
        return c
    try:
        cb = cambio_ptax()
        if cb:
            c["cambio"] = cb
    except Exception as ex:
        P.log("finanças: câmbio", ex)
    base_ts = time.mktime(time.strptime("2026-10-14", "%Y-%m-%d"))
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
    c["clubes"], c["t"] = cl, time.time()
    _gravar(c)
    return c


def do_clube(cid, folha_estimada_brl=None):
    """O que a janela usa: folha mensal (R$), orçamento para reforços (R$), câmbio, origem de cada número."""
    c = _ler()
    reg = (c.get("clubes") or {}).get(cid, {})
    cambio = c.get("cambio") or {"valor": EUR_BRL_PADRAO, "data": None, "fonte": "câmbio de referência do PLACAR"}
    if reg.get("folha"):
        folha = {**reg["folha"], "tipo": "noticia"}
    elif cid in FOLHA_BASE:
        folha = {"valor": FOLHA_BASE[cid], "fonte": "ge (levantamento das folhas da Série A)", "link": GE_RANKING, "data": "2026-10-14", "tipo": "levantamento"}
    else:
        folha = {"valor": folha_estimada_brl or 0, "fonte": "estimativa do PLACAR", "link": None, "data": None, "tipo": "estimativa"}
    if reg.get("orcamento"):
        orc = {**reg["orcamento"], "tipo": "noticia"}
    else:
        orc = {"valor": round(folha["valor"] * 2 / 1e5) * 1e5, "fonte": "estimativa do PLACAR: duas folhas mensais", "link": None, "data": None, "tipo": "estimativa"}
    return {"folha": folha, "orcamento": orc, "cambio": cambio, "noticias": reg.get("noticias", []), "atualizado": time.strftime("%d/%m/%Y às %H:%M", time.localtime(c.get("t") or time.time()))}
