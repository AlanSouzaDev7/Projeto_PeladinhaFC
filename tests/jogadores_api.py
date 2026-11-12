"""Jogadores na API (server/jogadores.py e as rotas em server/placar_api.py), com respostas simuladas.
- lances: coordenadas de 0 a 100 e de 0 a 1 caem no mesmo lugar; (0, 0) é "sem posição"; lado esquerdo/direito certo;
- homônimos com o mesmo número da ESPN em dois clubes: cada clube com o seu jogador, sem "também jogou por" falso;
- transferência de verdade (períodos sem cruzar): aparece em "também jogou por";
- fotos: nome e ano de nascimento precisam bater; homônimo com outro ano não leva a foto; sem licença livre não entra;
- em alta: só ids conhecidos contam; o mais buscado primeiro.
Uso: python -X utf8 tests/jogadores_api.py"""
import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))
import placar_api as P
J = P.JOG

falhas = []
def ok(c, m):
    print(("ok   " if c else "FALHA"), m)
    if not c:
        falhas.append(m)

# ---------- lances: escala e orientação ----------
def jogo_falso(pontos):
    itens = [{"type": {"text": t}, "participants": [{"athlete": {"$ref": f"http://x/athletes/{a}?lang=en"}}], "fieldPositionX": x, "fieldPositionY": y} for a, t, x, y in pontos]
    return lambda url: {"pageCount": 1, "items": itens}
