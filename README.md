# PLACAR. — futebol brasileiro em tempo real

### ▶ [Acessar o site](https://alansouzadev7.github.io/Projeto_PeladinhaFC/)

> Versão publicada no GitHub Pages, com os dados gravados no projeto. Para os dados ao vivo (placares, notícias e minuto a minuto), rode a API localmente — veja [Como rodar](#como-rodar).

Projeto de portfólio: uma plataforma de resultados do **Brasileirão Série A 2026** com página temática para cada um dos 20 clubes, dados reais, campinho interativo para montar o time, prancheta tática e narração minuto a minuto.

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

## Calendário: API e fontes

- **API** (`server/placar_api.py`): `GET /api/calendario?club=<id>[&mes=AAAA-MM]` devolve a temporada do clube (ou um mês) com competição, fase, data e hora de Brasília, adversário, mando, local, placar e pênaltis. `GET /api/jogo?event=<id da ESPN>&lg=<liga>` devolve as estatísticas rápidas de um jogo, guardadas por 1 min com bola rolando e 6 h depois do fim.
- **Sempre atualizado**: o robô do GitHub grava a temporada de todos os clubes a cada 30 min (`js/club-form.js`) e, ao abrir o clube, o navegador busca a agenda atualizada direto na ESPN. As estatísticas vêm na hora do resumo da ESPN.
- **Competições**: a ESPN traz Brasileirão, Copa do Brasil, Libertadores, Sul-Americana, Recopa, Supercopa, Carioca, Paulistão, Mineiro e Gauchão. Ela não cobre os estaduais do Paraná, da Bahia, de Santa Catarina e do Pará, nem a Copa do Nordeste e a Copa Verde. Esses entram pela **API-Football** quando a chave `API_FOOTBALL_KEY` estiver configurada no servidor ou nos segredos do GitHub (Settings › Secrets › Actions). Sem a chave, o calendário mostra o que a ESPN tem.

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

## Mapa de calor dos jogadores (estimado)

Nenhum site oficial publica o mapa de calor de cada jogador do Brasileirão: os das transmissões (Premiere, SporTV, ESPN) vêm de empresas de rastreamento contratadas pelas emissoras, e sites como SofaScore e FotMob proíbem copiar os dados. Por isso o mapa do "Bora pro jogo" é **estimado com dados reais**: as escalações da ESPN dizem, em cada jogo do campeonato, a formação, o número da posição e a sigla de cada titular, e quem entrou no lugar de quem. O servidor soma os minutos de cada jogador em cada posição ([`js/heatmaps.js`](js/heatmaps.js), 721 jogadores) e o site ([`js/heatmap.js`](js/heatmap.js)) desenha a área típica de movimentação de cada função, pesada por esses minutos — quem finaliza muito ganha mais calor na área. A leitura de cada sigla depende da formação (no 4-2-3-1 da ESPN, "LM/RM" são os volantes; no 4-3-3, os meias por dentro).

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

© 2026 Alan Souza (AlanSouzaDev7). **Todos os direitos reservados.** O código está visível só para avaliação do portfólio. Copiar, modificar, publicar ou usar este projeto, no todo ou em parte, exige autorização prévia e por escrito do autor. Os detalhes estão em [LICENSE](LICENSE). Escudos, dados e manchetes de terceiros pertencem aos seus donos.

## Fontes e créditos

- Análises e curiosidades da torcida: as páginas listadas na aba Estatísticas de cada clube (perfis no X), com link para o original.
- Tabela e artilharia: **CBF**. Jogos, elencos, escalações, lances e estatísticas das partidas (Raio-X): **ESPN**. Resultados: **ge.globo**. Manchetes: **Google Notícias** (só título, fonte e link).
- Escudos: imagens oficiais via **Wikimedia Commons**, marcas registradas dos respectivos clubes, usadas apenas para identificação em projeto sem fins comerciais.
- Fotos dos ídolos: imagens livres do **Wikimedia Commons** (as mesmas usadas na Wikipédia em português), com os créditos e licenças de cada autor na página do arquivo.
- Ilustrações das aparições e dos símbolos do GOL!, marca PLACAR. e narração do minuto a minuto são próprias. Os símbolos seguem os mascotes e emblemas que os clubes usam (conferidos no LANCE!, ge e nas páginas oficiais), desenhados do zero; não são os personagens oficiais.
- Fontes: Archivo e Barlow Condensed, do **Google Fonts** (licença SIL Open Font License).
- Modelo de "tendência do jogo" é uma estimativa simples, não uma previsão oficial.
