# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""Monitor de valores do Transfermarkt (server/valores_tm.py) sem rede, com casos reais do conjunto transfermarkt-datasets.
Uso: python -X utf8 tests/valores_tm_casos.py"""
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
import valores_tm as V  # noqa: E402

HOJE = date(2026, 11, 24)
casos = 0


def caso(nome):
    global casos
    casos += 1
    print("ok ", nome)


def jog(pid, nome, nasc, clube, comp, sub, valor, img="", temporada="2025", contrato="2028-06-30 00:00:00"):
    return {"player_id": pid, "name": nome, "date_of_birth": nasc + " 00:00:00", "current_club_name": clube, "current_club_domestic_competition_id": comp,
            "sub_position": sub, "market_value_in_eur": str(valor) if valor else "", "highest_market_value_in_eur": str(valor * 2) if valor else "",
            "contract_expiration_date": contrato, "image_url": img or f"https://img.a.transfermarkt.technology/portrait/header/{pid}-1.jpg?lm=1",
            "last_season": temporada, "foot": "right", "height_in_cm": "183"}


JOGADORES = [
    jog("181767", "Marquinhos", "1994-05-14", "Paris Saint-Germain", "FR1", "Centre-Back", 28000000),
    jog("668268", "Marquinhos", "2003-04-07", "Cruzeiro Esporte Clube", "BRA1", "Right Winger", 2500000),
    jog("516722", "Marquinhos", "1999-10-24", "FK Spartak Moskva", "RU1", "Left Winger", 7000000),
    jog("240913", "Lucas Villalba", "1994-08-19", "Cruzeiro Esporte Clube", "BRA1", "Centre-Back", 1700000),
    jog("874844", "Lucas Villalba", "2001-05-11", "S. A. F. Botafogo", "BRA1", "Right Winger", 1500000),
    jog("371998", "Vinicius Junior", "2000-07-12", "Real Madrid", "ES1", "Left Winger", 140000000),
    jog("100", "Mycael", "2004-03-12", "Clube Atlético Paranaense", "BRA1", "Goalkeeper", 3000000),
    jog("200", "Bruno Guimarães", "1997-11-16", "Newcastle United", "GB1", "Defensive Midfield", 65000000),
    jog("300", "Allan", "1991-01-08", "Sport Club Corinthians Paulista", "BRA1", "Defensive Midfield", 1000000),
    jog("400", "Velho Aposentado", "1980-01-01", "Clube X", "BRA1", "Centre-Back", 0, temporada="2018"),
    {**jog("600", "Gabriel", "1997-12-19", "Arsenal FC", "GB1", "Centre-Back", 75000000), "first_name": "Gabriel", "last_name": "Magalhães"},
    jog("700", "Ferdi Kadıoğlu", "1999-10-07", "Brighton & Hove Albion", "GB1", "Left-Back", 25000000),
    jog("500", "Sem Foto", "2000-01-01", "Clube Y", "BRA1", "Centre-Forward", 500000, img="https://img.a.transfermarkt.technology/portrait/header/default.jpg?lm=1"),
]
AVALIACOES = [{"player_id": "181767", "date": "2026-06-10"}, {"player_id": "181767", "date": "2025-12-20"}]
TRANSF = [
    {"player_id": "181767", "transfer_date": "2013-07-19", "from_club_name": "Roma", "to_club_name": "PSG", "transfer_fee": "31400000.000"},
    {"player_id": "181767", "transfer_date": "2030-06-30", "from_club_name": "PSG", "to_club_name": "Futuro", "transfer_fee": "1.0"},
    {"player_id": "240913", "transfer_date": "2024-01-10", "from_club_name": "Vélez", "to_club_name": "Cruzeiro", "transfer_fee": ""},
]
ind = V.monta_indice(JOGADORES, AVALIACOES, TRANSF, hoje=HOJE)

# --- índice ---------------------------------------------------------------------------------------------------------------
assert "400" not in ind["j"], "quem não joga desde 2018 fica de fora"
m = ind["j"]["181767"]
assert m["v"] == 28000000 and m["s"] == "ZAG" and m["ct"] == "2028-06-30" and m["vd"] == "2026-06-10" and m["f"] == "181767-1.jpg"
assert m["t"] == ["2013-07-19", "Roma", "PSG", 31400000], "transferência com data futura não conta"
assert ind["j"]["240913"]["t"][3] is None, "valor não divulgado fica None"
assert ind["j"]["500"]["f"] is None, "foto padrão (silhueta) do Transfermarkt não conta como foto"
assert ind["j"]["371998"]["s"] == "PE" and ind["j"]["100"]["s"] == "GOL"
caso("índice: valor, posição, contrato, avaliação, transferência e foto")

# --- clubes -------------------------------------------------------------------------------------------------------------
assert V.mesmo_clube("Athletico-PR", "Clube Atlético Paranaense")
assert V.mesmo_clube("Atlético-MG", "Clube Atlético Mineiro")
assert V.mesmo_clube("Botafogo", "S. A. F. Botafogo")
assert V.mesmo_clube("Paris Saint-Germain", "Paris Saint-Germain FC")
assert not V.mesmo_clube("Atlético-MG", "Clube Atlético Paranaense")
assert not V.mesmo_clube("Cruzeiro", "Botafogo")
caso("clubes: siglas e nomes oficiais (ESPN x Transfermarkt)")

# --- quem é quem ----------------------------------------------------------------------------------------------------------
assert V.casa({"nome": "Marquinhos", "idade": 32, "clube": "Paris Saint-Germain", "liga": "fra.1"}, ind, HOJE) == "181767"
assert V.casa({"nome": "Marquinhos", "idade": 23, "clube": "Cruzeiro", "liga": "bra.1"}, ind, HOJE) == "668268"
assert V.casa({"nome": "Marquinhos", "idade": 22, "clube": "Red Bull Bragantino", "liga": "bra.1"}, ind, HOJE) is None, "nome de uma palavra sem clube nem nascimento"
assert V.casa({"nome": "Lucas Villalba", "idade": 32, "clube": "Cruzeiro", "liga": "bra.1"}, ind, HOJE) == "240913"
assert V.casa({"nome": "Lucas Villalba", "idade": 25, "clube": "Botafogo", "liga": "bra.1"}, ind, HOJE) == "874844"
assert V.casa({"nome": "Vinícius Júnior", "idade": 26, "clube": "Real Madrid", "liga": "esp.1"}, ind, HOJE) == "371998", "acentos"
assert V.casa({"nome": "Mycael", "idade": 22, "clube": "Athletico-PR", "liga": "bra.1"}, ind, HOJE) == "100"
# trocou de clube depois de julho (o conjunto ainda mostra o antigo): nome completo + idade bastam
assert V.casa({"nome": "Bruno Guimarães", "idade": 29, "clube": "Arsenal", "liga": "eng.1"}, ind, HOJE) == "200"
assert V.casa({"nome": "Allan", "idade": 35, "clube": "Flamengo", "liga": "bra.1"}, ind, HOJE) is None, "Allan de outro clube e outra idade"
assert V.casa({"nome": "Allan", "idade": 35, "clube": "Flamengo", "nasc": "1991-01-08"}, ind, HOJE) == "300", "o nascimento confirma"
assert V.casa({"nome": "Lucas Villalba", "nasc": "1994-08-20", "clube": "Botafogo"}, ind, HOJE) != "874844"
assert V.casa({"nome": "Gabriel Magalhães", "idade": 28, "clube": "Arsenal", "liga": "eng.1"}, ind, HOJE) == "600", "nome e sobrenome registrados"
assert V.casa({"nome": "Ferdi Kadioglu", "idade": 27, "clube": "Brighton & Hove Albion", "liga": "eng.1"}, ind, HOJE) == "700", "letra turca ı"
caso("quem é quem: três Marquinhos, dois Villalba, acentos, siglas e quem trocou de clube")

# --- mercado global: valor real, calibração da estimativa e colunas novas -----------------------------------------------------
comp = {"times": {"1": ["Paris Saint-Germain", None, "fra.1"], "2": ["Cruzeiro", None, "bra.1"], "3": ["Clube Z", None, "fra.1"]},
        "campos": ["id", "nome", "idade", "pos", "pais", "nac", "time", "num", "valor", "lesao"],
        "jogadores": [["159047", "Marquinhos", 32, "D", "bra", "", "1", 5, 16100000, 0], ["9", "Desconhecido Silva", 20, "M", "fra", "", "3", 8, 4000000, 0]]
        + [[f"x{i}", f"Fulano {i}", 25, "M", "fra", "", "3", 1, 10000000, 0] for i in range(25)]}
ind2 = V.monta_indice(JOGADORES + [jog(f"x{i}", f"Fulano {i}", "2001-01-01", "Clube Z", "FR1", "Central Midfield", 4000000) for i in range(25)], [], TRANSF, hoje=HOJE)
comp, det = V.enriquecer_global(comp, ind2, {"9": {"def": 81, "z": [[60, 30, 10], [70, 20, 10]]}}, hoje=HOJE)
marq = comp["jogadores"][0]
assert marq[8] == 28000000 and marq[10] == 1 and marq[11] == "ZAG" and marq[12] == "181767-1.jpg" and marq[13] == "2028-06"
assert det["159047"]["t"][3] == 31400000 and det["159047"]["tm"] == "181767"
outro = comp["jogadores"][1]
assert outro[10] == 0 and outro[8] == 1600000, outro  # 4 mi estimados x 0,4 (os 25 Fulanos valem 40% da estimativa)
assert outro[15] == 81 and outro[16] == "DE60", "perfil da Série A: retorno defensivo e zona (defesa, pela esquerda)"
assert comp["campos"][10:] == ["real", "sub", "foto", "contrato", "tm", "def", "zona"]
assert comp["valores"]["fatorEstimativa"]["fra.1"] == 0.4
caso("mercado global: valor real, estimativa calibrada pela liga e perfil")

# --- zona de atuação pela grade do mapa de calor --------------------------------------------------------------------------------
grade = ["0"] * (24 * 16)
for y in range(0, 5):      # lado esquerdo (y pequeno)
    for x in range(0, 8):  # terço defensivo
        grade[y * 24 + x] = "Z"
tercos, lados = V.zona("".join(grade))
assert tercos == [100, 0, 0] and lados == [100, 0, 0]
assert V.zona("") is None
assert V.zona_txt(([20, 30, 50], [10, 20, 70])) == "AD20"
caso("zona de atuação pelos lances")

print(f"{casos} casos do monitor de valores passaram")
