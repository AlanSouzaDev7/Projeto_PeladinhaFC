# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""CazéStats.TV — junta os jogos dos arquivos de dados no formato da tabela `jogos` do banco D1 (histórico).

Fontes (as mesmas que o site já usa, gravadas pelo robô a cada rodada):
  - dados/competicoes/*.json  jogos completos (os dois times) de Série B, C e D, copas e estaduais;
  - dados/club-form.json      jogos de cada clube da Série A em todas as competições. A Série A só existe aqui:
                              cada jogo aparece duas vezes (uma na lista de cada clube), o que dá os dois lados.
Quando um jogo está nas duas fontes, vale o das competições (tem o id da ESPN dos dois times e os pênaltis).
Times do site usam o id do site ("cruzeiro"); os outros, "espn:<id>" (ou nada, se a fonte não traz o id).
"""
import json
from pathlib import Path

DADOS = Path(__file__).resolve().parent.parent / "dados"
NOMES_LIGA = {"bra.1": "Brasileirão"}


def _le(p):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _time_id(t):
    if t.get("clube"):
        return t["clube"]
    return f"espn:{t['id']}" if str(t.get("id") or "").isdigit() else None


def _int(v):
    return v if isinstance(v, int) and not isinstance(v, bool) else None


def linha(j, competicao, temporada=None, liga=""):
    """Um jogo no formato das competições (server/competicoes.py, jogo()) vira uma linha da tabela; None se incompleto."""
    casa, fora = j.get("casa") or {}, j.get("fora") or {}
    if not str(j.get("id") or "").isdigit() or not j.get("data") or not casa.get("nome") or not fora.get("nome"):
        return None
    return {
        "id": j["id"], "liga": j.get("lg") or liga, "competicao": competicao,
        "temporada": str(temporada or j["data"][:4]), "data": j["data"], "hora": j.get("hora"),
        "fase": j.get("faseNome") or None,
        "casa_id": _time_id(casa), "casa": casa["nome"], "fora_id": _time_id(fora), "fora": fora["nome"],
        "gols_casa": _int(casa.get("gols")), "gols_fora": _int(fora.get("gols")),
        "pen_casa": _int(casa.get("pen")), "pen_fora": _int(fora.get("pen")),
        "estado": j.get("estado") or "pre", "local": j.get("local") or None,
    }


def das_competicoes(dados=DADOS):
    jogos = {}
    for p in sorted((dados / "competicoes").glob("*.json")):
        c = _le(p) or {}
        for j in c.get("jogos") or []:
            x = linha(j, c.get("nome") or "", c.get("temporada"), c.get("lg") or "")
            if x:
                jogos[x["id"]] = x
    return jogos


def do_club_form(dados=DADOS):
    clubes = ((_le(dados / "club-form.json") or {}).get("clubs")) or {}
    # nome de cada clube do site: como os adversários o chamam
    nomes = {}
    for c in clubes.values():
        for g in c.get("all") or []:
            if g.get("oppId") and g.get("opp"):
                nomes.setdefault(g["oppId"], g["opp"])
    jogos = {}
    for cid, c in clubes.items():
        for g in c.get("all") or []:
            if not str(g.get("id") or "").isdigit() or not g.get("date") or not g.get("opp"):
                continue
            meu = {"id": cid, "nome": nomes.get(cid, cid), "gols": g.get("gf")}
            dele = {"id": g.get("oppId"), "nome": g["opp"], "gols": g.get("ga")}
            casa, fora = (meu, dele) if g.get("home") else (dele, meu)
            jogos.setdefault(g["id"], {
                "id": g["id"], "liga": g.get("lg") or "", "competicao": g.get("comp") or NOMES_LIGA.get(g.get("lg"), ""),
                "temporada": g["date"][:4], "data": g["date"], "hora": g.get("time"), "fase": g.get("stage") or None,
                "casa_id": casa["id"], "casa": casa["nome"], "fora_id": fora["id"], "fora": fora["nome"],
                "gols_casa": _int(casa["gols"]), "gols_fora": _int(fora["gols"]), "pen_casa": None, "pen_fora": None,
                "estado": g.get("state") or "pre", "local": g.get("venue") or None,
            })
    return jogos


def coleta(dados=DADOS):
    """Lista de jogos (dicts com as colunas da tabela), sem repetição, ordenada por data."""
    jogos = do_club_form(dados)
    jogos.update(das_competicoes(dados))  # as competições têm mais detalhe: sobrescrevem
    return sorted((j for j in jogos.values() if j["liga"] and j["competicao"]), key=lambda j: (j["data"], j["id"]))


if __name__ == "__main__":
    js = coleta()
    print(f"{len(js)} jogos; exemplo: {json.dumps(js[-1], ensure_ascii=False)}")
