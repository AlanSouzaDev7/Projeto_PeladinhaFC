# © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE).
"""Placar.TV — escalação anunciada para o próximo jogo de cada clube da Série A.

Fontes (todas de uso permitido):
- ESPN: a súmula do jogo traz os titulares e a formação assim que o clube divulga (em geral ~1 h antes);
- X (antigo Twitter): perfil oficial do clube, pela API oficial v2 (busca recente). Só com X_BEARER_TOKEN;
- Instagram: perfil oficial do clube, pela Graph API (Business Discovery). Só com IG_USER_ID e IG_ACCESS_TOKEN.
Nada é raspado: sem as chaves, X e Instagram ficam de fora e vale só a ESPN.

Na publicação do clube, o texto ("Escalado! Cássio; Fagner, ...") é cruzado com o elenco: um jogador conta quando o
nome, o apelido ou o sobrenome aparece no texto. Com 9 ou mais do elenco citados, a publicação vale como escalação.
A escalação é "confirmada" quando vem da ESPN ou de um perfil oficial; com mais de uma fonte, o site mostra todas.
Janela de busca: das 3 h antes do jogo até o fim dele. Saída: js/escalacoes.js e GET /api/escalacoes/<clube>.
"""
import calendar
import json
import os
import re
import time

P = None  # módulo placar_api

# perfis oficiais dos clubes (X, Instagram) — confira antes de ligar as chaves
PERFIS = {
    "athletico-pr": ("AthleticoPR", "athleticoparanaense"), "atletico-mg": ("Atletico", "atletico"), "bahia": ("ECBahia", "ecbahia"),
    "botafogo": ("Botafogo", "botafogo"), "bragantino": ("RedBullBraga", "redbullbragantino"), "chapecoense": ("ChapecoenseReal", "chapecoensereal"),
    "corinthians": ("Corinthians", "corinthians"), "coritiba": ("Coritiba", "coritiba"), "cruzeiro": ("Cruzeiro", "cruzeiro"),
    "flamengo": ("Flamengo", "flamengo"), "fluminense": ("FluminenseFC", "fluminensefc"), "gremio": ("Gremio", "gremio"),
    "internacional": ("SCInternacional", "scinternacional"), "mirassol": ("MirassolFC", "mirassolfc"), "palmeiras": ("Palmeiras", "palmeiras"),
    "remo": ("ClubeDoRemo", "clubedoremo"), "santos": ("SantosFC", "santosfc"), "sao-paulo": ("SaoPauloFC", "saopaulofc"),
    "vasco": ("VascodaGama", "vascodagama"), "vitoria": ("ECVitoria", "ecvitoria"),
}
TERMOS = re.compile(r"escala[cç][aã]o|escalad[oa]s?|\btime (para|de hoje)|\bonze\b|titulares|vamos com|relacionados", re.I)


def _ts(data, hora):
    try:
        return calendar.timegm(time.strptime(f"{data} {hora or '00:00'}", "%Y-%m-%d %H:%M")) + 3 * 3600  # horário de Brasília -> UTC
    except Exception:
        return None


def proximo_jogo(cid):
    """O jogo do clube que começa em até 3 h ou está em andamento (calendário do site)."""
    with P.lock:
        fm = ((P.state.get("form") or {}).get("clubs") or {}).get(cid) or {}
    agora = time.time()
    for e in fm.get("all", []):
        if e.get("state") == "in":
            return e
        if e.get("state") == "pre":
            t = _ts(e.get("date"), e.get("time"))
            if t and -3 * 3600 <= agora - t < 2.5 * 3600:  # de 3 h antes até o jogo acabar
                return e
    return None


def nomes_elenco(cid):
    """[(id, [formas do nome])]: nome no site, sobrenome e apelido curto, sem acentos, para achar no texto."""
    out = []
    for r in (P.squads_atuais().get(cid) or []):
        aid, nome = r[4], r[1]
        if not aid or not nome:
            continue
        n = P.norm_txt(nome)
        partes = n.split()
        formas = {n}
        if len(partes) > 1 and len(partes[-1]) > 3:
            formas.add(partes[-1])
        if len(partes[0]) > 3 and len(partes) <= 2:
            formas.add(partes[0])
        out.append((str(aid), sorted(formas, key=len, reverse=True)))
    return out


