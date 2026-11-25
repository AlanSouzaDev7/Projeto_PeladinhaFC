# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""CazéStats.TV — elencos completos do Transfermarkt, uma vez por janela de transferências (janeiro e julho).

O que lê: a página de cada competição (os clubes) e a página de elenco detalhada de cada clube
(/<clube>/kader/verein/<id>/plus/1), que traz de todos os jogadores do elenco profissional: número, posição, nascimento,
nacionalidade, altura, pé, data de chegada, clube anterior e valor pago, fim do contrato, valor de mercado e foto.

Regras de acesso (conferidas em 25/11/2026): o robots.txt do Transfermarkt bloqueia pelo nome robôs de IA e de coleta
em massa e, para os demais (User-agent: *), proíbe só /ceapi, /quickselect, /jumplist, /navigation/getSubNavigation e
/schnellsuche; as páginas de competição e de elenco são permitidas e respondem normalmente a um leitor identificado.
Este robô se identifica (User-Agent "CazeStats/1.0 (+https://cazestats.pages.dev)"), lê uma página a cada 3 segundos e
para de vez no primeiro desafio anti-robô ou recusa (403/429): nunca contorna bloqueio. O arquivo license.xml do site
declara proibido o uso do conteúdo por IA (padrão RSL, "ai-all"): este robô é um programa comum, sem IA, mas o ponto
está registrado em docs/RISCOS-APRESENTACAO.md.

