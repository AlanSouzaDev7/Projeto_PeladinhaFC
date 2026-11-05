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
| Placar ao vivo, intervalo, próximas rodadas, temporada dos clubes, minuto a minuto | o navegador consulta a ESPN direto (a cada 20 s durante os jogos) |
| Tabela, cartões, notícias, pendurados, lesões, minutagem, histórico | o **GitHub Actions** ([`.github/workflows/dados.yml`](.github/workflows/dados.yml)) roda `server/placar_api.py --snapshot` a cada 30 min e grava `js/live-data.js`, `js/player-stats.js` e `js/club-form.js` |

Para atualizar na hora: aba **Actions** do repositório › **Atualizar dados** › **Run workflow**.

### Placar mais rápido com a API-Football (opcional)

Um Worker da Cloudflare ([`worker/`](worker/README.md)) guarda a chave da **API-Football** e entrega placar e lances ao site. Ele é ligado em [`js/config.js`](js/config.js). Com ele ligado, a API-Football vem primeiro e a ESPN fica de reserva (Worker fora do ar ou limite do plano esgotado). Um jogo hipotético simulado testa os três casos:

```bash
BASE=http://127.0.0.1:5173 node tests/mobile/simulacao.mjs
```

## O que tem

| Área | Descrição |
|---|---|
| **Ao vivo** | Rodada agrupada por dia, navegação entre rodadas, favoritos, próximo jogo e artilharia. **Placar em tempo real** mesmo sem a API (no GitHub Pages também): com jogo perto do horário ou rolando, o navegador consulta o placar da ESPN a cada 20 s. As **próximas rodadas** entram sozinhas pelo calendário da ESPN (agrupadas por data, já que a ESPN não informa o número da rodada; jogos adiados aparecem marcados), e o site passa para a rodada seguinte quando a atual termina. |
| **Clubes** | 20 páginas no tema de cada clube. O topo, de ponta a ponta da tela, junta a **cena animada do clube** (o urubu voando sobre o Rio, a Via Láctea até o Cruzeiro do Sul, o galo cantando em BH…) com o **"GOL!" do clube no placar de transmissão**: a cena termina exatamente onde o escudo salta no placar, e então vêm o placar 0 · 0, a faixa com a sigla, o escudo saltando e o GOL! com o símbolo do clube no lugar do "O" (a raposa do Cruzeiro, o urubu do Flamengo, a Estrela Solitária do Botafogo, o gorro do Saci do Inter…). Depois o placar vira 1 · 0 e a frase do clube aparece embaixo. Toque no topo para ver o gol de novo. **Nos jogos ao vivo**, quando um clube marca, o GOL! dele aparece por cima de qualquer página, com o placar e o minuto do jogo (toque para abrir a partida). |
| **Partidas do clube** | A temporada inteira de cada clube, mês a mês: todos os jogos e placares já disputados (com pênaltis) e os jogos por vir com o horário de Brasília; quando a CBF/Conmebol ainda não marcou o horário, aparece **"A definir"**. Filtro por competição (Brasileirão, Copa do Brasil, Libertadores, Sul-Americana, Recopa, Supercopa e estaduais cobertos pela ESPN: Carioca, Paulistão, Mineiro e Gauchão) e resumo de vitórias, empates, derrotas e gols. |
| **Retrospecto** | Na visão geral de cada clube: **últimos 5 jogos** (V/E/D, placar, pênaltis, casa ou fora) e **próximos 5**, em todas as competições (Brasileirão, Copa do Brasil, Libertadores e Sul-Americana). Sem a API, a página busca a agenda atualizada direto da ESPN. |
| **Estatísticas do elenco** | Na visão geral de cada clube e na aba "Estatísticas": **pendurados** (2 amarelos, o próximo suspende), **jogos seguidos**, **departamento médico** e **reservas mais usados** por minutagem. Cartões e minutos vêm das súmulas de todos os jogos do Brasileirão; lesões e pendurados são conferidos nas manchetes de ge.globo, ESPN, UOL, Lance, Gazeta Esportiva e Terra e dos setoristas cadastrados, com o número de fontes que confirmam cada caso. |
| **Elenco** | Elencos reais, escalação do último jogo de cada clube e campinho interativo: arraste jogadores para trocar ou para qualquer ponto da grama; 8 formações. |
| **Bora pro jogo** | Prancheta tática comparando dois times com e sem a bola, leitura tática e tendência do jogo (modelo simples). **Arraste os jogadores** (mouse ou dedo) para mudar a posição em tempo real: as setas de ataque acompanham, cada fase guarda as suas posições e "Restaurar posições" desfaz. Ao segurar um jogador, aparece o **mapa de calor** de onde ele costuma atuar, com as posições em % e os minutos no Brasileirão. |
| **Tabela** | Classificação, números do campeonato e artilharia, **em tempo real**: com jogo rolando, os placares parciais entram na conta (pontos, jogos, saldo e posição, com ▲▼ de quem subiu ou caiu e o placar ao lado do clube), e os gols de agora entram na artilharia ("+1 ao vivo"). Funciona também sem a API, direto da ESPN no navegador. Cada número (gols, ataque, defesa, amarelos, vermelhos) abre uma **subpágina de ranking** dos 20 clubes; passar o mouse ou segurar o dedo mostra uma prévia. |
| **Partida** | Placar com o **resumo dos gols e expulsões** de cada time (jogador e minuto, gol contra e de pênalti marcados), informações, comparação no campeonato, **top 5 artilheiros de cada time lado a lado** (1º contra 1º…, com a ficha de cada um) e **Minuto a minuto** ao vivo. A página de cada clube também mostra o top 5 dele. |

