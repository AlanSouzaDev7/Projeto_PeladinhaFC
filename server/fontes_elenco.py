# © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE).
"""PLACAR — conferência do elenco de cada clube em várias fontes, para a janela de transferências.

Fontes e para que serve cada uma:
- TheSportsDB (API pública, chave de teste "123"): cadastro do jogador no clube, posição detalhada ("Right-Back",
  "Attacking Midfield"...) e a foto recortada com a camisa do clube. AS FOTOS NÃO TÊM LICENÇA para uso comercial:
  ficam no arquivo como "fotoPrivada" e o site só mostra no modo privado do dono (veja js/mercado.js). Antes de
  vender ou apresentar o produto, apague esse campo (FOTOS_PRIVADAS=0 no robô) ou não ligue o modo privado.
- API-Football (só com API_FOOTBALL_KEY): elenco atual com número e posição; escalações dos últimos jogos.
- Súmulas da ESPN (já no PLACAR): quem foi titular nos últimos 5 jogos.
- Google Notícias (só título, fonte, data e link): manchetes de escalação da semana que citam o jogador.
O site oficial do clube não é lido: o do Cruzeiro, por exemplo, carrega o elenco de um banco de dados interno do
aplicativo (não de uma página ou API pública), e ler esse banco direto seria contornar o próprio site.

Situação de cada jogador (titular, reserva, pouco usado) com quantas fontes concordam; "titular" só com 3 fontes ou
mais quando há 3 disponíveis.
"""
import json
import os
import re
import time
import urllib.parse

P = None  # módulo placar_api

TSDB = "https://www.thesportsdb.com/api/v1/json/123"
CACHE = "fontes-elenco.json"
POS_TSDB = {  # posição do TheSportsDB -> sigla em português
    "goalkeeper": "GOL", "centre-back": "ZAG", "center-back": "ZAG", "defender": "ZAG", "right-back": "LD", "left-back": "LE",
    "right wing-back": "ALD", "left wing-back": "ALE", "defensive midfield": "VOL", "central midfield": "MC", "midfielder": "MC",
    "attacking midfield": "MEI", "right midfield": "MD", "left midfield": "ME", "right winger": "PD", "left winger": "PE",
    "right wing": "PD", "left wing": "PE", "centre-forward": "CA", "center-forward": "CA", "forward": "CA", "striker": "CA",
    "second striker": "CA", "attacker": "CA",
}
_ultimo = [0.0, 0]  # hora da última consulta, quantos 429 seguidos


def _arq():
    return os.path.join(P.ROOT, "server", "cache", CACHE)


def _ler():
    try:
        return json.load(open(_arq(), encoding="utf-8"))
    except Exception:
        return {}


def _gravar(d):
    os.makedirs(os.path.dirname(_arq()), exist_ok=True)
    json.dump(d, open(_arq(), "w", encoding="utf-8"), ensure_ascii=False)


def _tsdb(caminho):
    # o plano gratuito é bem limitado: uma consulta a cada 6,5 s; com 429 (limite), para a rodada
    if _ultimo[1] >= 2:
        raise RuntimeError("limite do TheSportsDB atingido nesta rodada")
    espera = 6.5 - (time.time() - _ultimo[0])
    if espera > 0:
        time.sleep(espera)
    _ultimo[0] = time.time()
    try:
        return P.get_json(f"{TSDB}/{caminho}")
    except Exception as ex:
        if "429" in str(ex):
            _ultimo[1] += 1
            time.sleep(20)
        raise


def norm(x):
    return re.sub(r"[^a-z]", "", P.norm_txt(x or ""))


def mesmo_nome(a, b):
    a, b = P.norm_txt(a or "").split(), P.norm_txt(b or "").split()
    if not a or not b:
        return False
    if a == b or "".join(a) == "".join(b):
        return True
    # "Fabrício Bruno" ~ "Fabrício Bruno Soares de Faria"; "Kaio Jorge" ~ "Kaio Jorge Pinto Ramos"
    curto, longo = (a, b) if len(a) <= len(b) else (b, a)
    return all(p in longo for p in curto) and len(curto) >= (1 if len(curto[0]) > 4 else 2)


def tsdb_jogador(nome, clube_nomes):
    """Procura o jogador pelo nome no TheSportsDB e só aceita se ele estiver cadastrado no clube."""
    try:
        d = _tsdb("searchplayers.php?" + urllib.parse.urlencode({"p": nome}))
    except Exception as ex:
        P.log("fontes: TheSportsDB", nome, ex)
        return None
    for x in d.get("player") or []:
        if (x.get("strSport") or "") != "Soccer":
            continue
        if not any(norm(c) and norm(c) in norm(x.get("strTeam")) for c in clube_nomes):
            continue
        if not mesmo_nome(nome, x.get("strPlayer")):
            continue
        foto = x.get("strCutout") or x.get("strRender") or x.get("strThumb")
        return {"id": x.get("idPlayer"), "nome": P.clean_text(x.get("strPlayer") or "", 60), "pos": POS_TSDB.get((x.get("strPosition") or "").lower()),
                "posTxt": P.clean_text(x.get("strPosition") or "", 40), "foto": foto if foto and foto.startswith("https://r2.thesportsdb.com/") else None,
                "status": x.get("strStatus") or ""}
    return {}