Ritmo: workflow próprio (.github/workflows/valores-tm.yml) em 2 de janeiro e 2 de julho e quando o dono mandar. Cada
clube lido vale por VALIDADE_DIAS; uma execução interrompida continua de onde parou na próxima.
Saída: server/dados-tm/elencos.json (no repositório), lido pelo monitor de valores (server/valores_tm.py) em toda rodada.
Uso: python -X utf8 server/tm_elencos.py [--max-min 100] [--so BRA1,BRA2]
"""
import html
import json
import os
import re
import sys
import time

P = None  # módulo placar_api (para o get com o disjuntor)
BASE = "https://www.transfermarkt.com"
UA = "CazeStats/1.0 (+https://cazestats.pages.dev)"
ESPERA = 3.0  # segundos entre páginas
VALIDADE_DIAS = 150  # um clube lido vale por uma janela de transferências
SAIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dados-tm", "elencos.json")

# competições: as 31 ligas nacionais do conjunto transfermarkt-datasets, as segundas divisões grandes e ligas da América
# do Sul, Ásia e Oriente Médio. Código que não existir no Transfermarkt é pulado (fica registrado na saída).
COMPETICOES = [
    "GB1", "GB2", "ES1", "ES2", "IT1", "IT2", "L1", "L2", "FR1", "FR2", "PO1", "PO2", "NL1", "NL2", "BE1", "TR1", "SC1", "GR1",
    "RU1", "UKR1", "A1", "C1", "DK1", "NO1", "SE1", "PL1", "TS1", "RO1", "SER1", "KR1", "BRA1", "BRA2", "ARG1", "MEX1",
    "MLS1", "COL1", "URU1", "CLPD", "EL1S", "PR1A", "TDeA", "SA1", "JAP1", "RSK1", "CSL", "QSL", "UAE1", "AUS1",
]
SUB = {"Goalkeeper": "GOL", "Centre-Back": "ZAG", "Left-Back": "LE", "Right-Back": "LD", "Defensive Midfield": "VOL",
       "Central Midfield": "MC", "Attacking Midfield": "MEI", "Left Midfield": "ME", "Right Midfield": "MD",
       "Left Winger": "PE", "Right Winger": "PD", "Second Striker": "SA", "Centre-Forward": "CA"}


class Bloqueado(Exception):
    """O site recusou (403/429) ou pediu desafio anti-robô: a execução para aqui."""


_ultimo = [0.0]


def pagina(caminho):
    espera = ESPERA - (time.time() - _ultimo[0])
    if espera > 0:
        time.sleep(espera)
    _ultimo[0] = time.time()
    try:
        h = P.get(BASE + caminho, timeout=40, headers={"User-Agent": UA, "Accept-Language": "en"}).decode("utf-8", "ignore")
    except Exception as ex:
        if getattr(ex, "code", None) in (403, 429) or isinstance(ex, getattr(P, "SiteRecusando", ())):
            raise Bloqueado(f"{caminho}: {ex}") from ex
        raise
    if "Just a moment" in h[:4000] or "challenge-platform" in h[:8000] or "captcha" in h[:6000].lower():
        raise Bloqueado(f"{caminho}: desafio anti-robô")
    return h


def texto(s):
    return html.unescape(re.sub(r"<[^>]+>", " ", s or "")).replace("\xa0", " ").strip()


def valor(txt):
    """'€10.00M' -> 10000000; '€250.0K' -> 250000; '€1.20bn' -> 1200000000; '-' -> None."""
    m = re.search(r"€\s*([\d.,]+)\s*(bn|m|k|th\.)?", (txt or "").replace(",", ""), re.I)
    if not m:
        return None
    n = float(m.group(1))
    mult = {"bn": 1e9, "m": 1e6, "k": 1e3, "th.": 1e3}.get((m.group(2) or "").lower(), 1)
    return int(round(n * mult))


def data_br(txt):
    """'06/06/1987 (39)' ou 'Jun 6, 1987' -> '1987-06-06'."""
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", txt or "")
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    meses = {m3: i for i, m3 in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(), 1)}
    m = re.search(r"([A-Z][a-z]{2}) (\d{1,2}), (\d{4})", txt or "")
    return f"{m.group(3)}-{meses.get(m.group(1), 1):02d}-{int(m.group(2)):02d}" if m else ""


def clubes_da_competicao(h):
    """[(id, slug, nome)] dos clubes na tabela da página de competição."""
    out, vistos = [], set()
    for titulo, slug, cid in re.findall(r'<a title="([^"]+)" href="/([a-z0-9-]+)/startseite/verein/(\d+)(?:/saison_id/\d+)?"', h):
        if cid not in vistos:
            vistos.add(cid)
            out.append((cid, slug, html.unescape(titulo)))
    return out


def _anterior(m):
    """[clube anterior, valor pago]: 'Ceará Sporting Club: Ablöse €1.43m' -> ['Ceará Sporting Club', 1430000];
    'free transfer'/'loan' -> 0; 'Returned after loan spell with Avaí FC; ...' -> ['Avaí FC', 0] (fim de empréstimo)."""
    if not m:
        return None
    nome, taxa = html.unescape(m.group(1)), m.group(2) or ""
    volta = re.match(r"Returned after loan spell with (.+?);", nome)
    if volta:
        return [volta.group(1), 0]
    if "€" in taxa:
        return [nome, valor(taxa)]
    return [nome, 0 if re.search(r"free|loan|end of", taxa, re.I) else None]


def jogadores_do_elenco(h):
    """Lista de jogadores da página de elenco detalhada:
    [id, nome, número, posição (código do site), nascimento, [nacionalidades], altura em cm, pé, chegada,
     [clube anterior, valor pago ou None], fim do contrato, valor de mercado, foto]."""
    t = h[h.find('<table class="items">'):]
    out = []
    for r in re.split(r'<tr class="(?:odd|even)">', t)[1:]:
        m = re.search(r'<td class="hauptlink">\s*<a href="/[^"]*/profil/spieler/(\d+)"[^>]*>(.*?)</a>', r, re.S)
        if not m:
            continue
        tds = re.findall(r'<td class="zentriert"[^>]*>(.*?)</td>', r, re.S)
        num = texto((re.search(r'<div class=rn_nummer>(.*?)</div>', r) or [None, ""])[1])
        pos_txt = texto((re.search(r'<tr>\s*<td>\s*([^<]+?)\s*</td>\s*</tr>', r) or [None, ""])[1])
        foto = re.search(r'data-src="https://img\.a\.transfermarkt\.technology/portrait/[a-z]+/([^"?]+)', r)
        nacs = [html.unescape(x) for x in re.findall(r'<img[^>]*title="([^"]+)"[^>]*class="flaggenrahmen"', r)]
        anterior = re.search(r'<a title="([^"]*?)(?::\s*(?:Ablöse|Fee)\s*([^"]*))?" href="/[^"]*/startseite/verein/\d+', r)
        alt = re.search(r"(\d),(\d{2})\s*m", r)
        valor_txt = texto((re.search(r'<td class="rechts hauptlink">(.*?)</td>', r, re.S) or [None, ""])[1])
        campos = [texto(x) for x in tds]
        nasc = next((data_br(x) for x in campos if re.search(r"\(\d{1,2}\)", x)), "")
        pe = next((x for x in campos if x in ("left", "right", "both")), "")
        datas = [data_br(x) for x in campos if re.fullmatch(r"\d{2}/\d{2}/\d{4}", x)]
        out.append([
            m.group(1), texto(m.group(2)), num if num not in ("-", "") else "", SUB.get(pos_txt, ""), nasc, nacs,
            int(alt.group(1)) * 100 + int(alt.group(2)) if alt else None, {"left": "E", "right": "D", "both": "A"}.get(pe, ""),
            datas[0] if len(datas) >= 1 else "",
            _anterior(anterior),
            datas[1] if len(datas) >= 2 else "", valor(valor_txt), foto.group(1) if foto and "default" not in foto.group(1) else None,
        ])
    return out


def ler():
    try:
        return json.load(open(SAIDA, encoding="utf-8"))
    except Exception:
        return {"competicoes": {}}


def gravar(d):
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    tmp = SAIDA + ".tmp"
    json.dump(d, open(tmp, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, SAIDA)


def rodar(max_min=100, so=None, agora=None):
    """Lê o que estiver vencido (competições e clubes), até max_min minutos. Devolve o resumo."""
    agora = agora or time.time()
    d = ler()
    comps = d.setdefault("competicoes", {})
    lidos = falhas = 0
    inicio = time.time()
    try:
        for code in (so or COMPETICOES):
            c = comps.setdefault(code, {"clubes": {}})
            if not c.get("lido") or agora - c["lido"] > VALIDADE_DIAS * 86400 or not c.get("clubes"):
                h = pagina(f"/x/startseite/wettbewerb/{code}")
                nome = texto((re.search(r"<title>([^<|]+)", h) or [None, code])[1])
                lista = clubes_da_competicao(h)
                c.update({"nome": nome, "lido": agora, "existe": bool(lista)})
                for cid, slug, titulo in lista:
                    c["clubes"].setdefault(cid, {"slug": slug, "nome": titulo})
                gravar(d)
            for cid, cl in c.get("clubes", {}).items():
                if time.time() - inicio > max_min * 60:
                    raise TimeoutError
                if cl.get("lido") and agora - cl["lido"] < VALIDADE_DIAS * 86400:
                    continue
                try:
                    js = jogadores_do_elenco(pagina(f"/{cl['slug']}/kader/verein/{cid}/plus/1"))
                except Bloqueado:
                    raise
                except Exception as ex:
                    falhas += 1
                    print(f"tm: {code} {cl.get('nome')}: {ex}", flush=True)
                    continue
                if js:
                    cl.update({"lido": time.time(), "jogadores": js})
                    lidos += 1
                    if lidos % 10 == 0:
                        gravar(d)
                        print(f"tm: {lidos} clubes lidos ({code} {cl['nome']}: {len(js)} jogadores)", flush=True)
    except TimeoutError:
        print(f"tm: tempo da execução esgotado; continua na próxima", flush=True)
    except Bloqueado as ex:
        print(f"tm: o Transfermarkt recusou o acesso, parando sem insistir: {ex}", flush=True)
    d["gerado"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    gravar(d)
    tot = sum(len(cl.get("jogadores") or []) for c in comps.values() for cl in c.get("clubes", {}).values())
    clubes = sum(1 for c in comps.values() for cl in c.get("clubes", {}).values() if cl.get("jogadores"))
    print(f"tm: {lidos} clubes lidos nesta execução, {falhas} falhas; no arquivo: {clubes} clubes, {tot} jogadores", flush=True)
    return {"lidos": lidos, "falhas": falhas, "clubes": clubes, "jogadores": tot}


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import placar_api
    P = placar_api
    args = sys.argv[1:]
    mx = int(args[args.index("--max-min") + 1]) if "--max-min" in args else 100
    so = args[args.index("--so") + 1].split(",") if "--so" in args else None
    rodar(mx, so)
