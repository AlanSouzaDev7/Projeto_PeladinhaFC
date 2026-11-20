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
# ---------- pesquisa individual (Wikipédia / ESPN), sem rede ----------
import carreiras_wiki as W  # noqa: E402

caso("anos: intervalo, aberto e ano único", (W._anos("2006–2007"), W._anos("2026–"), W._anos("2013")) == ((2006, 2007), (2026, None), (2013, 2013)))
caso("clube atual bate pelo nome oficial", W.clube_bate("[[Clube Atlético Mineiro|Atlético]]", "Clube Atlético Mineiro") and W.clube_bate("CR Flamengo", "Clube de Regatas do Flamengo"))
caso("Atlético-MG não se confunde com Athletico-PR", not W.clube_bate("Club Athletico Paranaense", "Clube Atlético Mineiro"))
caso("nome antigo do Athletico também vale", W.clube_bate("Atlético Paranaense", "Club Athletico Paranaense"))
caso("link do clube: título e nome exibido", W._link("→ [[Esporte Clube Vitória|Vitória]] ([[Empréstimo (esportes)|emp.]])") == ("Esporte Clube Vitória", "Vitória"))
W._expande = lambda lang, textos: textos  # sem rede: os textos já vêm "expandidos"
pt = {"ano": "2006–2007<br>2007<br>2009–2012", "clubes": "[[Sport Club Corinthians Paulista|Corinthians]]<br>→ [[Esporte Clube Vitória|Vitória]] (emp.)<br>[[Seleção Brasileira de Futebol|Brasil]]"}
lista = W.clubes_da_caixa("pt", pt)
caso("caixa em português: clubes, anos e empréstimo; seleção fora", [(x[0], x[1], x[3], x[4]) for x in lista] == [(2006, 2007, "Corinthians", False), (2007, 2007, "Vitória", True)])
en = {"years1": "2016–2019", "clubs1": "[[Fluminense FC|Fluminense]]", "years2": "2019–2020", "clubs2": "→ [[ACF Fiorentina|Fiorentina]] (loan)"}
caso("caixa em inglês: years1/clubs1", [(x[3], x[4]) for x in W.clubes_da_caixa("en", en)] == [("Fluminense", False), ("Fiorentina", True)])
j = C.junta([{"q": "cor", "i": 2014, "f": 2014}, {"q": "cor", "i": 2015, "f": 2026}, {"q": "cru", "i": 2025, "f": None}])
caso("passagens seguidas pelo mesmo clube viram uma só", [(x["q"], x["i"], x["f"]) for x in j] == [("cor", 2014, 2026), ("cru", 2025, None)])
f = lambda c, i, fim, s=None, e=0: {"c": c, "q": s or c, "i": i, "f": fim, "l": None, "s": s, "e": e}  # noqa: E731
caso("um clube só, com ano de início: vira linha de um trecho (não é base)", C.fecha([f("SPFC", 2022, None, "sao-paulo")], "sao-paulo", "São Paulo") == [f("SPFC", 2022, None, "sao-paulo")])
caso("só o clube atual sem data: jogador da base, sem linha", C.fecha([f("SPFC", None, None, "sao-paulo")], "sao-paulo", "São Paulo") == [])
volta = C.fecha([f("Chape", 2021, None, "chapecoense"), f("Portimonense", 2022, 2022, None, 1)], "chapecoense", "Chapecoense")
caso("voltou de empréstimo: o clube atual fecha a linha de novo", [x["c"] for x in volta] == ["Chape", "Portimonense", "Chapecoense"])
caso("emprestado que voltou: o vínculo em aberto conta como clube atual", W.clube_bate("Portimonense S.C. Associação Chapecoense de Futebol", "Associação Chapecoense de Futebol"))
jog = {"1": {"cid": "sao-paulo", "t": 5, "fonte": None, "lista": []}, "2": {"cid": "cruzeiro", "t": 5, "fonte": "espn", "lista": [{"c": "X"}, {"c": "Y"}]}}
n = C.mescla_publicados(jog, {"sao-paulo": {"1": [{"c": "São Paulo", "i": 2022}], "3": [{"c": "A"}, {"c": "B"}]}, "cruzeiro": {"2": [{"c": "velho"}]}}, 99)
caso("carreira publicada volta para o cache vazio; a do cache, quando existe, é mantida", n == 2 and jog["1"]["lista"][0]["c"] == "São Paulo" and jog["3"]["cid"] == "sao-paulo" and jog["2"]["lista"][0]["c"] == "X")
print(f"\n{ok} casos das carreiras passaram")
