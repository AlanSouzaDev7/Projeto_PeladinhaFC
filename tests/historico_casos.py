# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""Histórico de jogos sem rede: a conversão de um jogo em linha da tabela e a lista de campeonatos da carga.
Uso: python -X utf8 tests/historico_casos.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
import historico_jogos as H  # noqa: E402
import temporadas_anteriores as T  # noqa: E402

ok = 0


def caso(nome, cond):
    global ok
    assert cond, nome
    ok += 1
    print("✓", nome)


j = {"id": "401500123", "lg": "bra.1", "data": "2024-06-02", "hora": "16:00", "estado": "post", "faseNome": None, "local": "Mineirão",
     "casa": {"id": "2022", "clube": "cruzeiro", "nome": "Cruzeiro", "gols": 2, "pen": None},
     "fora": {"id": "9999", "clube": None, "nome": "Sport", "gols": 1, "pen": None}}
x = H.linha(j, "Brasileirão", 2024)
caso("clube do site fica com o id do site; os outros, espn:<id>", (x["casa_id"], x["fora_id"]) == ("cruzeiro", "espn:9999"))
caso("placar, temporada e competição", (x["gols_casa"], x["gols_fora"], x["temporada"], x["competicao"]) == (2, 1, "2024", "Brasileirão"))
caso("jogo sem id numérico fica de fora", H.linha({**j, "id": "af123"}, "X") is None)
caso("jogo sem nome de time fica de fora", H.linha({**j, "fora": {"id": "1"}}, "X") is None)
caso("placar que não é número inteiro vira vazio", H.linha({**j, "casa": {**j["casa"], "gols": "2"}}, "X")["gols_casa"] is None)
ligas = [lg for lg, _, _ in T.LIGAS]
caso("a carga cobre a Série A e as competições da ESPN", "bra.1" in ligas and "bra.2" in ligas and "conmebol.libertadores" in ligas)
caso("Séries C e D (Wikipédia) ficam fora da carga da ESPN", "bra.3" not in ligas and "bra.4" not in ligas)
print(f"\n{ok} casos do histórico passaram")