def af_elenco(cid):
    """Elenco atual pela API-Football (com chave): {nome normalizado: {num, pos, foto}}."""
    if not os.environ.get("API_FOOTBALL_KEY", "").strip():
        return None
    try:
        tid = P.af_time(cid)
        if not tid:
            return None
        d = P.af_get(f"/players/squads?team={tid}")
        out = {}
        for t in d.get("response") or []:
            for j in t.get("players") or []:
                out[norm(j.get("name"))] = {"nome": j.get("name"), "num": j.get("number"), "pos": {"Goalkeeper": "G", "Defender": "D", "Midfielder": "M", "Attacker": "A"}.get(j.get("position")), "foto": j.get("photo")}
        return out
    except Exception as ex:
        P.log("fontes: API-Football", cid, ex)
        return None


def noticias_escalacao(cid):
    """Manchetes de escalação da última semana (só títulos) do clube."""
    nome = (P.HEADLINE_NAMES.get(cid) or [cid])[0]
    c = _ler()
    guard = (c.get("escalacao") or {}).get(cid)
    if guard and time.time() - guard.get("t", 0) < 6 * 3600:  # cache de 6 h: o robô grava a cada 30 min
        return guard.get("titulos", [])
    try:
        tit = [it["title"] for it in P.news_query(f'"{nome}" escalação OR escalado OR titular when:7d')]
    except Exception as ex:
        P.log("fontes: notícias de escalação", cid, ex)
        return (guard or {}).get("titulos", [])
    c = _ler()
    c.setdefault("escalacao", {})[cid] = {"t": time.time(), "titulos": tit[:40]}
    _gravar(c)
    return tit


def atualizar(clube_jogadores, max_buscas=60, fotos=True):
    """clube_jogadores: {cid: [(id, nome), ...]}. Busca no TheSportsDB quem ainda não foi procurado (ou há mais de 21
    dias; quem não foi achado, de novo em 7 dias), no máximo max_buscas por rodada (o resto fica para a próxima)."""
    c = _ler()
    tsdb = c.setdefault("tsdb", {})
    buscas = 0
    agora = time.time()
    for cid, jogs in clube_jogadores.items():
        nomes_clube = (P.HEADLINE_NAMES.get(cid) or [cid])[:2]  # "Atlético-MG" e "Atlético Mineiro"
        for item in jogs:
            aid, nome, extra = item[0], item[1], list(item[2:])
            r = tsdb.get(aid)
            idade = agora - (r or {}).get("t", 0)
            if r and (idade < 21 * 86400 if r.get("d") else idade < 7 * 86400):
                continue
            if buscas >= max_buscas:
                break
            buscas += 1
            achado = tsdb_jogador(nome, nomes_clube + [x for x in extra if x])
            if achado is None:
                continue  # erro de rede: tenta na próxima
            if not fotos and achado:
                achado.pop("foto", None)
            tsdb[aid] = {"t": agora, "d": achado}
    c["t"] = agora
    _gravar(c)
    P.log(f"fontes do elenco: {buscas} buscas no TheSportsDB")
    return c


def do_jogador(aid):
    r = (_ler().get("tsdb") or {}).get(str(aid)) or {}
    return r.get("d") or {}


def situacao(jogos_ult, xi_ult, noticias, nome, af=None):
    """Titular, reserva ou pouco usado, com as fontes que confirmam.
    jogos_ult: titular (True/False/None = não jogou) nos últimos 5 jogos (súmulas); xi_ult: estava no último XI;
    noticias: títulos de manchetes de escalação; af: escalações da API-Football (lista de bools) quando há chave."""
    fontes, votos = [], 0
    tit5 = sum(1 for x in jogos_ult if x)
    if jogos_ult:
        fontes.append(f"súmulas: titular em {tit5} dos últimos {len(jogos_ult)}")
        votos += 1 if tit5 >= 3 else 0
    if xi_ult is not None:
        fontes.append("último jogo: " + ("titular" if xi_ult else "fora do time titular"))
        votos += 1 if xi_ult else 0
    sobrenome = P.norm_txt(nome).split()[-1] if nome else ""
    cit = sum(1 for t in noticias if sobrenome and len(sobrenome) > 3 and re.search(r"\b" + re.escape(sobrenome) + r"\b", P.norm_txt(t)))
    fontes.append(f"manchetes de escalação: {cit}")
    votos += 1 if cit else 0
    if af:
        fontes.append(f"API-Football: titular em {sum(af)} de {len(af)}")
        votos += 1 if sum(af) >= len(af) / 2 else 0
    disponiveis = 3 + (1 if af else 0)
    if votos >= 3 or (tit5 >= 4 and xi_ult):
        st = "titular"
    elif tit5 >= 1 or any(x is False for x in jogos_ult):
        st = "reserva"
    else:
        st = "pouco usado"
    return {"st": st, "conf": votos, "de": disponiveis, "fontes": fontes}
