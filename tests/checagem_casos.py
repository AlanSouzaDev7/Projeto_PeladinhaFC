# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""Checagem dos dados e defesas x chutes bloqueados, sem rede.
Uso: python -X utf8 tests/checagem_casos.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
import placar_api as P  # noqa: E402
import jogadores as J  # noqa: E402
import checagem as K  # noqa: E402
import xg as XG  # noqa: E402

J.P = J.P or P
ok = 0


def caso(nome, cond):
    global ok
    assert cond, nome
    ok += 1
    print("✓", nome)


# um jogo com um zagueiro e um goleiro que tiveram "Save" nos lances
espn_cru = str(P.CLUBS["cruzeiro"]["espn"])
todas = {"9001": {"date": "2026-11-01", "comp": "Brasileirão", "home": espn_cru, "placar": {espn_cru: 1, "999": 0}, "nomes": {"999": "Rival"},
                  "teams": {espn_cru: [["10", "Zagueiro", 1, 90, 0, 0, 0, 0, 0, 0, 0], ["11", "Goleiro", 1, 90, 0, 0, 0, 0, 0, 0, 0]], "999": []}}}
lan = {"9001": {"v": 3, "p": {"10": {"g": {}, "c": {"defesas": 4, "cortes": 3, "xg": 0.31}}, "11": {"g": {}, "c": {"defesas": 5}}}}}
clubes = J.montar({"cruzeiro": [[3, "Zagueiro", "D", 28, "10"], [1, "Goleiro", "G", 30, "11"]]}, todas, lan, {})
jog = clubes["cruzeiro"]["jogadores"]
caso("zagueiro: o 'Save' vira chute bloqueado, não defesa de goleiro", jog["10"]["comps"]["Brasileirão"]["defesas"] == 0 and jog["10"]["comps"]["Brasileirão"]["bloq"] == 4)
caso("goleiro: o 'Save' continua sendo defesa", jog["11"]["comps"]["Brasileirão"]["defesas"] == 5 and jog["11"]["comps"]["Brasileirão"]["bloq"] == 0)
caso("os campos novos (bloq e xg) vão no fim da lista de cada jogo", clubes["cruzeiro"]["campos"][-2:] == ["bloq", "xg"] and jog["10"]["jogos"][0][-2:] == [4, 0.31])
caso("xG do jogador na temporada e do time por jogo (a favor e contra)", jog["10"]["comps"]["Brasileirão"]["xg"] == 0.31 and clubes["cruzeiro"]["xgTime"]["Brasileirão"] == {"jogos": 1, "xg": 0.31, "xgc": 0.0, "gols": 1, "gc": 0})
lan_antigo = {"9001": dict(lan["9001"], v=2)}
caso("jogo com lances antigos (sem xG) não entra no xG do time", "Brasileirão" not in J.montar({"cruzeiro": [[3, "Zagueiro", "D", 28, "10"]]}, todas, lan_antigo, {})["cruzeiro"]["xgTime"])
caso("xG por lance: chute com posição, cabeceio vale menos, pênalti 0,76, lance que não é chute fica de fora", XG.do_lance("Shot On Target", "x", 90, 50) > XG.do_lance("Shot On Target", "header", 90, 50) and XG.do_lance("Penalty - Scored", "", 0, 0) == 0.76 and XG.do_lance("Pass", "", 90, 50) is None and XG.do_lance("Goal", "", 0, 0) is None)
caso("a checagem não reclama mais do zagueiro", not [a for a in K.jogadores("cruzeiro", clubes["cruzeiro"]) if "defesas" in a["motivo"]])

# regras da checagem
d = {"campos": ["eid", "min", "nota"], "jogadores": {
    "1": {"n": "Atacante", "pos": "F", "comps": {"X": {"j": 2, "tit": 3, "min": 400, "g": 5, "ch": 2, "alvo": 3, "defesas": 1}}, "jogos": [["a", 90, 6.5], ["a", 150, 11]]},
    "2": {"n": "Normal", "pos": "M", "comps": {"X": {"j": 3, "tit": 2, "min": 250, "g": 1, "ch": 4, "alvo": 2, "defesas": 0}}, "jogos": [["b", 90, 7.0]]}}}
motivos = [a["motivo"] for a in K.jogadores("x", d)]
caso("aponta defesas de jogador de linha, gols demais, no alvo demais, titular demais e minutos demais",
     all(any(t in m for m in motivos) for t in ["defesas de goleiro", "gols e só", "no alvo", "como titular", "por jogo"]))
caso("aponta jogo repetido, jogo com mais de 130 minutos e nota fora de 3 a 10", all(any(t in m for m in motivos) for t in ["jogo repetido", "130 minutos", "nota fora"]))
caso("jogador com números coerentes não gera aviso", not [a for a in K.jogadores("x", d) if a["nome"] == "Normal"])
caso("tabela: pontos e jogos que não fecham", len(K.tabela({"standings": [["a", 10, 5, 3, 0, 2, 5, 3], ["b", 9, 5, 3, 0, 2, 5, 3]]})) == 1)
caso("carreira: saída antes da entrada e ano no futuro", len(K.carreiras("x", {"1": [{"c": "A", "i": 2020, "f": 2018}, {"c": "B", "i": 2031, "f": None}]}, 2026)) == 2)
print(f"\n{ok} casos da checagem passaram")
