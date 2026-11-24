# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""Verificação dos jogadores e das fotos (server/verifica_jogadores.py) sem rede.
Casos reais de 24/11/2026: o id 176810 da ESPN é o Lucas Villalba zagueiro do Cruzeiro E o atacante do Botafogo; o 216098 é
o Matheus Pereira do Cruzeiro E o do Corinthians. Uso: python -X utf8 tests/verifica_jogadores_casos.py"""
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
import carreiras_ogol as OG  # noqa: E402
import verifica_jogadores as V  # noqa: E402

V.ligar(types.SimpleNamespace(), types.SimpleNamespace(), OG)
casos = 0


def caso(nome):
    global casos
    casos += 1
    print("ok ", nome)


def datas(mes_ini, mes_fim, dia=10, passo=14):
    """Um jogo a cada 'passo' dias entre dois meses de 2026."""
    from datetime import date, timedelta
    d, fim, out = date(2026, mes_ini, dia), date(2026, mes_fim, 28), []
    while d <= fim:
        out.append(d.isoformat())
        d += timedelta(days=passo)
    return out


# --- 1) homônimos com jogos intercalados: cada clube só mostra a foto baixada para ele ----------------------------
villalba_cru = {"id": "176810", "nome": "Lucas Villalba", "nasc": "", "pais": "bra", "pos": "M", "num": "25", "cadastro": "súmulas recentes"}
villalba_bot = {"id": "176810", "nome": "Lucas Villalba", "nasc": "2001-05-11", "pais": "uru", "pos": "A", "num": "77"}
mp_cru = {"id": "216098", "nome": "Matheus Pereira", "nasc": "1996-05-05", "pais": "bra", "pos": "M", "num": "10"}
mp_cor = {"id": "216098", "nome": "Matheus Pereira", "nasc": "", "pais": "bra", "pos": "M", "num": "23", "cadastro": "súmulas recentes"}
mercado = {"cruzeiro": {"elenco": [villalba_cru, mp_cru]}, "botafogo": {"elenco": [villalba_bot]}, "corinthians": {"elenco": [mp_cor]}}
apar = {"cruzeiro": {"176810": datas(2, 11), "216098": datas(1, 11, passo=7)},
        "botafogo": {"176810": datas(2, 11, dia=13)},
        "corinthians": {"216098": datas(1, 11, dia=12, passo=10)}}
rosters = {"cruzeiro": {"216098"}, "botafogo": {"176810"}, "corinthians": set()}
sit, col = V.analisa(mercado, apar, rosters, {}, hoje="2026-11-24")
tipos = {c["id"]: c["tipo"] for c in col}
assert tipos == {"176810": "homonimo", "216098": "homonimo"}, col
assert sit["cruzeiro"]["176810"]["homonimo"] == ["botafogo"] and sit["botafogo"]["176810"]["homonimo"] == ["cruzeiro"]
foto_bot = "img/jogadores/botafogo/176810.webp?v=1"
assert not V.foto_permitida("cruzeiro", sit["cruzeiro"]["176810"], foto_bot), "Villalba do Cruzeiro com a foto do Botafogo"
assert V.foto_permitida("botafogo", sit["botafogo"]["176810"], foto_bot)
foto_cru = "img/jogadores/cruzeiro/216098.webp?v=2"
assert V.foto_permitida("cruzeiro", sit["cruzeiro"]["216098"], foto_cru)
assert not V.foto_permitida("corinthians", sit["corinthians"]["216098"], foto_cru), "Matheus Pereira do Corinthians com a foto do Cruzeiro"
caso("homônimos: Villalba (Cruzeiro x Botafogo) e Matheus Pereira (Cruzeiro x Corinthians)")

# --- 2) a mesma pessoa que trocou de clube: fica só onde jogou por último ----------------------------------------
j_a = {"id": "999", "nome": "Fulano", "nasc": "2000-01-01", "pais": "bra", "pos": "D", "num": "4"}
j_b = {"id": "999", "nome": "Fulano", "nasc": "2000-01-01", "pais": "bra", "pos": "D", "num": "33"}
sit, col = V.analisa({"santos": {"elenco": [j_a]}, "atletico-mg": {"elenco": [j_b]}},
                     {"santos": {"999": datas(1, 4)}, "atletico-mg": {"999": datas(6, 11)}}, {"santos": {"999"}, "atletico-mg": {"999"}}, {}, hoje="2026-11-24")
assert col[0]["tipo"] == "transferencia" and col[0]["atual"] == "atletico-mg", col
assert sit["santos"]["999"]["st"] == "saiu" and sit["santos"]["999"]["foiPara"] == "atletico-mg"
assert sit["atletico-mg"]["999"]["st"] == "confirmado"
# a foto com a camisa antiga (pasta do Santos) vale no clube novo: é a mesma pessoa
assert V.foto_permitida("atletico-mg", sit["atletico-mg"]["999"], "img/jogadores/santos/999.webp")
caso("transferência: sai do clube antigo e a foto com a camisa antiga continua valendo")

# --- 3) empréstimo: quem chegou emprestado não é tirado do elenco -------------------------------------------------
j_emp = {**j_a, "emprestadoDe": "Atlético-MG"}
sit, col = V.analisa({"santos": {"elenco": [j_emp]}, "atletico-mg": {"elenco": [j_b]}},
                     {"santos": {"999": datas(1, 4)}, "atletico-mg": {"999": datas(6, 11)}}, {}, {}, hoje="2026-11-24")
assert sit["santos"]["999"]["st"] != "saiu"
caso("empréstimo não vira saída")

# --- 4) fontes: confirmado com duas, provável com uma --------------------------------------------------------------
og = {"cruzeiro": {"kaio jorge": ["kaio-jorge", "1"], "matheus pereira": ["matheus-pereira", "2"]}}
m = {"cruzeiro": {"elenco": [{"id": "1", "nome": "Kaio Jorge"}, {"id": "2", "nome": "Matheus Pereira"}, {"id": "3", "nome": "Novato"}]}}
sit, _ = V.analisa(m, {"cruzeiro": {"1": ["2026-11-20"]}}, {"cruzeiro": {"1", "3"}}, og, hoje="2026-11-24")
assert sit["cruzeiro"]["1"]["st"] == "confirmado" and len(sit["cruzeiro"]["1"]["fontes"]) == 3
assert sit["cruzeiro"]["2"]["st"] == "provavel" and sit["cruzeiro"]["2"]["fontes"] == ["ogol (elenco atual)"]
assert sit["cruzeiro"]["3"]["st"] == "provavel"
caso("fontes: ESPN + ogol + súmulas")

# --- 5) sem jogos dos dois lados: atributos decidem (país de quem veio da súmula não conta) --------------------------
sit, col = V.analisa({"cruzeiro": {"elenco": [villalba_cru]}, "botafogo": {"elenco": [villalba_bot]}}, {}, {}, {}, hoje="2026-11-24")
assert col[0]["tipo"] == "homonimo", col  # camisa e posição diferentes
assert not V._difere({"pais": "bra", "cadastro": "súmulas recentes", "num": "9"}, {"pais": "uru", "num": "9"})
assert V._difere({"nasc": "1994-08-19"}, {"nasc": "2001-05-11"})
caso("atributos: camisa + posição ou nascimento separam duas pessoas")

# --- 6) base pela carreira do ogol ([S20] = time de base) --------------------------------------------------------------
def linha(slug, temporada, nome, base=None):
    sub = f"<span> [{base}]</span>" if base else ""
    return (f"<tr onclick=\"location.href='/jogador/x/1/jogos?tpstats=club&epoca_id=1&equipa_id=9';\"><td></td><td>{temporada}</td>"
            f"<td><div class=\"micrologo_and_text\"><div class=\"image\"><span class=\"flag:BR\"></span></div><div class=\"text\">"
            f"<a href=\"/equipe/{slug}?epoca_id=1\" title=\"\">{nome}</a></div></div>{sub}</td><td>10</td></tr>")


wallace = linha("red-bull-bragantino", "2026", "Red Bull Bragantino") + linha("flamengo", "2025", "Flamengo") + linha("flamengo/27268", "", "Flamengo", "S20") + linha("ferroviaria/34802", "2021", "Ferroviária", "S17")
bases, ok = V.base_da_carreira(wallace, "bragantino")
assert bases == ["flamengo"] and ok, (bases, ok)
cria = linha("cruzeiro", "2026", "Cruzeiro") + linha("cruzeiro/30001", "2023", "Cruzeiro", "S20") + linha("cruzeiro/30002", "2021", "Cruzeiro", "S17")
assert V.base_da_carreira(cria, "cruzeiro") == (["cruzeiro"], True)
# Pedro: Flamengo do Sub-11 ao Sub-15, Fluminense no Sub-17 e Sub-20 -> formado no Fluminense (cria de Xerém)
pedro = (linha("flamengo", "2026", "Flamengo") + linha("fluminense", "2019", "Fluminense") + linha("fluminense/27025", "2015", "Fluminense", "S20")
         + linha("fluminense/33782", "2014", "Fluminense", "S17") + linha("flamengo/31426", "2011", "Flamengo", "S15") + linha("flamengo/31428", "2008", "Flamengo", "S11"))
assert V.base_da_carreira(pedro, "flamengo") == (["fluminense"], True)
# homônimo no ogol: a temporada mais recente é em outro clube, então a base não vale para este jogador
assert V.base_da_carreira(cria, "flamengo")[1] is False
assert V.rotulo_base("cruzeiro") == "Cria da Toca" and V.rotulo_base("flamengo") == "Cria do Ninho" and V.rotulo_base("palmeiras") == "Cria da Academia"
assert V.rotulo_base("mirassol") == "Cria da base"
caso("base: Cria da Toca, Cria do Ninho e revelado em outro clube")

# --- 6b) base pela Wikipédia (youth_clubs em ordem; o último é o formador), usada quando o ogol recusa o acesso --------
site = {"Flamengo": "flamengo", "Fluminense": "fluminense", "Corinthians": "corinthians"}.get
pedro_wiki = {"youth_clubs1": "Flamengo", "youth_clubs2": "Duquecaxiense", "youth_clubs3": "Artsul", "youth_clubs4": "Fluminense", "currentclub": "Flamengo"}
assert V.base_da_wikipedia(pedro_wiki, "flamengo", site, "") == (["fluminense"], True)
assert V.base_da_wikipedia({**pedro_wiki, "currentclub": "Fluminense"}, "flamengo", site, "")[1] is False  # caixa de outro jogador
assert V.base_da_wikipedia({"currentclub": "Corinthians"}, "corinthians", site, "") == ([], True)
caso("base pela Wikipédia quando o ogol recusa")

# --- 7) nome no elenco do ogol ------------------------------------------------------------------------------------------
mapa = {"lucas villalba": ["lucas-villalba", "1"], "kaio jorge": ["kaio-jorge", "2"], "kaio cesar": ["kaio-cesar", "3"]}
assert V.acha_ogol("Lucas Villalba", mapa) == ["lucas-villalba", "1"]
assert V.acha_ogol("Kaio", mapa) is None  # dois Kaio: não chuta
assert V.acha_ogol("Kaio Jorge", mapa) == ["kaio-jorge", "2"]
caso("nome no ogol sem chute quando há dois parecidos")

print(f"{casos} casos da verificação dos jogadores passaram")
