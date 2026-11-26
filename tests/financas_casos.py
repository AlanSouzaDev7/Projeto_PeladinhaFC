# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""Balancete da janela (server/financas.py): folha e caixa só pelo ge e pela ESPN, folha conferida só antes de cada
janela abrir, caixa pela média das janelas do ano. Sem rede. Uso: python -X utf8 tests/financas_casos.py"""
import json
import os
import re
import sys
import tempfile
import types
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
import financas as F  # noqa: E402

casos = 0


def caso(nome):
    global casos
    casos += 1
    print("ok ", nome)


raiz = tempfile.mkdtemp()
os.makedirs(os.path.join(raiz, "server", "cache"))
norm = lambda x: re.sub(r"[^a-z0-9 ]", " ", unicodedata.normalize("NFD", str(x)).encode("ascii", "ignore").decode().lower()).strip()
F.P = types.SimpleNamespace(ROOT=raiz, norm_txt=norm, silencioso=lambda *a: None, log=lambda *a: None, HEADLINE_NAMES={"cruzeiro": ["Cruzeiro"]}, CLUBS={"cruzeiro": {}})

# 1. a manchete que gerou o erro: a redução da folha não é a folha
assert F.classifica("Nicola: Cruzeiro quer reduzir folha salarial em R$ 5 milhões sem perder titulares") is None
assert F.classifica("Cruzeiro economiza R$ 1 milhão por mês na folha com saída de reservas") is None
assert F.classifica("Folha do Cruzeiro terá aumento de R$ 2 milhões por mês") is None
assert F.classifica("Cruzeiro tem folha salarial de R$ 32 milhões por mês") == "folha"
caso("variação da folha (reduzir, economizar, aumentar) não vira a folha")

# 2. só ge e ESPN
assert F.fonte_ok("ge") and F.fonte_ok("ESPN Brasil") and F.fonte_ok("ge.globo.com") and F.fonte_ok("www.espn.com.br")
assert not F.fonte_ok("Rede 98") and not F.fonte_ok("www.jornalcruzeiro.com.br") and not F.fonte_ok("Itatiaia")
caso("manchetes só do ge e da ESPN")

# 3. folha conferida só antes de a janela abrir (CBF: 1ª janela de 2027 abre em 04/01)
assert F.janela_para_consultar("2026-11-26") is None, "fora do período: não relê a folha"
assert F.janela_para_consultar("2026-12-28")["id"] == "2027-1", "10 dias antes de abrir: confere"
assert F.janela_para_consultar("2027-01-04")["id"] == "2027-1", "no dia em que abre: confere"
assert F.janela_para_consultar("2027-01-20") is None, "janela já aberta há dias: não relê"
assert F.janela_para_consultar("2026-12-30", consultadas=["2027-1"]) is None, "uma consulta por janela"
assert F.janela_para_consultar("2027-07-12")["id"] == "2027-2"
assert F.janela_atual_ou_proxima("2026-11-26")["abre"] == "2027-01-04"
caso("folha conferida uma vez, nos dias antes de cada janela abrir")

# 4. o cache com a manchete errada (Rede 98, R$ 5 mi) é ignorado; vale o ranking do ge
json.dump({"t": 0, "clubes": {"cruzeiro": {"folha": {"valor": 5e6, "fonte": "Rede 98", "data": "2026-11-26", "link": "x"}}}},
          open(os.path.join(raiz, "server", "cache", F.CACHE), "w", encoding="utf-8"))
d = F.do_clube("cruzeiro")
assert d["folha"]["valor"] == 30e6 and d["folha"]["fonte"].startswith("ge"), d["folha"]
assert d["janela"]["abre"] == "2027-01-04" or d["janela"]["abre"] > "2027-01-04"
caso("folha do Cruzeiro: R$ 30 mi do ranking do ge, não os R$ 5 mi da Rede 98")

# 5. caixa pela média das janelas de 2026 (balanços do ge)
g = F.gasto_janelas("cruzeiro")
assert abs(g["valor"] - (174.141e6 + 110.296e6) / 2) < 1 and "R$ 142,2 mi" in g["obs"] and "1ª janela de 2026: R$ 174,1 mi" in g["obs"] and "2ª janela de 2026: R$ 110,3 mi" in g["obs"], g
assert d["orcamento"]["tipo"] == "ultima-janela" and d["orcamento"]["valor"] == 142.2e6 and d["orcamento"]["obs"] == g["obs"]
i = F.gasto_janelas("internacional")
assert abs(i["valor"] - (37.835e6 + 1.808e6) / 2) < 1, "Internacional: média das duas janelas, não só a do meio do ano"
c = F.gasto_janelas("corinthians")
assert abs(c["valor"] - 4.898e6 / 2) < 1
caso("caixa: média do que o clube gastou por janela em 2026 (Cruzeiro R$ 142,2 mi; Internacional R$ 19,8 mi)")

# 6. os 20 clubes têm folha e gasto, e nenhuma folha incoerente (entre R$ 3 mi e R$ 40 mi por mês)
assert len(F.FOLHA_BASE) == 20 and all(3e6 <= v <= 40e6 for v in F.FOLHA_BASE.values())
assert all(set(x["valores"]) == set(F.FOLHA_BASE) for x in F.GASTOS)
caso("20 clubes com folha do ge e gasto das duas janelas de 2026")

print(f"{casos} casos do balancete passaram")
