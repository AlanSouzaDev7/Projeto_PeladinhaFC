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

# posições em português a partir da sigla da ESPN (com a formação)
ok(P.pos_pt("4-2-3-1", "AM") == "MEI" and P.pos_pt("4-2-3-1", "AM-R") == "PD" and P.pos_pt("4-2-3-1", "RM") == "VOL" and P.pos_pt("4-4-2", "RM") == "MD"
   and P.pos_pt("3-5-2", "LM") == "ALE" and P.pos_pt("4-3-3", "LB") == "LE" and P.pos_pt("3-4-3", "RB") == "ALD" and P.pos_pt("4-2-3-1", "F") == "CA" and P.pos_pt("4-4-2", "G") == "GOL",
   "posições: MEI, PD, VOL (4-2-3-1), MD (4-4-2), alas no 3-5-2, CA, GOL")
m = {"1": {"teams": {"t": [["9", "Fulano", True, 90, 0, 0, 1, 0, 2, 1, 0, ["4-2-3-1", 10, "AM"]], ["9", "Fulano", True, 60, 0, 0, 0, 1, 1, 0, 0, ["4-2-3-1", 7, "AM-R"]]]}, "v": 3},
     "2": {"teams": {"t": [["9", "Fulano", False, 30, 0, 0, 0, 0, 0, 0, 0, ["4-2-3-1", 10, "AM"]]]}, "v": 3}}
pp = P.position_profiles(m)["9"]
ok(pp["f"] == "MEI" and pp["s"]["MEI"] == [2, 120, 1, 0, 1] and pp["s"]["PD"] == [1, 60, 0, 1, 1], f"histórico por posição: jogos, minutos, gols, assistências, titular ({pp['s']})")

# finanças: número da manchete, de quem é, que tipo
F = P.FIN
ok(F.valor_reais("folha de R$ 32,5 milhões por mês") == 32.5e6 and F.valor_reais("R$ 1,2 bilhão") == 1.2e9 and F.valor_reais("sem número") is None, "valor em reais lido da manchete")
ok(F.classifica("Cruzeiro tem folha salarial de R$ 30 milhões por mês") == "folha" and F.classifica("Galo terá orçamento de R$ 80 milhões para reforços") == "orcamento", "tipo do número: folha ou orçamento")
t = "Atlético gasta R$ 27 milhões por mês com salários, mas Cruzeiro tem folha ainda maior"
ok(not F.numero_do_clube("cruzeiro", t) and F.numero_do_clube("cruzeiro", "Cruzeiro tem folha de R$ 30 milhões por mês"), "o número só é do clube citado antes dele (o Cruzeiro, na manchete do Atlético, não)")
ok(not F.cita_clube("cruzeiro", "Motorista de caminhão em Cruzeiro, SP: R$ 2.933"), "manchete sem futebol (cidade de Cruzeiro) não conta")
d = F.do_clube("chapecoense")
ok(d["folha"]["valor"] > 0 and d["orcamento"]["valor"] == round(d["folha"]["valor"] * 2 / 1e5) * 1e5 or d["orcamento"]["tipo"] == "noticia", "sem notícia: caixa estimado em duas folhas")

# salário: veterano titular ganha mais que garoto sem minutos, mesmo valendo menos
ok(M.peso_salario(37, 0.8, 0.1) > M.peso_salario(18, 0.0, 0.3), "peso na folha: veterano titular > garoto da base")
# situação: titular só com fontes concordando
s1 = P.FE.situacao([True] * 5, True, ["Cruzeiro escalado com Otávio Costa no gol"], "Otávio Costa")
s2 = P.FE.situacao([False, None, None, False, None], False, [], "Fulano")
ok(s1["st"] == "titular" and s1["conf"] == 3 and s2["st"] == "reserva", f"situação: titular com 3 fontes ({s1['fontes']}); reserva ({s2['st']})")
ok(P.FE.mesmo_nome("Fabrício Bruno", "Fabrício Bruno Soares de Faria") and not P.FE.mesmo_nome("Wesley", "Wesley Ribeiro Silva") is None and not P.FE.mesmo_nome("Lucas Silva", "Lucas Romero"), "nomes: completo bate, outro jogador não")

