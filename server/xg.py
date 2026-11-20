# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""CazéStats.TV — xG estimado: chance de um chute virar gol pela posição (o mesmo modelo de js/chutes.js).

Posição de 0 a 100 com o time atacando para x = 100; campo de 105 x 68 m. Modelo logístico de distância e ângulo
que o gol "abre" visto da bola; cabeceio vale 60%; pênalti, 0,76. É uma estimativa do CazéStats.TV.
Também monta dados/xg.json (ranking de clubes e jogadores no Brasileirão) a partir de dados/jogadores/*.json.
Uso: python -X utf8 server/xg.py   (grava o resumo e imprime os primeiros)
"""
import json
import math
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CHUTES = {"Shot On Target", "Shot Off Target", "Shot Blocked", "Goal", "Shot Hit Woodwork", "Hit Woodwork"}
PENALTI = 0.76


def xg(x, y, cabeca=False):
    dx, dy = (100 - x) * 1.05, (y - 50) * 0.68
    dist = math.hypot(dx, dy)
    a = math.atan2(7.32 * dx, dx * dx + dy * dy - (7.32 / 2) ** 2)
    ang = a + math.pi if a < 0 else a
    v = 1 / (1 + math.exp(-(-1.0 + 1.6 * ang - 0.1 * dist)))
    return min(0.95, max(0.01, v * (0.6 if cabeca else 1)))


def do_lance(tipo, texto, x, y):
    """xG de um lance da ESPN (None se não for chute ou não tiver posição)."""
    if "Penalty" in tipo and ("Scored" in tipo or "Saved" in tipo or "Missed" in tipo):
        return PENALTI
    if tipo not in CHUTES or not isinstance(x, (int, float)) or not isinstance(y, (int, float)) or not (x or y):
        return None
    t = (texto or "").lower()
    if "penalty" in t:
        return PENALTI
    return xg(x, y, "header" in t or "cabe" in t)


def resumo(raiz=RAIZ, comp="Brasileirão", min_chutes=8):
    """dados/xg.json: clubes (xG a favor e contra, gols) e jogadores (xG, gols, gols − xG) numa competição."""
    clubes, jogadores = [], []
    for arq in sorted((Path(raiz) / "dados" / "jogadores").glob("*.json")):
        try:
            d = json.loads(arq.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        t = (d.get("xgTime") or {}).get(comp)
        if t and t.get("jogos"):
            clubes.append({"id": arq.stem, **{k: round(v, 2) if isinstance(v, float) else v for k, v in t.items()}})
        for aid, j in (d.get("jogadores") or {}).items():
            c = (j.get("comps") or {}).get(comp) or {}
            if (c.get("ch") or 0) >= min_chutes and c.get("xg") is not None:
                jogadores.append({"key": f"{aid}-{arq.stem}", "n": j.get("n"), "clube": arq.stem, "pos": j.get("pos"), "j": c.get("j", 0), "min": c.get("min", 0),
                                  "ch": c.get("ch", 0), "g": c.get("g", 0), "xg": round(c.get("xg") or 0, 2), "dif": round((c.get("g") or 0) - (c.get("xg") or 0), 2)})
    clubes.sort(key=lambda c: -c.get("xg", 0))
    jogadores.sort(key=lambda j: -j["xg"])
    saida = {"updated": time.strftime("%d/%m/%Y às %H:%M"), "comp": comp, "modelo": "distância e ângulo para o gol; cabeceio 60%; pênalti 0,76",
             "clubes": clubes, "jogadores": jogadores[:120]}
    (Path(raiz) / "dados" / "xg.json").write_text(json.dumps(saida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return saida


if __name__ == "__main__":
    s = resumo()
    print(f"xg: {len(s['clubes'])} clubes, {len(s['jogadores'])} jogadores")
    for c in s["clubes"][:5]:
        print(" ", c)
    for j in s["jogadores"][:5]:
        print(" ", j)
