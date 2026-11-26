# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""Carreira pelas transferências do Transfermarkt, sem rede (linhas sintéticas no formato do transfers.csv.gz).
Uso: python -X utf8 tests/carreiras_tm_casos.py"""
import gzip
import io
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
import carreiras as C  # noqa: E402
import carreiras_tm as T  # noqa: E402

ok = 0


def caso(nome, cond):
    global ok
    assert cond, nome
    ok += 1
    print("✓", nome)


HOJE = date(2026, 11, 25)
# Matheus Pereira (id TM 225984), como no conjunto: base do Sporting, três empréstimos, compra pelo West Brom,
# Al-Hilal com empréstimo ao Al-Wahda, empréstimo ao Cruzeiro e compra (volta de 1 dia ao Al-Hilal no meio)
MP = [["2010-07-01", "53957", "Sporting Yth.", "53956", "Sporting Sub-15", None], ["2013-07-01", "48365", "Sporting U17", "10283", "Sporting U19", None],
      ["2015-01-01", "10283", "Sporting U19", "10949", "Sporting B", None], ["2015-10-01", "10949", "Sporting B", "336", "Sporting", None],
      ["2017-07-26", "336", "Sporting", "3325", "Chaves", 0], ["2018-06-30", "3325", "Chaves", "336", "Sporting", 0],
      ["2018-08-31", "336", "Sporting", "4", "1.FC Nuremberg", 0], ["2019-06-30", "4", "1.FC Nuremberg", "336", "Sporting", 0],
      ["2019-08-08", "336", "Sporting", "984", "West Brom", 0], ["2020-07-31", "984", "West Brom", "336", "Sporting", 0],
      ["2020-08-17", "336", "Sporting", "984", "West Brom", 8250000], ["2021-08-06", "984", "West Brom", "1114", "Al-Hilal", 18000000],
      ["2023-01-22", "1114", "Al-Hilal", "161", "Al-Wahda", 0], ["2023-06-30", "161", "Al-Wahda", "1114", "Al-Hilal", 0],
      ["2023-07-24", "1114", "Al-Hilal", "609", "Cruzeiro", 0], ["2024-06-30", "609", "Cruzeiro", "1114", "Al-Hilal", 0],
      ["2024-07-01", "1114", "Al-Hilal", "609", "Cruzeiro", 5000000], ["2027-06-30", "609", "Cruzeiro", "1114", "Al-Hilal", 0]]
car = T.carreira(MP, HOJE)
caso("Matheus Pereira: Sporting, Chaves, Nürnberg, West Brom, Al-Hilal, Al-Wahda, Cruzeiro",
     [x["c"] for x in car] == ["Sporting CP", "Chaves", "Nürnberg", "West Bromwich Albion", "Al-Hilal", "Al-Wahda", "Cruzeiro"])
caso("anos de cada trecho", [(x["i"], x["f"]) for x in car] == [(2015, 2017), (2017, 2018), (2018, 2019), (2019, 2021), (2021, 2023), (2023, 2023), (2023, None)])
caso("ida e volta em menos de um ano = empréstimo", [x["e"] for x in car] == [0, 1, 1, 0, 0, 1, 0])
caso("empréstimo seguido de compra vira um trecho só, sem marca de empréstimo", car[3]["e"] == 0 and car[6]["e"] == 0)
caso("transferência com data futura não entra (Cruzeiro continua aberto)", car[-1]["f"] is None)
caso("clube do site pelo id do Transfermarkt", car[-1]["s"] == "cruzeiro" and all(x["s"] is None for x in car[:-1]))

caso("base, reservas e 'sem clube' ficam fora", all(not T.e_clube(n) for n in ["Sporting B", "Cruzeiro U20", "Barça Atlètic", "RM Castilla", "Jong Ajax",
                                                                               "Juve Next Gen", "Man Utd Res.", "Without Club", "Retired", "Career break", "Unknown",
                                                                               "Oliveirense S15", "Fluminense Sub-20", "Valladolid Prom", "Atl. Madrileño"]))
caso("clubes profissionais entram", all(T.e_clube(n) for n in ["Willem II", "Boca Juniors", "Argentinos Jrs.", "Real Madrid", "Al-Hilal", "Vasco da Gama"]))
troca = [["2020-08-04", "41101", "Juventus U23", "2464", "Barcelona B", 7600000], ["2020-08-03", "2464", "Barcelona B", "41101", "Juventus U23", 0],
         ["2020-08-04", "2464", "Barcelona B", "1533", "SD Eibar", 0]]
caso("mesma data: segue a corrente (quem sai do clube atual vem primeiro)", [r[4] for r in T._encadeia(sorted(troca, key=lambda r: r[0]))] == ["Juventus U23", "Barcelona B", "SD Eibar"])
semvalor = [["2018-01-01", "1", "Alfa", "2", "Beta", 0], ["2019-12-01", "2", "Beta", "1", "Alfa", 0], ["2021-07-01", "1", "Alfa", "3", "Gama", 3000000]]
caso("sem valor pago, ida e volta em até ~2 anos também é empréstimo", [x["e"] for x in T.carreira(semvalor, HOJE)] == [0, 1, 0, 0])
venda = [["2018-01-01", "1", "Alfa", "2", "Beta", 5000000], ["2019-12-01", "2", "Beta", "1", "Alfa", 4000000]]
caso("com valor pago e mais de um ano, volta é transferência (não empréstimo)", [x["e"] for x in T.carreira(venda, HOJE)] == [0, 0, 0])
caso("nomes curtos por extenso", (T.nome_bonito("Man City"), T.nome_bonito("Nott'm Forest"), T.nome_bonito("Al-Hilal")) == ("Manchester City", "Nottingham Forest", "Al-Hilal"))
caso("mais completo entre as grafias do conjunto", T.nomes_clubes({"1": [["2020-01-01", "13", "Atlético", "5", "AC Milan", 0], ["2021-01-01", "5", "AC Milan", "13", "Atlético Madrid", 0]]})["13"] == "Atlético Madrid")

# ---------- nomes de clube ----------
caso("abreviação bate no modo solto", T.bate("West Brom", "West Bromwich Albion") and T.bate("Man City", "Manchester City FC"))
caso("modo estrito: 'Sporting' não é 'Sporting Kansas City'", T.bate("Sporting CP", "Sporting") and not T.bate("Sporting CP", "Sporting Kansas City", estrito=True))
caso("'Sport' sozinho é o Sport Recife; Nuremberg = Nürnberg", T.bate("Sport Recife", "Sport") and T.bate("1.FC Nuremberg", "FC Nürnberg"))
caso("Al-Hilal não é Al-Wahda", not T.bate("Al-Hilal", "Al Wahda"))

# ---------- quem é quem ----------
caso("goleiro na ESPN e volante no TM: não é a mesma pessoa", not T.mesma_pessoa("G", None, ("VOL", "1992-07-10"), HOJE))
caso("idade com mais de 1 ano de diferença: não é a mesma pessoa", not T.mesma_pessoa("M", 22, ("MEI", "1996-08-31"), HOJE))
caso("posição e idade compatíveis (ou sem ficha): vale", T.mesma_pessoa("M", 30, ("MEI", "1996-03-05"), HOJE) and T.mesma_pessoa("G", 30, None, HOJE))
squads = {"cruzeiro": [[10, "Matheus Pereira", "M", 30, "216098"], [1, "Fulano", "G", 25, "999"]], "flamengo": [[7, "Outro", "F", 28, "555"]]}
linhas = {"225984": MP, "1": [["2020-01-01", "1", "Alfa", "2", "Beta", 0]], "2": [["2020-01-01", "1", "Alfa", "2", "Beta", 0]]}
mapa = {"216098": "225984", "999": "1", "555": "2"}
elencos = {"clubes": {"cruzeiro": {"225984": "2024-07-01"}, "flamengo": {"2": "2026-01-15"}}, "fichas": {"225984": ("MEI", "1996-05-05"), "2": ("CA", "1998-02-02")}}
tms = T.carreiras_tm(squads, linhas, mapa, elencos, HOJE)
caso("carreira que passa pelo clube atual vale", "216098" in tms)
caso("carreira que não passa pelo clube atual nem está na página de elenco do TM: fora", "999" not in tms)
caso("na página de elenco do TM: o clube atual fecha a linha com o ano de chegada", [(x["s"], x["i"]) for x in tms["555"]][-1] == ("flamengo", 2026))

# ---------- mescla com a carreira das outras fontes ----------
atual = [{"c": "Sporting Clube de Portugal", "q": "Q75729", "i": 2015, "f": 2023, "l": "https://a.espncdn.com/i/teamlogos/soccer/500/2250.png", "s": None},
         {"c": "Cruzeiro Esporte Clube", "q": "Q188277", "i": 2023, "f": None, "l": None, "s": "cruzeiro"}]
esc = T.Escudos([[{"c": "West Bromwich", "l": "WBA.png", "s": None}, {"c": "Sporting Kansas City", "l": "SKC.png", "s": None}]], {"929": ["Al Hilal", "HIL.png", "ksa.1"]}, {"gd chaves": "12705"})
nova = C.melhor_com_tm(atual, tms["216098"], "cruzeiro", "Cruzeiro Esporte Clube", esc, {"cruzeiro": "Cruzeiro Esporte Clube"})
caso("faltavam clubes: o TM vira a espinha", [x["c"] for x in nova] == ["Sporting Clube de Portugal", "Chaves", "Nürnberg", "West Bromwich Albion", "Al-Hilal", "Al-Wahda", "Cruzeiro Esporte Clube"])
caso("nome, item e escudo herdados do trecho igual", nova[0]["q"] == "Q75729" and nova[0]["l"].endswith("2250.png") and nova[0]["i"] == 2015 and nova[0]["f"] == 2017)
caso("escudo pela lista geral (nome estrito) e pela busca da ESPN guardada", nova[3]["l"] == "WBA.png" and nova[4]["l"] == "HIL.png" and nova[1]["l"].endswith("/12705.png"))
caso("formato da linha do tempo mantido", all(set(x) == {"c", "q", "i", "f", "l", "s", "e"} for x in nova) and nova[-1]["s"] == "cruzeiro" and nova[-1]["f"] is None)
caso("aplicar de novo não muda nada (o robô relê os arquivos publicados)", C.melhor_com_tm(nova, tms["216098"], "cruzeiro", "Cruzeiro Esporte Clube", esc, {"cruzeiro": "Cruzeiro Esporte Clube"}) == nova)
completa = [dict(x) for x in nova] + []
completa.insert(0, {"c": "Clube Formador", "q": "formador", "i": 2010, "f": 2012, "l": None, "s": None, "e": 0})
caso("nada faltando: fica a carreira das outras fontes", C.melhor_com_tm(completa, tms["216098"], "cruzeiro", "Cruzeiro", esc) == completa)
errada = [{"c": "Inter de Limeira", "q": "internacional", "i": 2023, "f": 2023, "l": None, "s": "internacional", "e": 0},
          {"c": "Bahia", "q": "bahia", "i": 2024, "f": None, "l": None, "s": "bahia", "e": 0}]
tm_lim = T.carreira([["2022-01-01", "1", "Juventude", "2", "Inter Limeira", 0], ["2024-01-01", "2", "Inter Limeira", "10010", "EC Bahia", 0]], HOJE)
m = C.melhor_com_tm(errada, tm_lim, "bahia", "Bahia", esc)
caso("clube do site posto por engano na outra fonte não passa para o TM", [(x["c"], x["s"]) for x in m] == [("Juventude", None), ("Inter de Limeira", None), ("Bahia", "bahia")])
caso("sem carreira TM: nada muda", C.melhor_com_tm(atual, None, "cruzeiro", "Cruzeiro") == atual)

# ---------- arquivo e cache ----------
csv_txt = ('"player_id","transfer_date","transfer_season","from_club_id","to_club_id","from_club_name","to_club_name","transfer_fee","market_value_in_eur","player_name"\n'
           '"225984","2021-08-06","21/22","984","1114","West Brom","Al-Hilal","18000000.000","15000000.000","Matheus Pereira"\n'
           '"225984","2020-08-17","20/21","336","984","Sporting","West Brom","8250000.000","9500000.000","Matheus Pereira"\n'
           '"1","2020-01-01","19/20","5","6","X","Y",,,"Outro"\n')
buf = io.BytesIO()
with gzip.GzipFile(fileobj=buf, mode="wb") as g:
    g.write(csv_txt.encode("utf-8"))
ind = T.indexa(T.linhas_csv(buf.getvalue()), {"225984"})
caso("índice: só os jogadores pedidos, em ordem de data, com o valor", list(ind) == ["225984"] and [r[0] for r in ind["225984"]] == ["2020-08-17", "2021-08-06"] and ind["225984"][0][5] == 8250000)
guardado = {"ids": ["225984"], "linhas": ind, "conferido": time.time(), "etag": "x"}
T._baixa = lambda *a, **k: (_ for _ in ()).throw(AssertionError("não devia baixar"))
caso("conferido há menos de um dia e ninguém novo: usa o guardado, sem rede", T.transferencias(guardado, {"225984"}) == ind)
caso("sem rede e com gente nova: fica o guardado (não quebra a rodada)", T.transferencias(dict(guardado), {"225984", "777"}) == ind)

print(f"\n{ok} casos ok")
