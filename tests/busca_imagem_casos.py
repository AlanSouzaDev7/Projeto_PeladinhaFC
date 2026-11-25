# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""Busca de imagem pelo Brave Search (server/busca_imagem.py) sem rede: conferência do título, cota do dia e cache.
Uso: python -X utf8 tests/busca_imagem_casos.py"""
import os
import sys
import tempfile
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
import busca_imagem as BI  # noqa: E402

casos = 0


def caso(nome):
    global casos
    casos += 1
    print("ok ", nome)


# --- conferência do título ----------------------------------------------------------------------------------------------
assert BI.titulo_bate("Lucas Villalba, zagueiro do Cruzeiro", "Lucas Villalba", "Cruzeiro")
assert BI.titulo_bate("Villalba comemora gol do Cruzeiro no Mineirão", "Lucas Villalba", "Cruzeiro"), "sobrenome + clube"
assert not BI.titulo_bate("Villalba no Botafogo", "Lucas Villalba", "Cruzeiro"), "sobrenome com outro clube"
assert not BI.titulo_bate("Cruzeiro anuncia reforço", "Lucas Villalba", "Cruzeiro")
assert BI.titulo_bate("Kaio Jorge marca dois", "Kaio Jorge")
assert BI.titulo_bate("Allan renova com o Flamengo", "Allan", "Flamengo"), "nome de uma palavra no título"
assert not BI.titulo_bate("Flamengo vence o clássico", "Allan", "Flamengo")
resultados = [
    {"title": "Escudo do Cruzeiro", "properties": {"url": "https://exemplo.com/escudo.png"}},
    {"title": "Lucas Villalba treina na Toca", "properties": {"url": "http://inseguro.com/foto.jpg"}},
    {"title": "Lucas Villalba treina na Toca", "properties": {"url": "https://exemplo.com/villalba.jpg"}},
]
assert BI.escolhe(resultados, "Lucas Villalba", "Cruzeiro") == "https://exemplo.com/villalba.jpg", "só https e com o nome no título"
assert BI.escolhe([], "Lucas Villalba") is None
caso("conferência: o título precisa trazer o jogador")

# --- cota do dia, cache e chave -----------------------------------------------------------------------------------------
with tempfile.TemporaryDirectory() as raiz:
    BI.P = types.SimpleNamespace(ROOT=raiz, log=lambda *a: None)
    os.environ.pop("BRAVE_SEARCH_KEY", None)
    assert BI.busca("Lucas Villalba", "Cruzeiro") is None, "sem a chave, nada é buscado"
    os.environ["BRAVE_POR_DIA"] = "2"
    pedidos = []

    def pedir(q):
        pedidos.append(q)
        return {"results": [{"title": q.replace(" futebol", ""), "properties": {"url": f"https://img.exemplo/{len(pedidos)}.jpg"}}]}
    BI._ultimo[0] = 0
    assert BI.busca("Lucas Villalba", "Cruzeiro", pedir=pedir) == "https://img.exemplo/1.jpg"
    assert BI.busca("Lucas Villalba", "Cruzeiro", pedir=pedir) == "https://img.exemplo/1.jpg" and len(pedidos) == 1, "cache: não busca de novo"
    assert BI.busca("Kaio Jorge", "Cruzeiro", pedir=pedir) == "https://img.exemplo/2.jpg"
    assert BI.restante() == 0
    assert BI.busca("Matheus Pereira", "Cruzeiro", pedir=pedir) is None and len(pedidos) == 2, "cota do dia esgotada"
    r = BI.resumo()
    assert r["hoje"] == 2 and r["buscados"] == 2 and r["achados"] == 2
    os.environ.pop("BRAVE_POR_DIA", None)
caso("cota do dia, cache de 60 dias e chave obrigatória")

print(f"{casos} casos da busca de imagem passaram")
