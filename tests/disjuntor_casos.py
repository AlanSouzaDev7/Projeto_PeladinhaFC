# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""Disjuntor dos pedidos do robô (server/placar_api.py: get) sem rede: um site que passa a recusar (503) para de ser
consultado na rodada, em vez de estourar o tempo; 404 não conta; um sucesso zera. Uso: python -X utf8 tests/disjuntor_casos.py"""
import sys
import time
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
import placar_api as P  # noqa: E402

chamadas = []
respostas = {}


def falso(url, timeout=20, headers=None):
    chamadas.append(url)
    r = respostas.get(P._site(url))
    if isinstance(r, int):
        raise urllib.error.HTTPError(url, r, "erro", {}, None)
    return b"ok"


P._get = falso
respostas["news.google.com"] = 503
for i in range(P.DISJUNTOR_LIMITE):
    try:
        P.get(f"https://news.google.com/rss/search?q={i}")
    except urllib.error.HTTPError:
        pass
antes = len(chamadas)
t0 = time.time()
for i in range(200):
    try:
        P.get(f"https://news.google.com/rss/search?q=x{i}")
    except P.SiteRecusando:
        pass
assert len(chamadas) == antes, "com o disjuntor aberto o pedido nem sai"
assert time.time() - t0 < 1, "e falha na hora"
assert P.get("https://site.api.espn.com/apis/x") == b"ok", "outros sites seguem normais"
print("ok  503 seguidos abrem o disjuntor só daquele site")

respostas["a.espncdn.com"] = 404
for i in range(30):
    try:
        P.get(f"https://a.espncdn.com/i/{i}.png")
    except urllib.error.HTTPError:
        pass
assert P._disjuntor.get("a.espncdn.com", [0, 0])[1] == 0, "404 é resposta normal: não abre o disjuntor"
print("ok  404 não conta como recusa")

respostas["www.thesportsdb.com"] = 503
for i in range(P.DISJUNTOR_LIMITE - 1):
    try:
        P.get("https://www.thesportsdb.com/api")
    except urllib.error.HTTPError:
        pass
respostas["www.thesportsdb.com"] = None
P.get("https://www.thesportsdb.com/api")
assert P._disjuntor["www.thesportsdb.com"] == [0, 0], "um sucesso zera as recusas"
print("ok  um sucesso zera a contagem")
print("3 casos do disjuntor passaram")
