# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""CazéStats.TV — carreira de um jogador pelas transferências do Transfermarkt (usado por server/carreiras.py).

Fonte: o conjunto aberto transfermarkt-datasets (licença CC0), arquivo transfers.csv.gz (o mesmo endereço que
server/valores_tm.py já usa para os valores de mercado). Cada linha é uma transferência: jogador, data, clube de origem,
clube de destino e valor. Em ordem de data, as transferências viram os trechos da carreira:
  - times de base e reservas (Sub-20, U19, "B", "II", Youth, Castilla, Jong...) e "Without Club"/"Retired"/"Unknown"
    ficam de fora (a linha do tempo é de clubes profissionais);
  - empréstimo: o conjunto não tem marcação própria; vale a ida e volta (A -> B e depois B -> A em até ~1 ano, ou em
    até ~2 anos quando nenhuma das duas teve valor pago) = empréstimo em B ("e": 1, que a página já desenha);
  - a "volta" de poucos dias ao clube dono do passe entre dois empréstimos (fim de junho -> novo empréstimo em julho)
    não vira trecho; passagens seguidas pelo mesmo clube viram uma só.

Quem é quem: o id do Transfermarkt de cada jogador do elenco já vem do monitor de valores (dados/mercado/<clube>.json,
campo tm.id, e dados/mercado/global.json, coluna "tm"); a carreira só vale se passar pelo clube atual do site ou se o
jogador estiver na página de elenco do clube no Transfermarkt (server/dados-tm/elencos.json).

