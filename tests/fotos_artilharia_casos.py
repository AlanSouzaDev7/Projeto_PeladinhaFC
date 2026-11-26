# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""Foto garantida dos artilheiros (server/fotos_artilharia.py), sem rede.
Uso: python -X utf8 tests/fotos_artilharia_casos.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
import fotos_artilharia as F  # noqa: E402

casos = 0


def caso(nome):
    global casos
    casos += 1
    print("ok ", nome)


assert F.mesmo_nome("Álex Arce", "Alex Arce") and F.mesmo_nome("Carlos González", "Carlos Gonzalez")
assert F.mesmo_nome("Michael Estrada", "Michael Steveen Estrada") and not F.mesmo_nome("Carlos González", "Francisco González")
assert F.mesmo_clube("Liga de Quito", "LDU Quito") and F.mesmo_clube("Independiente del Valle", "Independiente del Valle")
assert not F.mesmo_clube("Independiente del Valle", "CA Independiente"), "só 'independiente' em comum não basta"
caso("nome e clube: acentos, nome do meio e palavras genéricas")

EL = {"competicoes": {"EL1S": {"clubes": {
    "1": {"nome": "LDU Quito", "jogadores": [["265481", "Michael Estrada", "11", "CA", "", [], None, "", "", None, "", 1, "265481-1.jpg"]]},
    "2": {"nome": "Independiente del Valle", "jogadores": [["366620", "Carlos González", "9", "CA", "", [], None, "", "", None, "", 1, "366620-1.jpg"]]},
    "3": {"nome": "Club Libertad", "jogadores": [["1", "Carlos González", "5", "VOL", "", [], None, "", "", None, "", 1, "1-1.jpg"]]}}}}}
assert F.foto_tm({"nome": "Michael Estrada", "clube": "Liga de Quito"}, EL) == F.TM_FOTO + "265481-1.jpg"
assert F.foto_tm({"nome": "Carlos González", "clube": "Independiente del Valle"}, EL) == F.TM_FOTO + "366620-1.jpg", "homônimo: o clube decide"
assert F.foto_tm({"nome": "Carlos González", "clube": "Barcelona SC"}, EL) is None, "dois homônimos e nenhum do clube: nenhuma foto"
caso("Transfermarkt: foto pelo nome e pelo clube, sem confundir homônimos")


def pedir(url):
    if "searchplayers" in url:
        return {"player": [{"strPlayer": "Carlos Gonzalez Pena", "strTeam": "_Retired Soccer", "strCutout": "https://r2.thesportsdb.com/x.png"}]}
    if "searchteams" in url:
        return {"teams": [{"idTeam": "138225"}]}
    return {"player": [{"strPlayer": "Carlos González", "strCutout": "https://r2.thesportsdb.com/cutout/cg.png"}]}


F.time.sleep = lambda s: None
assert F.foto_tsdb({"nome": "Carlos González", "clube": "Independiente del Valle"}, pedir) == "https://r2.thesportsdb.com/cutout/cg.png"
caso("TheSportsDB: sem o jogador na busca, acha no elenco do clube")

print(f"{casos} casos das fotos da artilharia passaram")
