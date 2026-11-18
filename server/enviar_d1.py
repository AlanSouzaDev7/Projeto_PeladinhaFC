# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""CazéStats.TV — envia os dados/*.json do robô para o banco D1 (pelo Worker da Cloudflare).

Por que: o Cloudflare Pages grátis aceita 500 publicações por mês, e o robô roda cerca de 70 vezes por dia.
Com os dados no banco, o site lê deles direto (js/dados.js) e só é republicado quando o código muda.

Como:
  1. pergunta ao Worker o hash de cada arquivo guardado (GET /dados/_lista);
  2. envia só os que mudaram (PUT /dados/<nome>.json, com o sha-256 no cabeçalho x-hash);
  3. envia o meta.json por último, para o aviso de "dados de HH:MM" só mudar quando tudo já chegou;
  4. envia os jogos para o histórico (tabela jogos, POST /jogos, em lotes): o banco só regrava o que mudou.
Cada JSON é validado antes de sair daqui (o Worker não interpreta o conteúdo, para caber em 10 ms de CPU).

Uso:  ROBO_CHAVE=... python server/enviar_d1.py [--api https://...workers.dev]
Sai com código 0 se tudo chegou, 1 se algo falhou (aí o workflow publica o site do jeito antigo), 2 sem configuração.
Só biblioteca padrão, como o resto do robô.
"""
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import historico_jogos  # noqa: E402  (módulo irmão, também só biblioteca padrão)

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / "dados"
NOME_OK = re.compile(r"^(meta|[a-z][a-z-]{1,30}(/[a-z0-9][a-z0-9-]{0,30})?)$")  # o mesmo do Worker
MAX = 1_900_000
LOTE_JOGOS = 400  # ~150 KB por pedido
UA = "CazeStats-robo/1.0 (+https://cazestats.pages.dev)"


def api_da_config():
    """O endereço do Worker que o site usa (js/config.js), para não haver dois lugares a mudar."""
    txt = (RAIZ / "js" / "config.js").read_text(encoding="utf-8")
    m = re.search(r'\bapi:\s*"(https://[^"]+)"', txt)
    return m.group(1) if m else ""


def pedido(metodo, url, chave, corpo=None, cab=None, tentativas=3):
    cab = {"authorization": f"Bearer {chave}", "user-agent": UA, **(cab or {})}
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, data=corpo, method=metodo, headers=cab)
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            if e.code < 500 or i == tentativas - 1:  # 4xx não melhora tentando de novo
                return e.code, e.read()
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if i == tentativas - 1:
                return 0, b""
        time.sleep(2 * (i + 1))
    return 0, b""


def arquivos():
    """{nome: bytes} de cada dados/**/*.json com nome aceito pelo Worker; meta fica de fora (vai por último)."""
    saida = {}
    for p in sorted(DADOS.rglob("*.json")):
        nome = p.relative_to(DADOS).with_suffix("").as_posix()
        if nome == "meta" or not NOME_OK.match(nome):
            continue
        saida[nome] = p.read_bytes()
    return saida


def valido(nome, b):
    if len(b) > MAX:
        print(f"  ! {nome}: {len(b) / 1e6:.1f} MB, passa do limite de uma linha do D1", file=sys.stderr)
        return False
    try:
        json.loads(b)
        return True
    except ValueError as e:
        print(f"  ! {nome}: JSON inválido ({e})", file=sys.stderr)
        return False


def enviar(api, chave):
    base = api.rstrip("/") + "/dados/"
    st, corpo = pedido("GET", base + "_lista", chave)
    if st != 200:
        print(f"banco indisponível ou chave recusada (GET _lista: {st})", file=sys.stderr)
        return 1
    no_banco = json.loads(corpo)
    locais = arquivos()
    falhas = enviados = 0
    for nome, b in locais.items():
        h = hashlib.sha256(b).hexdigest()
        if no_banco.get(nome) == h:
            continue  # igual ao que já está no banco
        if not valido(nome, b):
            falhas += 1
            continue
        st, resp = pedido("PUT", f"{base}{nome}.json", chave, b, {"content-type": "application/json", "x-hash": h})
        if st == 200:
            enviados += 1
        else:
            falhas += 1
            print(f"  ! {nome}: {st} {resp[:120]!r}", file=sys.stderr)
    # meta por último, e só se tudo chegou: senão o site diria "dados de agora" com parte dos arquivos velha
    meta = DADOS / "meta.json"
    if not falhas and meta.exists():
        b = meta.read_bytes()
        st, _ = pedido("PUT", base + "meta.json", chave, b, {"content-type": "application/json", "x-hash": hashlib.sha256(b).hexdigest()})
        falhas += st != 200
    print(f"banco D1: {enviados} enviados, {len(locais) - enviados} sem mudança, {falhas} falhas")
    return 1 if falhas else 0


def enviar_jogos(api, chave, jogos=None):
    """Histórico: manda os jogos em lotes; o banco só grava os novos e os que mudaram (placar, estado...).
    Sem lista, usa os jogos dos arquivos de dados da rodada (historico_jogos.coleta())."""
    jogos = historico_jogos.coleta() if jogos is None else jogos
    url = api.rstrip("/") + "/jogos"
    gravados = falhas = 0
    for i in range(0, len(jogos), LOTE_JOGOS):
        corpo = json.dumps(jogos[i : i + LOTE_JOGOS], ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        st, resp = pedido("POST", url, chave, corpo, {"content-type": "application/json"})
        if st == 200:
            gravados += json.loads(resp).get("gravados", 0)
        else:
            falhas += 1
            print(f"  ! jogos {i}-{i + LOTE_JOGOS}: {st} {resp[:160]!r}", file=sys.stderr)
    print(f"histórico: {len(jogos)} jogos conferidos, {gravados} novos ou alterados, {falhas} lotes com falha")
    return 1 if falhas else 0


def main():
    api = sys.argv[sys.argv.index("--api") + 1] if "--api" in sys.argv else os.environ.get("CAZE_API") or api_da_config()
    chave = (os.environ.get("ROBO_CHAVE") or "").strip()
    if not api or not chave:
        print("banco D1 não configurado (falta ROBO_CHAVE ou o endereço do Worker): nada enviado")
        return 2
    r = enviar(api, chave)
    # o histórico não decide a publicação do site: falha aqui só fica registrada (os dados do site já chegaram)
    if r == 0 and enviar_jogos(api, chave):
        print("aviso: o histórico de jogos não foi atualizado nesta rodada", file=sys.stderr)
    return r


if __name__ == "__main__":
    sys.exit(main())
