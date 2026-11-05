"""Auditoria de coerência dos dados do site (sem internet): confere se o que o site mostra fecha entre si.
Tabela (pontos, jogos, saldo, ordem), rodadas (clube jogando duas vezes, placar de jogo encerrado),
listas do elenco (só quem está no clube; reserva é reserva de verdade), departamento médico, artilharia,
arbitragem, manchetes e retrospecto.
Uso: python -X utf8 tests/auditoria.py"""
import json
import os
import re
import sys
import time

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


def load(name):
    s = open(os.path.join(ROOT, "js", name), encoding="utf-8").read()
    return json.loads(s[s.index("{"):s.rindex("}") + 1])


L, P, F, DM = load("live-data.js"), load("player-stats.js"), load("club-form.js"), load("departamento-medico.js")
src = open(os.path.join(ROOT, "js", "squads.js"), encoding="utf-8").read()
SQ = json.loads(src[src.index("window.SQUADS = ") + 16:src.index("window.SQUADS_LAST")].strip().rstrip(";"))
try:
    MATCHES = json.load(open(os.path.join(ROOT, "server", "cache", "partidas.json"), encoding="utf-8"))
except Exception:
    MATCHES = {}
CFG = json.load(open(os.path.join(ROOT, "server", "config.json"), encoding="utf-8"))
ESPN = {k: str(v["espn"]) for k, v in CFG["clubes"].items()}
CLUBS = set(CFG["clubes"])
erros, avisos, checks = [], [], 0


def check(ok, msg, aviso=False):
    global checks
    checks += 1
    if not ok:
        (avisos if aviso else erros).append(msg)


# ---- tabela
T = L["standings"]
check(len(T) == 20 and {r[0] for r in T} == CLUBS, "tabela não tem os 20 clubes")
for r in T:
    cid, pts, j, v, e, d, gp, gc, *_ = r
    check(j == v + e + d, f"tabela {cid}: jogos ({j}) ≠ V+E+D ({v + e + d})")
    check(pts == 3 * v + e, f"tabela {cid}: pontos ({pts}) ≠ 3V+E ({3 * v + e})")
    check(gp >= 0 and gc >= 0, f"tabela {cid}: gols negativos")
key = lambda r: (r[1], r[3], r[6] - r[7], r[6])
check(all(key(T[i]) >= key(T[i + 1]) for i in range(len(T) - 1)), "tabela fora de ordem (pontos, vitórias, saldo, gols)")

# ---- rodadas
for rnd, games in L["fixtures"].items():
    vistos = {}
    for g in games:
        h, a = g[0], g[1]
        check(h in CLUBS and a in CLUBS and h != a, f"rodada {rnd}: jogo inválido {h} x {a}")
        adiado = len(g) > 9 and g[9] == "adiado"   # jogo de rodada anterior remarcado: o site mostra "adiado"
        for c in (h, a):
            check(adiado or c not in vistos, f"rodada {rnd}: {c} joga duas vezes")
            if not adiado:
                vistos[c] = 1
        st = (g[8] or {}).get("state") if len(g) > 8 and isinstance(g[8], dict) else None
        if st == "post":
            check(g[2] is not None and g[3] is not None, f"rodada {rnd}: {h} x {a} encerrado sem placar")
            gols = (g[8] or {}).get("gols")
            if gols is not None:
                ph = sum(1 for x in gols if x[2] == h)   # a súmula credita o gol (inclusive o contra) ao time beneficiado
                check(ph == g[2] and len(gols) == g[2] + g[3], f"rodada {rnd}: {h} {g[2]}x{g[3]} {a} não bate com os gols da súmula ({len(gols)})", aviso=True)

# ---- elenco: listas só com quem está no clube
def club_games(cid):
    e = ESPN[cid]
    return sorted((m["date"], {r[0] for r in m["teams"].get(e, [])}) for m in MATCHES.values() if e in m.get("teams", {}))


