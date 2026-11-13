# © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE).
"""PLACAR — monitor das fotos dos jogadores: confere se cada jogador dos 20 clubes tem foto, procura a foto atual de
quem não tem, guarda uma cópia no próprio site e troca quando o clube publica uma nova.

API:  GET /api/fotos            resumo (quantos têm foto por clube, de que fonte, quem falta)
      GET /api/fotos/<clube>    {id do jogador: foto} do clube
Site: js/fotos.js (gravado pelo robô a cada rodada) e as cópias em img/jogadores/<clube>/<id>.webp.

Fontes, na ordem em que valem:
  1. Site oficial do clube - a foto da temporada, com a camisa atual (server/fotos_clubes.mjs abre a página pública do
     elenco num navegador; quem recusa acesso automático ou pede login fica de fora: Athletico-PR, Corinthians, Cruzeiro);
  2. TheSportsDB  - recorte com a camisa do clube;
  3. ESPN         - foto de perfil recortada (a.espncdn.com/i/headshots); existe para poucos no Brasil;
  4. API-Football - foto de perfil (API oficial, só com API_FOOTBALL_KEY);
  5. Flickr       - foto de jogo recortada em volta do rosto (API oficial, só com FLICKR_API_KEY).
A foto livre da Wikipédia/Wikimedia NÃO aparece enquanto as fotos privadas estão ligadas (decisão do dono): sem
nenhuma das cinco, o site mostra o número da camisa.

As fotos NUNCA saem sozinhas: cada uma é baixada e guardada no site (img/jogadores/), e só é trocada por uma melhor
ou mais nova (o clube publicou outra foto). Só o comando de retirada as tira: MODO_VENDA=1 (ou FOTOS_PRIVADAS=0) apaga
img/jogadores/ e deixa o site só com as fotos livres (que têm licença).
Virada da temporada (ano novo): os sites dos clubes são relidos na hora e as buscas no TheSportsDB recomeçam.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

P = None  # módulo placar_api
CACHE = "mercado-fotos.json"  # nomes cobertos pelo cache do robô (server/cache/mercado-*.json): mudar a lista do cache faz o GitHub perder o cache inteiro
SITES = "mercado-fotos-clubes.json"
SITES_DIAS = 3      # os sites dos clubes são relidos a cada 3 dias (e na virada da temporada)
ESPN_DIAS = 7       # quem não tem foto na ESPN é conferido de novo em 7 dias
LADO = 360          # maior lado da cópia guardada, em pixels
ESPN_FOTO = "https://a.espncdn.com/i/headshots/soccer/players/full/{}.png"
ORDEM = ["Clube", "TheSportsDB", "ESPN", "API-Football", "Flickr"]
RECORTE = {"TheSportsDB", "ESPN"}  # fundo transparente: o site põe o fundo na cor do clube


def _posto(fonte):
    return ORDEM.index(fonte) if fonte in ORDEM else len(ORDEM)


def privadas_ligadas():
    return os.environ.get("FOTOS_PRIVADAS", "1") != "0" and os.environ.get("MODO_VENDA") != "1"


def temporada():
    return int(time.strftime("%Y"))


def _arq(nome=CACHE):
    return os.path.join(P.ROOT, "server", "cache", nome)


def _ler(nome=CACHE):
    try:
        return json.load(open(_arq(nome), encoding="utf-8"))
    except Exception:
        return {}


def _gravar(d, nome=CACHE):
    os.makedirs(os.path.dirname(_arq(nome)), exist_ok=True)
    json.dump(d, open(_arq(nome), "w", encoding="utf-8"), ensure_ascii=False)


def pasta_img():
    return os.path.join(P.ROOT, "img", "jogadores")


def abre(url, timeout=15):
    """A foto existe? (pedido HEAD: não baixa a imagem). True, False ou None (erro de rede: não decide)."""
    if not str(url or "").startswith("https://"):
        return False
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Placar/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            tipo = r.headers.get("Content-Type", "")
            return r.status == 200 and (tipo.startswith("image/") or tipo in ("", "application/octet-stream", "binary/octet-stream"))
    except urllib.error.HTTPError as ex:
        return False if ex.code in (403, 404, 410) else None
    except Exception:
        return None


def baixar(url):
    """Os bytes da imagem (ou None). Primeiro a cópia que o navegador do extrator já recebeu ao abrir o site do clube
    (server/cache/fotos-clubes-img/; alguns sites recusam baixar a foto fora do navegador), depois a internet."""
    arq = os.path.join(P.ROOT, "server", "cache", "fotos-clubes-img", hashlib.sha1(str(url).encode()).hexdigest() + ".img")
    if os.path.exists(arq):
        return open(arq, "rb").read()
    try:
        return P.get(url, timeout=30, headers={"Accept": "image/avif,image/webp,image/png,image/jpeg,*/*"})
    except Exception as ex:
        P.log("fotos: baixar", str(url)[-70:], ex)
        return None


def guardar(cid, aid, dados):
    """Reduz a imagem (maior lado LADO px, mantendo o fundo transparente) e guarda em img/jogadores/<clube>/<id>.webp.
    Devolve o caminho do site, com a marca da versão (?v=) para o navegador buscar a foto nova quando ela muda."""
    try:
        import cv2
        import numpy as np
    except Exception as ex:
        P.log("fotos: OpenCV indisponível", ex)
        return None
    img = cv2.imdecode(np.frombuffer(dados, np.uint8), cv2.IMREAD_UNCHANGED)
    if img is None or img.ndim < 2 or min(img.shape[:2]) < 60:
        return None
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    h, w = img.shape[:2]
    k = LADO / max(h, w)
    if k < 1:
        img = cv2.resize(img, (max(1, round(w * k)), max(1, round(h * k))), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".webp", img, [cv2.IMWRITE_WEBP_QUALITY, 82])
    if not ok:
        return None
    pasta = os.path.join(pasta_img(), cid)
    os.makedirs(pasta, exist_ok=True)
    nome = re.sub(r"[^a-z0-9-]", "", str(aid).lower()) or "x"
    open(os.path.join(pasta, f"{nome}.webp"), "wb").write(buf.tobytes())
    return f"img/jogadores/{cid}/{nome}.webp?v={hashlib.sha1(buf.tobytes()).hexdigest()[:8]}"


def _existe(u):
    return bool(u) and os.path.exists(os.path.join(P.ROOT, u.split("?")[0].replace("/", os.sep)))


def alvos():
    """{clube: {id: {"nome", "completo", "num", "espn", "clubes"}}}: elenco e emprestados da janela de transferências
    e quem tem estatísticas na temporada (inclusive quem já saiu do elenco)."""
    with P.lock:
        mc = P.state.get("mercado") or {}
        jg = P.state.get("jogadores") or {}
    out = {}
    for cid in P.CLUBS:
        o = out.setdefault(cid, {})
        d = mc.get(cid) or {}
        for j in d.get("elenco", []):
            o[str(j["id"])] = {"nome": j["nome"], "completo": j.get("nomeCompleto"), "num": j.get("num"), "espn": str(j["id"]), "clubes": []}
        for e in d.get("emprestados", []):
            o[str(e["id"])] = {"nome": e["nome"], "espn": str(e.get("espn") or ""), "clubes": [x for x in (e.get("clube"), e.get("clubeEspn")) if x], "fora": True}
        for aid, j in ((jg.get(cid) or {}).get("jogadores") or {}).items():
            if str(aid) not in o and j.get("n"):
                o[str(aid)] = {"nome": j["n"], "espn": str(aid), "clubes": []}
    return out


# ---------------------------------------------------------------------------
# Sites oficiais: ler (server/fotos_clubes.mjs) e cruzar as fotos com o elenco pelo nome
# ---------------------------------------------------------------------------
def ler_sites(forcar=False):
    """Relê os sites dos clubes quando o arquivo tem mais de SITES_DIAS dias (ou forcar). Precisa do Node, do Playwright
    e de um Chrome/Chromium; sem eles, fica o que já foi lido."""
    s = _ler(SITES)
    if not forcar and s.get("quando", 0) > time.time() - SITES_DIAS * 86400:
        return s
    if os.environ.get("FOTOS_CLUBES", "1") == "0":
        return s
    script = os.path.join(P.ROOT, "server", "fotos_clubes.mjs")
    try:
        r = subprocess.run(["node", script, _arq(SITES) + ".novo"], cwd=P.ROOT, capture_output=True, text=True, timeout=20 * 60)
        for linha in (r.stdout or "").splitlines()[-25:]:
            P.log(linha)
        if r.returncode != 0:
            P.log("fotos: sites dos clubes", (r.stderr or "")[-300:])
            return s
        novo = json.load(open(_arq(SITES) + ".novo", encoding="utf-8"))
        # clube que falhou nesta leitura mantém o que foi lido antes
        for cid, v in (s.get("clubes") or {}).items():
            if (novo["clubes"].get(cid) or {}).get("erro") and v.get("fotos"):
                novo["clubes"][cid] = v
        _gravar(novo, SITES)
        os.remove(_arq(SITES) + ".novo")
        return novo
    except Exception as ex:
        P.log("fotos: sites dos clubes", ex)
        return s


# data de notícia ("30 JUL 2026", "12 de novembro de 2026", "12/11/2026"); com o ano, para "7 Marinho" não virar "7 mar"
NOTICIA = re.compile(r"\b\d{1,2}\s+(de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?\s+(de\s+)?\d{4}\b|\b\d{1,2}/\d{1,2}/\d{2,4}\b", re.I)
RUIDO = {"foto", "site", "slider", "sem", "superbet", "santinho", "goleiro", "goleiros", "zagueiro", "zagueiros", "lateral", "direito",
         "esquerdo", "volante", "meia", "meio", "campo", "atacante", "atacantes", "png", "jpg", "jpeg", "webp", "squad", "member", "atleta",
         "fut", "prof", "masc", "gol", "zag", "lat", "vol", "ata", "mei"}


def _tokens(txt):
    return set(P.JOG._norm(re.sub(r"([a-z])([A-Z])", r"\1 \2", str(txt or "")))) - RUIDO


def cartoes(fotos):
    """[(palavras do cartão, palavras fortes, números no cartão, endereço da foto)], sem os cartões de notícia.
    Fortes: as do texto alternativo da foto e do nome do arquivo (dizem de quem é a foto); o texto em volta pode juntar
    vários jogadores (Vitória, por exemplo) e, comprido demais, não conta."""
    out = []
    for f in fotos or []:
        txt = f.get("txt") or ""
        if NOTICIA.search(txt):
            continue
        arquivo = re.sub(r"\.\w+(\?.*)?$", "", (f.get("src") or "").rsplit("/", 1)[-1])
        arquivo = re.sub(r"[-_]\d+x\d+$|[-_]\d{6,}.*$", "", arquivo)
        fortes = _tokens(f.get("alt")) | _tokens(arquivo.replace("_", " ").replace("-", " "))
        texto = _tokens(txt) if len(txt.split()) <= 18 else set()
        if fortes | texto:
            out.append((fortes | texto, fortes, set(re.findall(r"\b\d{1,2}\b", txt)) if texto else set(), f["src"]))
    return out


def casar(fotos, jogadores):
    """{id do jogador: endereço da foto}. Uma foto vale para o jogador quando todas as palavras do nome dele (ou do nome
    completo) estão no cartão; com mais de um cartão possível, ganha o que tem o nome no texto da foto ou no nome do
    arquivo, e depois o que tem o número da camisa; empate = fica sem (melhor sem foto que com a foto de outro). Cada
    foto vai para um jogador só, o mais específico primeiro."""
    cards = cartoes(fotos)
    pares = []
    for aid, info in jogadores.items():
        if info.get("fora"):
            continue
        nomes = [n for n in (info.get("nome"), info.get("completo")) if n]
        hits = []
        for i, (toks, fortes, nums, _src) in enumerate(cards):
            melhor = 0
            for n in nomes:
                nt = set(P.JOG._norm(n)) - {"de", "da", "do", "dos", "das", "e"}
                if nt and nt <= toks:
                    melhor = max(melhor, len(nt) * 2 + (4 if nt <= fortes else 0) + (3 if info.get("num") and str(info["num"]) in nums else 0))
            if melhor:
                hits.append((melhor, i))
        hits.sort(reverse=True)
        if hits and (len(hits) == 1 or hits[0][0] > hits[1][0]):
            pares.append((hits[0][0], aid, hits[0][1]))
    usados, out = set(), {}
    for _score, aid, i in sorted(pares, reverse=True):
        if i not in usados:
            usados.add(i)
            out[aid] = cards[i][3]
    return out


def _af_clube(c, cid, agora):
    """Fotos do elenco pela API-Football (1 consulta por clube, guardada por 7 dias)."""
    FE = P.FE
    r = (c.setdefault("af", {})).get(cid)
    if r and agora - r.get("t", 0) < 7 * 86400 and r.get("temp") == temporada():
        return r.get("d") or {}
    d = FE.af_elenco(cid) if FE else None
    if d is None:
        return (r or {}).get("d") or {}
    d = {k: {"nome": v.get("nome"), "foto": v.get("foto")} for k, v in d.items() if str(v.get("foto") or "").startswith("https://media.api-sports.io/")}
    c["af"][cid] = {"t": agora, "temp": temporada(), "d": d}
    return d


def candidatos(aid, info, fe, af, do_site, espn_ok):
    """As fotos possíveis do jogador, na ordem em que valem: [(fonte, {"src", ...}), ...]."""
    out = []
    if do_site:
        out.append(("Clube", {"src": do_site}))
    t = ((fe.get("tsdb") or {}).get(aid) or {}).get("d") or {}
    if t.get("foto"):
        out.append(("TheSportsDB", {"src": t["foto"]}))
    if espn_ok and info.get("espn"):
        out.append(("ESPN", {"src": ESPN_FOTO.format(info["espn"])}))
    if af and P.FE:
        achado = next((v for v in af.values() if P.FE.mesmo_nome(info["nome"], v.get("nome"))), None)
        if achado:
            out.append(("API-Football", {"src": achado["foto"]}))
    f = ((fe.get("flickr") or {}).get(aid) or {}).get("d") or {}
    if f.get("url"):
        out.append(("Flickr", {"src": f["url"], "r": f.get("rosto"), "a": f.get("autor"), "p": f.get("pagina")}))
    return out


def retirar():
    """O comando de retirada (MODO_VENDA=1 ou FOTOS_PRIVADAS=0): apaga as cópias e o registro das fotos privadas."""
    if os.path.isdir(pasta_img()):
        shutil.rmtree(pasta_img(), ignore_errors=True)
    c = _ler()
    if c.get("j"):
        c["j"] = {}
        _gravar(c)
    P.log("fotos: fotos privadas retiradas (modo venda)")


def publicadas():
    """As fotos que já estão no site (js/fotos.js) e cuja cópia existe no disco: {id: foto}."""
    try:
        s = open(os.path.join(P.ROOT, "js", "fotos.js"), encoding="utf-8").read()
        d = json.JSONDecoder().raw_decode(s[s.index("window.FOTOS = ") + len("window.FOTOS = "):])[0]
    except Exception:
        return {}
    return {aid: f for c in d.values() for aid, f in (c or {}).items() if f.get("f") != "Wikimedia" and _existe(f.get("u"))}


def atualizar(max_baixar=400):
    """Uma rodada do monitor. Devolve o resumo (também guardado no cache)."""
    if not privadas_ligadas():
        retirar()
    c = _ler()
    agora, T = time.time(), temporada()
    js = c.setdefault("j", {})
    # a foto que já está no site nunca sai: se o registro não a conhece (cache novo, outra máquina), ela é adotada
    if privadas_ligadas():
        for aid, f in publicadas().items():
            if not _existe((js.get(aid) or {}).get("u")):
                js[aid] = {**{k: f[k] for k in ("u", "f", "r", "a", "p") if f.get(k)}, "temp": T, "t": agora}
    esp = c.setdefault("espn", {})
    fe = P.FE._ler() if P.FE else {}
    virada = bool(c.get("temp")) and c["temp"] != T
    if virada and P.FE:
        for r in (fe.get("tsdb") or {}).values():
            r["t"] = 0
        for r in (fe.get("flickr") or {}).values():
            r["t"] = 0
        P.FE._gravar(fe)
        P.log(f"fotos: temporada {T} começou; sites dos clubes relidos e buscas recomeçadas")
    c["temp"] = T
    alvo = alvos()
    resumo = {"temporada": T, "quando": agora, "clubes": {}}
    if privadas_ligadas():
        sites = ler_sites(forcar=virada)
        site_por_clube = {cid: casar(((sites.get("clubes") or {}).get(cid) or {}).get("fotos"), jogs) for cid, jogs in alvo.items()}
        af_on = bool(os.environ.get("API_FOOTBALL_KEY", "").strip())
        # ESPN: só para quem não tem foto do clube nem do TheSportsDB (um pedido HEAD por jogador, revisto a cada 7 dias)
        testar = []
        for cid, jogs in alvo.items():
            for aid, info in jogs.items():
                tem_melhor = aid in site_por_clube[cid] or (((fe.get("tsdb") or {}).get(aid) or {}).get("d") or {}).get("foto")
                e = esp.get(aid)
                if not tem_melhor and info.get("espn") and (not e or agora - e.get("t", 0) > ESPN_DIAS * 86400):
                    testar.append((aid, info["espn"]))
        with ThreadPoolExecutor(max_workers=8) as ex:
            for aid, ok in zip([a for a, _ in testar], ex.map(lambda t: abre(ESPN_FOTO.format(t[1])), testar)):
                if ok is not None:
                    esp[aid] = {"t": agora, "ok": bool(ok)}
        # o que baixar: foto nova (ninguém tinha), foto melhor (fonte que vale mais) ou foto trocada pelo clube
        tarefas = []
        for cid, jogs in alvo.items():
            af = _af_clube(c, cid, agora) if af_on else None
            for aid, info in jogs.items():
                cands = candidatos(aid, info, fe, af, site_por_clube[cid].get(aid), (esp.get(aid) or {}).get("ok"))
                if not cands:
                    continue
                cur = js.get(aid) or {}
                fonte, foto = cands[0]
                tem = _existe(cur.get("u"))
                if tem and cur.get("src") == foto["src"]:
                    if fonte == "Clube" and cur.get("temp") != T:
                        cur["temp"] = T  # o clube ainda mostra esta foto: é a da temporada
                    continue
                if tem and _posto(cur.get("f")) < _posto(fonte):
                    continue  # a guardada vale mais que a que apareceu
                tarefas.append((cid, aid, cands, cur if tem else {}))
        tarefas = tarefas[:max_baixar]

        def resolve(t):
            cid, aid, cands, cur = t
            for fonte, foto in cands:
                if cur and (_posto(fonte) > _posto(cur["f"]) or (fonte == cur["f"] and foto["src"] == cur.get("src"))):
                    break  # chegou numa foto que não vale mais que a guardada: fica a guardada
                dados = baixar(foto["src"])
                u = guardar(cid, aid, dados) if dados else None
                if u:
                    return aid, {"u": u, "f": fonte, "src": foto["src"], "temp": T, "t": agora, **{k: v for k, v in foto.items() if k in ("r", "a", "p") and v}}
            return aid, None  # nada novo: a foto guardada (se houver) continua

        novas = 0
        with ThreadPoolExecutor(max_workers=6) as ex:
            for aid, r in ex.map(resolve, tarefas):
                if r:
                    js[aid] = r
                    novas += 1
    for cid, jogs in alvo.items():
        fontes, faltam = {}, []
        for aid, info in jogs.items():
            f = foto_de(aid, c)
            if f:
                fontes[f["f"]] = fontes.get(f["f"], 0) + 1
            else:
                faltam.append({"id": aid, "nome": info["nome"]})
        resumo["clubes"][cid] = {"jogadores": len(jogs), "comFoto": len(jogs) - len(faltam), "fontes": fontes, "faltam": faltam}
    c["resumo"] = resumo
    _gravar(c)
    tot = sum(x["jogadores"] for x in resumo["clubes"].values())
    com = sum(x["comFoto"] for x in resumo["clubes"].values())
    P.log(f"fotos: {com} de {tot} jogadores com foto" + (f"; {novas} fotos novas guardadas" if privadas_ligadas() else ""))
    return resumo


def foto_de(aid, c=None):
    """A foto que o site mostra (sem pegar a trava do servidor): {"u", "f", ...} ou None.
    Com as privadas ligadas, só as guardadas (nunca a da Wikipédia); no modo venda, só a livre."""
    c = c if c is not None else _ler()
    if privadas_ligadas():
        r = (c.get("j") or {}).get(str(aid)) or {}
        if not r.get("u") or not _existe(r["u"]):
            return None
        return {k: r[k] for k in ("u", "f", "r", "a", "p") if r.get(k)}
    with P.lock:
        jg = P.state.get("jogadores") or {}
    for d in jg.values():
        f = ((d.get("jogadores") or {}).get(str(aid)) or {}).get("foto")
        if f and f.get("url"):
            return {"u": f["url"], "f": "Wikimedia"}
    return None


def do_clube(cid, c=None):
    """{id: {"u", "f", "r"?, "a"?, "p"?}} das fotos do clube."""
    c = c if c is not None else _ler()
    with P.lock:
        jg = P.state.get("jogadores") or {}
        mc = P.state.get("mercado") or {}
    ids = set(((jg.get(cid) or {}).get("jogadores") or {}).keys())
    d = mc.get(cid) or {}
    ids |= {str(j["id"]) for j in d.get("elenco", []) + d.get("emprestados", [])}
    out = {}
    for aid in ids:
        f = foto_de(aid, c)
        if f:
            out[aid] = f
    return out


def campos_mercado(aid, c=None):
    """(fotoPrivada, fotoInfo) do elenco da janela de transferências; a foto livre (Wikimedia) já vai em "foto"."""
    f = foto_de(aid, c)
    if not f or f["f"] == "Wikimedia":
        return None, None
    info = None if f["f"] == "TheSportsDB" else {"fonte": f["f"], **{k2: f[k1] for k1, k2 in (("a", "autor"), ("p", "pagina"), ("r", "rosto")) if f.get(k1)}}
    return f["u"], info


def resumo():
    return _ler().get("resumo") or {}


def aplicar_mercado():
    """Põe a foto do monitor no elenco da janela de transferências (fotoPrivada e fotoInfo)."""
    c = _ler()
    with P.lock:
        mercado = list((P.state.get("mercado") or {}).values())
    campos = {}
    for d in mercado:
        for j in d.get("elenco", []) + d.get("emprestados", []):
            campos[str(j["id"])] = campos_mercado(j["id"], c)  # fora da trava: foto_de pode pegá-la no modo venda
    with P.lock:
        for d in (P.state.get("mercado") or {}).values():
            for j in d.get("elenco", []) + d.get("emprestados", []):
                j["fotoPrivada"], j["fotoInfo"] = campos.get(str(j["id"]), (None, None))


def gravar_js():
    c = _ler()
    dados = {cid: do_clube(cid, c) for cid in P.CLUBS}
    open(os.path.join(P.ROOT, "js", "fotos.js"), "w", encoding="utf-8", newline="\n").write(
        "/* PLACAR — fotos dos jogadores, conferidas e guardadas pelo monitor de fotos (server/fotos.py). As fotos dos sites dos "
        "clubes, TheSportsDB, ESPN, API-Football e Flickr são privadas do dono (sem licença comercial); o comando de retirada "
        "(MODO_VENDA=1) apaga todas. Gerado por: python server/placar_api.py --snapshot */\nwindow.FOTOS = "
        + json.dumps(P.clean_deep(dados), ensure_ascii=False, separators=(",", ":")) + ";\n")
    P.log("fotos gravadas em js/fotos.js")
