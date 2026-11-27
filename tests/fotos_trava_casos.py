# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""Trava das fotos por clube (server/fotos.py: foto_clube): a foto que um clube já mostra só muda se o jogador trocar de
clube; a foto baixada para outro clube com um homônimo no elenco (mesmo id da ESPN) nunca aparece.
Sem rede, numa pasta temporária. Uso: python -X utf8 tests/fotos_trava_casos.py"""
import json
import os
import sys
import tempfile
import threading
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
import fotos as F  # noqa: E402

raiz = tempfile.mkdtemp()
P = types.SimpleNamespace(ROOT=raiz, lock=threading.Lock(), state={}, silencioso=lambda *a: None, log=lambda *a: None)
F.P = P
os.environ.pop("MODO_VENDA", None)
os.environ.pop("FOTOS_PRIVADAS", None)
casos = 0


def caso(nome):
    global casos
    casos += 1
    print("ok ", nome)


def arquivo(rel, conteudo=b"x"):
    caminho = os.path.join(raiz, rel.replace("/", os.sep))
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    open(caminho, "wb").write(conteudo)


def publica(d):
    os.makedirs(os.path.join(raiz, "js"), exist_ok=True)
    open(os.path.join(raiz, "js", "fotos.js"), "w", encoding="utf-8").write("window.FOTOS = " + json.dumps(d) + ";\n")
    F._PUB[0] = None


arquivo("img/jogadores/botafogo/176810.webp", b"botafogo")
arquivo("img/jogadores/cruzeiro/176810-h.webp", b"cruzeiro-h")
arquivo("img/jogadores/cruzeiro/1.webp", b"antiga")
arquivo("img/jogadores/cruzeiro/2.webp", b"x")
arquivo("img/jogadores/flamengo/2.webp", b"nova")
P.state["mercado"] = {"cruzeiro": {"elenco": [{"id": "176810"}, {"id": "1"}]}, "botafogo": {"elenco": [{"id": "176810"}]}, "flamengo": {"elenco": [{"id": "2"}]}}
# o monitor (um registro por id) ficou com a foto do Botafogo para o id 176810 e com uma foto nova para o jogador 1
monitor = {"j": {"176810": {"u": "img/jogadores/botafogo/176810.webp?v=b", "f": "Clube"}, "1": {"u": "img/jogadores/cruzeiro/1.webp?v=nova", "f": "Clube"},
                 "2": {"u": "img/jogadores/flamengo/2.webp?v=fla", "f": "Clube"}}}

# 1) o erro de hoje: o Cruzeiro publicava a foto do Botafogo para o seu Lucas Villalba
publica({"cruzeiro": {"176810": {"u": "img/jogadores/botafogo/176810.webp?v=b", "f": "Clube"}}, "botafogo": {"176810": {"u": "img/jogadores/botafogo/176810.webp?v=b", "f": "Clube"}}})
f = F.foto_clube("cruzeiro", "176810", monitor)
assert f and f["u"].startswith("img/jogadores/cruzeiro/176810-h.webp?v="), f
assert F.foto_clube("botafogo", "176810", monitor)["u"].startswith("img/jogadores/botafogo/"), "o Botafogo fica com a dele"
caso("Lucas Villalba do Cruzeiro volta para a foto dele (não a do Botafogo); a do Botafogo continua lá")

# 2) a foto travada não muda, mesmo com uma foto nova no monitor
publica({"cruzeiro": {"1": {"u": "img/jogadores/cruzeiro/1.webp?v=antiga", "f": "TheSportsDB"}}})
assert F.foto_clube("cruzeiro", "1", monitor) == {"u": "img/jogadores/cruzeiro/1.webp?v=antiga", "f": "TheSportsDB"}
caso("foto já publicada no clube não muda por uma mais nova ou melhor")

# 3) transferência: no clube novo a foto pode mudar (a publicada era da pasta do clube antigo)
publica({"flamengo": {"2": {"u": "img/jogadores/cruzeiro/2.webp?v=x", "f": "Clube"}}})
assert F.foto_clube("flamengo", "2", monitor)["u"] == "img/jogadores/flamengo/2.webp?v=fla"
caso("jogador transferido: no clube novo entra a foto nova")

# 4) foto bloqueada (de outra pessoa) sai mesmo travada
F._bloq[0] = {"1": {"img/jogadores/cruzeiro/1.webp?v=antiga"}}
publica({"cruzeiro": {"1": {"u": "img/jogadores/cruzeiro/1.webp?v=antiga", "f": "TheSportsDB"}}})
assert F.travada("cruzeiro", "1") is None
F._bloq[0] = {}
caso("foto em fotos-bloqueadas.json não fica travada")

# 5) o monitor não baixa foto para quem já tem a travada (não sobrescreve o arquivo)
publica({"cruzeiro": {"1": {"u": "img/jogadores/cruzeiro/1.webp?v=antiga", "f": "TheSportsDB"}}})
assert F.travada("cruzeiro", "1") and not F.travada("cruzeiro", "999")
caso("trava reconhecida para o monitor pular o download")
print(f"{casos} casos da trava das fotos passaram")
