"""Competições na API (server/competicoes.py), com jogos simulados.
- nomes das fases em português (inclusive taças dos estaduais: "taca-rio---final" -> "Taça Rio · final");
- fase de pontos corridos x mata-mata decidido pelos próprios jogos (cada clube joga no máximo 2 vezes no mata-mata);
- chave: ida e volta somadas, pênaltis decidem o empate;
- classificação: 3 pontos por vitória, desempate por vitórias, saldo e gols pró, cartões contados;
- campeão só pela fase "Final" (finais de taças secundárias não coroam ninguém);
- rota /api/competicao/<id>: competição desconhecida = 404.
Uso: python -X utf8 tests/competicoes_api.py"""
import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))
import placar_api as P
C = P.COMP

falhas = []
def ok(c, m):
    print(("ok   " if c else "FALHA"), m)
    if not c:
        falhas.append(m)

ok(C.fase_pt("round-of-16") == "Oitavas de final" and C.fase_pt("quarterfinals") == "Quartas de final" and C.fase_pt("final") == "Final", "fases das copas em português")
ok(C.fase_pt("taca-rio---final") == "Taça Rio · final" and C.fase_pt("trofeu-inconfidencia---finals") == "Troféu Inconfidência · final", "taças e troféus dos estaduais")
ok(C.fase_pt("league-phase") == "Primeira fase" and C.fase_pt("group-stage") == "Fase de grupos", "fases de pontos corridos")
ok(C.nome_grupo("2026 Campeonato Gaúcho - Group") == "Primeira fase" and C.nome_grupo("Relegation Group") == "Grupo do rebaixamento" and C.nome_grupo("Group A") == "Grupo A", "nomes de grupos limpos")

def T(i, nome, gols=None, pen=None, venceu=False):
    return {"id": str(i), "clube": None, "nome": nome, "abrev": nome[:3], "logo": None, "gols": gols, "pen": pen, "venceu": venceu}
def J(i, data, fase, a, b, est="post", grupo=None, lances=()):
    return {"id": str(i), "lg": "x", "data": data, "hora": "20:00", "estado": est, "relogio": None, "fase": fase, "faseNome": C.fase_pt(fase), "mata": C.eh_mata(fase),
            "grupo": grupo, "local": None, "cidade": None, "casa": a, "fora": b, "lances": list(lances)}

# fase de grupos (todos contra todos) + semifinal ida e volta (pênaltis) + final
jogos = [J(1, "2026-04-01", "first-round", T(1, "Alfa", 2), T(2, "Beta", 0), lances=[{"t": "amarelo", "time": "2", "min": "10'", "nome": "x", "atleta": ""}]),
         J(2, "2026-04-02", "first-round", T(3, "Gama", 1), T(4, "Delta", 1)),
         J(3, "2026-04-08", "first-round", T(1, "Alfa", 1), T(3, "Gama", 1)),
         J(4, "2026-04-09", "first-round", T(2, "Beta", 3), T(4, "Delta", 0)),
         J(5, "2026-04-15", "first-round", T(4, "Delta", 0), T(1, "Alfa", 2)),
         J(6, "2026-04-16", "first-round", T(2, "Beta", 1), T(3, "Gama", 2)),
         J(7, "2026-05-01", "semifinals", T(1, "Alfa", 1), T(2, "Beta", 0)),
         J(8, "2026-05-08", "semifinals", T(2, "Beta", 1, 4), T(1, "Alfa", 0, 3)),
         J(9, "2026-05-02", "semifinals", T(3, "Gama", 2), T(4, "Delta", 0)),
         J(10, "2026-05-09", "semifinals", T(4, "Delta", 0), T(3, "Gama", 0)),
         J(11, "2026-05-20", "final", T(2, "Beta", 1, venceu=True), T(3, "Gama", 0))]
tab = C.classificar([j for j in jogos if j["fase"] == "first-round"])
ok([r["nome"] for r in tab] == ["Alfa", "Gama", "Beta", "Delta"] and tab[0]["p"] == 7, f"classificação: {[(r['nome'], r['p']) for r in tab]}")
ok(next(r for r in tab if r["nome"] == "Beta")["ca"] == 1, "cartões contados por clube")
fases = [{"rotulo": "1ª fase"}, {"rotulo": "Semifinal"}, {"rotulo": "Final"}]
ch = C.chave(jogos, fases)
semi = next(c for c in ch if c["fase"] == "Semifinal")["confrontos"]
ab = next(x for x in semi if {x["a"]["nome"], x["b"]["nome"]} == {"Alfa", "Beta"})
ok(ab["ga"] == 1 and ab["gb"] == 1 and ab["pen"] and ab["vencedor"] == "2", f"semifinal ida e volta 1 x 1 no placar somado, Beta nos pênaltis ({ab['pen']})")
gd = next(x for x in semi if {x["a"]["nome"], x["b"]["nome"]} == {"Gama", "Delta"})
ok(gd["vencedor"] == "3" and gd["pernas"] == 2, "semifinal decidida no placar somado")

