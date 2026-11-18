# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""Carreiras sem rede: quem é quem (nome + idade), ordem dos clubes e o que fica fora da linha do tempo.
Uso: python -X utf8 tests/carreiras_casos.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
import carreiras as C  # noqa: E402

ok = 0


def caso(nome, cond):
    global ok
    assert cond, nome
    ok += 1
    print("✓", nome)


cand = [{"q": "Q1", "nomes": ["fabio"], "ano": 1980}, {"q": "Q2", "nomes": ["fabio"], "ano": 1995}, {"q": "Q3", "nomes": ["fabio"], "ano": None},
        {"q": "Q4", "nomes": ["germán ezequiel cano", "german ezequiel cano"], "ano": 1988}]
elenco = [[1, "Fábio", "G", 46, "100"], [14, "Germán Cano", "F", 38, "200"], [9, "Fábio", "M", 22, "300"]]
achados = C.casar(cand, elenco, ano_atual=2026)
caso("nome repetido: vale quem tem a idade certa", achados.get("100") == "Q1")
caso("nome da ESPN dentro do nome completo, com a mesma idade", achados.get("200") == "Q4")
caso("sem ninguém com a idade certa e nome ambíguo: fica sem carreira", "300" not in achados)

x = lambda q, i, f, c="X": {"c": c, "q": q, "i": i, "f": f, "l": None, "s": None}  # noqa: E731
lista = C.ordena([x("Q9", 2015, 2018), x("Q8", 2010, None), x("Q7", None, None), x("Q9", 2018, 2020), x("Q6", 2021, None)])
caso("em ordem de entrada e sem vínculos sem data", [y["q"] for y in lista] == ["Q8", "Q9", "Q6"])
caso("vínculo sem saída termina quando começa o seguinte", lista[0]["f"] == 2015)
caso("idas e voltas seguidas ao mesmo clube viram um trecho só", (lista[1]["i"], lista[1]["f"]) == (2015, 2020))
caso("o último vínculo sem saída continua aberto (clube atual)", lista[2]["f"] is None)
caso("seleções e base ficam fora", all(C.FORA.search(n) for n in ["Seleção Brasileira de Futebol", "Brazil national under-20 football team", "Fluminense Sub-20", "FC Porto B"]))
caso("clubes normais entram", not any(C.FORA.search(n) for n in ["Fluminense Football Club", "Club Atlético Boca Juniors", "Paris Saint-Germain"]))
caso("nome genérico sai da busca da ESPN", C.GENERICO.sub(" ", "Chelsea Football Club").strip() == "Chelsea")
print(f"\n{ok} casos das carreiras passaram")
