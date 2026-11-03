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

## O que tem

| Área | Descrição |
|---|---|
| **Ao vivo** | Rodada agrupada por dia, navegação entre rodadas, favoritos, próximo jogo e artilharia. |
| **Clubes** | 20 páginas no tema de cada clube, com uma **aparição animada do escudo** inspirada no que ele significa. O Cruzeiro tem a versão em tela cheia (canvas): a câmera viaja pela Via Láctea até o Cruzeiro do Sul e as cinco estrelas formam o escudo. |
| **Elenco** | Elencos reais, escalação do último jogo de cada clube e campinho interativo: arraste jogadores para trocar ou para qualquer ponto da grama; 8 formações. |
| **Bora pro jogo** | Prancheta tática comparando dois times com e sem a bola, leitura tática e tendência do jogo (modelo simples). |
| **Tabela** | Classificação, números do campeonato e artilharia. |
| **Partida** | Informações, comparação no campeonato e **Minuto a minuto** ao vivo. |

## API (`server/placar_api.py`)

| Rota | Retorno |
|---|---|
| `GET /api/state` | tabela, jogos da rodada (com placar ao vivo), elencos e últimas escalações |
| `GET /api/news?club=flamengo` | manchetes recentes do clube (título, fonte, data e link) |
| `GET /api/minuto-a-minuto/<id>` | narração do jogo até o momento |
| `GET /api/minuto-a-minuto/<id>/stream` | narração ao vivo via Server-Sent Events |
| `GET /api/health` | situação das atualizações |

Intervalos de atualização, portais monitorados e **setoristas** de cada clube ficam em [`server/config.json`](server/config.json).

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
js/scenes.js          aparições dos escudos (SVG, cartões e topo)
js/hero-scenes.js     motor de cenas em canvas para o topo (Cruzeiro)
js/graphics.js        escudos, padrões de camisa e cores
server/               API em Python
assets/               marca do PLACAR.
prints/               capturas de tela
```

## Fontes e créditos

- Tabela e artilharia: **CBF**. Jogos, elencos, escalações e lances: **ESPN**. Resultados: **ge.globo**. Manchetes: **Google Notícias** (só título, fonte e link).
- Escudos: imagens oficiais via **Wikimedia Commons**, marcas registradas dos respectivos clubes, usadas apenas para identificação em projeto sem fins comerciais.
- Ilustrações das aparições, marca PLACAR. e narração do minuto a minuto são próprias.
- Modelo de "tendência do jogo" é uma estimativa simples, não uma previsão oficial.
