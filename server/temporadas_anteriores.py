# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""CazéStats.TV — carga única das temporadas anteriores no histórico de jogos (tabela jogos do banco D1).

O robô de cada rodada só vê a temporada atual. Este script busca na ESPN (os mesmos endereços públicos que o robô já
usa, com o mesmo identificador) os jogos encerrados de temporadas passadas e manda para o banco.

Como encontra os jogos sem pedir os 365 dias do ano: a consulta de um dia da temporada traz o calendário dela
(lista de dias com jogo nas ligas, janelas de cada fase nas copas). O mesmo método da temporada atual
(competicoes.dias_competicao). Cerca de 3 mil consultas para 3 temporadas de todas as competições, 4 por vez.
Cada dia lido fica guardado em server/cache/historico/ (reexecutar não pede de novo).

Uso:
  python server/temporadas_anteriores.py 2023 2024 2025          # busca e envia (precisa de ROBO_CHAVE)
  python server/temporadas_anteriores.py 2025 --seco              # só busca e conta, sem enviar
Roda pelo workflow "Histórico: temporadas anteriores" (.github/workflows/historico.yml), que tem a chave.
"""
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import competicoes as C  # noqa: E402
import enviar_d1  # noqa: E402
import historico_jogos as H  # noqa: E402
import placar_api as P  # noqa: E402

CACHE = AQUI / "cache" / "historico"
# Brasileirão (Série A) + as competições que o site acompanha com dados da ESPN (Séries C e D vêm da Wikipédia: fora)
LIGAS = [("bra.1", "Brasileirão", "liga")] + [(c["lg"], c["nome"], c["tipo"]) for k, c in C.COMPETICOES.items() if k not in ("serie-c", "serie-d")]
PARALELO = 4  # consultas ao mesmo tempo: devagar e educado (é uma carga única)


def _dia(lg, d):
    """Jogos de um dia (com cache em arquivo: dia passado não muda)."""
    arq = CACHE / f"{lg}-{d}.json"
    if arq.exists():
        return json.loads(arq.read_text(encoding="utf-8"))
    sb = P.get_json(f"{C.SB}/{lg}/scoreboard?dates={d}")
    jogos = [j for j in (C.jogo(e, lg) for e in sb.get("events", [])) if j]
    arq.parent.mkdir(parents=True, exist_ok=True)
    arq.write_text(json.dumps(jogos, ensure_ascii=False), encoding="utf-8")
    return jogos


def temporada(lg, nome, tipo, ano):
    """Linhas da tabela jogos com os jogos encerrados de uma competição numa temporada."""
    ancora = f"{ano}0215" if tipo == "estadual" else f"{ano}0701"  # um dia em que a temporada certamente está aberta
    try:
        sb0 = P.get_json(f"{C.SB}/{lg}/scoreboard?dates={ancora}")
    except Exception as e:
        print(f"  {nome} {ano}: sem calendário ({e})")
        return []
    ano_espn = str((((sb0.get("leagues") or [{}])[0]).get("season") or {}).get("year") or "")
    if ano_espn and ano_espn != str(ano):
        print(f"  {nome} {ano}: a ESPN devolveu a temporada {ano_espn}; pulada")
        return []
    dias, _ = C.dias_competicao(lg, sb0)
    dias = [d for d in dias if d.startswith(str(ano)) or d.startswith(str(ano + 1) + "01")]  # copas podem fechar em janeiro
    if tipo == "estadual" and len(dias) < 15:
        # calendário incompleto na ESPN (Carioca 2025 lista só os 8 dias da fase final): lê a janela inteira dos estaduais
        t, fim = time.mktime(time.strptime(f"{ano}0105", "%Y%m%d")), time.mktime(time.strptime(f"{ano}0430", "%Y%m%d"))
        janela = []
        while t <= fim:
            janela.append(time.strftime("%Y%m%d", time.localtime(t)))
            t += 86400
        dias = sorted(set(dias) | set(janela))

    def ler(d):
        try:
            return _dia(lg, d)
        except Exception as e:
            print(f"  ! {nome} {d}: {e}", file=sys.stderr)
            return []

    linhas = {}
    with ThreadPoolExecutor(max_workers=PARALELO) as ex:
        for jogos in ex.map(ler, dias):
            for j in jogos:
                if j.get("estado") != "post":
                    continue  # temporada passada: só jogo encerrado (adiado/cancelado fica de fora)
                x = H.linha(j, nome, ano, lg)
                if x:
                    linhas[x["id"]] = x
    print(f"  {nome} {ano}: {len(dias)} dias lidos, {len(linhas)} jogos")
    return list(linhas.values())


def main():
    anos = sorted({int(a) for a in sys.argv[1:] if a.isdigit() and 2000 <= int(a) < int(time.strftime("%Y"))})
    if not anos:
        print("informe as temporadas passadas, por exemplo: 2023 2024 2025")
        return 2
    seco = "--seco" in sys.argv
    todos = []
    for ano in anos:
        print(f"temporada {ano}")
        for lg, nome, tipo in LIGAS:
            todos += temporada(lg, nome, tipo, ano)
    print(f"total: {len(todos)} jogos de {len(anos)} temporada(s)")
    if seco:
        return 0
    api, chave = os.environ.get("CAZE_API") or enviar_d1.api_da_config(), (os.environ.get("ROBO_CHAVE") or "").strip()
    if not api or not chave:
        print("sem ROBO_CHAVE: nada enviado (use --seco para só contar)")
        return 2
    return enviar_d1.enviar_jogos(api, chave, sorted(todos, key=lambda j: (j["data"], j["id"])))


if __name__ == "__main__":
    sys.exit(main())
