# © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE).
"""PLACAR — Séries C e D do Brasileirão pela Wikipédia (a ESPN não cobre essas duas em 2026).

Lê, pela API oficial do MediaWiki (pt.wikipedia.org/w/api.php), o artigo da temporada e tira dele:
- participantes (clube, cidade, estado);
- a classificação de cada grupo/fase (Pos, Pts, J, V, E, D, GP, GC, SG);
- os resultados da tabela de confrontos (mandante x visitante), quando o artigo tem;
- a artilharia.
Textos da Wikipédia são CC BY-SA 4.0: o site mostra a fonte com link para o artigo. Placar ao vivo não vem daqui
(o artigo é editado por voluntários depois dos jogos); com a chave API_FOOTBALL_KEY, os jogos vêm da API-Football.
"""
import html
import json
import re
import urllib.parse

P = None  # módulo placar_api

API = "https://pt.wikipedia.org/w/api.php"


def artigo(titulo):
    u = API + "?" + urllib.parse.urlencode({"action": "parse", "page": titulo, "prop": "text", "format": "json", "formatversion": 2, "redirects": 1})
    return json.loads(P.get(u))["parse"]["text"]


def _txt(x):
    x = re.sub(r"<style.*?</style>|<sup.*?</sup>|<span class=\"navbar.*?</span></div>", "", x, flags=re.S)
    x = re.sub(r"<br\s*/?>", " ", x)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", x))).strip()


def _int(x):
    m = re.search(r"[−-]?\d+", (x or "").replace("−", "-"))
    return int(m.group(0).replace("−", "-")) if m else None


def tabelas(h):
    """[(título da seção, [linhas de células]), ...] de cada tabela "wikitable"."""
    out = []
    for m in re.finditer(r'<table class="wikitable[^"]*"[^>]*>(.*?)</table>', h, re.S):
        antes = h[:m.start()]
        tit = re.findall(r'<h[234][^>]*>(.*?)</h[234]>', antes, re.S)
        sec = _txt(tit[-1]) if tit else ""
        linhas = []
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", m.group(1), re.S):
            cel = re.findall(r"<t([hd])([^>]*)>(.*?)</t[hd]>", tr, re.S)
            linhas.append([(k, attrs, c) for k, attrs, c in cel])
        out.append((sec, linhas))
    return out


def _clube(c):
    """Nome do clube na célula (texto do último link para artigo; sem bandeira)."""
    links = re.findall(r'<a href="/wiki/([^"#]+)"[^>]*>(.*?)</a>', c, re.S)
    links = [(a, _txt(b)) for a, b in links if not a.startswith(("Ficheiro:", "Arquivo:", "File:")) and _txt(b)]
    if links:
        return links[-1][1], urllib.parse.unquote(links[-1][0]).replace("_", " ")
    return _txt(c), None


def extrair(h):
    tabs = tabelas(h)
    participantes, grupos, jogos, artilharia = [], [], [], []
    vistos = set()
    for sec, linhas in tabs:
        if not linhas:
            continue
        cab = [_txt(c) for _, _, c in linhas[0]]
        cab0 = [re.sub(r"vde$", "", x) for x in cab]
        if cab0[:3] == ["Equipe", "Cidade", "Estado"]:
            for l in linhas[1:]:
                if len(l) >= 3:
                    nome, art = _clube(l[0][2])
                    participantes.append({"nome": nome, "artigo": art, "cidade": _txt(l[1][2]), "uf": _txt(l[2][2])[-2:]})
        elif cab0[:3] == ["Pos", "Equipe", "Pts"] and sec != "Classificação geral":
            tab = []
            for l in linhas[1:]:
                v = [_txt(c) for _, _, c in l]
                if len(v) < 10 or _int(v[0]) is None:
                    continue
                nome, art = _clube(l[1][2])
                tab.append({"pos": _int(v[0]), "nome": re.sub(r"\s*\((C|A|R|Q|E)\)$", "", nome), "artigo": art, "p": _int(v[2]) or 0, "j": _int(v[3]) or 0,
                            "v": _int(v[4]) or 0, "e": _int(v[5]) or 0, "d": _int(v[6]) or 0, "gp": _int(v[7]) or 0, "gc": _int(v[8]) or 0,
                            "nota": v[10] if len(v) > 10 else ""})
            if tab:
                nome = sec if sec not in vistos else f"{sec} ({len(grupos) + 1})"
                vistos.add(nome)
                grupos.append({"nome": nome, "linhas": tab})
        elif cab0 and cab0[0].startswith("Mandante"):
            sig = cab0[1:]
            for l in linhas[1:]:
                if len(l) < 2:
                    continue
                casa, _ = _clube(l[0][2])
                for i, (_, _, c) in enumerate(l[1:]):
                    t = _txt(c)
                    m = re.match(r"^(\d+)\s*[–-]\s*(\d+)$", t)
                    if m and i < len(sig):
                        jogos.append({"casa": casa, "foraSigla": sig[i], "gc": int(m.group(1)), "gf": int(m.group(2))})
        elif cab0 and cab0[0].startswith("Gols") and len(cab0) >= 3 and cab0[1] == "Jogador":
            gols = None
            for l in linhas[1:]:
                v = [_txt(c) for _, _, c in l]
                if len(v) == 3:
                    gols = _int(v[0]); jog, eq = v[1], l[2][2]
                elif len(v) == 2 and gols is not None:
                    jog, eq = v[0], l[1][2]
                else:
                    continue
                artilharia.append({"gols": gols, "nome": jog, "time": _clube(eq)[0]})
    return {"participantes": participantes, "grupos": grupos, "confrontos": jogos, "artilharia": artilharia}


def serie(titulo):
    h = artigo(titulo)
    d = extrair(h)
    d["fonte"] = {"nome": "Wikipédia", "url": "https://pt.wikipedia.org/wiki/" + urllib.parse.quote(titulo.replace(" ", "_")), "licenca": "CC BY-SA 4.0"}
    return d