for cid, c in P["clubs"].items():
    ids = {r[4] for r in SQ.get(cid, [])}
    rec = set().union(*[ps for _, ps in club_games(cid)[-3:]]) if MATCHES else set()
    for k in ("reservas", "pendurados", "sequencia"):
        for x in c.get(k, []):
            check(x["id"] in ids or x["id"] in rec, f"{cid} · {k}: {x['name']} não está mais no clube")
    for x in c.get("reservas", []):
        check(x["jogos"] - x["titular"] >= x["titular"], f"{cid} · reservas: {x['name']} foi mais titular ({x['titular']}) que reserva ({x['jogos'] - x['titular']})")
    for x in c.get("sequencia", []):
        check(x["titular"] <= x["jogos"], f"{cid} · sequência: {x['name']} titular em mais jogos do que jogou")
    for x in c.get("pendurados", []):
        if x.get("amarelos") is not None:
            check(x["amarelos"] % 3 == 2, f"{cid} · pendurados: {x['name']} com {x['amarelos']} amarelos não está pendurado", aviso=bool(x.get("so_imprensa")))

# ---- departamento médico
for cid, c in DM["clubs"].items():
    ids = {r[4] for r in SQ.get(cid, [])}
    for x in c["ativos"]:
        check(x["status"] in ("lesionado", "dúvida", "em transição", "longo prazo", "fora da temporada"), f"DM {cid}: situação estranha {x['status']}")
        check(x["id"] in ids or x.get("base") or str(x["id"]).isdigit(), f"DM {cid}: {x['name']} não é do elenco")
        check(not x.get("ultimoJogo") or x["ultimoJogo"] <= x["atualizado"], f"DM {cid}: {x['name']} jogou depois da última notícia de lesão")
        check(bool(x["noticias"]), f"DM {cid}: {x['name']} sem nenhuma notícia")
        check(all(n["link"].startswith("https://") for n in x["noticias"]), f"DM {cid}: {x['name']} com link sem https")
    nomes = [x["id"] for x in c["ativos"]]
    check(len(nomes) == len(set(nomes)), f"DM {cid}: jogador repetido")

# ---- artilharia
art = L["scorers"]
check(all(art[i][2] >= art[i + 1][2] for i in range(len(art) - 1)), "artilharia fora de ordem")
for cid, lst in P.get("artilhariaClubes", {}).items():
    check(all(lst[i]["golsClube"] >= lst[i + 1]["golsClube"] for i in range(len(lst) - 1)), f"artilheiros do {cid} fora de ordem")
    for x in lst:
        check(x["golsClube"] <= max(x["gols"], x["golsSumulas"]), f"artilheiros do {cid}: {x['name']} com mais gols pelo clube que no total")

# ---- arbitragem: só jogos que ainda vão acontecer
hoje = time.strftime("%Y-%m-%d")
for j in (L.get("arbitragem") or {}).get("jogos", {}).values() if isinstance((L.get("arbitragem") or {}).get("jogos"), dict) else (L.get("arbitragem") or {}).get("jogos", []):
    d = j.get("data") or j.get("date") or ""
    check(not d or d >= time.strftime("%Y-%m-%d", time.localtime(time.time() - 86400)), f"arbitragem de jogo que já passou ({d})", aviso=True)

# ---- manchetes e notícias
for x in (L.get("manchetes") or {}).get("items", []):
    check(x["link"].startswith("https://") and not re.search(r"[<>]", x["title"]), f"manchete com link ou título inválido: {x['title'][:50]}")
for cid, items in (L.get("news") or {}).items():
    for x in items:
        check(x["link"].startswith("https://"), f"notícia do {cid} com link sem https")

# ---- retrospecto
for cid, c in F["clubs"].items():
    for e in c.get("last", []):
        check(e.get("res") in ("V", "E", "D") and e.get("gf") is not None, f"retrospecto {cid}: resultado inválido em {e.get('date')}")
        if e.get("gf") is not None:
            r = "V" if e["gf"] > e["ga"] else "E" if e["gf"] == e["ga"] else "D"
            check(r == e["res"], f"retrospecto {cid}: {e['gf']}x{e['ga']} marcado como {e['res']}")
    check(all(a["date"] <= b["date"] for a, b in zip(c.get("next", []), c.get("next", [])[1:])), f"retrospecto {cid}: próximos jogos fora de ordem")
    check(all(e["date"] >= hoje for e in c.get("next", []) if e.get("state") == "pre"), f"retrospecto {cid}: jogo 'próximo' com data passada", aviso=True)

print(f"{checks} conferências · {len(erros)} erro(s) · {len(avisos)} aviso(s)")
for x in erros:
    print("ERRO  ", x)
for x in avisos:
    print("aviso ", x)
sys.exit(1 if erros else 0)
