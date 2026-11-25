# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""Leitor das páginas de elenco do Transfermarkt (server/tm_elencos.py) sem rede, com HTML sintético no formato da página
(nenhum conteúdo do site copiado para o repositório) e a sobreposição no índice de valores (server/valores_tm.py).
Uso: python -X utf8 tests/tm_elencos_casos.py"""
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
import tm_elencos as T  # noqa: E402
import valores_tm as V  # noqa: E402

casos = 0


def caso(nome):
    global casos
    casos += 1
    print("ok ", nome)


def linha(cls, num, pid, nome, pos, nasc, nac, alt, pe, chegou, anterior_titulo, contrato, valor, foto):
    ant = f'<td class="zentriert"><a title="{anterior_titulo}" href="/x/startseite/verein/9/saison_id/2025"><img src="w.png" /></a></td>' if anterior_titulo else '<td class="zentriert"></td>'
    return (f'<tr class="{cls}"><td class="zentriert rueckennummer"><div class=rn_nummer>{num}</div></td><td class="posrela"><table class="inline-table"><tr>'
            f'<td rowspan="2"><img src="data:x" data-src="https://img.a.transfermarkt.technology/portrait/medium/{foto}?lm=1" title="{nome}" class="bilderrahmen-fixed lazy" /></td>'
            f'<td class="hauptlink"><a href="/x/profil/spieler/{pid}"> {nome} </a></td></tr><tr><td> {pos} </td></tr></table></td>'
            f'<td class="zentriert">{nasc}</td><td class="zentriert"><img src="f.png" title="{nac}" alt="{nac}" class="flaggenrahmen" /></td>'
            f'<td class="zentriert">{alt}</td><td class="zentriert">{pe}</td><td class="zentriert">{chegou}</td>{ant}'
            f'<td class="zentriert">{contrato}</td><td class="rechts hauptlink"><a href="/x/marktwertverlauf/spieler/{pid}">{valor}</a></td></tr>')


PAGINA = ('<html><table class="items"><tbody>'
          + linha("odd", "34", "1001", "Jonathan Jesus", "Centre-Back", "27/05/2004 (22)", "Brazil", "1,87m", "right", "10/07/2024", "Ceará Sporting Club: Ablöse €1.43m", "30/06/2029", "€12.00M", "1001-1.jpg")
          + linha("even", "1", "1002", "Cássio", "Goalkeeper", "06/06/1987 (39)", "Brazil", "1,96m", "left", "10/07/2024", "Sport Club Corinthians Paulista: Ablöse free transfer", "31/05/2027", "€250.0K", "1002-1.jpg")
          + linha("odd", "41", "1003", "Léo Aragão", "Goalkeeper", "19/04/2002 (24)", "Brazil", "1,92m", "right", "01/01/2024", "Returned after loan spell with Avaí FC; date: 01/07/2026; fee: End of loan", "31/12/2027", "-", "default.jpg")
          + "</tbody></table></html>")

js = T.jogadores_do_elenco(PAGINA)
assert len(js) == 3
jj = js[0]
assert jj[:5] == ["1001", "Jonathan Jesus", "34", "ZAG", "2004-05-27"] and jj[5] == ["Brazil"] and jj[6] == 187 and jj[7] == "D"
assert jj[8] == "2024-07-10" and jj[9] == ["Ceará Sporting Club", 1430000] and jj[10] == "2029-06-30" and jj[11] == 12000000 and jj[12] == "1001-1.jpg"
assert js[1][9] == ["Sport Club Corinthians Paulista", 0] and js[1][11] == 250000 and js[1][7] == "E"
assert js[2][9] == ["Avaí FC", 0], "volta de empréstimo"
assert js[2][11] is None and js[2][12] is None, "sem valor e foto padrão (silhueta)"
caso("página de elenco: valor, posição, nascimento, contrato, chegada com o valor pago e foto")

comp = '<a title="Fortaleza Esporte Clube" href="/fortaleza-esporte-clube/startseite/verein/10870/saison_id/2025"><a title="Sport Club do Recife" href="/sport-club-do-recife/startseite/verein/8718">'
assert T.clubes_da_competicao(comp) == [("10870", "fortaleza-esporte-clube", "Fortaleza Esporte Clube"), ("8718", "sport-club-do-recife", "Sport Club do Recife")]
assert [T.valor(x) for x in ("€10.00M", "€250.0K", "€1.20bn", "-")] == [10000000, 250000, 1200000000, None]
caso("página de competição e leitura dos valores")

# sobreposição: o valor de hoje (página de elenco) passa por cima do valor de julho (conjunto)
ind = V.monta_indice([{"player_id": "1001", "name": "Jonathan Jesus", "date_of_birth": "2004-05-27 00:00:00", "current_club_name": "Cruzeiro Esporte Clube",
                       "current_club_domestic_competition_id": "BRA1", "sub_position": "Centre-Back", "market_value_in_eur": "4000000",
                       "highest_market_value_in_eur": "4000000", "contract_expiration_date": "", "image_url": "", "last_season": "2025"}], [], [], hoje=date(2026, 11, 25))
el = {"competicoes": {"BRA1": {"clubes": {"609": {"nome": "Cruzeiro Esporte Clube", "lido": 1795600000, "jogadores": js}}}}}
ind2 = V.sobrepor_elencos(ind, el)
assert ind["j"]["1001"]["v"] == 4000000, "o índice do conjunto fica intacto"
assert ind2["j"]["1001"]["v"] == 12000000 and ind2["j"]["1001"]["t"][1] == "Ceará Sporting Club" and ind2["j"]["1001"]["t"][3] == 1430000
assert "1002" in ind2["j"] and ind2["j"]["1002"]["v"] == 250000, "quem não estava no conjunto entra"
assert V.casa({"nome": "Cássio", "idade": 39, "clube": "Cruzeiro", "liga": "bra.1"}, ind2, date(2026, 11, 25)) == "1002"
caso("valores de hoje por cima dos de julho; jogador novo entra no índice")

print(f"{casos} casos do leitor do Transfermarkt passaram")
