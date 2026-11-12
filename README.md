# PLACAR. — futebol brasileiro em tempo real

### ▶ [Acessar o site](https://alansouzadev7.github.io/Projeto_PeladinhaFC/)

> Versão publicada no GitHub Pages, com os dados gravados no projeto. Para os dados ao vivo (placares, notícias e minuto a minuto), rode a API localmente — veja [Como rodar](#como-rodar).

Plataforma de resultados do futebol brasileiro: **Brasileirão Séries A, B, C e D**, **Libertadores**, **Sul-Americana**, **Copa do Brasil** e **estaduais**, com placar ao vivo, tabelas, estatísticas, página temática para cada clube da Série A, campinho interativo para montar o time, prancheta tática e narração minuto a minuto.

Feito com **HTML, CSS e JavaScript puro** (sem frameworks) e uma **API em Python** (só biblioteca padrão).

![Página do Cruzeiro](prints/14-aparicao-cruzeiro.png)

## Como rodar

```bash
python -X utf8 server/placar_api.py
```

Abra <http://localhost:8000>. A API serve o site e mantém os dados atualizados em segundo plano.
Sem a API (por exemplo, `python -m http.server`), o site funciona com os dados gravados em `js/`.

### Sem depender de um computador ligado

O site publicado no GitHub Pages se mantém atualizado sozinho:

| O quê | Como |
|---|---|
| Placar ao vivo, intervalo, próximas rodadas, temporada dos clubes, minuto a minuto | o navegador consulta a ESPN direto (a cada 0,8 s com bola rolando; minuto a minuto a cada 4 s) |
| Tabela, cartões, notícias, pendurados, lesões, minutagem, histórico | o **GitHub Actions** ([`.github/workflows/dados.yml`](.github/workflows/dados.yml)) roda `server/placar_api.py --snapshot` a cada 30 min e grava `js/live-data.js`, `js/player-stats.js` e `js/club-form.js` |
| Elenco (busca de jogadores, números de camisa, prancheta) | o mesmo robô baixa o elenco da ESPN **uma vez por hora** (quando a última gravação tem mais de 55 min) e grava `js/squads.js`; quem jogou pelo clube nos últimos 45 dias e sumiu da lista da ESPN continua, e uma lista da ESPN com menos de 15 jogadores (falha da fonte) não apaga o clube |

Para atualizar na hora: aba **Actions** do repositório › **Atualizar dados** › **Run workflow**.

### Vigia: dados que ficam para trás

Uma aba aberta por horas (computador dormindo, aba em segundo plano, internet caindo) ficava parada no tempo: um jogo "ao vivo, 63'" que já tinha acabado e o jogo seguinte sem resultado. O GitHub também atrasa a rotina de 30 min (às vezes roda de 5 em 5 horas). O **vigia** confere a coerência dos dados e corrige sozinho:

- **No navegador** (`js/live.js`), a cada 2 min e na hora em que a aba volta a aparecer, a internet volta ou a página sai do cache:
  - jogo "ao vivo" ou "a disputar" que começou há mais de 2h15 → busca o placar daquele dia na ESPN;
  - arquivo gravado com mais de 40 min → relê a versão publicada pelo robô e fica com o placar mais adiantado de cada jogo.
  - O que foi visto e corrigido fica em `PD.vigia` (no console do navegador).
- **No robô** (`server/placar_api.py`): antes de gravar, o jogo parado no tempo é consultado de novo pelo outro endereço da ESPN.
- **Nos testes**: `tests/mobile/vigia.mjs` reproduz a aba aberta desde a noite anterior (com e sem a ESPN no ar), e a auditoria reprova um arquivo gravado com jogo parado no tempo.

### Placar mais rápido com a API-Football (opcional)

Um Worker da Cloudflare ([`worker/`](worker/README.md)) guarda a chave da **API-Football** e entrega placar e lances ao site. Ele é ligado em [`js/config.js`](js/config.js). Com ele ligado, a API-Football vem primeiro e a ESPN fica de reserva (Worker fora do ar ou limite do plano esgotado). Um jogo hipotético simulado testa os três casos:

```bash
BASE=http://127.0.0.1:5173 node tests/mobile/simulacao.mjs
```

## O que tem

| Área | Descrição |
|---|---|
| **Faixa de notícias** | Logo abaixo do menu, de ponta a ponta da tela, em todas as páginas, como a tarja dos telejornais: o bloco do PLACAR. com a hora, a **manchete principal** em cima (troca a cada 8 s; a barrinha embaixo dela marca o tempo até a próxima) e a **fita** com as outras passando embaixo (para com o mouse em cima, com o foco do teclado ou no botão de pausa; cada notícia abre a matéria). A fita anda em qualquer aparelho, pela Web Animations API: com as animações do aparelho desligadas (Windows, iPhone, Android) ela só anda mais devagar, e não fica presa parada depois de um toque no celular ou de abrir uma matéria em outra aba. As principais notícias do futebol das últimas 24 h nos portais configurados (ge, UOL, ESPN, Lance!, Gazeta Esportiva e Terra), sem repetir o mesmo fato e no máximo 3 por portal, com o escudo dos clubes citados. **Atualiza a cada 30 min**, sozinha, sem recarregar a página. |
| **Sobre o projeto** | Além do cartão e das decisões técnicas, a seção **"Como o site funciona"**: números do projeto, caminho dos dados (fontes → coleta → arquivos → navegador), ritmo das atualizações, testes por área, o que foi construído em ordem e de que é feito o código. |
| **Ao vivo** | Rodada agrupada por dia, navegação entre rodadas, favoritos, próximo jogo e artilharia. **Placar em tempo real** mesmo sem a API (no GitHub Pages também): com jogo perto do horário ou rolando, o navegador consulta o placar da ESPN a cada 0,8 s (veja "Placar ao vivo: atraso" abaixo). **A página não se redesenha**: só o que mudou (placar, minuto, tabela, artilharia) é trocado no lugar, com um pulo discreto no número; a animação do topo, a rolagem e a ficha aberta continuam como estão. As **próximas rodadas** entram sozinhas pelo calendário da ESPN (agrupadas por data, já que a ESPN não informa o número da rodada; jogos adiados aparecem marcados), e o site passa para a rodada seguinte quando a atual termina. |
| **Clubes** | 20 páginas no tema de cada clube. O topo, de ponta a ponta da tela, junta a **cena animada do clube** (o urubu voando sobre o Rio, a Via Láctea até o Cruzeiro do Sul, o galo cantando em BH…) com o **"GOL!" do clube no placar de transmissão**: a cena termina exatamente onde o escudo salta no placar, e então vêm o placar 0 · 0, a faixa com a sigla, o escudo saltando e o GOL! com o símbolo do clube no lugar do "O" (a raposa do Cruzeiro, o urubu do Flamengo, a Estrela Solitária do Botafogo, o gorro do Saci do Inter…). Depois o placar vira 1 · 0 e a frase do clube aparece embaixo. O **relógio do placar** para na **goleada mais simbólica de cada torcida**, com os gols do clube no lugar das horas e os do adversário no dos minutos (Cruzeiro **06:01** = 6 × 1 no Atlético-MG em 2011; Corinthians 11:00 = 11 × 0 no Santos em 1920; Grêmio 10:00 = 10 × 0 no Inter em 1909…), e uma legenda ao lado diz qual foi. Pesquisado nas páginas de cada clássico na Wikipédia, nos sites dos clubes, ge, Lance!, Terra e Gazeta Esportiva. Toque no topo para ver o gol de novo. **Nos jogos ao vivo**, quando um clube marca, o GOL! dele aparece por cima de qualquer página, com quem marcou, o placar e o minuto do jogo (toque para abrir a partida). Com a aba em segundo plano ou a tela do celular apagada, o gol espera você voltar (até 10 min). **Últimas notícias** do clube: só manchetes que falam dele (nome ou apelido no título, sem "ex-Clube"). |
| **Partidas do clube** | A temporada inteira de cada clube, mês a mês: todos os jogos e placares já disputados (com pênaltis) e os jogos por vir com o horário de Brasília; quando a CBF/Conmebol ainda não marcou o horário, aparece **"A definir"**. Filtro por competição (Brasileirão, Copa do Brasil, Libertadores, Sul-Americana, Recopa, Supercopa e estaduais cobertos pela ESPN: Carioca, Paulistão, Mineiro e Gauchão) e resumo de vitórias, empates, derrotas e gols. |
| **Calendário do clube** | Na visão geral de cada clube, no lugar dos últimos 5 e próximos 5: o **mês** com cada jogo no seu dia, em **todas as competições** (Brasileirão, Copa do Brasil, Libertadores, Sul-Americana, estaduais, Supercopa, Recopa). Voltar o mês mostra **placar, resultado e local**; os próximos, horário e local. **Clicar num jogo** abre as estatísticas rápidas (gols com autor e minuto, posse, finalizações, escanteios, faltas, impedimentos, defesas, passes, cartões, árbitro e público) ou, antes do jogo, a contagem, os últimos 5 e os confrontos na temporada. Veja "Calendário: API e fontes". |
| **Estatísticas do elenco** | Na visão geral de cada clube e na aba "Estatísticas": **pendurados** (2 amarelos, o próximo suspende), **jogos seguidos**, **departamento médico** e **reservas mais usados** por minutagem. Cartões e minutos vêm das súmulas de todos os jogos do Brasileirão; lesões e pendurados são conferidos nas manchetes de ge.globo, ESPN, UOL, Lance, Gazeta Esportiva e Terra e dos setoristas cadastrados, com o número de fontes que confirmam cada caso. |
| **Elenco** | Elencos reais, escalação do último jogo de cada clube e campinho interativo: arraste jogadores para trocar ou para qualquer ponto da grama; 8 formações. |
| **Bora pro jogo** | Prancheta tática comparando dois times com e sem a bola, leitura tática e tendência do jogo (modelo simples). **Arraste os jogadores** (mouse ou dedo) para mudar a posição em tempo real: as setas de ataque acompanham, cada fase guarda as suas posições e "Restaurar posições" desfaz. Ao segurar um jogador, aparece o **mapa de calor** de onde ele costuma atuar, com as posições em % e os minutos no Brasileirão. |
| **Tabela** | Classificação, números do campeonato e artilharia, **em tempo real**: com jogo rolando, os placares parciais entram na conta (pontos, jogos, saldo e posição, com ▲▼ de quem subiu ou caiu e o placar ao lado do clube), e os gols de agora entram na artilharia ("+1 ao vivo"). Funciona também sem a API, direto da ESPN no navegador. Cada número (gols, ataque, defesa, amarelos, vermelhos) abre uma **subpágina de ranking** dos 20 clubes; passar o mouse ou segurar o dedo mostra uma prévia. |
| **Artilharia e ficha do jogador** | Artilharia geral, do clube e da partida **em tempo real** ("+1 ao vivo"), montada pelas súmulas da ESPN de todos os jogos (quem está no top 10 da CBF fica com o número oficial; gol contra não conta). A ficha abre e fecha no **clique** (ou toque), rola por dentro em telas baixas e mostra jogos, minutos, gols por clube e **contra quem marcou**, já com os gols de hoje ("+2 hoje"). |
| **Partida** | Placar com o **resumo dos gols e expulsões** de cada time (jogador e minuto, gol contra e de pênalti marcados), informações, comparação no campeonato, **top 5 artilheiros de cada time lado a lado** (1º contra 1º…, com a ficha de cada um) e **Minuto a minuto** ao vivo. Nos jogos por vir, **Árbitro** nas informações e as **manchetes da arbitragem** com link (veja abaixo). A página de cada clube também mostra o top 5 dele. |

## API (`server/placar_api.py`)

| Rota | Retorno |
|---|---|
| `GET /api/state` | tabela, jogos da rodada (com placar ao vivo), elencos e últimas escalações |
| `GET /api/artilharia-ao-vivo[?jogador=ID]` | artilharia em tempo real: súmulas gravadas + gols dos jogos de agora, com contra quem e por qual clube cada jogador marcou |
| `GET /api/tabela-ao-vivo` | classificação em tempo real: a tabela da ESPN (que só conta jogos encerrados) mais o placar dos jogos em andamento e dos encerrados que ela ainda não contou, com quanto cada clube subiu ou caiu |
| `GET /api/rankings?tipo=gols\|ataque\|defesa\|amarelos\|vermelhos` | rankings do campeonato; os cartões somam a súmula de cada jogo encerrado depois da última tabela da CBF |
| `GET /api/retrospecto?club=flamengo` | últimos 5 e próximos 5 jogos, em todas as competições; atualiza a cada 30 min e ao fim de cada jogo |
| `GET /api/jogadores?club=flamengo` | pendurados, jogos seguidos, lesionados (com fontes) e reservas mais usados: quem mais entra saindo do banco (pelo menos tantas vezes quanto começa jogando). Só entra quem está no elenco atual ou jogou um dos 3 últimos jogos; quem foi vendido sai das listas. Atualiza a cada hora |
| `GET /api/departamento-medico[?club=cruzeiro]` | quem está no DM (situação, parte do corpo, desde quando, último jogo, veículos que confirmam e manchetes) e quem saiu na temporada, com o motivo; atualiza a cada hora (a cada 30 min pelo robô) |
| `GET /api/arbitragem` | árbitro dos jogos dos próximos 8 dias segundo as manchetes dos veículos, quantas manchetes confirmam e os links; atualiza a cada 30 min |
| `GET /api/manchetes` | principais notícias do futebol para a faixa embaixo do menu (título, fonte, hora, link e clubes citados); atualiza a cada 30 min |
| `GET /api/news?club=flamengo` | manchetes recentes do clube (título, fonte, data e link), só as que citam o clube no título pelo nome ou por um apelido (`apelidos` em `server/config.json`) |
| `GET /api/minuto-a-minuto/<id>` | narração do jogo até o momento |
| `GET /api/minuto-a-minuto/<id>/stream` | narração ao vivo via Server-Sent Events |
| `GET /api/health` | situação das atualizações |

Intervalos de atualização, portais monitorados, **setoristas** e **apelidos** de cada clube (usados para filtrar as notícias) ficam em [`server/config.json`](server/config.json).

## Departamento médico (temporada inteira)

Para cada clube, o monitor olha quem pode estar machucado:
- quem costuma jogar (2 ou mais dos últimos 10 jogos) e não entrou em campo nem foi relacionado no último jogo;
- quem já está no DM;
- quem aparece numa manchete de lesão do clube.

Para cada um desses jogadores, busca no Google Notícias o nome dele com o clube e termos médicos (lesão, desconforto, cirurgia, transição, liberado…). O índice do Google lê o texto das matérias; o site só guarda título, veículo, data e link. As buscas cobrem a imprensa nacional, a imprensa local (onde estão os setoristas), o site oficial do clube e os setoristas configurados.

- **Nome certo:** compara sem acento e com as grafias que variam (Morais/Moraes, Souza/Sousa…). Um nome só conta se estiver inteiro na manchete: "Lucas" não é "Lucas Paquetá", e "Santos" não é o estádio "Nilton Santos".
- **O que a manchete diz de cada jogador:** vale a palavra mais próxima do nome, dentro da mesma oração. Em "Atlético libera Ruan, mas perde Victor", Ruan foi liberado e Victor é desfalque. Suspensão, julgamento, convocação e negociação não contam como lesão.
- **Confirmação:** dois veículos diferentes, ou um da lista de `fontes_dm` em `server/config.json`, ou o site oficial do clube.
- **Situação:** lesionado, dúvida, em transição, longo prazo ou fora da temporada, com a parte do corpo quando a manchete diz.
- **Saída do DM:** acontece sozinha quando o jogador entra em campo ou é **relacionado** (fica no banco), pela súmula da ESPN, ou quando uma manchete diz que foi liberado, voltou a treinar com o grupo ou joga no sacrifício. Lesão leve sem notícia nova por 30 dias também sai.
- **Histórico:** fica gravado em `js/departamento-medico.js`, com quem esteve no DM, de quando a quando e por que saiu, e o robô continua dele na execução seguinte.

As regras de leitura têm casos reais de teste em `tests/dm_casos.py`.

### Setoristas e canais monitorados

Cada clube tem em `server/config.json` os jornalistas que cobrem o dia a dia dele: 54 setoristas, que se apresentam como setoristas do clube e informam o veículo. Por exemplo:
- Samuel Venâncio (Samuca TV) no Cruzeiro;
- Breno Galante no Atlético-MG;
- Venê Casagrande no Flamengo;
- Victor Lessa no Fluminense.

A **CazéTV** entra como canal nacional.

| Onde | Como é lido |
|---|---|
| Matérias e publicações indexadas | Google Notícias, uma busca por clube com todos os setoristas |
| YouTube (10 canais de setoristas + CazéTV) | feed oficial (RSS) de cada canal, só os títulos dos vídeos |
| X | API oficial v2, se houver a chave `X_BEARER_TOKEN` |
| Instagram | Graph API oficial (perfis profissionais), se houver `IG_USER_ID` e `IG_ACCESS_TOKEN` |
| TikTok | não é lido: não há API pública para isso |

Os termos de uso do Instagram, do X e do TikTok proíbem coleta automática fora das APIs oficiais, por isso nada é raspado. Das redes, o site mostra só "publicação de @perfil", a data e o link; o texto serve apenas para reconhecer o jogador e a situação.

Notícia de setorista cadastrado ou da CazéTV confirma a lesão sozinha, e na página do clube aparece "setorista · Nome".

**Jogadores da base:** entram no monitor:
- os que já entraram em campo pelo clube, mesmo fora do elenco da ESPN;
- os que aparecem como "joia/cria/garoto… Fulano" numa notícia de lesão (no máximo 3 por clube).

Eles ganham o selo "base".

**Ligar o X e o Instagram (opcional):**
1. Crie as chaves no [portal de desenvolvedores do X](https://developer.x.com) (o plano gratuito não permite leitura) e/ou num app da [Meta for Developers](https://developers.facebook.com) ligado a uma conta profissional do Instagram.
2. Cadastre-as em *Settings → Secrets and variables → Actions* com os nomes `X_BEARER_TOKEN`, `IG_USER_ID` e `IG_ACCESS_TOKEN`.
3. O robô passa a usá-las sozinho. As chaves nunca ficam no código.

## Placar ao vivo: atraso

O gol aparecia, em média, 6 s depois de estar na ESPN (até 12 s), nunca aparecia em jogo sem horário marcado e, com a aba em segundo plano, podia levar 1 min. Medido com o mesmo jogo simulado nas duas versões (`tests/mobile/latencia.mjs`):

| Caso (14 gols) | Antes | Agora |
|---|---|---|
| Jogo com horário: atraso médio | 5,6 s | 0,39 s (93% menor) |
| Jogo com horário: pior caso | 11,0 s | 1,4 s |
| Jogo só com a data | não aparecia | 0,5 s em média |
| Aba em segundo plano | até 1 min | a cada 3 s |
| Dados com bola rolando | ~20 KB/min | ~280 KB/min (4 KB a cada 0,8 s) |

O que mudou:
- **Consulta a cada 0,8 s com bola rolando** (antes 12 s). A ESPN guarda o placar por 1 a 2 s (`Cache-Control: max-age=1-2`), então perguntar mais vezes não traz nada novo. A resposta do dia tem uns 4 KB comprimida.
- **Relógio num Worker** (`js/relogio.js`): com a aba escondida, o navegador espaça os timers da página para 1 vez por minuto, mas não os de um Worker. Escondida, a consulta é a cada 3 s, e o som do gol toca na hora.
- **Economia de dados**: com "economia de dados" ligada ou internet 2G/3G, a cada 4 s.
- **Jogo sem horário** (só a data, comum nas últimas rodadas) entra no placar em tempo real no dia do jogo.
- **Alerta antes do resto**: o GOL! aparece primeiro e a página é atualizada no quadro seguinte.
- **Minuto a minuto** a cada 4 s (antes 20 s) e na hora em que o placar muda.
- Com o Worker da API-Football ligado, Worker e ESPN são consultados ao mesmo tempo.

O que fica fora do alcance do site: o tempo que a própria ESPN leva para registrar o gol depois do lance. Monitorar o Instagram dos clubes não resolveria: a API do Instagram não avisa quando outra conta publica (a busca de contas comerciais tem limite de consultas por hora) e os clubes postam o gol depois do replay, em geral mais tarde que a ESPN. Fontes com atraso de poucos segundos depois do lance são pagas (por exemplo API-Football em plano pago, já suportada pelo Worker, ou provedores de dados oficiais).

## Simulador da tabela

Na aba **Simulador** (`#/simulador`), o usuário dá o placar dos jogos que faltam e vê a classificação mudar na hora, com setas de quem subiu ou caiu e os pontos ganhos no palpite.
- Só entram jogos que ainda não começaram. Os que estão rolando já contam na tabela com o placar de agora.
- Rodada por rodada ou **Todas** (até o fim do campeonato). Botões rápidos: vitória, empate, "Mandantes vencem", "Tudo empate" e "Limpar".
- Mesma conta da tabela ao vivo: pontos, vitórias, saldo e gols pró.
- **Palpites acumulam**: a tabela de cada rodada já soma os placares dados nas rodadas anteriores (Palmeiras 3 x 0 Flamengo na 36ª: na 37ª o Palmeiras já aparece com os 3 pontos e o jogo a mais). Rodadas anteriores não contam palpites das seguintes.
- Os palpites ficam guardados no aparelho.
- **Próxima temporada**: os jogos vêm da mesma fonte do placar (ESPN). Quando a tabela de 2027 for divulgada e os jogos ganharem data, eles aparecem no simulador sozinhos. As páginas do ge.globo, da CazéTV e do site da ESPN não são lidas, porque os termos de uso desses sites não permitem copiar o conteúdo.

## Janela de transferências

Aba **Janela** na página de cada clube da Série A (`#/clube/<id>/mercado`): o torcedor vira diretor de futebol e monta o elenco da próxima temporada numa **mesa de transferências** nas cores do clube, com a linguagem das páginas de notícia de mercado: números grandes e condensados (fonte Big Shoulders Display), o cartão de cada negócio (de onde vem, para onde vai, quanto custou) e o carimbo de **"Negócio fechado"** a cada contratação.
- **Painel**: saídas (um ponto colorido por saída: emprestado, vendido, devolvido), chegadas (escudos de origem), tamanho do elenco (faixa com o mínimo e o máximo), **caixa disponível** (barra do quanto já foi gasto) e **folha mensal** (barra até o limite). Só o número que mudou anima, contando do valor antigo ao novo.
- **Dois modos**: *real* (caixa e folha do clube; folha até 10% acima da atual; elenco entre 22 e o limite; aviso de mais de 9 estrangeiros entre os titulares; o caixa **não** pode ser editado) e *manager* (sem limites; o **caixa pode ser editado** no próprio painel).
- **Desfazer tudo**: um botão (com confirmação) desfaz todas as decisões, reforços, escalação e caixa editado, e volta ao elenco real.
- **1. Elenco**: cartões por posição (goleiros, zagueiros, laterais, volantes, meias, pontas, centroavantes), cada um com a posição de origem, número, idade, nacionalidade, **minutos reais da temporada** (todas as competições, pelas súmulas: minutos, jogos e jogos como titular), a **situação** (titular, reserva ou pouco usado, com as fontes que confirmam) e a decisão: fica, empresta ou sai. Quem chegou emprestado: fica, compra ou devolve.
- **Emprestados**: os jogadores do clube cedidos a outros clubes, com onde estão, até quando e **quanto jogam lá** (minutos e jogos quando o clube de destino é da Série A; jogos como titular e gols pela ESPN nos outros), conferidos em duas fontes (Wikipédia e elenco do clube de destino na ESPN: "confirmado" quando batem). Decisão: segue lá, volta ou vende.
- **2. Reforços**: o mercado global (elencos de 17 ligas) com busca e filtros; cada contratação vira o cartão do negócio.
- **3. Escalação no campo 3D**: o campo inclinado como na transmissão, com sombra e luz. **Arraste qualquer jogador para qualquer ponto do campo**: o campo identifica a posição nova pelo lugar (GOL, ZAG, LD, LE, ALD, ALE, VOL, MC, MD, ME, MEI, PD, PE, CA) e compara com a posição de origem do jogador. Mudou, aparece o selo em cima dele (por exemplo **MEI → PD**): azul se ele já jogou ali, laranja se **não está acostumado**. Tocar no jogador mostra a **prévia de como ele jogou em cada posição** (jogos, minutos, gols e assistências por posição, pelas súmulas do Brasileirão). Solte um reserva em cima de um titular para trocar. O banco tem os 12 mais usados e, embaixo, **todos os outros jogadores do elenco**. A escalação automática usa quem mais joga em cada posição (no Cruzeiro, o Otávio no gol). A mesma troca de posição com selo vale na escalação do clube (aba Elenco).
- **4. Compartilhar**: cartaz 1080 × 1350 com a escalação no campo 3D (com os selos de troca de posição), chegadas com o valor e saídas com o tipo; download em **PNG** ou **PDF** e link que abre o mesmo elenco para os amigos.
- **Dados** (`server/mercado.py`, `server/financas.py`, `server/fontes_elenco.py`; API `/api/mercado/<clube>` e `/api/mercado-global`; arquivos `js/mercado/`):
  - **elenco**: cadastro da ESPN, conferido com o **TheSportsDB** (cadastro no clube e posição detalhada) e com as súmulas (quem jogou nos últimos 45 dias entra mesmo se a ESPN tirou do cadastro: assim o Matheus Pereira está no Cruzeiro);
  - **titular ou reserva**: súmulas dos últimos 5 jogos, último jogo e manchetes de escalação da semana (Google Notícias, só títulos); "titular" com 3 fontes concordando (ou 4 de 5 jogos como titular e no último XI); com a chave da API-Football, as escalações dela entram como quarta fonte;
  - **folha mensal**: levantamento do ge de 14/10/2026 (valores aproximados de cada clube), substituído automaticamente quando uma manchete mais nova traz a folha do clube ("folha de R$ X milhões por mês", com o clube citado antes do número); o salário de cada jogador não é público: a folha é dividida pelo tempo de carreira, pelos minutos e pelo valor;
  - **caixa para reforços**: nenhum clube publica caixa disponível; quando uma manchete traz o orçamento de reforços, ele é usado; sem isso, a estimativa é de duas folhas mensais, e o painel diz qual dos dois está valendo;
  - **câmbio**: euro PTAX do **Banco Central do Brasil** (API pública Olinda), do último dia útil;
  - **posição de origem e histórico por posição**: súmulas do Brasileirão (posição de cada jogador em cada jogo);
  - **valor de mercado**: estimativa do Placar.TV (o Transfermarkt não é usado: os termos dele proíbem robôs).
  - O robô atualiza clubes e finanças todo dia (finanças a cada 6 h), o mercado global uma vez por semana por time e o TheSportsDB aos poucos (60 consultas por rodada, por causa do limite do plano gratuito).
- **Site oficial dos clubes**: não é lido. O do Cruzeiro, por exemplo, não tem página nem API pública do elenco: carrega a lista de um banco de dados interno do aplicativo, e ler esse banco direto seria contornar o próprio site. Se o clube oferecer um feed ou API pública, ele entra como mais uma fonte em `server/fontes_elenco.py`.
- **Fotos dos jogadores (modo privado)**: as fotos recortadas com a camisa do clube vêm do TheSportsDB e **não têm licença para uso comercial**. Enquanto o site é de uso do dono, ficam **ligadas por padrão** e substituem a foto livre em todo o site (ficha do jogador, listas do elenco, cartão do mapa de calor, Janela); `?privado=0` desliga neste navegador e `?privado=fotos` liga de novo. **Antes de apresentar ou vender o produto**: desligue o modo privado e rode o robô com `MODO_VENDA=1` (ou `FOTOS_PRIVADAS=0`), que tira as fotos dos arquivos.

## Notas dos jogadores e do time

Ao fim de cada jogo (e durante ele, quando o servidor está ao vivo), cada jogador ganha uma **nota de 3 a 10** e o time, uma **nota coletiva**. Aparecem na ficha do jogador (coluna "Nota" e nota média dos últimos 10) e no card **Notas da partida** da página do jogo, com o **melhor em campo** destacado. As cores seguem o padrão dos apps de placar: vermelho abaixo de 6, laranja, verde-claro, verde e azul a partir de 8.
- **Critérios** (`server/jogadores.py`, `nota_jogo`), no espírito do Sofascore e do FlashScore (que usa as notas do Opta), cujos pesos exatos não são públicos: parte de **6,0**; gol +1,0 (defensor e goleiro +1,2), assistência +0,6, finalização no alvo +0,15, fora +0,03, drible +0,08, cruzamento +0,03, participação com bola até +0,4; desarme +0,12, interceptação +0,10, corte +0,06, duelo aéreo +0,05, defesa do goleiro +0,25; sem sofrer gol (60+ min) goleiro +0,6 e defensor +0,4; gol sofrido em campo goleiro −0,35 e defensor −0,15; perda de bola −0,05, amarelo −0,3, vermelho −1,5; vitória +0,2, derrota −0,2; **menos de 10 minutos, sem nota**.
- **Nota do time**: média das notas de quem jogou, pesada pelos minutos, +0,3 na vitória e −0,3 na derrota.

## Estatísticas, mapas de calor e notas durante o jogo

O robô lia súmula e lances só de jogo encerrado. Agora os **jogos em andamento** também entram: no servidor ao vivo, a cada **5 minutos** com algum dos 20 clubes em campo; no robô do GitHub, a cada rodada de 30 min. Quando o jogo termina, a rodada seguinte relê tudo uma vez, já com os números finais. Nota ao vivo aparece com contorno vermelho.

## Escalação anunciada (ESPN, X e Instagram)

`server/escalacoes.py`, API `GET /api/escalacoes/<clube>` e `js/escalacoes.js`: das 3 h antes do jogo até o fim, o robô procura a escalação do próximo jogo de cada clube:
- **ESPN**: a súmula traz titulares e formação assim que o clube divulga (em geral ~1 h antes);
- **X** (perfil oficial do clube, API oficial v2, `X_BEARER_TOKEN`) e **Instagram** (perfil oficial, Graph API Business Discovery, `IG_USER_ID` e `IG_ACCESS_TOKEN`): a publicação de escalação é cruzada com o elenco; com 9 ou mais jogadores citados, vale. Nada é raspado: sem as chaves, fica só a ESPN. Os perfis oficiais estão em `PERFIS` (confira antes de ligar as chaves).
- Na janela de transferências e na escalação do clube, **a escalação anunciada vale mais que a do último jogo**; sem anúncio, o ponto de partida é **sempre a escalação do técnico no último jogo** (a edição do torcedor vale até o próximo jogo).

## Modo venda

Enquanto o site é de uso pessoal do dono, ficam ligados dados sem licença comercial: fotos não comerciais do Flickr e as fotos privadas do TheSportsDB (ligadas por padrão em todo o site). **Antes de vender ou apresentar**: rode o robô com `MODO_VENDA=1` (tira as fotos não comerciais e as fotos privadas dos arquivos) e abra o site com `?privado=0`.

## Identidade visual 2026

O site segue o modelo dos apps de placar: lista densa de jogos, três colunas no computador, barra de navegação embaixo no celular, tema claro e escuro.
- **Fonte**: Saira (texto e interface) e Saira Condensed (placares, cabeçalhos, números): uma família, duas larguras.
- **Faixa da competição**: o campo de cor do torneio, com três faixas diagonais de grafismo de TV, o emblema grande e o nome em condensada pesada. Cada competição tem a sua paleta: **Brasileirão** em verde-bandeira, amarelo-ouro e azul (Série B em azul, Série C em verde-água, Série D em laranja); **Libertadores** em preto e ouro; **Sul-Americana** em azul profundo e celeste; **Copa do Brasil** em verde, azul e amarelo; cada estadual nas cores da bandeira do estado.
- **Emblemas**: desenhos próprios do site, a partir da forma de cada troféu (a taça do Brasileirão com o losango e o círculo da bandeira, a taça com a figura no alto da Libertadores, o disco com faixas da Sul-Americana, a chave que se fecha num troféu da Copa do Brasil, o escudo com a sigla do estado). Nenhum logo oficial é copiado: as marcas das competições pertencem à CBF, à CONMEBOL e às federações, e usá-las num produto exige licença.
- **Abertura animada**: o emblema se desenha no centro sobre o campo de cor, o nome entra por uma máscara e tudo se recolhe para o lugar da faixa (FLIP). Dura 1,4 s na primeira vez de cada competição na visita; depois, só a varredura de cor de 0,5 s. Um toque pula, e quem usa "reduzir movimento" não vê animação.
- **Escudos**: ESPN; quem a ESPN não tem (estaduais, Copa do Brasil, Séries C e D) recebe o escudo do **Wikimedia Commons**, achado pelo artigo do clube na Wikipédia, pelo item do Wikidata (logotipo, P154) ou pela imagem principal do artigo, sempre só se o arquivo estiver no Commons, que aceita apenas imagens livres. Sem imagem livre, o site desenha um escudo com as iniciais nas cores do clube (propriedade "cores" do Wikidata). Os escudos entram com uma mola curta ao carregar.

## Brasileirão Séries B, C e D

A faixa do Brasileirão troca de série (A, B, C, D), e a página de **Clubes** separa os clubes por série.
- **Série B**: tudo o que as copas têm (visão geral da rodada, classificação com as zonas de acesso e rebaixamento, jogos por rodada, rankings, clubes, simulador da tabela). O placar ao vivo vem direto da ESPN: a cada 10 s com jogo rolando, com aviso de gol na tela.
- **Séries C e D**: a ESPN não tem a temporada 2026 dessas séries, e não há fonte gratuita de placar ao vivo para elas. Participantes, classificação de cada fase e artilharia vêm do artigo da temporada na **Wikipédia** (CC BY-SA 4.0, com link para o artigo), lido pela API oficial do MediaWiki (`server/wiki_series.py`). Com a chave da API-Football (`API_FOOTBALL_KEY`, plano pago para 2026), o robô passa a trazer os jogos e o placar ao vivo dessas duas sozinho (ligas 75 e 76).

Hospedagem, banco de dados e escala: veja [docs/INFRAESTRUTURA.md](docs/INFRAESTRUTURA.md).

## Outras competições: Libertadores, Sul-Americana, Copa do Brasil e estaduais

Uma **barra de competições** no topo do Brasileirão e de cada competição leva de uma a outra sem sair do site: mesmo desenho, mesmas abas, mesmo jeito de navegar; o que muda é a cara do torneio.
- **Identidade de cada competição**: cores do site, fundo, emblema e uma **abertura animada** própria, que toca ao trocar de competição (a completa na primeira vez da visita; depois, a rápida; nada com "reduzir movimento"). Libertadores em preto e dourado, com um feixe de luz sobre a taça; Sul-Americana em azul profundo cortado por faixas de luz; Copa do Brasil em verde e amarelo, com o chaveamento se fechando; cada estadual com as cores da bandeira do estado. Tudo desenhado para o site: nenhum logo, vinheta ou música oficial.
- **Abas**: visão geral (fase atual, linha do tempo das fases na ordem real e com as datas, próximos jogos e últimos resultados, artilharia, brasileiros na competição e a situação de cada um, "como funciona" e notícias), classificação (grupos com as zonas de classificação e a classificação geral de todos os jogos), mata-mata (chave das oitavas à final na ordem do caminho até a final, ida e volta somadas, pênaltis; as fases anteriores em listas), jogos (por fase e data), rankings (artilharia, mais gols, melhor ataque, melhor defesa, mais amarelos e vermelhos), clubes (todos os participantes, com a página de cada um na competição), **simulador** (placar dos jogos que faltam, grupos e mata-mata recalculados) e **Bora pro jogo** no clima da competição (os clubes da Série A que estão nela).
- **Copa do Brasil**: mata-mata desde a 1ª fase; o "como funciona" sai dos próprios jogos (jogo único ou ida e volta em cada fase).
- **Estaduais**: Paulistão, Carioca, Mineiro e Gauchão (os que a ESPN cobre com jogos, gols e cartões). Campeão só aparece pela fase chamada "Final" (finais de taças secundárias não coroam ninguém).
- **Dados**: o robô monta `js/competicoes/<id>.js` a cada 30 min a partir do placar do dia da ESPN (dias que já passaram ficam guardados; os próximos são relidos de 12 em 12 h), as tabelas dos grupos da ESPN e as manchetes do Google Notícias (só título, veículo, data e link). No dia de jogo, a página atualiza o placar direto da ESPN a cada 30 s. API: `GET /api/competicao/<id>`.

## Jogadores: página, mapa de calor real, fotos e comparativos

- **Página de cada jogador** (`#/jogador/<id>-<clube>`, por exemplo `#/jogador/216098-cruzeiro`, o Matheus Pereira): foto, camisa, posição, idade e clube; números da temporada por competição; por 90 minutos; e as abas **Últimos 10** (jogo a jogo: minutos, gols, assistências, finalizações, ações com bola, passes, desarmes, interceptações, dribles e cartões, mais o mapa dos 10 jogos), **Temporada** (todos os jogos, por mês, com filtro de competição), **Mapa de calor** (temporada e últimos 10, com o tanto de ações em cada terço e faixa do campo) e **Comparar** (qualquer outro jogador, números por 90 minutos e os dois mapas lado a lado).
- **Mapa de calor com os lances reais**: cada ação do jogador com posição no campo (passe, desarme, cruzamento, drible, corte, duelo aéreo, finalização) vem do feed de lances da ESPN e vira um ponto no campo. Antes, o mapa era estimado pela posição na escalação; agora a página do jogador e o "Bora pro jogo" usam os lances (o estimado fica só para quem não tem lances). Conferido com posições conhecidas: goleiros concentram as ações perto do próprio gol, atacantes perto do gol adversário, laterais-direitos à direita e laterais-esquerdos à esquerda. Em parte dos jogos a ESPN grava as coordenadas de 0 a 1 em vez de 0 a 100: o robô detecta a escala de cada jogo.
- **Fotos**: primeiro do **Flickr**, da **temporada atual**, pela API oficial: fotos com licença que permite o uso (Creative Commons com atribuição que permitem uso comercial, CC0 e domínio público) e com o nome do jogador no título ou nas etiquetas. Cada foto mostra o fotógrafo, a licença, a data e o link para a página dela no Flickr. Fotos com "todos os direitos reservados" (o padrão do Flickr) não entram: o crédito não substitui a licença, e os termos da API do Flickr exigem respeitar a licença de cada foto. As "sem derivações" também ficam de fora, porque o site recorta a foto num círculo. As não comerciais (NC) entram enquanto o site é de uso pessoal do dono; `MODO_VENDA=1` as tira antes de vender. Precisa da chave gratuita da API do Flickr em `FLICKR_API_KEY` (no servidor e nos segredos do GitHub). Sem foto no Flickr, ou sem a chave, vale o **Wikimedia Commons**, achado pelo Wikidata e conferido com o elenco pelo nome **e pelo ano de nascimento**. Hoje, sem a chave, 246 jogadores têm foto do Commons; os outros aparecem com o número da camisa. **Rosto centrado**: o robô acha o rosto em cada foto com a OpenCV (detector de rostos que vem com ela, confirmado por um olho dentro do rosto ou por dois detectores concordando, para não recortar uma bola ou a torcida) e guarda o quadrado em volta dele; o círculo da foto (página do jogador, "Bora pro jogo" e estatísticas do clube) mostra esse quadrado, com o rosto no centro. Foi achado em 188 das 241 fotos; nas outras (em geral de corpo inteiro, de longe), fica o recorte padrão, um pouco acima do centro. Sem a OpenCV instalada, tudo funciona com o recorte padrão. O rodapé traz o aviso exigido pelo Flickr: "This product uses the Flickr API but is not endorsed or certified by SmugMug, Inc."
- **Homônimos**: a ESPN às vezes usa o mesmo número para dois jogadores de clubes diferentes (os dois Matheus Pereira, do Cruzeiro e do Corinthians). Por isso o endereço leva o clube, e cada clube mostra só os jogos do seu jogador.
- **Opta**: o site [optaplayerstats.statsperform.com](https://optaplayerstats.statsperform.com/) não pode ser usado como fonte: os termos da Stats Perform proíbem usar o conteúdo em outro site sem autorização escrita, e o site bloqueia acesso automático. Com um contrato da API oficial do Opta, os dados entram por `fonte_opta()` em `server/jogadores.py`, no mesmo formato.
- **Comparativo de clubes**: na aba **Comparar** de cada clube (`#/clube/<id>/comparar/<outro>`), qualquer clube da Série A: tabela do Brasileirão lado a lado, aproveitamento em casa e fora, temporada em todas as competições, últimos 5, confrontos na temporada e artilheiros.
- **API**: `GET /api/elenco-temporada?club=<id>` (todos os jogadores do clube) e `GET /api/jogador/<id>[-<clube>]`. No site sem servidor, o robô grava `js/jogadores/<clube>.js` a cada 30 min, baixado só nas páginas de jogador, nas estatísticas do clube e no "Bora pro jogo".

## Busca: jogadores, histórico e em alta

- Clubes pelo começo do nome; **jogadores** pelo começo do nome ou de um sobrenome ("pereira" acha o Matheus Pereira). A lista de jogadores vem do elenco já carregado: buscar não baixa nada.
- **Histórico**: as últimas buscas abertas aparecem ao clicar no campo, com o botão "Limpar". Fica só neste aparelho (`localStorage`, até 10).
- **Em alta**: os clubes e jogadores mais buscados nas últimas 24 h por todo mundo (só contagens por clube/jogador, nada de quem buscou). Para não pesar com muita gente: cada aparelho conta cada item no máximo uma vez a cada 6 h, num envio pequeno e assíncrono (`sendBeacon`); a lista fica guardada 5 min. Funciona com a API (`POST /api/busca`, a única rota que aceita escrita, com corpo de até 200 bytes e limite por endereço; `GET /api/em-alta`) ou com o Worker da Cloudflare (Workers KV, binding `BUSCAS`, opcional; cada instância grava no máximo uma vez por minuto). Sem nenhum dos dois, a lista vira **"Em destaque agora"**: jogos de hoje, artilheiros e o líder.

## Calendário: API e fontes

- **API** (`server/placar_api.py`): `GET /api/calendario?club=<id>[&mes=AAAA-MM]` devolve a temporada do clube (ou um mês) com competição, fase, data e hora de Brasília, adversário, mando, local, placar e pênaltis. `GET /api/jogo?event=<id da ESPN>&lg=<liga>` devolve as estatísticas rápidas de um jogo, guardadas por 1 min com bola rolando e 6 h depois do fim.
- **Sempre atualizado**: o robô do GitHub grava a temporada de todos os clubes a cada 30 min (`js/club-form.js`) e, ao abrir o clube, o navegador busca a agenda atualizada direto na ESPN. As estatísticas vêm na hora do resumo da ESPN.
- **Competições**: a ESPN traz Brasileirão, Copa do Brasil, Libertadores, Sul-Americana, Recopa, Supercopa, Carioca, Paulistão, Mineiro e Gauchão. Ela não cobre os estaduais do Paraná, da Bahia, de Santa Catarina e do Pará, nem a Copa do Nordeste e a Copa Verde. Esses entram pela **API-Football** quando a chave `API_FOOTBALL_KEY` estiver configurada no servidor ou nos segredos do GitHub (Settings › Secrets › Actions). Sem a chave, o calendário mostra o que a ESPN tem.

**Escudos dos adversários**: a ESPN não tem o escudo de muitos times pequenos dos estaduais e copas (Pouso Alegre, Betim, Noroeste, Maricá...). No calendário e na aba Partidas, esses times ganham um escudo desenhado com as iniciais e uma cor própria, o mesmo que entra se a imagem da ESPN falhar.

## Som do gol

O único som do site (`js/sons.js`, gerado no navegador com Web Audio, sem arquivos de áudio): quando um clube marca, junto com o alerta GOL!, tocam 5 s de
- o grito de **"GOOOOOL"** de um narrador: voz sintetizada como numa transmissão, com o pulso das pregas vocais e as pequenas irregularidades de uma voz de verdade, a rouquidão do esforço, cinco ressonâncias da boca na vogal "ô", o tom que sobe e segura com vibrato e ondas de fôlego, o "L" no fim, timbre de microfone de narrador e o eco do estádio;
- a **torcida vibrando ao fundo**: o ronco da arquibancada, gente gritando e aplausos. A torcida fica mais baixa enquanto o grito está no ar e cresce depois dele.

Cada clube muda um pouco o tom da voz, a duração do grito e a força da torcida.

Dois gols juntos tocam um depois do outro. Com a aba escondida, o som toca na hora e o alerta aparece quando ela voltar. O navegador só deixa tocar som depois do primeiro toque na página. Não há botão de som nem apito.

**Hinos**: têm composição e gravação protegidas pela Lei 9.610/98, e baixar o áudio do YouTube é proibido pelos termos do YouTube, por isso não estão no site. Quem tiver o instrumental licenciado pode pôr o arquivo em `media/hinos/<id do clube>.mp3` (ex.: `media/hinos/cruzeiro.mp3`) e o id em `hinos` no `js/config.js`: aí o gol toca o hino, cortado em 5 s com final suave, no lugar do som de estádio.

## Cenas dos clubes com a cidade de verdade

Ao abrir um clube, a cena de abertura (o urubu, o galo, o farol, a caravela, o Cruzeiro do Sul...) acontece sobre a **cidade do clube filmada de verdade**: um trecho de vídeo aéreo de cerca de 10 s, em repetição contínua e sem som, por baixo da animação. Nos 3 clubes sem vídeo da cidade disponível (Bragantino, Chapecoense e Mirassol), vale uma foto real.

- **Vídeos:** 17 clubes, do Pexels (licença que permite uso e edição, sem marca d'água), com o nome do autor no canto da faixa. Cortados e comprimidos para o site: 720p no computador e 540p no celular, de 0,4 a 1,5 MB cada (`media/cidades/`). Vídeos do YouTube não são usados: as imagens têm dono e os termos não permitem baixar nem tirar a marca d'água.
- **Fotos:** Wikimedia Commons, licença livre, com autor e licença na faixa. Também são a reserva do vídeo.
- **Cores do clube** por cima da imagem (preto e branco para Atlético, Botafogo, Corinthians, Santos e Vasco); nas cenas noturnas (Cruzeiro, Botafogo, Vasco, Grêmio, Remo e Vitória) o vídeo é escurecido como noite. A cidade começa escura e "acende" com a cena, com aproximação lenta da câmera e paralaxe do mouse. No Cruzeiro, as luzes de Belo Horizonte ficam embaixo do céu estrelado, e a Via Láctea e o Cruzeiro do Sul continuam no céu.
- **Luz de cinema:** raios de sol e brilho de lente saindo do sol do vídeo ou da foto, névoa baixa e vinheta. **Bichos em silhueta realista:** o galo contra o sol, com rabo de penas em foice balançando, crista e esporas, que levanta voo até o escudo; aves com as penas da ponta da asa abertas (os urubus sobem em espiral perto do Cristo). A abertura do Flamengo abre as listras rubro-negras como uma cortina.
- **Quando fica a foto:** com "reduzir movimento" no aparelho, se o vídeo não carregar em 6 s ou falhar, e em aparelho sem fôlego (se a animação cair abaixo de ~25 quadros/s com o vídeo, a cena troca para a foto e segue fluida). O vídeo pausa fora da tela.
## Tomada de drone do estádio (página da partida)

Ao abrir um jogo, a faixa com os escudos, a data e o estádio ganha uma **tomada de drone do estádio da partida**: a câmera começa no céu, acima das nuvens, atravessa as nuvens descendo e inclinando para baixo até o estádio aparecer atrás do placar, freia como um drone de verdade e fica parada. As cores dos dois clubes continuam nas laterais. Os **escudos** são grandes (imagem de 330 px, nítida) e entram com uma animação, cada um do seu lado, em todos os jogos, passados e futuros.

- **Fotos reais** dos 20 estádios do Brasileirão, de licença livre (Wikimedia Commons), com autor e licença na própria faixa. Os vídeos do YouTube não podem ser reaproveitados (as imagens têm dono e os termos não permitem), então o "drone" é a câmera feita em código sobre a foto aérea.
- O estádio vem do nome publicado pela ESPN para aquele jogo; sem o nome, a casa do mandante. Estádio fora da lista (jogo em campo neutro): a faixa fica como antes, sem mostrar outro estádio.
- **Fluida**: só `transform` e `opacity`; começa quando a foto já está decodificada; no celular, foto menor; nas laterais, uma miniatura ampliada no lugar de um filtro de desfoque (que custa caro a cada quadro). Com movimento reduzido, a foto aparece já parada.
- Estádios sem foto aérea livre (Nabi Abi Chedid, Couto Pereira, Baenão, Vila Belmiro, Barradão) usam a melhor foto livre do alto da arquibancada.

## Raio-X do clube e estatística da torcida

A aba **Estatísticas** de cada clube abre com o **Raio-X**: números táticos do Brasileirão calculados pelo PLACAR a partir das súmulas da ESPN (posse, passes, finalizações, escanteios, desarmes, defesas do goleiro e o minuto de cada gol). Cada número vem com a posição do clube entre os 20 e a média da liga, e tudo anima quando aparece na tela:

- **Quando marca e sofre**: gols por faixa de 15 minutos, 1º e 2º tempo;
- **Estilo de jogo**: anéis de posse, passes certos, chutes no alvo e aproveitamento em casa;
- **Comparado com a liga**: onde o clube fica entre o pior e o melhor em dez números;
- **Reação ao placar**: como termina o jogo quando sai na frente ou atrás, pontos buscados e pontos com gols depois dos 80';
- **Sequências e marcas**, **Você sabia?** (curiosidades geradas dos próprios números) e **destaques individuais** (participações em gol, finalizações, conversão, minutos por gol e garçons).

A auditoria (`tests/auditoria.py`) confere que pontos e gols do Raio-X fecham com a tabela e que os gols por faixa somam o total.

**Estatística feita pela torcida (créditos).** Logo abaixo ficam as páginas de torcedores que estudam o clube a fundo, como o [Cruzeiro Stats](https://x.com/cruzeirostats). Para cada uma aparecem o perfil (com link), as reportagens que citaram a página (só título, fonte, data e link) e, com a chave da API oficial do X (`X_BEARER_TOKEN`, plano pago), as publicações recentes com link para o original. O conteúdo dessas páginas pertence aos autores; o PLACAR não copia as artes nem os textos delas. A lista fica em `server/config.json` (`paginas_estatistica`), conferida em 05/11/2026: Cruzeiro, Flamengo, Atlético-MG, São Paulo, Fluminense, Corinthians, Grêmio, Botafogo e Vasco. Para os outros clubes ainda não há página de torcida com dados conferíveis e atualizados, e aparecem as que cobrem todos os clubes (Jogo em Números e DataFut).

## Arbitragem dos próximos jogos (pelas manchetes)

A escala oficial (árbitro, assistentes, quarto árbitro e VAR) é publicada pela CBF, mas os termos de uso do site da CBF não permitem reutilizar os dados sem autorização. Por isso a API **monitora os veículos de comunicação**: a cada 30 min, para cada jogo dos próximos 8 dias, busca no Google Notícias as manchetes sobre a arbitragem daquele confronto (só título, fonte, data e link) publicadas depois do último jogo dos dois clubes. Quando o título traz o nome do árbitro ("Fulano apita…", "CBF escala Fulano…", "com Fulano no apito"), o nome aparece na página do jogo com quantas manchetes confirmam. Um nome só vale se estiver na **lista de árbitros** que a própria API aprende com esse tipo de manchete, para não confundir com jogador, técnico ou dirigente. Enquanto nenhum veículo publicou o nome no título, a página mostra "Ainda não noticiado" e as manchetes da arbitragem, com o link para a escala oficial na CBF.

## Mapa de calor dos jogadores

O mapa da página do jogador e do "Bora pro jogo" usa os **lances reais** com posição no campo (feed de lances da ESPN; veja "Jogadores" acima). Quem não tem lances registrados (jogador que ainda não entrou em campo, ou estaduais sem cobertura lance a lance) fica com o mapa **estimado** de antes: as posições em que atuou nas escalações, pesadas pelos minutos. O cartão do mapa diz qual dos dois está na tela. Sites como SofaScore e FotMob proíbem copiar os dados, e o Opta exige contrato: nada vem deles.

## Identidade visual

Fundo escuro com **brilho nas bordas** (canto de cima à direita e de baixo à esquerda) e uma **grade de pontinhos** que acende, na cor do site ou do clube aberto, perto dos brilhos e em volta do mouse. Os cartões são levemente translúcidos, então o brilho passa por eles. O fundo é desenhado uma vez numa imagem ([`js/backdrop.js`](js/backdrop.js)) e só é redesenhado quando mudam a tela, o tema ou o clube, para não pesar na animação do topo.

**Tipografia em três vozes:** [Archivo](https://fonts.google.com/specimen/Archivo) Black condensada para a identidade (nome do clube, títulos, placar grande e o GOL!), [Barlow Condensed](https://fonts.google.com/specimen/Barlow+Condensed) como letra de placar de transmissão (cabeçalhos dos cards, rótulos, dias da rodada e números das listas) e Archivo normal para tudo o que se lê (nomes, frases, notícias e narração).

## Qualidade (QA) em PC e celular

| Item | Resultado |
|---|---|
| Rolagem para os lados, alvos de toque, texto ≥ 11 px | sem problemas nas 16 páginas testadas, no PC, iPhone 15 e Pixel 7 |
| Contraste (WCAG AA) | textos ≥ 4,5:1 nos dois temas; a cor de destaque de cada clube é ajustada para ficar legível no claro e no escuro |
| Links internos | os 66 links do site abrem uma página de verdade; a rota inexistente mostra "Impedimento!" |
| Teclado e leitor de tela | foco visível em todos os itens; cada página tem um título principal (h1); botões e imagens com nome |
| Interações | busca, tema, rodadas, filtros, favoritos, carrossel, ficha do artilheiro (abre e fecha no clique), abas do clube, prévia do ranking e o "voltar" do navegador |
| Rolagem | cabeçalho e títulos dos meses grudam no alto; listas longas e a página de clubes sem travadas |
| Carregamento (4G e processador 4× mais lento) | maior conteúdo em até ~2 s; saltos de layout ≤ 0,014 |
| Peso da página | ~0,3–0,5 MB (escudos pequenos nas listas; temporada dos clubes só nas páginas de clube) |
| Dados ao vivo | página sem redesenhar durante os jogos (só o que mudou é trocado); tabela e artilharia somam os jogos em andamento sem contar duas vezes; GOL! com a aba escondida espera a volta |
| Notícias | as 20 páginas de clube só com manchetes do próprio clube |
| Funções | rankings, estatísticas, retrospecto, partidas, rodadas, próximo jogo, ficha do artilheiro, site sem servidor, Worker e jogo simulado ao vivo |

```bash
python -m http.server 5173 --bind 127.0.0.1
BASE=http://127.0.0.1:5173 npm run test:mobile     # PC, iPhone e Android: layout, toque, texto, acessibilidade
node tests/mobile/qa.mjs                           # QA completo: contraste, links, teclado, interações e fluidez (PC, iPhone, Android)
node tests/mobile/desempenho.mjs                   # carregamento, peso e saltos de layout
node tests/mobile/visual.mjs                       # prints do tema escuro e claro
node tests/mobile/gol.mjs                          # o GOL! dos 20 clubes, quadro a quadro, no PC e no celular
node tests/mobile/escudos.mjs                      # escudo inteiro (pode vazar da faixa) no topo, na cortina e no gol ao vivo, 20 clubes × 3 aparelhos
node tests/mobile/topo-contraste.mjs               # texto do topo legível (≥ 4,5:1) sobre a cena de cada clube
node tests/mobile/gol-ao-vivo.mjs                  # jogo simulado: o GOL! aparece em cada gol, com placar e minuto
node tests/mobile/alinhamento.mjs                  # botões desalinhados em todas as páginas (PC, iPhone, Android)
node tests/mobile/bora-arrastar.mjs                # arrastar jogadores na prancheta (mouse e dedo)
node tests/mobile/bora-calor.mjs                   # mapa de calor de quem está sendo arrastado (PC e celular)
node tests/mobile/tabela-ao-vivo.mjs                # tabela, artilharia e GOL! em tempo real (ESPN simulada, aba escondida)
node tests/mobile/arbitragem.mjs                   # árbitro nos títulos das manchetes e quadro de arbitragem na página do jogo
node tests/seguranca/site.mjs                      # testes de invasão no navegador: dados maliciosos nas fontes, endereços forjados, moldura de outro site
node tests/seguranca/api.mjs                       # testes de invasão da API: arquivos fora do site, travessia de pastas, métodos, parâmetros, limites
node tests/mobile/drone.mjs                        # tomada de drone: os 20 estádios (foto, câmera parada, créditos) e a fluidez no PC, Android e iPhone
node tests/mobile/menu.mjs                         # menu principal visível e clicável no PC, tablet e celular; coluna "Próx." troca assim que o jogo termina
node tests/mobile/vigia.mjs                        # vigia: aba aberta desde a noite anterior, jogo parado aos 63' e jogo sem resultado são corrigidos sozinhos
node tests/mobile/sobreposicao.mjs                 # revisão visual: texto vazando da caixa, texto ou escudo por cima do vizinho e conteúdo fora da tela, em 17 páginas e 5 larguras (CLUBES=1: os 20 clubes; ABA=estatisticas: a aba de cada um)
python -X utf8 tests/auditoria.py                  # coerência dos dados: tabela, rodadas e placares, só jogadores que estão no clube, reservas de verdade, DM, artilharia, retrospecto e o Raio-X contra a tabela
python -X utf8 tests/dm_casos.py                   # regras do departamento médico com manchetes reais (nome certo, liberado x desfalque, suspensão não conta)
node tests/mobile/departamento-medico.mjs          # departamento médico na página do clube: situação, desde quando, confirmação, manchetes e quem voltou
node tests/mobile/faixa.mjs                        # faixa de notícias: troca da manchete, fita, links, atualização sozinha a cada 30 min, reduzir movimento
node tests/mobile/movimento.mjs                    # fita andando e escudos grandes da partida em 13 aparelhos (320 px a 2560 px, Chrome e Safari, retrato e paisagem)
node tests/mobile/escudos-espaco.mjs               # escudos x textos, letra por letra: nenhum texto embaixo de escudo, em 18 páginas e 6 telas (320 px a 1440 px)
node tests/mobile/cenas.mjs                        # cenas dos 20 clubes: vídeo da cidade (toca, crédito, foto de reserva) e foto, sem erros, e fluidez no PC, Android e iPhone
node tests/mobile/noticias.mjs                     # "Últimas notícias" do clube: só manchetes que falam dele (20 clubes, PC e celular)
node tests/mobile/sem-recarregar.mjs                # com jogo rolando, a página não se redesenha sozinha (só o que mudou é trocado)
node tests/mobile/fotos.mjs [prefixo]               # fotos das páginas principais (PC escuro, celular claro) para revisão visual
node tests/mobile/ficha-clique.mjs                  # ficha do artilheiro abre e fecha no clique, rola por dentro (PC baixo, PC, iPhone SE, Pixel)
node tests/mobile/artilheiros.mjs                  # top 5 dos dois times em todas as partidas e nos 20 clubes
node tests/mobile/elenco.mjs                       # campinho do elenco dos 20 clubes: nomes sem encostar, no PC, notebook e celular
node tests/mobile/proximo-artilheiros.mjs          # próximo jogo (carrossel, palpite) e ficha do artilheiro
node tests/mobile/estatisticas.mjs                 # pendurados, sequência, departamento médico e reservas dos 20 clubes
node tests/mobile/partidas.mjs                     # temporada de cada clube (todas as competições)
node tests/mobile/rodadas.mjs                      # próximas rodadas e jogos adiados
node tests/mobile/calendario.mjs                   # calendário dos 20 clubes: dias e meses, placar e local, competições, estatísticas ao clicar, celular
python -X utf8 tests/calendario_api.py             # API do calendário: estatísticas de um jogo real e jogos da API-Football (estadual, pênaltis, adiado)
node tests/mobile/janela.mjs                       # janela de transferências: dados, modos real e manager, elenco, reforços, escalação, cartaz PNG/PDF, link, celular
python -X utf8 tests/mercado_api.py                # API do mercado: valor e salário estimados, emprestados da Wikipédia, rotas
node tests/mobile/competicoes.mjs                  # competições: dados (gols, chave, artilharia), 8 abas de cada uma, tema, abertura, simulador, Bora pro jogo, celular
python -X utf8 tests/competicoes_api.py            # API das competições: fases, pontos corridos x mata-mata, ida e volta e pênaltis, campeão, rota
node tests/mobile/jogadores.mjs                    # jogadores: mapa de calor com orientação certa, fotos, busca, histórico, página, comparativos, 20 clubes, escudos dos estaduais
python -X utf8 tests/jogadores_api.py              # API dos jogadores: escala das coordenadas, homônimos, transferências, fotos, rosto, em alta e elenco de hora em hora
node tests/mobile/sem-servidor.mjs                 # site funcionando só com os arquivos (GitHub Pages)
node tests/mobile/busca.mjs                        # busca: só clubes que começam com o que foi digitado (A a Z e começos de nome, PC e celular)
node tests/mobile/simulador.mjs                    # simulador: só jogos que faltam, conta da tabela, botões, palpites guardados, 320 px a tablet
node tests/mobile/sons.mjs                         # som do gol (grito + torcida): toca no alerta, um gol depois do outro, nada ao navegar, os 20 clubes sem estourar
node tests/mobile/latencia.mjs                     # atraso do placar ao vivo: versão anterior x atual, com e sem horário marcado
node tests/mobile/demo-video.mjs                   # vídeo de demonstração das novidades, com som (tests/mobile/out/demo-novidades.mp4)
```

## Segurança

O site segue requisitos de segurança de nível empresarial, descritos em [SECURITY.md](SECURITY.md) (sem detalhes de implementação, de propósito). Em resumo: só o código do próprio site roda na página, todo dado que vem de fora é tratado como não confiável, a API é só de leitura e tem limites de uso, nenhuma chave fica no repositório e o código passa por análise automática toda semana. Os testes de invasão (`tests/seguranca/`) rodam no PC, no iPhone e no Android.

Encontrou uma falha? Use o [relato privado de vulnerabilidade](https://github.com/AlanSouzaDev7/Projeto_PeladinhaFC/security/advisories/new), não uma issue pública.

## Celular (iPhone e Android)

O site é testado automaticamente num **iPhone 15** (motor WebKit, o mesmo do Safari) e num **Pixel 7** (Chrome Android), com [Playwright](https://playwright.dev):

```bash
npm install
npx playwright install webkit
npm run api            # em outro terminal
npm run test:mobile    # relatório e prints em tests/mobile/out/
```

O teste abre as 8 páginas principais e confere rolagem lateral, tamanho dos alvos de toque (≥ 40 px), texto legível, erros e o arrastar com o dedo no campinho. Ajustes feitos para celular: escudo da cena no canto de cima, áreas seguras do iPhone, busca sem zoom automático do iOS, altura de tela estável (`100dvh`), prefixos do Safari, ícones e manifesto para "Adicionar à tela inicial", e canvas que reduz resolução e ritmo sozinho em aparelhos mais lentos.

## Estrutura

```
index.html            página única (rotas por hash)
js/seguranca.js       camada de segurança: roda antes de tudo e limpa todo dado que vem de fora
css/styles.css        estilos, temas por clube, animações
js/data.js            clubes, tabela e jogos (base)
js/squads.js          elencos e últimas escalações (base)
js/live.js            troca a base pelos dados da API e liga minuto a minuto/notícias
js/ticker.js          faixa de notícias embaixo do menu (manchete + fita)
js/app.js             páginas, roteador e transições
js/lineup.js          campinho interativo e "Bora pro jogo"
js/heatmap.js         mapa de calor estimado (desenho e leitura das posições da ESPN)
js/heatmaps.js        minutos de cada jogador em cada posição (gerado pelo servidor)
js/scenes.js          aparições dos escudos nos cartões da lista de clubes
js/goal-bug.js        o "GOL!" de cada clube no placar do topo (símbolos em SVG)
js/backdrop.js        fundo com brilho nas bordas e pontinhos
js/hero-scenes.js     motor das cenas em canvas do topo (e a do Cruzeiro)
js/hero-scenes-clubes.js  cenas dos outros 19 clubes
js/graphics.js        escudos, padrões de camisa e cores
server/               API em Python (server/config.json: intervalos, portais, setoristas e apelidos)
tests/mobile/         testes automáticos em PC, iPhone e Android (Playwright)
tests/seguranca/      testes de invasão (site e API)
SECURITY.md           política e requisitos de segurança
assets/               marca do PLACAR.
prints/               capturas de tela
```

## Direitos autorais

© 2026 Alan Souza (AlanSouzaDev7). **Todos os direitos reservados.** O código está visível só para avaliação. Copiar, modificar, publicar ou usar este projeto, no todo ou em parte, exige autorização prévia e por escrito do autor. Os detalhes estão em [LICENSE](LICENSE). Escudos, dados e manchetes de terceiros pertencem aos seus donos.

## Fontes e créditos

- Análises e curiosidades da torcida: as páginas listadas na aba Estatísticas de cada clube (perfis no X), com link para o original.
- Tabela e artilharia: **CBF**. Jogos, elencos, escalações, lances e estatísticas das partidas (Raio-X): **ESPN**. Resultados: **ge.globo**. Manchetes: **Google Notícias** (só título, fonte e link).
- Escudos: imagens oficiais via **Wikimedia Commons**, marcas registradas dos respectivos clubes, usadas apenas para identificação em projeto sem fins comerciais.
- Fotos dos ídolos: imagens livres do **Wikimedia Commons** (as mesmas usadas na Wikipédia em português), com os créditos e licenças de cada autor na página do arquivo.
- Ilustrações das aparições e dos símbolos do GOL!, marca PLACAR. e narração do minuto a minuto são próprias. Os símbolos seguem os mascotes e emblemas que os clubes usam (conferidos no LANCE!, ge e nas páginas oficiais), desenhados do zero; não são os personagens oficiais.
- Fontes: Archivo e Barlow Condensed, do **Google Fonts** (licença SIL Open Font License).
- Modelo de "tendência do jogo" é uma estimativa simples, não uma previsão oficial.
