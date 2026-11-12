"""Janela de transferências na API (server/mercado.py), sem rede.
- valor estimado: auge entre 24 e 27 anos, atacante vale mais que goleiro, liga e força do time pesam, nunca zero;
- salário estimado: proporcional ao valor, com piso;
- emprestados pela Wikipédia em inglês: "Out on loan" (destino e data) e "on loan from" no elenco;
- mercado global compacto: campos na ordem, país uma vez só;
- rotas /api/mercado/<clube> (clube desconhecido = 404) e /api/mercado-global.
Uso: python -X utf8 tests/mercado_api.py"""
import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))
import placar_api as P
M = P.MERC

falhas = []
def ok(c, m):
    print(("ok   " if c else "FALHA"), m)
    if not c:
        falhas.append(m)

v = lambda idade, pos="A", peso=1.0, forca=1.0, papel=1.0: M.valor_estimado(idade, pos, peso, forca, papel)
ok(v(25) > v(20) > v(17) and v(25) > v(31) > v(35), f"idade: auge aos 25 ({v(17):.0f} < {v(20):.0f} < {v(25):.0f} > {v(31):.0f} > {v(35):.0f})")
ok(v(25, "A") > v(25, "M") > v(25, "D") > v(25, "G"), "posição: atacante > meia > defensor > goleiro")
ok(v(25, peso=1.0) > v(25, peso=0.22) > v(25, peso=0.05), "liga: Premier > Brasileirão > Série B")
ok(v(25, forca=1.6) > v(25, forca=0.7) and v(25, papel=1.4) > v(25, papel=0.25), "força do time e minutos jogados pesam")
ok(min(v(i, p, 0.05, 0.7, 0.25) for i in range(15, 45) for p in "GDMA") >= 25000, "valor nunca abaixo de € 25 mil")
ok(M.salario_mensal_brl(10e6, 0.22) > M.salario_mensal_brl(1e6, 0.22) and M.salario_mensal_brl(1, 0.22) == 15000, "salário proporcional ao valor, com piso de R$ 15 mil")

wiki = """==Players==
===Current squad===
{{Fs start}}
{{Fs player|no=1|nat=Brazil|pos=GK|name=[[Fulano Goleiro|Fulano]]}}
{{Fs player|no=9|nat=Argentina|pos=FW|name=[[Ciclano Pérez]]|other=on loan from [[Club Atlético River Plate|River Plate]] until 31 December 2026}}
{{Fs end}}
===Out on loan===
{{Fs start}}
{{Fs player|no=|nat=Brazil|pos=MF|name=[[Beltrano (footballer, born 2004)|Beltrano]]|other=at [[Mirassol Futebol Clube|Mirassol]] until 30 June 2027}}
{{Fs end}}
===Notable players==="""
orig_get, orig_art = P.get_json, M.artigo_en
P.get_json = lambda url: {"parse": {"wikitext": wiki}}
M.artigo_en = lambda cid: "Clube Teste"
e = M.emprestimos("cruzeiro")
P.get_json, M.artigo_en = orig_get, orig_art
ok(e["fora"] == [{"nome": "Beltrano", "pos": "M", "nac": "Brazil", "clube": "Mirassol", "ate": "2027-06-30"}], f"emprestado fora: destino e data ({e['fora']})")
ok(len(e["dentro"]) == 1 and e["dentro"][0]["nome"] == "Ciclano Pérez" and e["dentro"][0]["de"] == "River Plate" and e["dentro"][0]["ate"] == "2026-12-31", f"chegou emprestado: de onde e até quando ({e['dentro']})")
ok(e["fonte"] == "https://en.wikipedia.org/wiki/Clube_Teste", "link do artigo como fonte")

cache = {"updated": "x", "times": {"1": {"lg": "eng.1", "nome": "Time A", "logo": None, "forca": 1, "t": 0, "jogadores": [["10", "Jogador", 25, "A", "bra", "Brazil", "1", 9, 1000000, 0]]}}}
c = M.global_compacto(cache)
ok(c["campos"][:4] == ["id", "nome", "idade", "pos"] and c["jogadores"][0][5] == "" and c["paises"] == {"bra": "Brazil"} and c["ligas"]["eng.1"][2] == 1.0, "mercado global compacto: país uma vez só e peso das ligas")

class Fake:
    client_address = ("127.0.0.1", 0); headers = {}
    def __init__(self, path): self.path = path
    def guard(self): return True
    def send_json(self, o, code=200): self.r = (code, o)
    def static_ok(self, p): return False
    def send_error(self, c): self.r = (c, None)
f = Fake("/api/mercado/nao-existe"); P.Handler.do_GET(f)
ok(f.r[0] == 404, "rota: clube desconhecido = 404")
P.state["mercado"] = {"cruzeiro": {"clube": "cruzeiro", "elenco": []}}
f = Fake("/api/mercado/cruzeiro"); P.Handler.do_GET(f)
ok(f.r[0] == 200 and f.r[1]["clube"] == "cruzeiro", "rota: /api/mercado/cruzeiro")
f = Fake("/api/mercado-global"); P.Handler.do_GET(f)
ok(f.r[0] == 503, "rota: mercado global ainda carregando = 503")

print("\nOK" if not falhas else f"\n{len(falhas)} falha(s)")
sys.exit(1 if falhas else 0)
