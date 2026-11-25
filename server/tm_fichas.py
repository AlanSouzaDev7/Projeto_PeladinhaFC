# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""CazéStats.TV — ficha técnica de cada jogador pelas escalações (transfermarkt-datasets, CC0).

Para cada jogador: em que posição ele foi escalado como titular nas duas últimas temporadas (game_lineups) e os minutos,
gols, assistências e cartões (appearances). É com isso que o site separa o 1º do 2º volante e diz se um lateral ou um ponta
recompõe: um ponta escalado várias vezes como meia pelo lado ou como lateral volta para marcar; um volante escalado como
meio-campista e que faz gols e assistências é um 2º volante. Na Série A os lances reais da ESPN (desarmes, interceptações,
cortes e onde age no campo) têm prioridade; a ficha completa o resto do mundo.

Os arquivos têm ~170 MB: o robô lê uma vez por janela (como os elencos) e grava o resumo em server/dados-tm/fichas.json.
Uso: python -X utf8 server/tm_fichas.py [pasta-com-os-csv.gz]   (sem pasta, baixa do conjunto público)
"""
import csv
import gzip
import io
import json
import os
import sys
import time
import urllib.request

BASE = "https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/"
SAIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dados-tm", "fichas.json")
DESDE = "2024-07-01"  # duas temporadas europeias
# posição da escalação -> código do site; as genéricas ("Midfield", "Attack"...) não dizem nada e ficam de fora
POS = {"Goalkeeper": "GOL", "Centre-Back": "ZAG", "Sweeper": "ZAG", "Left-Back": "LE", "Right-Back": "LD", "Defensive Midfield": "VOL",
       "Central Midfield": "MC", "Attacking Midfield": "MEI", "Left Midfield": "ME", "Right Midfield": "MD", "Left Winger": "PE",
       "Right Winger": "PD", "Second Striker": "SA", "Centre-Forward": "CA"}


def _abre(nome, pasta=None):
    if pasta:
        return io.TextIOWrapper(gzip.open(os.path.join(pasta, nome + ".csv.gz")), encoding="utf-8")
    pedido = urllib.request.Request(BASE + nome + ".csv.gz", headers={"User-Agent": "CazeStats/1.0 (+https://cazestats.pages.dev)"})
    return io.TextIOWrapper(gzip.GzipFile(fileobj=urllib.request.urlopen(pedido, timeout=600)), encoding="utf-8")


def resumir(escalacoes, aparicoes, desde=DESDE):
    """{tm_id: [titular, {pos: vezes}, minutos, gols, assistências, amarelos]} a partir das duas listas de linhas."""
    out = {}
    for r in escalacoes:
        if (r.get("date") or "") < desde or r.get("type") != "starting_lineup":
            continue
        p = POS.get(r.get("position") or "")
        if not p:
            continue
        x = out.setdefault(r["player_id"], [0, {}, 0, 0, 0, 0])
        x[0] += 1
        x[1][p] = x[1].get(p, 0) + 1
    for r in aparicoes:
        if (r.get("date") or "") < desde:
            continue
        x = out.setdefault(r["player_id"], [0, {}, 0, 0, 0, 0])
        for i, k in ((2, "minutes_played"), (3, "goals"), (4, "assists"), (5, "yellow_cards")):
            try:
                x[i] += int(float(r.get(k) or 0))
            except ValueError:
                pass
    return {k: v for k, v in out.items() if v[0] >= 3 or v[2] >= 270}


def rodar(pasta=None):
    t0 = time.time()
    fichas = resumir(csv.DictReader(_abre("game_lineups", pasta)), csv.DictReader(_abre("appearances", pasta)))
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump({"gerado": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "desde": DESDE, "fonte": "transfermarkt-datasets (CC0): game_lineups e appearances",
                   "campos": ["titular", "posicoes", "min", "gols", "assist", "amarelos"], "jogadores": fichas}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"fichas: {len(fichas)} jogadores em {time.time() - t0:.0f} s -> {SAIDA}")


if __name__ == "__main__":
    rodar(sys.argv[1] if len(sys.argv) > 1 else None)
