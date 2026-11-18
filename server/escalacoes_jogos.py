# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE).
"""CazéStats.TV — escalação de cada jogo de cada clube (aba "Escalações" do clube e campinho tático da partida).

Lê as súmulas já baixadas pelo robô (server/cache/partidas.json, do Brasileirão, e partidas-outras.json, das outras
competições) e grava dados/escalacoes-jogos/<clube>.json:
    {id do jogo: {"f": formação, "xi": [[lugar na formação, id, nome, posição da ESPN], ...],
                  "entraram": [[id, nome, minutos], ...]}}
Data, competição, adversário e placar vêm do calendário do clube (club-form), juntados no navegador pelo id do jogo.
O jogo de hoje (escalação anunciada antes de começar) vem de js/escalacoes.js. Fonte: súmulas da ESPN (risco J4).
"""
import json
import os

P = None  # módulo placar_api


def _ler(nome):
    try:
        return json.load(open(os.path.join(P.ROOT, "server", "cache", nome), encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def montar():
    jogos = {**_ler("partidas-outras.json"), **_ler("partidas.json")}
    por_clube = {cid: {} for cid in P.CLUBS}
    espn_de = {str(v.get("espn")): cid for cid, v in P.CLUBS.items() if v.get("espn")}
    for eid, j in jogos.items():
        for tid, linhas in (j.get("teams") or {}).items():
            cid = espn_de.get(str(tid))
            if not cid or not linhas:
                continue
            titulares = [x for x in linhas if len(x) > 11 and x[2] and x[11]]
            if len(titulares) < 9:
                continue
            forma = next((x[11][0] for x in titulares if x[11] and x[11][0]), "")
            xi = sorted(([int(x[11][1] or 0), str(x[0]), P.clean_text(x[1], 40), x[11][2] or ""] for x in titulares), key=lambda r: r[0])
            entraram = [[str(x[0]), P.clean_text(x[1], 40), int(x[3] or 0)] for x in linhas if not x[2]]
            por_clube[cid][str(eid)] = {"f": forma, "xi": xi, "entraram": entraram}
    return por_clube


def gravar():
    pasta = os.path.join(P.ROOT, "dados", "escalacoes-jogos")
    os.makedirs(pasta, exist_ok=True)
    n = 0
    for cid, jogos in montar().items():
        tmp = os.path.join(pasta, f"{cid}.json.tmp")
        with open(tmp, "w", encoding="utf-8", newline="\n") as f:
            json.dump(jogos, f, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, os.path.join(pasta, f"{cid}.json"))
        n += len(jogos)
    P.log(f"escalações dos jogos: {n} escalações em dados/escalacoes-jogos/")
    return n
