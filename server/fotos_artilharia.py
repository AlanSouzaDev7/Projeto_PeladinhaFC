# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""CazéStats.TV — foto garantida para cada artilheiro (arte da artilharia, js/arte-artilharia.js).

Os 10 primeiros da artilharia do Brasileirão, da Libertadores, da Sul-Americana e da Copa do Brasil. A arte já tenta, no
navegador, a foto guardada do site do clube, a da ESPN e a do Transfermarkt pelo mercado global; aqui o robô cobre quem
ficaria sem nenhuma (jogador de clube de fora que a ESPN não fotografa, como os do futebol equatoriano). Ordem:
  1. Transfermarkt: elencos lidos uma vez por janela (server/dados-tm/elencos.json), pelo nome e pelo clube;
  2. TheSportsDB: busca pelo nome e, sem resultado, o elenco do clube de lá;
  3. busca de imagem da API oficial do Brave Search (a cota do dia que sobrar; título conferido com o nome).
A foto achada é baixada e guardada em img/jogadores/artilharia/<id>.webp (mesmo endereço do site: o canvas aceita) e
listada em dados/fotos-artilharia.json. Nunca a da Wikipédia. Com MODO_VENDA=1 (ou FOTOS_PRIVADAS=0), nenhuma cópia.
"""
import json
import os
import re
import time
import unicodedata
import urllib.parse

P = None      # módulo placar_api
FOTO = None   # server/fotos.py (baixar, guardar, abre)
BI = None     # server/busca_imagem.py
COMPS = ("libertadores", "sul-americana", "copa-do-brasil")
POR_COMP = 10
REVER_DIAS = 30        # foto guardada é conferida de novo depois de 30 dias
SEM_FOTO_DIAS = 2      # quem não teve foto achada é procurado de novo em 2 dias
TM_FOTO = "https://img.a.transfermarkt.technology/portrait/header/"
TSDB = "https://www.thesportsdb.com/api/v1/json/123/"
GENERICAS = set("fc cf sc ac ca cd club clube de da do del la los futbol futebol sport sporting esporte deportivo atletico liga "
                "independiente universidad nacional 1 sad".split())


def _norm(x):
    x = unicodedata.normalize("NFD", str(x or "")).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", x).split())


def mesmo_nome(a, b):
    """'Álex Arce' = 'Alex Arce'; 'Carlos González' = 'Carlos Gonzalez'. Também aceita nome de lá com mais palavras
    ('Michael Estrada' x 'Michael Steveen Estrada'), desde que o primeiro e o último batam."""
    a, b = _norm(a).split(), _norm(b).split()
    if not a or not b:
        return False
    return a == b or (a[0] == b[0] and a[-1] == b[-1])


def mesmo_clube(a, b):
    """Uma palavra significativa em comum ('Liga de Quito' x 'LDU Quito'; 'Independiente del Valle' x o mesmo)."""
    ta = {w for w in _norm(a).split() if w not in GENERICAS and len(w) > 2}
    tb = {w for w in _norm(b).split() if w not in GENERICAS and len(w) > 2}
    return bool(ta & tb)


def alvos():
    """[{id, nome, clube, cid}] dos 10 primeiros de cada artilharia (sem repetir o jogador)."""
    with P.lock:
        jog = (P.state.get("players") or {}).get("artilheiros") or []
        comps = P.state.get("competicoes") or {}
    out, vistos = [], set()
    for a in jog[:POR_COMP]:
        cid = a.get("club")
        out.append({"id": str(a.get("id")), "nome": a.get("name"), "clube": (P.CLUBS.get(cid) or {}).get("busca") or cid, "cid": cid})
    for k in COMPS:
        for a in ((comps.get(k) or {}).get("artilharia") or [])[:POR_COMP]:
            out.append({"id": str(a.get("atleta")), "nome": a.get("nome"), "clube": a.get("timeNome") or "", "cid": a.get("clube")})
    res = []
    for a in out:
        if a["id"] and a["id"] != "None" and a["id"] not in vistos:
            vistos.add(a["id"])
            res.append(a)
    return res


def foto_tm(a, elencos=None):
    """Foto da página de elenco do Transfermarkt: mesmo nome e mesmo clube (ou nome único em todos os elencos)."""
    elencos = elencos if elencos is not None else _elencos()
    achados = []
    for c in (elencos.get("competicoes") or {}).values():
        for cl in (c.get("clubes") or {}).values():
            for r in cl.get("jogadores") or []:
                if len(r) > 12 and r[12] and mesmo_nome(r[1], a["nome"]):
                    achados.append((mesmo_clube(cl.get("nome") or "", a["clube"]), r[12]))
    certos = [f for ok, f in achados if ok]
    if certos:
        return TM_FOTO + certos[0]
    return TM_FOTO + achados[0][1] if len(achados) == 1 else None


def foto_tsdb(a, pedir=None):
    """Foto do TheSportsDB (recorte, se houver): pela busca do nome com o clube batendo; sem isso, no elenco do clube."""
    pedir = pedir or P.get_json

    def foto(p):
        u = p.get("strCutout") or p.get("strThumb") or ""
        return u if u.startswith("https://r2.thesportsdb.com/") else None
    try:
        d = pedir(TSDB + "searchplayers.php?p=" + urllib.parse.quote(_norm(a["nome"]).replace(" ", "_")))
        for p in d.get("player") or []:
            if mesmo_nome(p.get("strPlayer"), a["nome"]) and mesmo_clube(p.get("strTeam") or "", a["clube"]) and foto(p):
                return foto(p)
        time.sleep(1.5)
        t = pedir(TSDB + "searchteams.php?t=" + urllib.parse.quote(a["clube"].replace(" ", "_")))
        for tm in (t.get("teams") or [])[:2]:
            time.sleep(1.5)
            el = pedir(TSDB + "lookup_all_players.php?id=" + urllib.parse.quote(str(tm.get("idTeam"))))
            for p in el.get("player") or []:
                if mesmo_nome(p.get("strPlayer"), a["nome"]) and foto(p):
                    return foto(p)
    except Exception as ex:
        P.silencioso("fotos-artilharia:tsdb", ex)
    return None


def _elencos():
    try:
        return json.load(open(os.path.join(P.ROOT, "server", "dados-tm", "elencos.json"), encoding="utf-8"))
    except Exception:
        return {}


def _guardadas():
    try:
        return json.load(open(os.path.join(P.ROOT, "dados", "fotos.json"), encoding="utf-8"))
    except Exception:
        return {}


def _saida():
    return os.path.join(P.ROOT, "dados", "fotos-artilharia.json")


def _ler():
    try:
        return json.load(open(_saida(), encoding="utf-8"))
    except Exception:
        return {}


def rodar(agora=None):
    """Confere os artilheiros e grava dados/fotos-artilharia.json. Devolve quantas fotos novas foram guardadas."""
    agora = agora or time.time()
    antigo = _ler()
    jog = dict(antigo.get("jogadores") or {})
    if not FOTO.privadas_ligadas():
        json.dump({"atualizado": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "jogadores": {}}, open(_saida(), "w", encoding="utf-8"), ensure_ascii=False)
        return 0
    guardadas, elencos, novas = _guardadas(), _elencos(), 0
    for a in alvos():
        x = jog.get(a["id"])
        if x and agora - x.get("t", 0) < (REVER_DIAS if x.get("u") else SEM_FOTO_DIAS) * 86400 and (not x.get("u") or FOTO._existe(x["u"])):
            continue
        g = (guardadas.get(a["cid"] or "") or {}).get(a["id"])
        if g and g.get("u") and g.get("f") != "Wikimedia":
            jog.pop(a["id"], None)  # a foto do site do clube já serve
            continue
        if FOTO.abre(f"https://a.espncdn.com/i/headshots/soccer/players/full/{a['id']}.png"):
            jog.pop(a["id"], None)  # a ESPN tem
            continue
        url, fonte = foto_tm(a, elencos), "Transfermarkt"
        if not url:
            url, fonte = foto_tsdb(a), "TheSportsDB"
        if not url and BI and BI.ligada():
            url, fonte = BI.busca(a["nome"], a["clube"]), "Brave"
        u = None
        if url and "wikimedia" not in url and "wikipedia" not in url:
            dados = FOTO.baixar(url)
            u = FOTO.guardar("artilharia", a["id"], dados) if dados else None
        jog[a["id"]] = {"nome": a["nome"], "clube": a["clube"], "u": u, "f": fonte if u else None, "t": agora}
        novas += bool(u)
        P.log(f"fotos da artilharia: {a['nome']} ({a['clube']}) -> {fonte if u else 'sem foto'}")
    json.dump({"atualizado": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "jogadores": jog}, open(_saida(), "w", encoding="utf-8", newline="\n"),
              ensure_ascii=False, separators=(",", ":"))
    return novas