P.get_json = jogo_falso([("1", "Pass", 90.0, 10.0), ("1", "Cross", 95.0, 5.0), ("2", "Clear", 5.0, 50.0), ("3", "Pass", 0.0, 0.0)])
a = J.lances("1", "bra.1")
P.get_json = jogo_falso([("1", "Pass", 0.90, 0.10), ("1", "Cross", 0.95, 0.05), ("2", "Clear", 0.05, 0.50), ("3", "Pass", 0.0, 0.0)])
b = J.lances("2", "bra.1")
ok(a["1"]["g"] == b["1"]["g"] and a["2"]["g"] == b["2"]["g"], "coordenadas de 0 a 1 caem nas mesmas células que as de 0 a 100")
cel = int(next(iter(a["1"]["g"])))
ok(cel % J.GX >= J.GX - 3 and cel // J.GX >= J.GY - 3, "ESPN y baixo (lado direito de quem ataca) vira y alto no site (direita)")
ok(not a.get("3", {}).get("g") and a["3"]["c"].get("passes") == 1, "(0, 0) conta a ação mas não entra no mapa")
ok(a["1"]["c"].get("toques") == 2 and a["1"]["c"].get("cruz") == 1, "contagem por tipo de ação")

# ---------- homônimos e transferências ----------
def partida(eid, data, casa, fora, rows_casa, rows_fora, comp="Brasileirão"):
    return eid, {"date": data, "home": casa, "placar": {casa: 1, fora: 0}, "teams": {casa: rows_casa, fora: rows_fora}, "comp": comp}
row = lambda aid, nome: [aid, nome, True, 90, 0, 0, 1, 0, 2, 1, 0, None]
CRU, COR, FLA = P.CLUBS["cruzeiro"]["espn"], P.CLUBS["corinthians"]["espn"], P.CLUBS["flamengo"]["espn"]
todas = dict([
    partida("10", "2026-05-01", CRU, FLA, [row("777", "Fulano Silva")], []),
    partida("11", "2026-05-08", COR, FLA, [row("777", "Fulano Silva")], []),   # mesmo número, mesmo período: homônimos
    partida("12", "2026-05-15", CRU, FLA, [row("777", "Fulano Silva")], []),
    partida("20", "2026-02-01", FLA, CRU, [row("888", "Beltrano")], []),       # jogou pelo Flamengo...
    partida("21", "2026-08-01", CRU, FLA, [row("888", "Beltrano")], []),       # ...e depois pelo Cruzeiro: transferência
])
squads = {"cruzeiro": [[10, "Fulano Silva", "M", 28, "777"]], "corinthians": [], "flamengo": []}
cl = J.montar(squads, todas, {}, {})
cru, cor = cl["cruzeiro"]["jogadores"], cl["corinthians"]["jogadores"]
ok(cru["777"]["comps"]["Brasileirão"]["j"] == 2 and cor["777"]["comps"]["Brasileirão"]["j"] == 1, "homônimos: 2 jogos no Cruzeiro, 1 no Corinthians, cada um no seu clube")
ok("antes" not in cru["777"], "homônimos com períodos cruzados: sem \"também jogou por\" falso")
ok("888" in cru and cru["888"].get("antes") == [["flamengo", 1]], "transferência: entra no elenco de quem jogou pelo clube e mostra o clube anterior")
ok(cru["777"]["num"] == 10 and cor["777"]["num"] is None, "número de camisa do elenco onde ele está")

# ---------- fotos ----------
respostas = []
def wjson(url):
    if "wbsearchentities" in url or "Q476028" in url:
        return {"results": {"bindings": [{"c": {"value": "http://www.wikidata.org/entity/Q1"}}]}}
    if "commons.wikimedia.org" in url:
        return {"query": {"pages": {
            "1": {"title": "File:Fulano.jpg", "imageinfo": [{"thumburl": "https://upload.wikimedia.org/f.jpg", "descriptionurl": "https://commons.wikimedia.org/wiki/File:Fulano.jpg",
                  "extmetadata": {"Artist": {"value": "<a>Autor X</a>"}, "LicenseShortName": {"value": "CC BY-SA 4.0"}}}]},
            "2": {"title": "File:Sicrano.jpg", "imageinfo": [{"thumburl": "https://upload.wikimedia.org/s.jpg", "descriptionurl": "x", "extmetadata": {"LicenseShortName": {"value": "Todos os direitos reservados"}}}]}}}}
    respostas.append(url)
    if "P106" in url:  # segunda passada (pelo nome)
        return {"results": {"bindings": []}}
    return {"results": {"bindings": [
        {"pLabel": {"value": "Fulano Silva"}, "img": {"value": "http://commons.wikimedia.org/wiki/Special:FilePath/Fulano.jpg"}, "nasc": {"value": "1998-01-01T00:00:00Z"}},
        {"pLabel": {"value": "Beltrano"}, "img": {"value": "http://commons.wikimedia.org/wiki/Special:FilePath/Beltrano.jpg"}, "nasc": {"value": "1980-01-01T00:00:00Z"}},
        {"pLabel": {"value": "Sicrano"}, "img": {"value": "http://commons.wikimedia.org/wiki/Special:FilePath/Sicrano.jpg"}, "nasc": {"value": "2000-01-01T00:00:00Z"}}]}}
J._wjson = wjson
J._gravar = lambda *a, **k: None
J._ler = lambda nome: {}
ano = int(__import__("time").strftime("%Y"))
f = J.fotos_clube("cruzeiro", [[10, "Fulano Silva", "M", ano - 1998, "1"], [5, "Beltrano", "M", 25, "2"], [7, "Sicrano", "M", ano - 2000, "3"]])
ok("1" in f and f["1"]["autor"] == "Autor X" and f["1"]["licenca"] == "CC BY-SA 4.0", "foto: nome e ano de nascimento batem, com autor e licença")
ok("2" not in f, "homônimo com outro ano de nascimento não leva a foto")
ok("3" not in f, "foto sem licença livre não entra")

# ---------- em alta ----------
P._validos.update(t=1e18, ids={"c:cruzeiro", "j:216098-cruzeiro"})
P._buscas.clear()
for _ in range(3):
    P.contar_busca("j", "216098-cruzeiro")
P.contar_busca("c", "cruzeiro")
ok(P.contar_busca("c", "nao-existe") is False, "em alta: id desconhecido não conta")
top = P.em_alta()["itens"]
ok(top[0]["id"] == "216098-cruzeiro" and top[1]["id"] == "cruzeiro", "em alta: o mais buscado primeiro")

print("\nOK" if not falhas else f"\n{len(falhas)} falha(s)")
sys.exit(1 if falhas else 0)