## API (`server/placar_api.py`)

| Rota | Retorno |
|---|---|
| `GET /api/state` | tabela, jogos da rodada (com placar ao vivo), elencos e últimas escalações |
| `GET /api/artilharia-ao-vivo[?jogador=ID]` | artilharia em tempo real: súmulas gravadas + gols dos jogos de agora, com contra quem e por qual clube cada jogador marcou |
| `GET /api/tabela-ao-vivo` | classificação em tempo real: a tabela da ESPN (que só conta jogos encerrados) mais o placar dos jogos em andamento e dos encerrados que ela ainda não contou, com quanto cada clube subiu ou caiu |
| `GET /api/rankings?tipo=gols\|ataque\|defesa\|amarelos\|vermelhos` | rankings do campeonato; os cartões somam a súmula de cada jogo encerrado depois da última tabela da CBF |
| `GET /api/retrospecto?club=flamengo` | últimos 5 e próximos 5 jogos, em todas as competições; atualiza a cada 30 min e ao fim de cada jogo |
| `GET /api/jogadores?club=flamengo` | pendurados, jogos seguidos, lesionados (com fontes) e minutagem dos reservas; atualiza a cada hora |
| `GET /api/news?club=flamengo` | manchetes recentes do clube (título, fonte, data e link) |
| `GET /api/minuto-a-minuto/<id>` | narração do jogo até o momento |
| `GET /api/minuto-a-minuto/<id>/stream` | narração ao vivo via Server-Sent Events |
| `GET /api/health` | situação das atualizações |

Intervalos de atualização, portais monitorados e **setoristas** de cada clube ficam em [`server/config.json`](server/config.json).

## Mapa de calor dos jogadores (estimado)

Nenhum site oficial publica o mapa de calor de cada jogador do Brasileirão: os das transmissões (Premiere, SporTV, ESPN) vêm de empresas de rastreamento contratadas pelas emissoras, e sites como SofaScore e FotMob proíbem copiar os dados. Por isso o mapa do "Bora pro jogo" é **estimado com dados reais**: as escalações da ESPN dizem, em cada jogo do campeonato, a formação, o número da posição e a sigla de cada titular, e quem entrou no lugar de quem. O servidor soma os minutos de cada jogador em cada posição ([`js/heatmaps.js`](js/heatmaps.js), 721 jogadores) e o site ([`js/heatmap.js`](js/heatmap.js)) desenha a área típica de movimentação de cada função, pesada por esses minutos — quem finaliza muito ganha mais calor na área. A leitura de cada sigla depende da formação (no 4-2-3-1 da ESPN, "LM/RM" são os volantes; no 4-3-3, os meias por dentro).

## Identidade visual

Fundo escuro com **brilho nas bordas** (canto de cima à direita e de baixo à esquerda) e uma **grade de pontinhos** que acende, na cor do site ou do clube aberto, perto dos brilhos e em volta do mouse. Os cartões são levemente translúcidos, então o brilho passa por eles. O fundo é desenhado uma vez numa imagem ([`js/backdrop.js`](js/backdrop.js)) e só é redesenhado quando mudam a tela, o tema ou o clube, para não pesar na animação do topo.

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
node tests/mobile/ficha-clique.mjs                  # ficha do artilheiro abre e fecha no clique, rola por dentro (PC baixo, PC, iPhone SE, Pixel)
node tests/mobile/artilheiros.mjs                  # top 5 dos dois times em todas as partidas e nos 20 clubes
node tests/mobile/elenco.mjs                       # campinho do elenco dos 20 clubes: nomes sem encostar, no PC, notebook e celular
```

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
css/styles.css        estilos, temas por clube, animações
js/data.js            clubes, tabela e jogos (base)
js/squads.js          elencos e últimas escalações (base)
js/live.js            troca a base pelos dados da API e liga minuto a minuto/notícias
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
server/               API em Python
assets/               marca do PLACAR.
prints/               capturas de tela
```

## Fontes e créditos

- Tabela e artilharia: **CBF**. Jogos, elencos, escalações e lances: **ESPN**. Resultados: **ge.globo**. Manchetes: **Google Notícias** (só título, fonte e link).
- Escudos: imagens oficiais via **Wikimedia Commons**, marcas registradas dos respectivos clubes, usadas apenas para identificação em projeto sem fins comerciais.
- Fotos dos ídolos: imagens livres do **Wikimedia Commons** (as mesmas usadas na Wikipédia em português), com os créditos e licenças de cada autor na página do arquivo.
- Ilustrações das aparições e dos símbolos do GOL!, marca PLACAR. e narração do minuto a minuto são próprias. Os símbolos seguem os mascotes e emblemas que os clubes usam (conferidos no LANCE!, ge e nas páginas oficiais), desenhados do zero; não são os personagens oficiais.
- Modelo de "tendência do jogo" é uma estimativa simples, não uma previsão oficial.