def xi_do_texto(texto, elenco):
    """Ids do elenco citados no texto, na ordem em que aparecem (goleiro primeiro, como os clubes publicam)."""
    t = " " + P.norm_txt(texto) + " "
    achados = []
    for aid, formas in elenco:
        pos = min((m.start() for f in formas for m in re.finditer(r"(?<![a-z])" + re.escape(f) + r"(?![a-z])", t)), default=None)
        if pos is not None:
            achados.append((pos, aid))
    # a mesma palavra (sobrenome comum) não pode valer para dois jogadores: fica o primeiro
    vistos, xi = set(), []
    for pos, aid in sorted(achados):
        if pos in vistos:
            continue
        vistos.add(pos)
        xi.append(aid)
    return xi


def da_espn(e, cid):
    try:
        d = P.get_json(f"{P.ESPN}/site/v2/sports/soccer/{e['lg']}/summary?event={e['id']}")
    except Exception as ex:
        P.log("escalações: ESPN", cid, ex)
        return None
    espn_id = str(P.CLUBS[cid]["espn"])
    for r in d.get("rosters") or []:
        if str((r.get("team") or {}).get("id")) != espn_id:
            continue
        tit = sorted([x for x in r.get("roster") or [] if x.get("starter")], key=lambda x: int(x.get("formationPlace") or 99))
        if len(tit) >= 11:
            return {"fonte": "ESPN (súmula do jogo)", "formacao": r.get("formation"), "xi": [[int(x.get("formationPlace") or 0), str(x["athlete"]["id"])] for x in tit],
                    "link": None, "hora": time.strftime("%H:%M")}
    return None


def das_redes(cid, inicio):
    x, ig = PERFIS.get(cid, (None, None))
    elenco = nomes_elenco(cid)
    posts = []
    try:
        posts += P.x_posts([x], "(escalação OR escalado OR escalados OR titulares OR relacionados)") if x else []
    except Exception as ex:
        P.log("escalações: X", cid, ex)
    try:
        posts += P.ig_posts(ig, (P.HEADLINE_NAMES.get(cid) or [cid])[0]) if ig else []
    except Exception as ex:
        P.log("escalações: Instagram", cid, ex)
    out = []
    for p in sorted(posts, key=lambda p: -p.get("ts", 0)):
        if p.get("ts", 0) < inicio or not TERMOS.search(p.get("texto", "")):
            continue
        xi = xi_do_texto(p["texto"], elenco)
        if len(xi) >= 9:
            out.append({"fonte": p.get("source"), "canal": p.get("canal"), "xi": [[i + 1, aid] for i, aid in enumerate(xi[:11])], "link": p.get("link"),
                        "hora": time.strftime("%H:%M", time.localtime(p.get("ts") or time.time()))})
    return out[:2]


def atualizar():
    """{clube: {jogo, fontes, confirmada}} dos clubes com jogo em até 3 h ou rolando; os outros guardam a última."""
    antigo = {}
    try:
        antigo = json.load(open(os.path.join(P.ROOT, "server", "cache", "escalacoes.json"), encoding="utf-8"))
    except Exception:
        pass
    out = {}
    for cid in P.CLUBS:
        e = proximo_jogo(cid)
        if not e:
            if antigo.get(cid) and time.time() - antigo[cid].get("t", 0) < 3 * 86400:
                out[cid] = antigo[cid]
            continue
        t0 = _ts(e.get("date"), e.get("time")) or time.time()
        fontes = [f for f in [da_espn(e, cid)] if f] + das_redes(cid, t0 - 3 * 3600)
        anterior = antigo.get(cid) if (antigo.get(cid) or {}).get("jogo", {}).get("id") == e.get("id") else None
        if not fontes and anterior:
            out[cid] = anterior
            continue
        out[cid] = {"t": time.time(), "jogo": {"id": e.get("id"), "data": e.get("date"), "hora": e.get("time"), "adversario": e.get("opp"), "comp": e.get("comp"), "casa": e.get("home")},
                    "fontes": fontes, "confirmada": bool(fontes), "atualizado": time.strftime("%d/%m/%Y às %H:%M")}
    os.makedirs(os.path.join(P.ROOT, "server", "cache"), exist_ok=True)
    json.dump(out, open(os.path.join(P.ROOT, "server", "cache", "escalacoes.json"), "w", encoding="utf-8"), ensure_ascii=False)
    return out


def gravar_js(d):
    P.write_js("escalacoes.js", "ESCALACOES", {"updated": time.strftime("%d/%m/%Y às %H:%M"), "clubes": d},
               "escalação anunciada para o próximo jogo (ESPN; X e Instagram oficiais dos clubes pelas APIs oficiais, quando há chave)")
