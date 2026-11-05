"""Casos reais de manchetes para o departamento médico: quem é citado e o que a manchete diz dele.
Uso: python -X utf8 tests/dm_casos.py   (sem internet; só as regras de leitura)"""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server"))
import placar_api as a  # noqa: E402

NOME = [  # (manchete, jogador, aparece?)
    ("Lucas Paquetá tem lesão no joelho", "Lucas", False),
    ("Com dores, Andrés Gómez é desfalque no Nilton Santos", "Santos", False),
    ("João Marcelo passa por cirurgia", "Marcelo", False),
    ("Cruzeiro: Felipe Morais vira dúvida", "Felipe Morais", True),
    ("Felipe Moraes sente desconforto", "Felipe Morais", True),       # grafia diferente
    ("Ayrton Lucas e Carrascal sentem dores", "Ayrton Lucas", True),
    ("Danilo, do Flamengo, mostra recuperação", "Danilo", True),
    ("Vitória do Flamengo liga alerta após Ayrton Lucas", "Ayrton Lucas", True),
    ("E o Luís Sinisterra? Saiba como está a recuperação", "Luis Sinisterra", True),  # acento diferente
]
TIPO = [  # (manchete, jogador, tipo esperado)
    ("Atlético-MG libera Ruan, mas perde Victor", "Ruan", "volta"),
    ("Atlético-MG libera Ruan, mas perde Victor", "Victor", "ausencia"),
    ("Paulinho e Sosa ficam no DM, mas Vitor Roque joga; veja provável Palmeiras", "Vitor Roque", "volta"),
    ("Paulinho e Sosa ficam no DM, mas Vitor Roque joga", "Paulinho", "lesao"),
    ("Sosa treina no campo, mas Paulinho continua em tratamento no Palmeiras", "Sosa", "evol"),
    ("Sosa treina no campo, mas Paulinho continua em tratamento no Palmeiras", "Paulinho", "lesao"),
    ("Alan Patrick será julgado no STJD por criticar arbitragem e pode desfalcar o Inter", "Alan Patrick", None),
    ("Vasco: Bruno Duarte tem lesão e vem jogando no sacrifício", "Bruno Duarte", "volta"),
    ("Felipe Morais sente desconforto e vira dúvida no Cruzeiro contra o Remo", "Felipe Morais", "duvida"),
    ("Atlético-MG anuncia volta de Ruan Tressoldi e lesão de Victor Hugo", "Victor Hugo", "lesao"),
    ("Danilo Barbosa sofre lesão e desfalca o Grêmio nos próximos jogos", "Danilo Barbosa", "lesao"),
    ("Vitão do Atlético-MG: Zagueiro libera hospital após choque na cabeça, mas contusão muscular exige", "Vitão", "lesao"),
    ("Gabriel Brazão avança na recuperação e vai iniciar fisioterapia no Santos", "Gabriel Brazão", "evol"),
    ("Matheus Pereira recebe terceiro amarelo e está suspenso", "Matheus Pereira", None),
    ("Kaio Jorge é convocado para a Seleção", "Kaio Jorge", None),
    ("Arrascaeta treina com o grupo e está liberado para o clássico", "Arrascaeta", "volta"),
    ("Weverton é questionado sobre Palmeiras e admite incômodo com decisão de Renato no Grêmio", "Weverton", None),
    ("Kaio Jorge sente incômodo na coxa e deixa o treino", "Kaio Jorge", "duvida"),
]
erros = 0
for t, n, exp in NOME:
    r = bool(a.has_name(t, a.fold(n).split()))
    erros += r != exp
    print("ok " if r == exp else "ERRO", "nome", n, "|", t)
for t, n, exp in TIPO:
    r = a.dm_classify(t, a.has_name(t, a.fold(n).split()))
    erros += r != exp
    print("ok " if r == exp else "ERRO", f"{n}: {r}", "|", t)
# títulos todos em maiúsculas (YouTube): o vizinho só barra se também for nome de jogador do elenco
TOK = {"lucas", "paqueta", "felipe", "morais", "joao", "marcelo", "fred"}
for t, n, exp in [("FELIPE MORAIS FORA? SAMUEL VENÂNCIO EXPLICA", "Felipe Morais", True), ("LUCAS PAQUETÁ SENTE DORES", "Lucas", False),
                  ("JOÃO MARCELO OPERA O JOELHO", "Marcelo", False), ("FRED SENTE DORES E PREOCUPA", "Fred", True)]:
    r = bool(a.has_name(t, a.fold(n).split(), TOK))
    erros += r != exp
    print("ok " if r == exp else "ERRO", "maiúsculas", n, "|", t)
st = [("João Marcelo passa por cirurgia no joelho e não joga mais pelo Cruzeiro na temporada", "fora"),
      ("Danilo passa por cirurgia após fraturas na mandíbula", "grave"), ("Fred sente dores na coxa", "")]
for t, exp in st:
    r = "fora" if a.DM_FORA_TEMP.search(t) else "grave" if a.DM_GRAVE.search(t) else ""
    erros += r != exp
    print("ok " if r == exp else "ERRO", "gravidade", repr(r), "|", t)
print(f"\n{'Todos os casos passaram.' if not erros else f'{erros} caso(s) falharam.'}")
sys.exit(1 if erros else 0)
