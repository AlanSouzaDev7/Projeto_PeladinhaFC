# © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE).
"""PLACAR — monitor das fotos dos jogadores: confere se cada jogador dos 20 clubes tem foto, procura quem não tem,
confere se as fotos ainda abrem e renova tudo a cada temporada.

API:  GET /api/fotos            resumo (quantos têm foto por clube, de que fonte, quem falta)
      GET /api/fotos/<clube>    {id do jogador: foto} do clube
Site: js/fotos.js (gravado pelo robô a cada rodada), lido pelo js/heatmap.js e aplicado em todo o site.

Fontes, na ordem em que valem (só APIs e arquivos públicos; nada é raspado):
  1. TheSportsDB  - recorte com a camisa do clube (o estilo das fotos do Cruzeiro e do Flamengo), sem chave;
  2. ESPN         - foto de perfil recortada (a.espncdn.com/i/headshots), sem chave; existe para poucos no Brasil;
  3. Flickr       - foto de jogo recortada em volta do rosto (API oficial, FLICKR_API_KEY);
  4. API-Football - foto de perfil de praticamente todo jogador inscrito (API oficial, API_FOOTBALL_KEY);
  5. Wikimedia Commons - a foto livre que o site já tinha.
As fotos 1 a 4 NÃO têm licença para uso comercial: são privadas do dono enquanto o site é de uso pessoal. Com
MODO_VENDA=1 (ou FOTOS_PRIVADAS=0) o monitor não grava nenhuma delas, e o site fica só com as fotos livres.

Prazos: foto achada é conferida (ainda abre?) a cada 7 dias; quem está sem foto é procurado de novo a cada 3 dias;
na virada da temporada (ano novo) todos são procurados de novo, e as buscas no TheSportsDB recomeçam, para trocar
as fotos da camisa antiga pelas da nova.
"""
import json
import os
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

P = None  # módulo placar_api
CACHE = "mercado-fotos.json"  # nome coberto pelo cache do robô (server/cache/mercado-*.json): mudar a lista do cache faz o GitHub perder o cache inteiro
CONFERE_DIAS, PROCURA_DIAS = 7, 3
ESPN_FOTO = "https://a.espncdn.com/i/headshots/soccer/players/full/{}.png"
RECORTE = {"TheSportsDB", "ESPN"}  # fotos já recortadas (fundo transparente): o site põe o fundo na cor do clube


def privadas_ligadas():
    return os.environ.get("FOTOS_PRIVADAS", "1") != "0" and os.environ.get("MODO_VENDA") != "1"


def temporada():
    return int(time.strftime("%Y"))


def _arq():
    return os.path.join(P.ROOT, "server", "cache", CACHE)


def _ler():
    try:
        return json.load(open(_arq(), encoding="utf-8"))
    except Exception:
        return {}


def _gravar(d):
    os.makedirs(os.path.dirname(_arq()), exist_ok=True)
    json.dump(d, open(_arq(), "w", encoding="utf-8"), ensure_ascii=False)


def abre(url, timeout=15):
    """A foto ainda existe? (pedido HEAD: não baixa a imagem). True, False ou None (erro de rede: não decide)."""
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


def alvos():
    """{clube: {id: {"nome", "espn", "clubes"}}}: elenco e emprestados da janela de transferências e quem tem
    estatísticas na temporada (inclusive quem já saiu do elenco)."""
    with P.lock:
        mc = P.state.get("mercado") or {}
        jg = P.state.get("jogadores") or {}
    out = {}
    for cid in P.CLUBS:
        o = out.setdefault(cid, {})
        d = mc.get(cid) or {}
        for j in d.get("elenco", []):
            o[str(j["id"])] = {"nome": j["nome"], "espn": str(j["id"]), "clubes": []}
        for e in d.get("emprestados", []):
            o[str(e["id"])] = {"nome": e["nome"], "espn": str(e.get("espn") or ""), "clubes": [x for x in (e.get("clube"), e.get("clubeEspn")) if x]}
        for aid, j in ((jg.get(cid) or {}).get("jogadores") or {}).items():
            if str(aid) not in o and j.get("n"):
                o[str(aid)] = {"nome": j["n"], "espn": str(aid), "clubes": []}
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


