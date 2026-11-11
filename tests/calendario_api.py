"""Calendário dos clubes na API (server/placar_api.py).
- estatísticas rápidas de um jogo encerrado de verdade (resumo da ESPN): placar, gols, posse, finalizações...;
- jogos da API-Football (respostas no formato da documentação oficial): estadual entra, Série A não duplica,
  adiado/cancelado sai, pênaltis, horário a definir e o lado certo (mandante ou visitante);
- sem a chave API_FOOTBALL_KEY, nenhuma consulta à API-Football.
Uso: python -X utf8 tests/calendario_api.py"""
import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))
os.environ.pop("API_FOOTBALL_KEY", None)
import placar_api as P

falhas = []
def ok(c, m):
    print(("ok   " if c else "FALHA"), m)
    if not c:
        falhas.append(m)

# 1) jogo de verdade: o último jogo encerrado do Cruzeiro no Brasileirão (arquivo gravado pelo robô)
raw = open(os.path.join(P.ROOT, "js", "club-form.js"), encoding="utf-8").read()
form = json.loads(raw[raw.index("{"):raw.rindex("}") + 1])
jogo = [e for e in form["clubs"]["cruzeiro"]["all"] if e["state"] == "post" and e["comp"] == "Brasileirão"][-1]
s = P.match_stats(jogo["id"], "bra.1")
ok(s["state"] == "post", f"jogo {jogo['id']} encerrado")
me = "home" if jogo["home"] else "away"
ok(s[me]["club"] == "cruzeiro" and s[me]["gols"] == jogo["gf"], f"placar confere com o calendário ({s['home']['gols']} x {s['away']['gols']})")
rot = [x[0] for x in s["stats"]]
ok("Posse de bola" in rot and "Finalizações" in rot, f"estatísticas: {', '.join(rot)}")
posse = next(x for x in s["stats"] if x[0] == "Posse de bola")
ok(98 <= posse[1] + posse[2] <= 102, f"posse soma 100% ({posse[1]}% x {posse[2]}%)")
ok(len(s["gols"]) == jogo["gf"] + jogo["ga"], f"{len(s['gols'])} gols listados, placar tem {jogo['gf'] + jogo['ga']}")
ok(bool(s["estadio"]), f"estádio: {s['estadio']}")
ok(P.match_stats(jogo["id"], "bra.1") is s, "segunda consulta sai do cache")

# 2) API-Football: formato de /fixtures (documentação v3)
def fx(fid, liga, pais, casa_id, fora_id, fora_nome, data, status, gh=None, ga=None, pen=None, rodada="Regular Season - 3", estadio="Arena"):
    return {"fixture": {"id": fid, "date": data, "status": {"short": status}, "venue": {"name": estadio}},
            "league": {"name": liga, "country": pais, "round": rodada},
            "teams": {"home": {"id": casa_id, "name": "Athletico Paranaense" if casa_id == 134 else fora_nome}, "away": {"id": fora_id, "name": fora_nome if casa_id == 134 else "Athletico Paranaense"}},
            "goals": {"home": gh, "away": ga}, "score": {"penalty": {"home": pen[0], "away": pen[1]} if pen else {"home": None, "away": None}}}
T = 134
e = P.af_evento(fx(1, "Paranaense - 1", "Brazil", T, 999, "Coritiba", "2026-02-10T21:30:00-03:00", "FT", 2, 1), T)
ok(e and e["comp"] == "Paranaense" and e["res"] == "V" and e["home"] and e["gf"] == 2 and e["oppId"] == "coritiba", f"Paranaense encerrado: {e and (e['comp'], e['gf'], e['ga'], e['res'], e['oppId'])}")
e = P.af_evento(fx(2, "Paranaense - 1", "Brazil", 999, T, "Coritiba", "2026-03-01T16:00:00-03:00", "PEN", 1, 1, pen=(4, 3), rodada="Final"), T)
ok(e and not e["home"] and e["res"] == "E" and e["pen"] == [3, 4], f"final nos pênaltis, visitante: {e and (e['home'], e['pen'])}")
ok(P.af_evento(fx(3, "Serie A", "Brazil", T, 999, "Flamengo", "2026-05-01T16:00:00-03:00", "FT", 0, 0), T) is None, "Série A (já vem da ESPN) não duplica")
ok(P.af_evento(fx(4, "Paranaense - 1", "Brazil", T, 999, "Londrina", "2026-02-20T16:00:00-03:00", "PST"), T) is None, "jogo adiado sai")
e = P.af_evento(fx(5, "Copa do Nordeste", "Brazil", T, 999, "Sport", "2026-12-20T00:00:00-03:00", "TBD"), T)
ok(e and e["comp"] == "Copa do Nordeste" and e["state"] == "pre" and e["time"] is None, "Copa do Nordeste futura, horário a definir")
e = P.af_evento(fx(6, "Premier League", "England", T, 999, "X", "2026-02-20T16:00:00-03:00", "NS"), T)
ok(e is None, "competição estrangeira desconhecida não entra")
e = P.af_evento(fx(7, "Paranaense - 1", "Brazil", T, 999, "<script>x", "2026-02-20T16:00:00-03:00", "1H", 0, 0), T)
ok(e and "<" not in e["opp"] and e["state"] == "in", "nome com marcação é limpo; jogo rolando = ao vivo")

# 3) sem chave: nada é consultado
chamou = []
P.get = lambda *a, **k: chamou.append(a) or b"{}"
ok(P.af_extra("athletico-pr") == [] and not chamou, "sem API_FOOTBALL_KEY: nenhuma consulta à API-Football")

print("\nOK" if not falhas else f"\n{len(falhas)} falha(s)")
sys.exit(1 if falhas else 0)