Download: só as transferências dos jogadores do elenco ficam guardadas (no cache das carreiras, que o robô já
restaura); o arquivo (~6 MB) é baixado de novo apenas quando a versão muda (ETag, conferida uma vez por dia) ou quando
entra no elenco alguém que ainda não está guardado.
"""
import csv
import functools
import gzip
import io
import json
import re
import time
import unicodedata
from datetime import date
from pathlib import Path

P = None  # módulo placar_api (para get/log); sem ele, usa urllib direto
RAIZ = Path(__file__).resolve().parent.parent
URL = "https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/transfers.csv.gz"
CONFERIR = 86400  # ETag conferida no máximo uma vez por dia
DIAS_VOLTA = 100  # "volta" ao clube dono do passe mais curta que isso, entre dois trechos, não vira trecho
EMPRESTIMO_DIAS = 400  # ida e volta em até ~1 ano e um mês: empréstimo
EMPRESTIMO_DIAS_SEM_VALOR = 740  # sem valor pago na ida nem na volta: até ~2 anos

# id do clube no Transfermarkt -> id do clube no site (os 20 da Série A; nomes curtos do conjunto enganam:
# "Botafogo-SP", "Atlético-GO", "Vit. Guimarães", "Santos Laguna"... por isso o id, nunca o nome)
TM_SITE = {"614": "flamengo", "1023": "palmeiras", "609": "cruzeiro", "199": "corinthians", "978": "vasco", "537": "botafogo",
           "10010": "bahia", "2462": "fluminense", "221": "santos", "330": "atletico-mg", "679": "athletico-pr", "8793": "bragantino",
           "585": "sao-paulo", "210": "gremio", "6600": "internacional", "2125": "vitoria", "776": "coritiba", "3876": "mirassol",
           "10997": "remo", "17776": "chapecoense"}

NAO_CLUBE = re.compile(r"^(without club|retired|career break|unknown|ban|banned|suspended|vereinslos|pause|karriereende|\?+)$", re.I)
# base e reservas: "Sub-20", "U19", "Yth.", "Youth", "Juvenil", "Jong Ajax", "RM Castilla", "Barça Atlètic", "Sevilla Atl.",
# "Juve Next Gen", "Primavera", "Reserves", "Academy" e o sufixo " B", " II", " C" (mas "Willem II" é clube profissional)
BASE = re.compile(r"\b(u|sub|s)[- ]?\d\d\b|\byth\.?$|\byouth\b|\bjuvenil|\bjuniores\b|^jong\b|\bcastilla$|\batl[eè]tic$|\batl\.$|\bnext gen\b|"
                  r"\bprimavera\b|\bprom\.?$|\bpromesas\b|\breserves?\b|\bres\.$|\bacademy\b|\bb-b$|\s(b|ii|iii|c|y|23)$", re.I)
NAO_BASE = {"willem ii"}
BASE_NOMES = {"ind. jrs.", "velez jv", "primavera", "atl. madrileno", "rb juniors"}  # times de base com nome que a regra acima não pega

# nomes curtos do conjunto -> nome por extenso (o resto fica como está: "Al-Hilal", "Sporting", "Benfica" já são bons)
NOMES = {"Man City": "Manchester City", "Man Utd": "Manchester United", "West Brom": "West Bromwich Albion", "Nott'm Forest": "Nottingham Forest",
         "Nottm Forest": "Nottingham Forest", "Spurs": "Tottenham", "Wolves": "Wolverhampton", "Sheff Utd": "Sheffield United",
         "Sheff Wed": "Sheffield Wednesday", "Newcastle": "Newcastle United", "Shakhtar D.": "Shakhtar Donetsk", "1.FC Nuremberg": "Nürnberg",
         "1.FC Köln": "Colônia", "1.FC K'lautern": "Kaiserslautern", "M'gladbach": "Borussia Mönchengladbach", "B. Dortmund": "Borussia Dortmund",
         "Bayern Munich": "Bayern de Munique", "F. Düsseldorf": "Fortuna Düsseldorf", "Leverkusen": "Bayer Leverkusen", "Sporting": "Sporting CP",
         "Vit. Guimarães": "Vitória de Guimarães", "Din. Zagreb": "Dinamo Zagreb", "Dep. La Coruña": "Deportivo La Coruña", "Atlético": "Atlético de Madrid",
         "Atlético Madrid": "Atlético de Madrid", "Paris SG": "Paris Saint-Germain", "Argentinos Jrs.": "Argentinos Juniors", "Sparta R.": "Sparta Rotterdam",
         "Heart of Midl.": "Heart of Midlothian", "Yokohama F. M.": "Yokohama F. Marinos", "U. de Chile": "Universidad de Chile",
         "U. Católica": "Universidad Católica", "Newell's": "Newell's Old Boys", "G. Bordeaux": "Bordeaux", "R. Strasbourg": "Strasbourg",
         "Apol. Limassol": "Apollon Limassol", "Slo. Bratislava": "Slovan Bratislava", "Atl. Nacional": "Atlético Nacional", "Atl. Tucumán": "Atlético Tucumán",
         "Indep. Medellín": "Independiente Medellín", "Indep. Santa Fe": "Independiente Santa Fe", "Ind. Rivadavia": "Independiente Rivadavia",
         "Indep'te": "Independiente", "Estudiantes": "Estudiantes de La Plata", "Gimnasia": "Gimnasia La Plata", "Sanf. Hiroshima": "Sanfrecce Hiroshima",
         "Kawasaki Front.": "Kawasaki Frontale", "Melb. Victory": "Melbourne Victory", "JEF Utd. Chiba": "JEF United Chiba", "C. Rizespor": "Çaykur Rizespor",
         "M. Tel Aviv": "Maccabi Tel Aviv", "H. Beer Sheva": "Hapoel Be'er Sheva", "Univ. Craiova": "Universitatea Craiova", "A. Bucaramanga": "Atlético Bucaramanga",
         "Muangthong Utd.": "Muangthong United", "St. Pauli": "St. Pauli", "Inter": "Inter de Milão", "AC Milan": "Milan", "Bayern München": "Bayern de Munique",
         "EC Bahia": "Bahia", "Atlético-PR": "Athletico-PR", "Bragantino": "RB Bragantino", "Vasco da Gama": "Vasco",
         "Atlético-GO": "Atlético Goianiense", "América-MG": "América Mineiro", "Atlético-CE": "Atlético Cearense", "Sampaio-MA": "Sampaio Corrêa",
         "Operário-PR": "Operário Ferroviário", "Inter Limeira": "Inter de Limeira", "América-RN": "América de Natal", "Caxias-RS": "Caxias",
         "Santa Cruz-PE": "Santa Cruz", "Desp. Brasil": "Desportivo Brasil", "Ceará SC": "Ceará", "Coritiba FC": "Coritiba", "EC Vitória": "Vitória",
         "Criciúma EC": "Criciúma", "Avaí FC": "Avaí", "Figueirense FC": "Figueirense", "Vila Nova FC": "Vila Nova",
         "Chacarita Jrs.": "Chacarita Juniors", "C'dole Sapporo": "Consadole Sapporo", "St. Pat's": "St Patrick's Athletic", "Portuguesa-SP": "Portuguesa", "Mirassol-SP": "Mirassol", "Cuiabá-MT": "Cuiabá", "Paysandu": "Paysandu",
         "Mvd City Torque": "Montevideo City Torque", "J'ville Armada": "Jacksonville Armada", "Inter Bogotá": "Inter de Bogotá", "LAFC": "Los Angeles FC",
         "Olympique Lyon": "Lyon", "Zenit S-Pb": "Zenit", "Spartak Moscow": "Spartak Moscou", "Dinamo Moscow": "Dínamo Moscou", "PSG": "Paris Saint-Germain",
         "TJ Jinmen Tiger": "Tianjin Teda", "Rionegro Águila": "Águilas Doradas", "Dep. Rionegro": "Deportivo Rionegro", "Uni. Popayán": "Universitario de Popayán",
         "SH Shenhua": "Shanghai Shenhua", "QD West Coast": "Qingdao West Coast", "SH Port": "Shanghai Port", "BJ Guoan": "Beijing Guoan",
         "Kalba FC": "Ittihad Kalba", "Ittihad Kalba": "Ittihad Kalba"}

GENERICAS = {"fc", "cf", "sc", "ac", "afc", "cd", "ud", "sd", "ca", "ec", "se", "cr", "cp", "sv", "club", "clube", "de", "da", "do", "del", "la", "el",
             "the", "gd", "sl", "cs", "ad", "vfl", "vfb", "tsg", "fsv", "aec", "futebol", "football", "futbol", "calcio", "esporte", "sport", "al", "e", "y", "and", "fk", "sk", "if", "bk", "ssc", "as", "rc", "us"}
APELIDOS = {"nuremberg": "nurnberg", "munich": "munique", "bayern": "bayern", "cologne": "colonia", "koln": "colonia", "milan": "milan",
            "atletico pr": "athletico paranaense", "athletico pr": "athletico paranaense", "inter de milao": "internazionale", "wolverhampton wanderers": "wolverhampton",
            "tottenham hotspur": "tottenham", "manchester utd": "manchester united",
            "moscou": "moscow", "moskva": "moscow", "dinamo": "dynamo", "sport recife": "recife", "sport club do recife": "recife"}


def _ascii(x):
    return unicodedata.normalize("NFD", str(x or "")).encode("ascii", "ignore").decode().lower()


@functools.lru_cache(maxsize=20000)
def _fichas(nome):
    return frozenset(fichas_cru(nome))


def fichas(nome):
    return set(_fichas(str(nome or "")))


def fichas_cru(nome):
    """Palavras que identificam um clube, sem as genéricas nem números ("West Bromwich Albion FC" -> {west, bromwich, albion})."""
    t = " ".join(re.sub(r"[^a-z0-9 ]", " ", _ascii(nome)).split())
    for velho, novo in APELIDOS.items():
        t = re.sub(rf"\b{velho}\b", novo, t)
    if t == "sport":
        t = "recife"  # "Sport" sozinho, nas carreiras de jogadores do Brasil, é o Sport Club do Recife
    out = {p for p in t.split() if p not in GENERICAS and not p.isdigit() and len(p) > 1}
    return out or {p for p in t.split() if not p.isdigit() and len(p) > 1}  # nome só de palavras genéricas


def _par(a, b):
    return a == b or (min(len(a), len(b)) >= 3 and (a.startswith(b) or b.startswith(a)))


def bate(a, b, estrito=False):
    """Mesmo clube pelo nome? Solto (dentro da carreira de um jogador): todas as palavras do nome menor estão no maior
    (aceita abreviação: "West Brom" ~ "West Bromwich"). Estrito (lista geral de escudos): além disso, as palavras em comum
    cobrem 60% do nome maior ("Sporting" não vira "Sporting Kansas City")."""
    fa, fb = (_fichas(a or ""), _fichas(b or "")) if isinstance(a, str) else (a, b)
    if not fa or not fb:
        return False
    menor, maior = (fa, fb) if len(fa) <= len(fb) else (fb, fa)
    comuns = sum(1 for p in menor if any(_par(p, q) for q in maior))
    if comuns < len(menor):
        return False
    return not estrito or comuns / len(maior) >= 0.6


@functools.lru_cache(maxsize=20000)
def e_base(nome):
    n = _ascii(nome).strip()
    return n in BASE_NOMES or (n not in NAO_BASE and bool(BASE.search(n)))


@functools.lru_cache(maxsize=20000)
def e_clube(nome):
    return bool(nome) and not NAO_CLUBE.match(str(nome).strip()) and not e_base(nome)


@functools.lru_cache(maxsize=20000)
def raiz(nome):
    """Nome sem o sufixo de base ("Cruzeiro U20" -> "cruzeiro"), para reconhecer a volta ao clube de origem."""
    n = re.sub(r"\b(u|sub)[- ]?\d\d\b|\byth\.?|\byouth\b|\bjuvenil\b|\s(b|ii)$", " ", _ascii(nome))
    return " ".join(n.split())


def nome_bonito(nome):
    nome = re.sub(r"\s+", " ", str(nome or "")).strip()
    return NOMES.get(nome, nome)


# ---------------------------------------------------------------------------
# transferências -> trechos
# ---------------------------------------------------------------------------
def linhas_csv(fonte):
    """Linhas do transfers.csv.gz: fonte = bytes do arquivo ou caminho local."""
    bruto = Path(fonte).read_bytes() if isinstance(fonte, (str, Path)) else fonte
    return csv.DictReader(io.TextIOWrapper(gzip.GzipFile(fileobj=io.BytesIO(bruto)), encoding="utf-8"))


def _valor(v):
    try:
        return int(float(v)) if v not in (None, "") else None
    except ValueError:
        return None


def indexa(linhas, ids=None):
    """{id do jogador no TM: [[data, id origem, origem, id destino, destino, valor], ...]} (só os ids pedidos; None = todos)."""
    out = {}
    for x in linhas:
        pid = str(x.get("player_id") or "")
        if not pid or (ids is not None and pid not in ids):
            continue
        d = (x.get("transfer_date") or "")[:10]
        if not re.fullmatch(r"\d{4}-\d\d-\d\d", d):
            continue
        out.setdefault(pid, []).append([d, str(x.get("from_club_id") or ""), x.get("from_club_name") or "", str(x.get("to_club_id") or ""),
                                        x.get("to_club_name") or "", _valor(x.get("transfer_fee"))])
    for v in out.values():
        v.sort(key=lambda r: r[0])
    return out


def _encadeia(transf):
    """Mesma data: a transferência que sai do clube onde o jogador está vem primeiro (troca Barcelona B <-> Juventus U23)."""
    resto, out, atual = list(transf), [], None
    while resto:
        d = resto[0][0]
        mesmo_dia = [r for r in resto if r[0] == d]
        r = next((r for r in mesmo_dia if atual and r[1] == atual), mesmo_dia[0])
        resto.remove(r)
        out.append(r)
        atual = r[3]
    return out


def _dias(a, b):
    if not a or not b:
        return 10 ** 6
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def trechos(transf, hoje=None):
    """Trechos da carreira: [{id, nome, ini, fim, e}] com datas (AAAA-MM-DD; ini None = antes do conjunto; fim None = atual).
    transf = [[data, id origem, origem, id destino, destino, valor], ...] de um jogador."""
    hoje = (hoje or date.today()).isoformat()
    linhas = _encadeia([r for r in transf if r[0] <= hoje])
    brutos = []  # todos os trechos, inclusive base e "sem clube" (para reconhecer as idas e voltas)
    for d, oid, onome, did, dnome, valor in linhas:
        if not brutos:
            brutos.append({"id": oid, "nome": onome, "ini": None, "fim": None, "vin": None})
        brutos[-1]["fim"] = d
        brutos[-1]["vout"] = valor
        brutos.append({"id": did, "nome": dnome, "ini": d, "fim": None, "vin": valor})
    for k, t in enumerate(brutos):
        t["e"] = 0
        if 0 < k < len(brutos) - 1 and t["fim"]:
            antes, depois = brutos[k - 1], brutos[k + 1]
            volta = depois["id"] == antes["id"] or (raiz(depois["nome"]) and raiz(depois["nome"]) == raiz(antes["nome"]))
            dur = _dias(t["ini"], t["fim"])
            sem_valor = not t.get("vin") and not t.get("vout")
            if volta and e_clube(t["nome"]) and (dur <= EMPRESTIMO_DIAS or (sem_valor and dur <= EMPRESTIMO_DIAS_SEM_VALOR)):
                t["e"] = 1
    clubes = [t for t in brutos if e_clube(t["nome"])]
    # "volta" curta ao clube dono do passe entre dois trechos: some (a não ser que todas as passagens por ele sejam curtas: fica a primeira)
    longos = {t["id"] for t in clubes if _dias(t["ini"], t["fim"]) >= DIAS_VOLTA}
    vistos, limpos = set(), []
    for k, t in enumerate(clubes):
        curto = _dias(t["ini"], t["fim"]) < DIAS_VOLTA and k < len(clubes) - 1
        if curto and (t["id"] in longos or t["id"] in vistos):
            vistos.add(t["id"])
            continue
        vistos.add(t["id"])
        limpos.append(t)
    out = []
    for t in limpos:
        if out and out[-1]["id"] == t["id"]:
            a = out[-1]
            a["fim"] = t["fim"]
            a["e"] = a["e"] and t["e"]
        else:
            out.append({"id": t["id"], "nome": t["nome"], "ini": t["ini"], "fim": t["fim"], "e": t["e"]})
    return out


def carreira(transf, hoje=None, nomes=None):
    """Trechos em anos, no formato da linha do tempo (sem escudo): [{id, c, i, f, e, s}].
    nomes = {id do clube no TM: nome} (o nome mais completo visto no conjunto); s = clube do site ou None."""
    out = []
    for t in trechos(transf, hoje):
        nome = (nomes or {}).get(t["id"]) or t["nome"]
        out.append({"id": t["id"], "c": nome_bonito(nome), "i": int(t["ini"][:4]) if t["ini"] else None,
                    "f": int(t["fim"][:4]) if t["fim"] else None, "e": t["e"], "s": TM_SITE.get(t["id"])})
    return out


def nomes_clubes(transf_por_jogador):
    """{id do clube: nome} escolhendo, entre as grafias do conjunto, a mais longa ("Atlético" < "Atlético Madrid")."""
    nomes = {}
    for linhas in transf_por_jogador.values():
        for r in linhas:
            for cid, nm in ((r[1], r[2]), (r[3], r[4])):
                if nm and len(nm) > len(nomes.get(cid, "")) and "�" not in nm:
                    nomes[cid] = nm
    return nomes


# ---------------------------------------------------------------------------
# comparação e mescla com a carreira das outras fontes
# ---------------------------------------------------------------------------
def acha(x, lista, usados=()):
    """Índice do trecho de `lista` que é o mesmo clube do trecho TM `x` (pelo clube do site ou pelo nome; o de ano mais perto)."""
    melhor, dist = None, 10 ** 6
    for k, y in enumerate(lista):
        if k in usados:
            continue
        if x.get("s") and y.get("s"):
            ok = x["s"] == y["s"]
        elif x.get("s") or y.get("s"):  # só um lado é clube do site (a outra fonte às vezes erra: "Inter de Limeira" -> Internacional)
            ok = bate(x["c"], y.get("c") or "", estrito=True) or bate(x.get("tm") or "", y.get("c") or "", estrito=True)
        else:
            ok = bate(x["c"], y.get("c") or "") or bate(x["c"], y.get("q") or "") or bate(x.get("tm") or "", y.get("c") or "")
        if not ok:
            continue
        d = abs((x.get("i") or y.get("i") or 0) - (y.get("i") or x.get("i") or 0))
        if d < dist:
            melhor, dist = k, d
    return melhor


def faltando(atual, tm):
    """Clubes da carreira TM que a carreira atual não tem (nomes)."""
    return [x["c"] for x in tm if acha(x, atual) is None]


class Escudos:
    """Escudo de um clube de fora do site, sem rede: carreiras já publicadas/pesquisadas, times da ESPN do mercado global
    e as buscas de times da ESPN já guardadas no cache das carreiras. Só com nome que bate no modo estrito."""

    def __init__(self, listas=(), times=None, busca=None):
        cont = {}
        for lista in listas:
            for y in lista or []:
                if y.get("l") and not y.get("s") and y.get("c"):
                    chave = frozenset(fichas(y["c"]))
                    if chave:
                        cont.setdefault(chave, {}).setdefault(y["l"], 0)
                        cont[chave][y["l"]] += 1
        self.itens = [(set(k), max(v, key=v.get)) for k, v in cont.items()]
        for _tid, (nome, logo, *_r) in (times or {}).items():
            if logo and fichas(nome):
                self.itens.append((fichas(nome), logo))
        for nome, eid in (busca or {}).items():
            if eid and str(eid).isdigit() and not nome.startswith("_") and fichas(nome):
                self.itens.append((fichas(nome), f"https://a.espncdn.com/i/teamlogos/soccer/500/{eid}.png"))

        self.por_prefixo = {}
        for k, (chave, _logo) in enumerate(self.itens):
            for p in chave:
                self.por_prefixo.setdefault(p[:3], set()).add(k)
        self.memo = {}

    def de(self, *nomes):
        for nome in nomes:
            if nome in self.memo:
                if self.memo[nome]:
                    return self.memo[nome]
                continue
            f = fichas(nome)
            perto = set().union(*(self.por_prefixo.get(p[:3], set()) for p in f)) if f else set()
            achados = {}
            for k in perto:
                chave, logo = self.itens[k]
                if bate(f, chave, estrito=True):
                    achados[logo] = achados.get(logo, 0) + (2 if chave == f else 1)
            self.memo[nome] = max(achados, key=achados.get) if achados else None
            if self.memo[nome]:
                return self.memo[nome]
        return None


def mescla(atual, tm, cid, nome_atual, escudos=None, nomes_site=None):
    """Carreira final com o TM como espinha: cada trecho TM herda nome, item (q) e escudo do trecho igual da carreira atual
    (quando houver); clubes que só a carreira atual tem e que vêm antes do primeiro trecho TM (base fora do conjunto, como
    o clube formador) entram no começo. Formato {c, q, i, f, l, s, e}."""
    import carreiras as C
    usados, out = set(), []
    for x in tm:
        k = acha(x, atual, usados)
        y = atual[k] if k is not None else None
        if k is not None:
            usados.add(k)
        site = x.get("s")
        if site:
            nome = (y or {}).get("c") if y and y.get("s") == site else None
            nome = nome or (nomes_site or {}).get(site) or x["c"]
            out.append({"c": nome, "q": site, "i": x["i"], "f": x["f"], "l": None, "s": site, "e": x["e"]})
            continue
        if y and y.get("s"):
            y = None  # a outra fonte tinha posto um clube do site no lugar deste: não herda nada dela
        logo = (y or {}).get("l") or (escudos.de(x["c"], x.get("tm") or "") if escudos else None)
        nome = (y or {}).get("c") or x["c"]
        q = (y or {}).get("q") or " ".join(sorted(fichas(x["c"]))) or x["c"]
        out.append({"c": nome, "q": q, "i": x["i"], "f": x["f"], "l": logo, "s": None, "e": x["e"]})
    if out and out[0]["i"] is None and atual:
        k = acha(tm[0], atual)
        if k is not None and atual[k].get("i") and (out[0]["f"] is None or atual[k]["i"] <= out[0]["f"]):
            out[0]["i"] = atual[k]["i"]  # o conjunto não diz quando começou no primeiro clube: vale o ano da outra fonte
    primeiro = next((x["i"] for x in out if x["i"]), None)
    antes = [dict(y) for k, y in enumerate(atual) if k not in usados and y.get("i") and primeiro and (y.get("f") or y["i"]) <= primeiro
             and y.get("s") != cid and k < min(usados or {0})]
    for y in antes:
        y.setdefault("e", 0)
    return C.fecha(antes + out, cid, nome_atual)


# ---------------------------------------------------------------------------
# quem é quem e download
# ---------------------------------------------------------------------------
def mapa_espn_tm(raiz=RAIZ):
    """{id ESPN: id TM} pelos arquivos do monitor de valores (dados/mercado/<clube>.json e global.json)."""
    m = {}
    try:
        g = json.loads((raiz / "dados" / "mercado" / "global.json").read_text(encoding="utf-8"))
        k = (g.get("campos") or []).index("tm")
        for r in g.get("jogadores") or []:
            if len(r) > k and r[k]:
                m[str(r[0])] = str(r[k])
    except (OSError, ValueError):
        pass
    for f in sorted((raiz / "dados" / "mercado").glob("*.json")):
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if not isinstance(d, dict):
            continue
        for j in (d.get("elenco") or []) + (d.get("emprestados") or []):
            t = (j.get("tm") or {}).get("id") if isinstance(j, dict) else None
            if t and j.get("id"):
                m[str(j["id"])] = str(t)
    return m


def elencos_tm(raiz=RAIZ):
    """Páginas de elenco do Transfermarkt (server/dados-tm/elencos.json): {"clubes": {clube do site: {id TM: data de
    chegada}}, "fichas": {id TM: (posição, nascimento)}} (as fichas de todos os clubes lidos, de todas as ligas)."""
    try:
        e = json.loads((raiz / "server" / "dados-tm" / "elencos.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"clubes": {}, "fichas": {}}
    clubes, fichas_ = {}, {}
    for c in (e.get("competicoes") or {}).values():
        for tcid, cl in (c.get("clubes") or {}).items():
            linhas = [r for r in cl.get("jogadores") or [] if r]
            for r in linhas:
                fichas_[str(r[0])] = ((r + [None] * 5)[3], (r + [None] * 5)[4])
            if tcid in TM_SITE:
                clubes[TM_SITE[tcid]] = {str(r[0]): (r[8] if len(r) > 8 else None) for r in linhas}
    return {"clubes": clubes, "fichas": fichas_}


def mesma_pessoa(pos, idade, ficha, hoje=None):
    """O jogador da ESPN (posição G/D/M/F, idade) e a ficha do TM (posição, nascimento) não se contradizem?
    Goleiro de um lado e jogador de linha do outro, ou idade com mais de 1 ano de diferença: não é a mesma pessoa."""
    if not ficha:
        return True
    sub, nasc = ficha
    if pos and sub and (pos == "G") != (sub == "GOL"):
        return False
    if idade and nasc and re.match(r"\d{4}-\d\d-\d\d", str(nasc)):
        hoje = hoje or date.today()
        n = date.fromisoformat(str(nasc)[:10])
        anos = hoje.year - n.year - ((hoje.month, hoje.day) < (n.month, n.day))
        if abs(anos - int(idade)) > 1:
            return False
    return True


def _baixa(url=URL, metodo="GET"):
    import urllib.request
    req = urllib.request.Request(url, method=metodo, headers={"User-Agent": "CazeStats/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return (r.read() if metodo == "GET" else b""), r.headers.get("ETag", "").strip('"')


def transferencias(guardado, ids, arquivo=None, agora=None):
    """Transferências dos jogadores `ids` (ids do TM). guardado = dict persistente (cache das carreiras, chave "tm"):
    {etag, conferido, ids, linhas}. Baixa de novo só se a versão mudou (conferida 1x/dia) ou se faltam ids.
    arquivo = caminho local do transfers.csv.gz (sem rede). Devolve {id TM: linhas}; em falha, o guardado."""
    agora = agora or time.time()
    ids = set(ids)
    tem = set(guardado.get("ids") or [])
    faltam = bool(ids - tem)
    if arquivo:
        bruto, etag = Path(arquivo).read_bytes(), "local"
    else:
        etag = guardado.get("etag")
        if not faltam and agora - guardado.get("conferido", 0) < CONFERIR:
            return guardado.get("linhas") or {}
        try:
            _b, etag = _baixa(metodo="HEAD")
            guardado["conferido"] = agora
            if not faltam and etag and etag == guardado.get("etag"):
                return guardado.get("linhas") or {}
            bruto, etag = _baixa()
        except Exception as ex:
            if P:
                P.log("carreiras (transferências do Transfermarkt)", ex)
            return guardado.get("linhas") or {}
    linhas = indexa(linhas_csv(bruto), ids | tem)
    guardado.update(etag=etag, conferido=agora, ids=sorted(ids | tem), linhas=linhas)
    return linhas


def carreiras_tm(squads, linhas, mapa=None, elencos=None, hoje=None, indice=None):
    """{id ESPN: carreira TM validada} para os elencos do site. Vale se a carreira passa pelo clube atual ou se o jogador
    está na página de elenco do clube no Transfermarkt (então o clube atual fecha a linha, com o ano de chegada), e se a
    posição (goleiro ou não) e a idade não contradizem a ficha do TM (páginas de elenco; sem ela, o índice dos valores).
    indice = índice do server/valores_tm.py ({"j": {id TM: {s, d, ...}}}), opcional."""
    mapa = mapa if mapa is not None else mapa_espn_tm()
    elencos = elencos if elencos is not None else elencos_tm()
    j_ind = (indice or {}).get("j") or {}
    nomes = nomes_clubes(linhas)
    out = {}
    for cid, elenco in squads.items():
        no_tm = (elencos.get("clubes") or {}).get(cid) or {}
        for r in elenco:
            aid = str(r[4] or "")
            tid = mapa.get(aid)
            if not tid or tid not in linhas:
                continue
            ficha = (elencos.get("fichas") or {}).get(tid) or ((j_ind[tid].get("s"), j_ind[tid].get("d")) if tid in j_ind else None)
            if not mesma_pessoa(r[2], r[3], ficha, hoje):
                continue
            car = carreira(linhas[tid], hoje, nomes)
            curtos = {i_: nm for rr in linhas[tid] for i_, nm in ((rr[1], rr[2]), (rr[3], rr[4]))}
            for x in car:
                x["tm"] = curtos.get(x["id"], "")  # a grafia curta do conjunto também serve para achar o clube nas outras fontes
            passa = any(x["s"] == cid for x in car)
            if not car or not (passa or tid in no_tm):
                continue
            if car[-1]["s"] != cid and no_tm.get(tid):
                chegou = str(no_tm[tid])[:4]
                if chegou.isdigit() and (car[-1]["i"] or 0) <= int(chegou):
                    car[-1]["f"] = car[-1]["f"] or int(chegou)
                    car.append({"id": "", "c": "", "i": int(chegou), "f": None, "e": 0, "s": cid, "tm": ""})
            out[aid] = car
    return out


def auditoria(publicados, tm, exemplos=15):
    """Compara as carreiras publicadas ({clube: {id ESPN: lista}}) com as do Transfermarkt ({id ESPN: carreira}).
    Devolve {"com_tm", "faltando": [(clube, id, [clubes])], "so_na_publicada": [...]}."""
    falt, sobra, com = [], [], 0
    for cid, d in publicados.items():
        for aid, car in tm.items():
            if not any(x["s"] == cid for x in car[-1:]):
                continue  # cada jogador é conferido no arquivo do clube atual
            com += 1
            atual = (d or {}).get(aid) or []
            f = faltando(atual, car)
            if f:
                falt.append((cid, aid, f))
            usados = set()
            for x in car:
                k = acha(x, atual, usados)
                if k is not None:
                    usados.add(k)
            so = [y.get("c") for k, y in enumerate(atual) if k not in usados]
            if so:
                sobra.append((cid, aid, so))
    return {"com_tm": com, "faltando": falt, "so_na_publicada": sobra}


if __name__ == "__main__":
    # python -X utf8 server/carreiras_tm.py --auditoria [transfers.csv.gz] [pasta com <clube>.json]
    # (sem o arquivo, baixa o conjunto; sem a pasta, confere dados/carreiras)
    import sys
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    arq = args[0] if args else None
    pasta = Path(args[1]) if len(args) > 1 else RAIZ / "dados" / "carreiras"
    squads = json.loads((RAIZ / "dados" / "squads.json").read_text(encoding="utf-8")).get("SQUADS") or {}
    mapa = mapa_espn_tm()
    linhas = transferencias({}, set(mapa.values()), arquivo=arq)
    try:
        indice = json.loads((RAIZ / "server" / "cache" / "valores-tm.json").read_text(encoding="utf-8")).get("indice")
    except (OSError, ValueError):
        indice = None
    tm = carreiras_tm(squads, linhas, mapa, elencos_tm(), indice=indice)
    publicados = {f.stem: json.loads(f.read_text(encoding="utf-8")) for f in sorted(pasta.glob("*.json"))}
    nomes = {str(r[4]): r[1] for el in squads.values() for r in el}
    a = auditoria(publicados, tm)
    print(f"jogadores com carreira no Transfermarkt: {a['com_tm']}")
    print(f"com clubes faltando na carreira publicada: {len(a['faltando'])}")
    for cid, aid, f in sorted(a["faltando"], key=lambda x: -len(x[2]))[:25]:
        print(f"  {cid:14} {nomes.get(aid, aid):28} {aid:>8}  faltam: {', '.join(f)}")
    print(f"com clubes só na carreira publicada (base, amadores ou nome diferente): {len(a['so_na_publicada'])}")