def candidatos(cid, aid, info, fe, af, livres):
    """As fotos possíveis do jogador, na ordem em que valem: [(fonte, foto), ...]. A da ESPN é testada depois."""
    out = []
    if privadas_ligadas():
        t = ((fe.get("tsdb") or {}).get(aid) or {}).get("d") or {}
        if t.get("foto"):
            out.append(("TheSportsDB", {"u": t["foto"]}))
        if info.get("espn"):
            out.append(("ESPN", {"u": ESPN_FOTO.format(info["espn"])}))
        f = ((fe.get("flickr") or {}).get(aid) or {}).get("d") or {}
        if f.get("url"):
            out.append(("Flickr", {"u": f["url"], "r": f.get("rosto"), "a": f.get("autor"), "p": f.get("pagina")}))
        if af and P.FE:
            achado = next((v for v in af.values() if P.FE.mesmo_nome(info["nome"], v.get("nome"))), None)
            if achado:
                out.append(("API-Football", {"u": achado["foto"]}))
    lv = livres.get(aid)
    if lv and lv.get("url"):
        out.append(("Wikimedia", {"u": lv["url"], "livre": True}))
    return out


def atualizar(max_testes=1500):
    """Uma rodada do monitor. Devolve o resumo (também guardado no cache)."""
    c = _ler()
    agora, T = time.time(), temporada()
    js = c.setdefault("j", {})
    fe = P.FE._ler() if P.FE else {}
    # virada da temporada: as buscas no TheSportsDB recomeçam (fotos com a camisa nova) e todos são procurados de novo
    if c.get("temp") and c["temp"] != T and P.FE:
        for r in (fe.get("tsdb") or {}).values():
            r["t"] = 0
        for r in (fe.get("flickr") or {}).values():
            r["t"] = 0
        P.FE._gravar(fe)
        P.log(f"fotos: temporada {T} começou; todas as fotos serão procuradas de novo")
    c["temp"] = T
    with P.lock:
        jg = P.state.get("jogadores") or {}
    alvo = alvos()
    tarefas = []  # (cid, aid, info, motivo)
    for cid, jogs in alvo.items():
        for aid, info in jogs.items():
            r = js.get(aid)
            if not r or r.get("temp") != T:
                tarefas.append((cid, aid, info, "nova temporada" if r else "primeira vez"))
            elif r.get("u") and agora - r.get("v", 0) > CONFERE_DIAS * 86400:
                tarefas.append((cid, aid, info, "conferir"))
            elif not r.get("u") and agora - r.get("t", 0) > PROCURA_DIAS * 86400:
                tarefas.append((cid, aid, info, "procurar"))
            elif r.get("u") and r.get("f") != "TheSportsDB":
                # já tem foto, mas uma melhor pode ter aparecido (o recorte do TheSportsDB vale mais)
                t = ((fe.get("tsdb") or {}).get(aid) or {}).get("d") or {}
                if t.get("foto") and privadas_ligadas():
                    tarefas.append((cid, aid, info, "foto melhor"))
            elif r.get("u") and r.get("f") != "Wikimedia" and not privadas_ligadas():
                tarefas.append((cid, aid, info, "modo venda"))
    tarefas = tarefas[:max_testes]
    af_por_clube = {cid: _af_clube(c, cid, agora) for cid in {t[0] for t in tarefas}} if os.environ.get("API_FOOTBALL_KEY", "").strip() else {}

    def resolve(t):
        cid, aid, info, motivo = t
        livres = {k: v.get("foto") for k, v in ((jg.get(cid) or {}).get("jogadores") or {}).items() if v.get("foto")}
        velho = js.get(aid) or {}
        if motivo == "conferir":
            ok = abre(velho["u"])
            if ok:
                return aid, {**velho, "v": agora}
            if ok is None:
                return aid, velho  # rede falhou: confere na próxima
        for fonte, foto in candidatos(cid, aid, info, fe, af_por_clube.get(cid), livres):
            if foto.get("livre"):  # a foto livre já é conferida pelo módulo de jogadores
                return aid, {"temp": T, "t": agora, "v": agora, "f": fonte, **{k: v for k, v in foto.items() if v and k != "livre"}}
            ok = abre(foto["u"])
            if ok:
                return aid, {"temp": T, "t": agora, "v": agora, "f": fonte, **{k: v for k, v in foto.items() if v}}
            if ok is None and fonte != "ESPN":
                return aid, velho or None  # rede falhou numa foto que existe: tenta de novo na próxima
        return aid, {"temp": T, "t": agora}  # nenhuma foto: procura de novo em 3 dias

    with ThreadPoolExecutor(max_workers=8) as ex:
        for aid, r in ex.map(resolve, tarefas):
            if r is None:
                js.pop(aid, None)
            else:
                js[aid] = r
    resumo = {"temporada": T, "quando": agora, "clubes": {}}
    for cid, jogs in alvo.items():
        fontes, faltam = {}, []
        for aid, info in jogs.items():
            r = js.get(aid) or {}
            if r.get("u"):
                fontes[r["f"]] = fontes.get(r["f"], 0) + 1
            else:
                faltam.append({"id": aid, "nome": info["nome"]})
        resumo["clubes"][cid] = {"jogadores": len(jogs), "comFoto": len(jogs) - len(faltam), "fontes": fontes, "faltam": faltam}
    c["resumo"] = resumo
    _gravar(c)
    tot = sum(x["jogadores"] for x in resumo["clubes"].values())
    com = sum(x["comFoto"] for x in resumo["clubes"].values())
    P.log(f"fotos: {len(tarefas)} jogadores conferidos ou procurados; {com} de {tot} com foto")
    return resumo