# montar com os jogos simulados (sem rede)
C.jogos_temporada = lambda cid, lg: (json.loads(json.dumps(jogos)), [])
C.tabelas = lambda lg, js: []
C.noticias = lambda nome: []
C.escudos = lambda d: None  # sem rede: escudos do Wikidata ficam de fora do teste
d = C.montar("paulistao")
ok(d["encerrado"] and d["campeao"] and d["campeao"]["nome"] == "Beta", f"competição encerrada, campeão pela Final: {d['campeao']}")
ok(not any(c["fase"] == "1ª fase" for c in d["chave"]), "fase de pontos corridos fora do mata-mata (cada clube joga 3 vezes nela)")
ok([f["rotulo"] for f in d["fases"]] == ["1ª fase", "Semifinal", "Final"] and not d["fases"][0]["mata"] and d["fases"][1]["idaVolta"], "fases na ordem, com pontos corridos x ida e volta")
jogos2 = json.loads(json.dumps(jogos))
jogos2[-1]["fase"] = "taca-rio---final"
C.jogos_temporada = lambda cid, lg: (jogos2, [])
ok(C.montar("carioca")["campeao"] is None, "final de taça secundária não coroa campeão")

# Séries B, C e D
ok(C.fase_pt("2026-brasileiro-serie-b") == "Pontos corridos", "fase das séries: pontos corridos")
js = [J(20 + i, f"2026-0{3 + i // 2}-1{i % 2}", "2026-brasileiro-serie-b", T(1 + i % 2, "Alfa" if i % 2 == 0 else "Beta", 1), T(3 + i % 2, "Gama" if i % 2 == 0 else "Delta", 0)) for i in range(4)]
C.rodadas(js)
ok([j["rodada"] for j in js] == [1, 1, 2, 2], f"rodada de cada jogo pela ordem dos jogos de cada clube: {[j['rodada'] for j in js]}")
W = P.WIKI
html = """<h2 id="Participantes">Participantes</h2><table class="wikitable"><tr><th>Equipe</th><th>Cidade</th><th>Estado</th></tr>
<tr><td><a href="/wiki/Ficheiro:Flag.svg">x</a> <a href="/wiki/Alfa_Futebol_Clube">Alfa</a></td><td>Natal</td><td>RN</td></tr></table>
<h3>Grupo A</h3><table class="wikitable"><tr><th>Pos</th><th>Equipe</th><th>Pts</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>Classificação</th></tr>
<tr><th>1</th><td><a href="/wiki/Alfa_Futebol_Clube">Alfa</a> (A)</td><td>7</td><td>3</td><td>2</td><td>1</td><td>0</td><td>5</td><td>1</td><td>+4</td><td>Próxima fase</td></tr></table>
<table class="wikitable"><tr><th>Gols</th><th>Jogador</th><th>Equipe</th></tr><tr><td>4</td><td>Fulano</td><td><a href="/wiki/Alfa_Futebol_Clube">Alfa</a></td></tr></table>"""
w = W.extrair(html)
ok(w["participantes"] == [{"nome": "Alfa", "artigo": "Alfa Futebol Clube", "cidade": "Natal", "uf": "RN"}], f"Wikipédia: participantes ({w['participantes']})")
g = w["grupos"][0]
ok(g["nome"] == "Grupo A" and g["linhas"][0]["nome"] == "Alfa" and g["linhas"][0]["p"] == 7 and g["linhas"][0]["gp"] == 5, f"Wikipédia: classificação do grupo ({g})")
ok(w["artilharia"] == [{"gols": 4, "nome": "Fulano", "time": "Alfa"}], f"Wikipédia: artilharia ({w['artilharia']})")
E = P.ESC
u = E.thumb("ABC FC (E) - RN.svg")
ok(u.startswith("https://upload.wikimedia.org/wikipedia/commons/thumb/") and "/120px-" in u and u.endswith(".svg.png"), f"escudo do Commons em miniatura padrão de 120 px ({u})")

# rota da API
class Fake:
    path = "/api/competicao/nao-existe"; client_address = ("127.0.0.1", 0); headers = {}
    def guard(self): return True
    def send_json(self, o, code=200): self.r = (code, o)
    def static_ok(self, p): return False
    def send_error(self, c): self.r = (c, None)
f = Fake()
P.Handler.do_GET(f)
ok(f.r[0] == 404, "rota: competição desconhecida = 404")

print("\nOK" if not falhas else f"\n{len(falhas)} falha(s)")
sys.exit(1 if falhas else 0)