# notas por jogo (critérios do Placar.TV)
J = P.JOG
base = {"min": 90, "g": 0, "a": 0, "ch": 0, "alvo": 0, "dribles": 0, "cruz": 0, "toques": 0, "desarmes": 0, "intercept": 0, "cortes": 0, "aereos": 0, "defesas": 0, "perdas": 0, "ca": 0, "cv": 0, "gf": 1, "ga": 1}
ok(J.nota_jogo(base, "M") == 6.0 and J.nota_jogo({**base, "min": 8}, "M") is None, "nota: 6,0 sem nada de mais; menos de 10 min, sem nota")
hat = J.nota_jogo({**base, "g": 3, "alvo": 4, "ch": 5, "gf": 3, "ga": 0}, "A")
ok(9.0 <= hat <= 10.0, f"três gols numa vitória: nota alta ({hat})")
gol, frango = J.nota_jogo({**base, "ga": 0, "gf": 1, "defesas": 6}, "G"), J.nota_jogo({**base, "ga": 4, "gf": 0, "perdas": 2}, "G")
ok(gol > 7.5 and frango < 5.5, f"goleiro: sem sofrer gol com 6 defesas ({gol}) x 4 gols sofridos na derrota ({frango})")
ok(J.nota_jogo({**base, "cv": 1, "gf": 0}, "D") < 5.0 and J.nota_jogo({**base, "g": 9, "alvo": 9, "ch": 9}, "A") == 10.0, "vermelho derruba; nota nunca passa de 10")
jg = {"1": {"jogos": [["e1", 90, 7.5, 2, 0]]}, "2": {"jogos": [["e1", 30, 6.5, 2, 0]]}, "3": {"jogos": [["e1", 5, None, 2, 0]]}}
nt = J.notas_time(jg, ["eid", "min", "nota", "gf", "ga"])
ok(nt["e1"][0] == round(7.25 + 0.3, 1) and nt["e1"][1] == "1", f"nota do time: média pelos minutos + vitória, melhor em campo ({nt})")
# escalação na publicação do clube
el = [("1", ["cassio"]), ("2", ["fagner"]), ("3", ["fabricio bruno", "bruno"]), ("4", ["jonathan jesus", "jesus"]), ("5", ["kaio jorge", "jorge"])]
ok(P.ESCL.xi_do_texto("ESCALADO! 🦊 Cássio; Fagner, Fabrício Bruno e Jonathan Jesus. Vamos!", el) == ["1", "2", "3", "4"], "publicação do clube: jogadores achados na ordem do texto")
ok(P.ESCL.xi_do_texto("Kaio Jorge está fora", el) == ["5"], "sobrenome não conta duas vezes (Jorge = Kaio Jorge)")
f = Fake("/api/escalacoes/nao-existe"); P.Handler.do_GET(f)
ok(f.r[0] == 404, "rota: escalações de clube desconhecido = 404")
f = Fake("/api/escalacoes/cruzeiro"); P.Handler.do_GET(f)
ok(f.r[0] == 200 and "confirmada" in f.r[1], "rota: /api/escalacoes/cruzeiro")

