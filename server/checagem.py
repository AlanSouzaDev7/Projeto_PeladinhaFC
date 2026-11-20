# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""CazéStats.TV — checagem automática dos dados: números que não fazem sentido.

Roda no robô depois de gravar os arquivos e grava dados/checagem.json, que a administração mostra.
Nada é corrigido sozinho: a checagem só aponta, com o clube, o jogador e o motivo.
Regras (cada uma pega um tipo de erro real de coleta ou de leitura):
  · jogador de linha com defesas de goleiro           · mais gols que finalizações / mais no alvo que finalizações
  · mais jogos como titular que jogos                  · minutos demais por jogo (mais de 130 em média ou num jogo)
  · nota fora de 3 a 10                                · o mesmo jogo duas vezes na lista do jogador
  · tabela: pontos diferentes de 3V + E, jogos diferentes de V + E + D, saldo diferente de GP − GC
  · carreira: ano de saída antes do de entrada, ano no futuro ou antes de 1990
Uso: python -X utf8 server/checagem.py   (imprime o resumo e grava o arquivo)
"""
import json
import time
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / "dados"


def _ler(arq, padrao=None):
    try:
        return json.loads(Path(arq).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return padrao


def jogadores(cid, d):
    """Avisos dos números de cada jogador de um clube (arquivo dados/jogadores/<clube>.json)."""
    out = []
    campos = d.get("campos") or []
    ix = {k: i for i, k in enumerate(campos)}
    for aid, j in (d.get("jogadores") or {}).items():
        nome, pos = j.get("n") or aid, j.get("pos")
        aviso = lambda motivo: out.append({"tipo": "jogador", "clube": cid, "id": aid, "nome": nome, "motivo": motivo})  # noqa: E731
        tot = Counter()
        for c in (j.get("comps") or {}).values():
            tot.update({k: v for k, v in c.items() if isinstance(v, (int, float))})
        if pos and pos != "G" and tot["defesas"] > 0:
            aviso(f"jogador de linha com {tot['defesas']} defesas de goleiro")
        if tot["g"] > tot["ch"] > 0 or (tot["g"] > 0 and tot["ch"] == 0 and tot["toques"] > 0):
            aviso(f"{tot['g']} gols e só {tot['ch']} finalizações")
        if tot["alvo"] > tot["ch"]:
            aviso(f"{tot['alvo']} finalizações no alvo e só {tot['ch']} finalizações")
        if tot["tit"] > tot["j"]:
            aviso(f"{tot['tit']} jogos como titular em {tot['j']} jogos")
        if tot["j"] and tot["min"] / tot["j"] > 130:
            aviso(f"{tot['min']} minutos em {tot['j']} jogos ({round(tot['min'] / tot['j'])} por jogo)")
        jogos = j.get("jogos") or []
        eids = [r[ix["eid"]] for r in jogos if "eid" in ix]
        rep = [e for e, n in Counter(eids).items() if n > 1]
        if rep:
            aviso(f"jogo repetido na lista ({len(rep)}): {', '.join(map(str, rep[:3]))}")
        if "min" in ix and any((r[ix["min"]] or 0) > 130 for r in jogos):
            aviso("um jogo com mais de 130 minutos")
        if "nota" in ix:
            fora = [r[ix["nota"]] for r in jogos if r[ix["nota"]] is not None and not 3 <= r[ix["nota"]] <= 10]
            if fora:
                aviso(f"nota fora de 3 a 10: {fora[0]}")
    return out


def tabela(live):
    """Avisos da classificação (standings do live-data: [id, P, J, V, E, D, GP, GC, ...])."""
    out = []
    for r in live.get("standings") or []:
        cid, p, j, v, e, d, gp, gc = r[:8]
        if p != 3 * v + e:
            out.append({"tipo": "tabela", "clube": cid, "motivo": f"{p} pontos, mas 3×{v} + {e} = {3 * v + e}"})
        if j != v + e + d:
            out.append({"tipo": "tabela", "clube": cid, "motivo": f"{j} jogos, mas {v} + {e} + {d} = {v + e + d}"})
    return out


def carreiras(cid, d, ano):
    out = []
    for aid, lista in (d or {}).items():
        for x in lista or []:
            i, f = x.get("i"), x.get("f")
            if isinstance(i, int) and isinstance(f, int) and f < i:
                out.append({"tipo": "carreira", "clube": cid, "id": aid, "motivo": f"{x.get('c')}: saída em {f} antes da entrada em {i}"})
            if any(isinstance(y, int) and (y > ano + 1 or y < 1990) for y in (i, f)):
                out.append({"tipo": "carreira", "clube": cid, "id": aid, "motivo": f"{x.get('c')}: ano fora do esperado ({i}–{f})"})
    return out


def verifica(raiz=RAIZ):
    dados = Path(raiz) / "dados"
    avisos = []
    for arq in sorted((dados / "jogadores").glob("*.json")):
        avisos += jogadores(arq.stem, _ler(arq, {}))
    avisos += tabela(_ler(dados / "live-data.json", {}))
    ano = int(time.strftime("%Y"))
    for arq in sorted((dados / "carreiras").glob("*.json")):
        avisos += carreiras(arq.stem, _ler(arq, {}), ano)
    return avisos


def gravar(raiz=RAIZ):
    avisos = verifica(raiz)
    resumo = dict(Counter(a["tipo"] for a in avisos))
    saida = {"updated": time.strftime("%d/%m/%Y às %H:%M"), "total": len(avisos), "porTipo": resumo, "avisos": avisos[:300]}
    (Path(raiz) / "dados" / "checagem.json").write_text(json.dumps(saida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return saida


if __name__ == "__main__":
    s = gravar()
    print(f"checagem: {s['total']} avisos {s['porTipo']}")
    for a in s["avisos"][:25]:
        print(" -", a["tipo"], a["clube"], a.get("nome", a.get("id", "")), "·", a["motivo"])
