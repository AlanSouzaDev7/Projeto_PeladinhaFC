# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados.
# Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE).
"""CazéStats.TV — cópia em JSON dos arquivos de dados, para o carregador único do site e do app (js/dados.js).

Os arquivos js/<nome>.js gravados pelo robô continuam (transição); ao fim de cada rodada, cada um vira
dados/<nome>.json, que o navegador lê com fetch e limpa antes de usar (nenhum código baixado é executado).
O app Android 433Fut lê os mesmos JSON pelo endereço publicado, então fica atualizado sem nova versão do APK.
dados/meta.json traz a hora da gravação (aviso de dados velhos, E5).
"""
import glob
import json
import os
import re
import time

P = None  # módulo placar_api

# arquivo .js -> nome em dados/ (mesmos nomes de js/dados.js)
SIMPLES = {"live-data": "LIVE_DATA", "player-stats": "PLAYER_STATS", "departamento-medico": "DM", "club-form": "CLUB_FORM",
           "heatmaps": "HEATMAPS", "raio-x": "RAIO_X", "escalacoes": "ESCALACOES", "fotos": "FOTOS"}
PASTAS = {"jogadores": "JOGADORES_CLUBE", "competicoes": "COMPETICOES", "mercado": "MERCADO"}


def _valor(txt, inicio):
    """O JSON que vem depois do '=' a partir de 'inicio' (raw_decode: para no fim do objeto)."""
    i = txt.index("=", inicio) + 1
    return json.JSONDecoder().raw_decode(txt[i:].lstrip())[0]


def _ler_global(caminho, var):
    txt = open(caminho, encoding="utf-8").read()
    m = re.search(r"window\." + re.escape(var) + r"\s*=(?!=)", txt)
    return _valor(txt, m.start()) if m else None


def _gravar(nome, valor, pasta):
    alvo = os.path.join(pasta, nome + ".json")
    os.makedirs(os.path.dirname(alvo), exist_ok=True)
    tmp = alvo + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(valor, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, alvo)  # troca atômica: quem lê nunca vê o arquivo pela metade


def exportar(raiz=None):
    """Converte os js/*.js de dados em dados/*.json. Devolve quantos arquivos gravou."""
    raiz = raiz or P.ROOT
    js, pasta = os.path.join(raiz, "js"), os.path.join(raiz, "dados")
    n = 0
    for nome, var in SIMPLES.items():
        arq = os.path.join(js, nome + ".js")
        if os.path.exists(arq):
            try:
                v = _ler_global(arq, var)
                if v is not None:
                    _gravar(nome, v, pasta)
                    n += 1
            except (ValueError, OSError) as ex:
                P.log("dados json:", nome, ex)
    arq = os.path.join(js, "squads.js")
    if os.path.exists(arq):
        try:
            v = {k: _ler_global(arq, k) for k in ("SQUADS", "SQUADS_LAST", "SQUADS_META")}
            _gravar("squads", {k: x for k, x in v.items() if x is not None}, pasta)
            n += 1
        except (ValueError, OSError) as ex:
            P.log("dados json: squads", ex)
    for sub, var in PASTAS.items():
        for arq in glob.glob(os.path.join(js, sub, "*.js")):
            nome = os.path.basename(arq)[:-3]
            try:
                txt = open(arq, encoding="utf-8").read()
                if nome == "global" and sub == "mercado":
                    m = re.search(r"window\.MERCADO_GLOBAL\s*=(?!=)", txt)
                else:
                    m = re.search(r"window\." + var + r"\[\"" + re.escape(nome) + r"\"\]\s*=(?!=)", txt)
                if m:
                    _gravar(f"{sub}/{nome}", _valor(txt, m.start()), pasta)
                    n += 1
            except (ValueError, OSError) as ex:
                P.log("dados json:", sub, nome, ex)
    _gravar("meta", {"quando": int(time.time()), "arquivos": n, "autor": "Alan Evangelista de Souza Martins"}, pasta)
    P.log(f"dados json: {n} arquivos em dados/")
    return n
