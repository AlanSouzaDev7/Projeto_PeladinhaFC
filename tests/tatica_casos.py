# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""Perfil tático do mercado global (server/valores_tm.py: tatica e perfis; server/tm_fichas.py: resumir; server/tm_elencos.py:
limpa_anterior), sem rede e com dados sintéticos.
Uso: python -X utf8 tests/tatica_casos.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
import tm_elencos as T  # noqa: E402
import tm_fichas as TF  # noqa: E402
import valores_tm as V  # noqa: E402

casos = 0


def caso(nome):
    global casos
    casos += 1
    print("ok ", nome)


# ficha = [titular, {posição: vezes}, minutos, gols, assistências, amarelos]
destruidor = [50, {"VOL": 47, "MC": 3}, 3900, 2, 6, 12]          # Ugarte: sempre de volante, 0,18 G+A por 90
box_to_box = [84, {"VOL": 39, "MC": 38, "ME": 5, "MEI": 2}, 7500, 6, 12, 8]  # Elliot Anderson
quase_zagueiro = [100, {"VOL": 75, "ZAG": 25}, 8900, 4, 4, 9]    # Tchouaméni
assert V.tatica("VOL", destruidor) == "1F"
assert V.tatica("VOL", box_to_box) == "2F"
assert V.tatica("VOL", quase_zagueiro) == "1MF", "escalado de zagueiro: 1º volante que marca bem"
assert V.tatica("VOL") == "pP", "sem dados: 1º pela posição"
caso("1º e 2º volante pela ficha de escalações (e pela posição quando não há ficha)")

# lances reais da Série A: percentil de marcação (def), de recomposição (rec), zona e G+A por 90
assert V.tatica("VOL", None, {"def": 95, "rec": 60, "z": [[23, 62, 15], [30, 40, 30]], "ga": 0.05})[0] == "1"
assert V.tatica("VOL", None, {"def": 25, "rec": 40, "z": [[18, 52, 30], [30, 40, 30]], "ga": 0.1})[0] == "2", "Cristian Medina: pouca marcação e muito ataque"
assert V.tatica("PE", None, {"def": 89, "rec": 11, "z": [[12, 35, 53], [71, 19, 10]], "ga": 0.5}) == "-MrL"
assert V.tatica("LD", None, {"def": 50, "rec": 80, "z": [[40, 40, 20], [5, 15, 80]], "ga": 0.1}) == "-RL"
assert V.tatica("CA", None, {"def": 90, "rec": 90, "z": [[5, 20, 75], [10, 80, 10]]}) == "", "centroavante não leva etiqueta"
caso("Série A: lances reais decidem o tipo de volante e as etiquetas")

assert V.tatica("PE", [40, {"PE": 25, "ME": 15}, 3000, 5, 5, 2]) == "-RF", "ponta escalado como meia pelo lado recompõe"
assert V.tatica("PD", [30, {"PD": 30}, 2500, 8, 4, 1]) == "-rF", "ponta sempre escalado no ataque"
assert V.tatica("PD", [6, {"PD": 6}, 500, 1, 0, 0]) == "", "poucos jogos: sem etiqueta"
assert V.tatica("LE", [50, {"LE": 35, "ME": 16}, 4500, 3, 4, 3]) == "-OF", "lateral escalado mais à frente: de apoio"
assert V.tatica("LD", [40, {"LD": 34, "ZAG": 6}, 3500, 0, 1, 5]) == "-MF", "lateral que também joga de zagueiro marca bem"
caso("laterais e pontas pela ficha de escalações")

linhas = [{"date": "2025-01-10", "type": "starting_lineup", "position": "Defensive Midfield", "player_id": "7"},
          {"date": "2025-01-17", "type": "starting_lineup", "position": "Central Midfield", "player_id": "7"},
          {"date": "2025-01-24", "type": "substitutes", "position": "Central Midfield", "player_id": "7"},
          {"date": "2023-01-24", "type": "starting_lineup", "position": "Centre-Back", "player_id": "7"},
          {"date": "2025-02-01", "type": "starting_lineup", "position": "Midfield", "player_id": "7"}]
aps = [{"date": "2025-01-10", "player_id": "7", "minutes_played": "200", "goals": "1", "assists": "2", "yellow_cards": "1"},
       {"date": "2025-01-17", "player_id": "7", "minutes_played": "90", "goals": "0", "assists": "0", "yellow_cards": "0"}]
assert TF.resumir(linhas, aps) == {"7": [2, {"VOL": 1, "MC": 1}, 290, 1, 2, 1]}, "só titular, desde 2024-07, sem posição genérica"
caso("ficha: só as escalações como titular das duas últimas temporadas")

assert T.limpa_anterior("Joined from Royal Antwerp FC; date: 01/09/2026; fee: €5.00M") == ["Royal Antwerp FC", 5000000]
assert T.limpa_anterior("Joined from Portuguesa; date: 25/08/2026; fee: free transfer") == ["Portuguesa", 0]
assert T.limpa_anterior("Joined from Al-Ula FC; date: 13/08/2026; fee: ?") == ["Al-Ula FC", None]
assert T.limpa_anterior("Internal transfer: SE Palmeiras São Paulo U20; date: 01/07/2026") == ["SE Palmeiras São Paulo U20", 0]
assert T.limpa_anterior("On loan from CF Pachuca U21; started on: 01/07/2026; loaned until: ") == ["CF Pachuca U21", 0]
caso("chegada ao clube: as frases da página viram clube e valor pago")

print(f"{casos} casos do perfil tático passaram")
