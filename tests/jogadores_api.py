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

# ---------- fotos do Flickr (API oficial, simulada) ----------
import time as _t
ANO = _t.strftime("%Y")
LIC = {"stat": "ok", "licenses": {"license": [
    {"id": 0, "name": "All Rights Reserved"}, {"id": 1, "name": "Attribution-NonCommercial-ShareAlike License"}, {"id": 2, "name": "Attribution-NonCommercial License"},
    {"id": 3, "name": "Attribution-NonCommercial-NoDerivs License"}, {"id": 4, "name": "Attribution License"}, {"id": 5, "name": "Attribution-ShareAlike License"},
    {"id": 6, "name": "Attribution-NoDerivs License"}, {"id": 7, "name": "No known copyright restrictions"}, {"id": 9, "name": "Public Domain Dedication (CC0)"},
    {"id": 10, "name": "Public Domain Mark"}, {"id": 16, "name": "CC BY-ND 4.0"}]}}
def ph(i, titulo, lic, data, tags="", url=True):
    return {"id": str(i), "owner": "123@N04", "ownername": "Fotógrafo do Clube", "title": titulo, "license": str(lic), "datetaken": f"{data} 16:00:00", "tags": tags,
            **({"url_z": f"https://live.staticflickr.com/65535/{i}_abc_z.jpg"} if url else {})}
chamadas = []
def flickr_get(url, headers=None, timeout=20):
    chamadas.append(url)
    if "licenses.getInfo" in url:
        return json.dumps(LIC).encode()
    return json.dumps({"stat": "ok", "photos": {"photo": [
        ph(1, "Kaio Jorge comemora", 0, f"{ANO}-05-01"),                 # todos os direitos reservados: não
        ph(2, "Treino do Cruzeiro", 4, f"{ANO}-05-02"),                   # sem o nome do jogador: não
        ph(3, "Kaio Jorge", 4, f"{int(ANO) - 1}-11-20"),                  # temporada passada: não
        ph(4, "Gol de Kaio Jorge", 6, f"{ANO}-06-01"),                    # sem derivações: não
        ph(5, "Cruzeiro x Bahia", 2, f"{ANO}-07-10", tags="kaiojorge kaio jorge cruzeiro"),  # nome nas etiquetas, CC BY-NC: sim
        ph(6, "Kaio Jorge", 4, f"{ANO}-08-01"),
    ]}}).encode()
os.environ.pop("FLICKR_API_KEY", None)
P.get = flickr_get
ok(J.licencas_flickr() == {} and not chamadas, "Flickr sem a chave: nenhuma consulta")
os.environ["FLICKR_API_KEY"] = "chave-de-teste"
lic = J.licencas_flickr()
ok(set(lic) == {"1", "2", "4", "5", "7", "9", "10"}, f"licenças aceitas: Creative Commons com atribuição, CC0 e domínio público; fora: todos os direitos reservados e sem derivações ({sorted(lic)})")
fl = J.fotos_flickr("cruzeiro", [[19, "Kaio Jorge", "F", 24, "555"]], lic)
f5 = fl.get("555", {})
ok(f5.get("url", "").endswith("5_abc_z.jpg"), "escolhe a primeira foto válida: desta temporada, licença livre, nome do jogador (no título ou nas etiquetas)")
ok(f5.get("autor") == "Fotógrafo do Clube" and f5.get("licenca") == "CC BY-NC" and f5.get("fonte") == "Flickr" and f5.get("pagina") == "https://www.flickr.com/photos/123%40N04/5",
   f"crédito completo: autor, licença, Flickr e link da foto ({f5.get('licenca')}, {f5.get('pagina')})")
busca = [u for u in chamadas if "photos.search" in u][0]
ok(f"min_taken_date={ANO}-01-01" in busca and "license=" in busca and "%220%22" not in busca, "a busca já pede só fotos da temporada e só as licenças aceitas")
os.environ["FLICKR_SEM_NC"] = "1"
ok(set(J.licencas_flickr()) == {"4", "5", "7", "9", "10"}, "FLICKR_SEM_NC=1 tira as não comerciais")
os.environ.pop("FLICKR_SEM_NC", None)
os.environ.pop("FLICKR_API_KEY", None)

# ---------- rosto centrado (OpenCV) ----------
try:
    import cv2, numpy as np
    vazio = cv2.imencode(".jpg", np.full((300, 220, 3), 90, np.uint8))[1].tobytes()  # gramado liso, sem rosto
    ok(J.recorte_rosto(vazio) is None, "rosto: imagem sem rosto não ganha recorte (fica o padrão)")
    ok(J.recorte_rosto(b"nao e imagem") is None, "rosto: arquivo que não é imagem não quebra")
except ImportError:
    print("(OpenCV não instalada: teste do rosto pulado)")
antes = J._detectores
J._detectores = False  # sem a OpenCV
fot = {"cruzeiro": {"1": {"url": "https://upload.wikimedia.org/x.jpg"}}}
ok(J.rostos_fotos(fot) is fot and "rosto" not in fot["cruzeiro"]["1"], "rosto: sem a OpenCV, as fotos seguem sem recorte (nada quebra)")
J._detectores = antes

print("\nOK" if not falhas else f"\n{len(falhas)} falha(s)")
sys.exit(1 if falhas else 0)
