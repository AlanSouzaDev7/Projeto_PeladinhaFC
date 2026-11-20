# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""Candidatos à seleção da rodada (server/selecao.py) sem rede. Uso: python -X utf8 tests/selecao_casos.py"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
import selecao as SEL  # noqa: E402

CAMPOS = ["eid", "comp", "min", "g", "a", "nota", "vivo"]


def linha(eid, nota, minutos=90, comp="Brasileirão", g=0, vivo=0):
    return [eid, comp, minutos, g, 0, nota, vivo]


with tempfile.TemporaryDirectory() as raiz:
    pasta = Path(raiz) / "dados" / "jogadores"
    pasta.mkdir(parents=True)
    jog = {f"d{i}": {"n": f"Zagueiro {i}", "pos": "D", "jogos": [linha("10", 6 + i / 10)]} for i in range(6)}
    jog["g1"] = {"n": "Goleiro", "pos": "G", "jogos": [linha("10", 7.0), linha("11", 9.0, comp="Copa do Brasil")]}
    jog["m1"] = {"n": "Meia que entrou no fim", "pos": "M", "jogos": [linha("10", 9.5, minutos=12)]}
    jog["f1"] = {"n": "Atacante ao vivo", "pos": "F", "jogos": [linha("10", 8.0, vivo=1)]}
    jog["f2"] = {"n": "Atacante", "pos": "F", "jogos": [linha("10", 7.1, g=1)]}
    (pasta / "cruzeiro.json").write_text(json.dumps({"campos": CAMPOS, "jogadores": jog}), encoding="utf-8")
    (pasta / "sem-notas.json").write_text(json.dumps({"campos": ["eid"], "jogadores": {}}), encoding="utf-8")

    c = SEL.candidatos(raiz)
    assert list(c) == ["10"], c.keys()  # o jogo da Copa do Brasil fica de fora
    ids = [r[0] for r in c["10"]]
    assert [i for i in ids if i.startswith("d")] == ["d5", "d4", "d3", "d2"], ids  # só os 4 melhores defensores
    assert "m1" not in ids, "menos de 30 minutos"
    assert "f1" not in ids, "nota ao vivo ainda muda"
    assert "g1" in ids and "f2" in ids
    s = SEL.resumo(raiz)
    assert json.loads((Path(raiz) / "dados" / "notas-jogos.json").read_text(encoding="utf-8"))["jogos"] == s["jogos"]

print("4 casos da seleção da rodada passaram")
