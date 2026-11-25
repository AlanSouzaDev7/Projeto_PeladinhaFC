# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
"""Emprestados (server/mercado.py) sem rede: o destino tirado da Wikipédia sai limpo e o jogador só é ligado a alguém da
ESPN no clube de destino (o Rodriguinho do Cruzeiro, emprestado ao Fortaleza, virava o do Bragantino).
Uso: python -X utf8 tests/emprestados_casos.py"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
import placar_api  # noqa: E402,F401  (liga os módulos)
import mercado as M  # noqa: E402

casos = 0


def caso(nome):
    global casos
    casos += 1
    print("ok ", nome)


# --- destino limpo -------------------------------------------------------------------------------------------------------
assert M._limpa_destino("on loan to São Paulo until 30 June 2027") == "São Paulo"
assert M._limpa_destino("at [[Fortaleza Esporte Clube|Fortaleza]] until December 2026") == "Fortaleza"
assert M._limpa_destino("to [[Club Libertad|Libertad]]") == "Libertad"
assert M._limpa_destino("on loan at Juazeirense") == "Juazeirense"
assert M._limpa_destino("[[Sport Club do Recife|Sport Recife]]") == "Sport Recife"
# o modelo {{small|...}} dentro do jogador fechava a leitura cedo e o destino saía "{{small"
corpo = "{{fs player|no=|nat=BRA|pos=FW|name=[[Cadu]]|other={{small|on loan to [[Goiás EC|Goiás]] until 2027}}}}"
limpo = re.sub(r"\{\{\s*(?:small|nowrap|abbr|sort)\s*\|([^{}|]*)(?:\|[^{}]*)?\}\}", r"\1", corpo, flags=re.I)
assert "{{small" not in limpo and "on loan to [[Goiás EC" in limpo
caso("destino do empréstimo sai limpo")

# --- ligação só no clube de destino --------------------------------------------------------------------------------------
glob = {"times": {"1": {"nome": "Red Bull Bragantino", "logo": "b.png", "lg": "bra.1", "jogadores": [["339001", "Rodriguinho", 22, "M", "bra", "", "", 10]]},
                  "2": {"nome": "Fortaleza", "logo": "f.png", "lg": "bra.2", "jogadores": [["777", "Rodriguinho", 23, "M", "bra", "", "", 20]]},
                  "3": {"nome": "Sport", "logo": "s.png", "lg": "bra.2", "jogadores": [["383097", "Murilo Rhikman", 20, "A", "bra", "", "", 9]]}}}
assert M._acha_global("Rodriguinho", "M", glob, "Fortaleza")["id"] == "777", "o do Fortaleza, não o do Bragantino"
assert M._acha_global("Rodriguinho", "M", glob, "Remo") is None, "destino fora do mercado global: sem ligação"
assert M._acha_global("Rodriguinho", "M", glob, None) is None, "sem destino: sem ligação"
assert M._acha_global("Murilo Rhikman", "A", glob, "Sport Recife")["id"] == "383097", "Sport (ESPN) = Sport Recife (Wikipédia)"
caso("emprestado só é ligado no clube de destino")

print(f"{casos} casos dos emprestados passaram")
