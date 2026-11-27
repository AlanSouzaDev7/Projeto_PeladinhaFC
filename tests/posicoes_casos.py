# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""Posição de cada jogador na janela (server/mercado.py: funcao_de), cruzando escalações, Transfermarkt e correções.
Sem rede. Uso: python -X utf8 tests/posicoes_casos.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
import mercado as M  # noqa: E402

casos = 0


def caso(nome):
    global casos
    casos += 1
    print("ok ", nome)


# Luciano Rodríguez (Cruzeiro): 1 jogo de meia (62 min), 2 de centroavante (39 min, o último em 22/11); Transfermarkt: CA
luciano = {"pos": "A", "tm": {"s": "CA"}}
hp = {"s": {"MEI": [1, 62, 0, 0, 1], "CA": [2, 39, 0, 1, 0], "PD": [1, 11, 0, 1, 0], "VOL": [1, 5, 0, 0, 0]}, "f": "MEI", "u": "CA", "ud": "2026-11-22"}
f, fonte, tambem = M.funcao_de(luciano, hp, {})
assert f == "CA" and "Transfermarkt" in fonte and tambem[0] == "MEI", (f, fonte, tambem)
caso("Luciano Rodríguez: centroavante (Transfermarkt e onde jogou pelo clube), também meia")

# Eduardo Pape (Cruzeiro, 17 anos): sem jogos pelo profissional nem Transfermarkt ligado; correção com fonte
f, fonte, _ = M.funcao_de({"pos": "M"}, {}, {}, {"pos": "VOL", "fonte": "Cruzeiro (convocação Sub-17)"})
assert f == "VOL" and "Cruzeiro" in fonte
caso("Eduardo Pape: volante pela correção com fonte")

# um jogo improvisado não muda a posição: Calleri centroavante, último jogo como meia pela direita
calleri = {"pos": "A", "tm": {"s": "CA"}}
hp = {"s": {"CA": [30, 2400, 10, 3, 28], "MD": [1, 70, 0, 0, 1]}, "f": "CA", "u": "MD", "ud": "2026-11-05"}
assert M.funcao_de(calleri, hp, {})[0] == "CA"
caso("Calleri: um jogo como meia pela direita não tira a posição de centroavante")

# nenhuma posição domina: vale a última (se também foi frequente)
hp = {"s": {"MC": [6, 290, 0, 0, 3], "VOL": [5, 280, 0, 0, 4], "MEI": [3, 280, 0, 0, 2]}, "f": "MC", "u": "VOL", "ud": "2026-11-20"}
assert M.funcao_de({"pos": "M"}, hp, {})[0] == "VOL"
caso("sem posição dominante: a última em que jogou")

# homônimo ligado errado no Transfermarkt (goleiro para um atacante): ignorado
assert M.funcao_de({"pos": "A", "tm": {"s": "GOL"}}, {}, {"pos": "CA"})[0] == "CA"
assert M._setor_ok("PE", "M") and not M._setor_ok("GOL", "A") and not M._setor_ok("ZAG", "A")
caso("Transfermarkt de outro setor (homônimo) não vale")

# sem jogos: o Transfermarkt; sem nada: o cadastro
assert M.funcao_de({"pos": "D", "tm": {"s": "LE"}}, {}, {})[0] == "LE"
assert M.funcao_de({"pos": "G"}, {}, {}) == ("GOL", "cadastro da ESPN", [])
caso("sem jogos pelo clube: Transfermarkt, depois o cadastro")

print(f"{casos} casos das posições passaram")
