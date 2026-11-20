# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""CazéStats.TV — candidatos à seleção da rodada: os melhores de cada jogo do Brasileirão, por posição.

Lê dados/jogadores/*.json (notas do CazéStats.TV) e grava dados/notas-jogos.json, pequeno o bastante para o site
baixar inteiro: para cada jogo, os melhores por posição (1 goleiro, 4 defensores, 3 meias e 3 atacantes, somando
os dois times), que é tudo o que a seleção da rodada (4-3-3) pode usar. Quem jogou menos de 30 minutos fica de fora.
O site escolhe o time com js/rodada.js (selecao), com os jogos de cada rodada.
Uso: python -X utf8 server/selecao.py
"""
import json
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
VAGAS = {"G": 1, "D": 4, "M": 3, "F": 3}
MIN_MINUTOS = 30


def candidatos(raiz=RAIZ, comp="Brasileirão"):
    """{eid: [[aid, clube, nome, pos, nota, gols, assist, min], ...]} com os melhores de cada posição em cada jogo."""
    por_jogo = {}
    for arq in sorted((Path(raiz) / "dados" / "jogadores").glob("*.json")):
        try:
            d = json.loads(arq.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        campos = d.get("campos") or []
        if "nota" not in campos:
            continue
        i = {c: n for n, c in enumerate(campos)}
        for aid, j in (d.get("jogadores") or {}).items():
            pos = j.get("pos")
            if pos not in VAGAS:
                continue
            for row in j.get("jogos") or []:
                if row[i["comp"]] != comp or row[i["nota"]] is None or (row[i["min"]] or 0) < MIN_MINUTOS or row[i["vivo"]]:
                    continue
                por_jogo.setdefault(str(row[i["eid"]]), []).append(
                    [aid, arq.stem, j.get("n"), pos, row[i["nota"]], row[i["g"]] or 0, row[i["a"]] or 0, row[i["min"]] or 0])
    saida = {}
    for eid, linhas in por_jogo.items():
        linhas.sort(key=lambda r: (-r[4], -(r[5] + r[6]), -r[7], r[2] or ""))
        fica, conta = [], {}
        for r in linhas:
            if conta.get(r[3], 0) < VAGAS[r[3]]:
                conta[r[3]] = conta.get(r[3], 0) + 1
                fica.append(r)
        saida[eid] = fica
    return saida


def resumo(raiz=RAIZ):
    jogos = candidatos(raiz)
    saida = {"updated": time.strftime("%d/%m/%Y às %H:%M"), "comp": "Brasileirão", "jogos": jogos}
    (Path(raiz) / "dados" / "notas-jogos.json").write_text(json.dumps(saida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return saida


if __name__ == "__main__":
    s = resumo()
    print(f"seleção: candidatos de {len(s['jogos'])} jogos")