def do_clube(cid, c=None):
    """{id: {"u", "f", "r"?, "a"?, "p"?}} das fotos do clube (só as privadas com elas ligadas)."""
    c = c if c is not None else _ler()
    with P.lock:
        jg = P.state.get("jogadores") or {}
        mc = P.state.get("mercado") or {}
    ids = set(((jg.get(cid) or {}).get("jogadores") or {}).keys())
    d = mc.get(cid) or {}
    ids |= {str(j["id"]) for j in d.get("elenco", []) + d.get("emprestados", [])}
    out = {}
    for aid in ids:
        r = (c.get("j") or {}).get(aid) or {}
        if not r.get("u") or (r.get("f") != "Wikimedia" and not privadas_ligadas()):
            continue
        out[aid] = {k: r[k] for k in ("u", "f", "r", "a", "p") if r.get(k)}
    return out


def foto_de(aid, c=None):
    """A foto do jogador conferida pelo monitor (sem pegar a trava do servidor): {"u", "f", ...} ou None."""
    c = c if c is not None else _ler()
    r = (c.get("j") or {}).get(str(aid)) or {}
    if not r.get("u") or (r.get("f") != "Wikimedia" and not privadas_ligadas()):
        return None
    return {k: r[k] for k in ("u", "f", "r", "a", "p") if r.get(k)}


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
        for d in (P.state.get("mercado") or {}).values():
            for j in d.get("elenco", []) + d.get("emprestados", []):
                j["fotoPrivada"], j["fotoInfo"] = campos_mercado(j["id"], c)


def gravar_js():
    c = _ler()
    dados = {cid: do_clube(cid, c) for cid in P.CLUBS}
    open(os.path.join(P.ROOT, "js", "fotos.js"), "w", encoding="utf-8", newline="\n").write(
        "/* PLACAR — fotos dos jogadores, conferidas pelo monitor de fotos (server/fotos.py). As de TheSportsDB, ESPN, Flickr e "
        "API-Football são privadas do dono (sem licença comercial); com MODO_VENDA=1 o robô não grava nenhuma. "
        "Gerado por: python server/placar_api.py --snapshot */\nwindow.FOTOS = " + json.dumps(P.clean_deep(dados), ensure_ascii=False, separators=(",", ":")) + ";\n")
    P.log("fotos gravadas em js/fotos.js")
