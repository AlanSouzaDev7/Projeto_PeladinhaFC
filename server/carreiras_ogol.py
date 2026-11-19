# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""CazéStats.TV — carreira de um jogador pelo ogol.com.br (rede zerozero), usado por server/carreiras.py.

Por que o ogol: tem a carreira de temporada em temporada de praticamente todo jogador profissional brasileiro, servida
direto na página (sem API escondida), e o robots.txt dele permite as páginas de equipe e de jogador.
Transfermarkt, SofaScore, FotMob e ge foram testados em 18/11/2026: o robots.txt proíbe o caminho dos dados (/ceapi,
/api) ou o site recusa robôs (403, desafio anti-robô). Contornar isso seria invadir, então eles ficam de fora.

Como: a página do clube no ogol lista o elenco atual com o endereço de cada jogador; o jogador é achado pelo nome; a tabela
"Carreira" da página dele dá o clube de cada temporada. Só vale se a temporada mais recente for no clube do site (nada de
homônimo). Ritmo: 1 página por segundo, com cache (server/cache/carreiras.json).
"""
import re
import time
import unicodedata

P = None  # módulo placar_api
BASE = "https://www.ogol.com.br"
CLUBES = {"athletico-pr": "athletico-paranaense", "atletico-mg": "atletico-mineiro", "bahia": "bahia/2231", "botafogo": "botafogo",
          "bragantino": "red-bull-bragantino", "chapecoense": "chapecoense/3195", "corinthians": "corinthians", "coritiba": "coritiba/2235",
          "cruzeiro": "cruzeiro", "flamengo": "flamengo", "fluminense": "fluminense", "gremio": "gremio", "internacional": "internacional",
          "mirassol": "mirassol/3348", "palmeiras": "palmeiras", "remo": "remo/3423", "santos": "santos", "sao-paulo": "sao-paulo",
          "vasco": "vasco", "vitoria": "vitoria/2259"}
BASE_TIME = re.compile(r"\bsub[- ]?\d\d|\bu[- ]?\d\d\b|\bjun\b|junior(es)?\b|juvenil|\bii\b|\sb$|\bsel\.|sele[cç][aã]o", re.I)
_ultimo = [0.0]


def _norm(x):
    x = unicodedata.normalize("NFD", str(x or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]", " ", x).split()


def _pagina(caminho):
    espera = 1.0 - (time.time() - _ultimo[0])  # no máximo 1 página por segundo
    if espera > 0:
        time.sleep(espera)
    _ultimo[0] = time.time()
    return P.get(BASE + caminho, timeout=30).decode("utf-8", "ignore")


def elenco(cid):
    """{nome normalizado do endereço: (slug, id)} dos jogadores ligados na página do clube no ogol."""
    caminho = CLUBES.get(cid)
    if not caminho:
        return {}
    h = _pagina(f"/equipe/{caminho}")
    return {" ".join(slug.split("-")): (slug, pid) for slug, pid in re.findall(r"/jogador/([a-z0-9-]+)/(\d+)", h)}


def acha(nome, mapa):
    """(slug, id) do jogador: nome igual ao endereço; senão, um único endereço com todas as palavras do nome."""
    alvo = " ".join(_norm(nome))
    if alvo in mapa:
        return mapa[alvo]
    pal = set(alvo.split())
    cands = {v for k, v in mapa.items() if pal and pal <= set(k.split())}
    return cands.pop() if len(cands) == 1 else None


def _ano_fim(temporada):
    m = re.match(r"((?:19|20)\d\d)(?:/(\d\d))?", temporada)
    if not m:
        return None, None
    ini = int(m.group(1))
    return ini, (ini // 100 * 100 + int(m.group(2)) if m.group(2) else ini)


def carreira(slug, pid, nascido=None):
    """[(ano ini, ano fim, nome do clube, id do clube no ogol, logo)] do mais antigo ao atual (só clubes principais).
    nascido: ano de nascimento; temporadas antes dos 17 anos são de base e ficam de fora."""
    h = _pagina(f"/jogador/{slug}/{pid}")
    logos = {i: BASE + src for src, i in re.findall(r'src="(/img/logos/equipas/(\d+)_imgbank_[^"]+)"', h)}
    linhas, temporada = [], ""
    for eq, corpo in re.findall(r"tpstats=club&epoca_id=\d+&equipa_id=(\d+)';\">(.*?)</tr>", h, re.S):
        tds = re.findall(r"<td[^>]*>(.*?)</td>", corpo, re.S)
        t = re.sub(r"<[^>]+>", "", tds[1]).strip() if len(tds) > 1 else ""
        temporada = t or temporada  # temporada em branco = a mesma da linha de cima (dois clubes no mesmo ano)
        m = re.search(r'<a href="/equipe/[^"]+"[^>]*>([^<]+)</a>', corpo)
        if not m or not temporada:
            continue
        nome = P.clean_text(m.group(1), 50)
        if BASE_TIME.search(nome):
            continue
        ini, fim = _ano_fim(temporada)
        if ini and not (nascido and fim < nascido + 17):
            linhas.append((ini, fim, nome, eq))
    if not linhas and "tpstats=club" not in h:
        raise ValueError(f"página do ogol sem a tabela de carreira ({slug})")  # resposta incompleta: tenta noutra rodada
    linhas.reverse()  # a página vem do mais recente para o mais antigo
    trechos = []
    for ini, fim, nome, eq in linhas:
        if trechos and (trechos[-1][3] == eq or _norm(trechos[-1][2]) == _norm(nome)):  # o mesmo clube (ou a base dele, com outro id)
            a = trechos[-1]
            trechos[-1] = (min(a[0], ini), max(a[1], fim), a[2], eq, a[4])
        else:
            trechos.append((ini, fim, nome, eq, logos.get(eq)))
    return trechos


def nome_bate(nome_ogol, nome_oficial, distintivas):
    """'Grêmio' x 'Grêmio Foot-Ball Porto Alegrense': as palavras do ogol dentro do nome oficial (ou o contrário)."""
    a, b = distintivas(nome_ogol), distintivas(nome_oficial)
    return bool(a and b) and (a <= b or b <= a)