# fotos privadas do Flickr (sem chave de verdade: a API é simulada)
_fl, _rr, _get = P.JOG._flickr, P.JOG.recorte_rosto, P.get
os.environ["FLICKR_API_KEY"] = "teste"
fotos_fake = [
    {"id": "1", "owner": "a@N0", "ownername": "Fã", "title": "Kaio Jorge comemora", "tags": "palmeiras", "url_c": "https://live.staticflickr.com/1/1_c.jpg", "datetaken": "2026-03-01"},
    {"id": "2", "owner": "b@N0", "ownername": "Torcedor", "title": "Cruzeiro x Bahia", "tags": "kaiojorge kaio jorge", "url_c": "https://live.staticflickr.com/2/2_c.jpg", "datetaken": "2026-05-01"},
    {"id": "3", "owner": "c@N0", "ownername": "Outro", "title": "Kaio Jorge Cruzeiro", "tags": "", "url_c": "https://exemplo.com/3.jpg", "datetaken": "2026-05-01"},
]
P.JOG._flickr = lambda metodo, **q: {"photos": {"photo": fotos_fake}}
P.JOG.recorte_rosto = lambda dados: [0.2, 0.1, 0.3, 0.4]
P.get = lambda url, **k: b""
try:
    r = P.FE.flickr_jogador("Kaio Jorge", ["Cruzeiro", "Cruzeiro EC"])
    ok(r and r["url"].endswith("2_c.jpg") and r["rosto"] == [0.2, 0.1, 0.3, 0.4] and r["pagina"].endswith("/2"), f"Flickr: só vale com nome e clube no título/etiquetas e endereço do Flickr ({r})")
    ok(P.FE.flickr_jogador("Matheus Pereira", ["Cruzeiro"]) == {}, "Flickr: nome que não aparece em nenhuma foto = não achado")
    P.JOG.recorte_rosto = lambda dados: None
    ok(P.FE.flickr_jogador("Kaio Jorge", ["Cruzeiro"]) == {}, "Flickr: sem rosto achado, a foto não entra")
    fe = {"tsdb": {"9": {"d": {"foto": "https://r2.thesportsdb.com/x.png"}}, "8": {"d": {}}}, "flickr": {"9": {"d": {"url": "u9"}}, "8": {"d": {"url": "https://live.staticflickr.com/8.jpg", "autor": "Fã", "rosto": [0, 0, 1, 1]}}}}
    ok(P.FE.foto_privada("9", fe)["fonte"] == "TheSportsDB" and P.FE.foto_privada("8", fe)["fonte"] == "Flickr" and P.FE.foto_privada("7", fe) is None, "foto privada: o recorte do TheSportsDB vale mais; sem ele, a do Flickr")
finally:
    P.JOG._flickr, P.JOG.recorte_rosto, P.get = _fl, _rr, _get
    os.environ.pop("FLICKR_API_KEY", None)

# monitor de fotos (server/fotos.py), sem rede e sem tocar nos arquivos reais: sites dos clubes, downloads e cópias simulados
F = P.FOTO
guardado = {k: getattr(F, k) for k in ("abre", "_arq", "baixar", "guardar", "_existe", "ler_sites", "retirar")}
_feler, _fegr, _st = P.FE._ler, P.FE._gravar, dict(P.state)
P.FE._gravar = lambda d: None  # nunca grava no cache real do TheSportsDB
import tempfile
tmp = tempfile.mkdtemp()
F._arq = lambda nome=F.CACHE: os.path.join(tmp, nome)
existe = {"https://r2.thesportsdb.com/a.png", "https://a.espncdn.com/i/headshots/soccer/players/full/2.png", "https://live.staticflickr.com/3.jpg", "https://clube.com/seis-v1.png"}
copias = set()
F.abre = lambda url, timeout=15: url in existe
F.baixar = lambda url: url.encode() if url in existe else None
F.guardar = lambda cid, aid, dados: (copias.add(f"img/jogadores/{cid}/{aid}.webp"), f"img/jogadores/{cid}/{aid}.webp?v={abs(hash(dados)) % 10**8}")[1]
F._existe = lambda u: bool(u) and u.split("?")[0] in copias
sites = {"quando": 0, "clubes": {"cruzeiro": {"fotos": [{"src": "https://clube.com/seis-v1.png", "alt": "", "txt": "6 SEIS SILVA Meia"}]}}}
F.ler_sites = lambda forcar=False: sites
F.retirar = lambda: (copias.clear(), F._gravar({**F._ler(), "j": {}}))
guardado["publicadas"] = F.publicadas
F.publicadas = lambda: {}
fe = {"tsdb": {"1": {"d": {"foto": "https://r2.thesportsdb.com/a.png"}}}, "flickr": {"3": {"d": {"url": "https://live.staticflickr.com/3.jpg", "autor": "Fã", "rosto": [0, 0, 1, 1]}}}}
P.FE._ler = lambda: fe
with P.lock:
    P.state["mercado"] = {"cruzeiro": {"elenco": [{"id": "1", "nome": "Um"}, {"id": "2", "nome": "Dois"}, {"id": "3", "nome": "Tres"}, {"id": "4", "nome": "Quatro"},
                                                  {"id": "6", "nome": "Seis Silva", "num": "6"}], "emprestados": []}}
    P.state["jogadores"] = {"cruzeiro": {"jogadores": {"5": {"n": "Cinco", "foto": {"url": "https://upload.wikimedia.org/5.jpg"}}}}}
