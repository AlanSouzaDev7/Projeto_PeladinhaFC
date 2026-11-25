# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""CazéStats.TV — busca de imagem pela API oficial do Brave Search, para jogador sem foto em nenhuma outra fonte.

Por que o Brave: a API de busca do Google (Custom Search JSON API) não aceita contas novas desde 20/01/2026 e acaba em
01/01/2027; raspar a página de busca do Google seria furar bloqueio de robô. O Brave tem índice próprio e uma API
oficial de imagens (api.search.brave.com/res/v1/images/search), com US$ 5 de crédito por mês (~1.000 buscas).

Liga com o segredo BRAVE_SEARCH_KEY no GitHub; sem ele, nada é buscado. Cota: BRAVE_POR_DIA buscas por dia (30 por
padrão, ~900 por mês, dentro do crédito grátis), divididas entre todas as rodadas do dia; a Série A vem primeiro (o
monitor de fotos roda antes do mercado global). Cada nome é buscado uma vez a cada 60 dias.

Conferência: só vale um resultado cujo título tenha todas as palavras do nome do jogador (ou o sobrenome e o clube).
Não há como conferir o rosto: é a fonte de último recurso, e a cópia guardada sai com o comando de retirada
(MODO_VENDA=1), como todas as fotos sem licença.
"""
import json
import os
import re
import time
import unicodedata
import urllib.parse

P = None  # módulo placar_api
CACHE = "mercado-brave.json"  # entra no cache principal do robô (server/cache/mercado-*.json)
API = "https://api.search.brave.com/res/v1/images/search"
VALIDADE_DIAS = 60
_ultimo = [0.0]


def chave():
    return os.environ.get("BRAVE_SEARCH_KEY", "").strip()


def ligada():
    return bool(chave())


def por_dia():
    try:
        return max(0, int(os.environ.get("BRAVE_POR_DIA", "30")))
    except ValueError:
        return 30


def _norm(x):
    x = unicodedata.normalize("NFD", str(x or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]", " ", x).split()


def titulo_bate(titulo, nome, clube=""):
    """O resultado fala do jogador? Todas as palavras do nome no título; ou o sobrenome e uma palavra do clube."""
    t, n, c = set(_norm(titulo)), _norm(nome), [w for w in _norm(clube) if len(w) > 3]
    if not n:
        return False
    if set(n) <= t:
        return True
    return len(n) > 1 and n[-1] in t and any(w in t for w in c)


def escolhe(resultados, nome, clube=""):
    """A primeira imagem (endereço original, https) cujo título bate com o jogador."""
    for r in resultados or []:
        u = ((r.get("properties") or {}).get("url") or "").strip()
        if u.startswith("https://") and titulo_bate(r.get("title") or "", nome, clube):
            return u
    return None


def _arq():
    return os.path.join(P.ROOT, "server", "cache", CACHE)


def _ler():
    try:
        return json.load(open(_arq(), encoding="utf-8"))
    except Exception:
        return {}


def _gravar(c):
    os.makedirs(os.path.dirname(_arq()), exist_ok=True)
    json.dump(c, open(_arq() + ".tmp", "w", encoding="utf-8"), ensure_ascii=False)
    os.replace(_arq() + ".tmp", _arq())


def restante(c=None):
    c = c if c is not None else _ler()
    hoje = time.strftime("%Y-%m-%d")
    return por_dia() - (c.get("n", 0) if c.get("dia") == hoje else 0)


def busca(nome, clube="", agora=None, pedir=None):
    """Endereço da imagem do jogador, ou None (sem chave, sem cota, nada que bata). pedir: função de teste no lugar da rede."""
    if not ligada() and pedir is None:
        return None
    agora = agora or time.time()
    c = _ler()
    k = f"{' '.join(_norm(nome))}|{' '.join(_norm(clube))}"
    r = (c.get("r") or {}).get(k)
    if r and agora - r.get("t", 0) < VALIDADE_DIAS * 86400:
        return r.get("u")
    hoje = time.strftime("%Y-%m-%d")
    if c.get("dia") != hoje:
        c["dia"], c["n"] = hoje, 0
    if c["n"] >= por_dia():
        return None
    c["n"] += 1
    q = f"{nome} {clube} futebol".strip()
    u = None
    try:
        espera = 1.1 - (time.time() - _ultimo[0])  # a API aceita cerca de 1 pedido por segundo
        if espera > 0:
            time.sleep(espera)
        _ultimo[0] = time.time()
        if pedir:
            d = pedir(q)
        else:
            url = API + "?" + urllib.parse.urlencode({"q": q, "count": 8, "safesearch": "strict", "search_lang": "pt", "country": "BR"})
            d = json.loads(P.get(url, timeout=20, headers={"Accept": "application/json", "X-Subscription-Token": chave()}))
        u = escolhe(d.get("results"), nome, clube)
    except Exception as ex:
        if P:
            P.log("fotos: busca de imagem do Brave", ex)
        _gravar(c)
        return None
    c.setdefault("r", {})[k] = {"t": agora, "u": u}
    _gravar(c)
    return u


def resumo():
    c = _ler()
    rs = (c.get("r") or {}).values()
    return {"ligada": ligada(), "porDia": por_dia(), "hoje": c.get("n", 0) if c.get("dia") == time.strftime("%Y-%m-%d") else 0,
            "buscados": len(c.get("r") or {}), "achados": sum(1 for r in rs if r.get("u"))}