try:
    os.environ.pop("MODO_VENDA", None)
    r = F.atualizar()["clubes"]["cruzeiro"]
    fc = F.do_clube("cruzeiro")
    ok(r["comFoto"] == 4 and sorted(x["id"] for x in r["faltam"]) == ["4", "5"], f"monitor: 4 de 6 com foto; a da Wikipédia não conta ({r['comFoto']}, {r['faltam']})")
    ok({k: v["f"] for k, v in fc.items()} == {"1": "TheSportsDB", "2": "ESPN", "3": "Flickr", "6": "Clube"} and fc["3"]["r"], f"monitor: ordem das fontes, site do clube primeiro ({ {k: v['f'] for k, v in fc.items()} })")
    ok(all(v["u"].startswith("img/jogadores/cruzeiro/") for v in fc.values()), "monitor: toda foto é uma cópia guardada no site")
    F.aplicar_mercado()  # (antes travava: pegava a trava do servidor duas vezes)
    el = {j["id"]: j for j in P.state["mercado"]["cruzeiro"]["elenco"]}
    ok(el["1"]["fotoPrivada"].startswith("img/") and el["1"]["fotoInfo"] is None and el["3"]["fotoInfo"]["fonte"] == "Flickr" and el["4"]["fotoPrivada"] is None, "monitor: fotos aplicadas no elenco da janela")
    # nunca sai sozinha: a ESPN apagou a foto do jogador 2 e mesmo assim a cópia guardada continua
    existe.discard("https://a.espncdn.com/i/headshots/soccer/players/full/2.png")
    c = F._ler(); c["espn"]["2"]["t"] = 0; F._gravar(c)
    F.atualizar()
    ok(F.do_clube("cruzeiro").get("2", {}).get("f") == "ESPN", "monitor: foto que sumiu da fonte continua no site (cópia guardada)")
    # o clube publicou uma foto nova: troca
    existe.add("https://clube.com/seis-v2.png"); sites["clubes"]["cruzeiro"]["fotos"][0]["src"] = "https://clube.com/seis-v2.png"
    antes = F.do_clube("cruzeiro")["6"]["u"]
    F.atualizar()
    ok(F._ler()["j"]["6"]["src"].endswith("v2.png") and F.do_clube("cruzeiro")["6"]["u"] != antes, "monitor: o clube trocou a foto, o site troca também")
    # apareceu uma fonte que vale mais (recorte do TheSportsDB para quem só tinha a da ESPN): troca
    fe["tsdb"]["2"] = {"d": {"foto": "https://r2.thesportsdb.com/b.png"}}; existe.add("https://r2.thesportsdb.com/b.png")
    F.atualizar()
    ok(F.do_clube("cruzeiro")["2"]["f"] == "TheSportsDB", "monitor: fonte melhor substitui a guardada")
    # cruzamento de nomes nos cartões do site do clube
    J = {"a": {"nome": "Gabriel", "num": "1"}, "b": {"nome": "Gabriel Batista"}, "c": {"nome": "Darlan"}}
    m = F.casar([{"src": "u1", "alt": "", "txt": "12 GABRIEL BATISTA Goleiro 7 Marinho"}, {"src": "u2", "alt": "", "txt": "1 GABRIEL Goleiro"},
                 {"src": "https://x/DARLAN-scaled.png", "alt": "", "txt": "43 Edu Zagueiro 4 Camutanga Zagueiro 3 Darlan Zagueiro 53 Andrei Zagueiro 2 Britez Zagueiro 5 Outro Zagueiro"},
                 {"src": "https://x/EDU-scaled.png", "alt": "", "txt": "43 Edu Zagueiro 4 Camutanga Zagueiro 3 Darlan Zagueiro 53 Andrei Zagueiro 2 Britez Zagueiro 5 Outro Zagueiro"}], J)
    ok(m == {"a": "u2", "b": "u1", "c": "https://x/DARLAN-scaled.png"}, f"casar: nome mais específico primeiro, número da camisa desempata, nome no arquivo vale mais ({m})")
    ok(F.casar([{"src": "n1", "alt": "", "txt": "12 NOV 2026 Gabriel Batista renova contrato"}], J) == {}, "casar: cartão de notícia não vale")
    ok(F.casar([{"src": "g1", "txt": "GABRIEL SOUZA"}, {"src": "g2", "txt": "GABRIEL LIMA"}], {"a": {"nome": "Gabriel"}}) == {}, "casar: na dúvida entre dois, fica sem foto")
    ok(F.casar([{"src": "https://img.x/c_fill,w_400/2026/abc/isidro-pitta", "alt": ""}, {"src": "https://img.x/c_fill,w_1600/2026/abc/isidro-pitta", "alt": ""}],
               {"p": {"nome": "Isidro Pitta"}}).get("p", "").endswith("/2026/abc/isidro-pitta"), "casar: a mesma foto em dois tamanhos não é empate")
    # o registro não conhece uma foto que já está no site (cache novo do robô) e a fonte dela sumiu: a foto fica
    c = F._ler(); c["j"].pop("1"); F._gravar(c)
    fe["tsdb"].pop("1")
    F.publicadas = lambda: {"1": {"u": "img/jogadores/cruzeiro/1.webp?v=1", "f": "TheSportsDB"}}
    F.atualizar()
    ok(F.do_clube("cruzeiro").get("1", {}).get("f") == "TheSportsDB", "monitor: foto já publicada é adotada e não sai do site")
    F.publicadas = lambda: {}
    # comando de retirada
    os.environ["MODO_VENDA"] = "1"
    F.atualizar()
    ok(set(F.do_clube("cruzeiro")) == {"5"} and not copias, "monitor: MODO_VENDA=1 apaga as cópias e só fica a foto livre")
    os.environ.pop("MODO_VENDA", None)
    f = Fake("/api/fotos/nao-existe"); P.Handler.do_GET(f)
    ok(f.r[0] == 404, "rota: fotos de clube desconhecido = 404")
    f = Fake("/api/fotos"); P.Handler.do_GET(f)
    ok(f.r[0] == 200 and "comFoto" in f.r[1]["clubes"]["cruzeiro"], "rota: /api/fotos (resumo)")
finally:
    for k, v in guardado.items():
        setattr(F, k, v)
    P.FE._ler, P.FE._gravar = _feler, _fegr
    os.environ.pop("MODO_VENDA", None)
    with P.lock:
        P.state.clear(); P.state.update(_st)

print("\nOK" if not falhas else f"\n{len(falhas)} falha(s)")
sys.exit(1 if falhas else 0)
