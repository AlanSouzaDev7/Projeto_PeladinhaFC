# Auditoria de QA multidispositivo, segurança e desempenho (20/11/2026)

Escopo: site CazéStats.TV (Cloudflare Pages), API (Cloudflare Worker + D1) e preparação para app.

**Como foi testado:** emulação de navegador com Playwright em três motores: Chrome e Edge (Chromium) e WebKit (o motor do
Safari), com tamanho de tela, densidade de pixels, toque e user agent de cada aparelho. **Nenhum teste foi feito em
aparelho físico** nem em serviço de dispositivos na nuvem. Firefox e Samsung Internet não foram testados (não estão
instalados; instalar exige baixar navegadores). Os scripts ficam em `tests/qa/` e podem ser repetidos.

## A. Diagnóstico técnico

| Parte | Tecnologia | Estado |
|---|---|---|
| Site | SPA sem framework (JavaScript puro, 49 scripts, 11 CSS), rotas com `#`, páginas estáticas para buscadores | Estável; sem erros de JavaScript nas 264 páginas da matriz |
| PWA | `manifest.webmanifest`, service worker (`sw.js`), Web Push | Instalável; sem internet a tabela abre com aviso |
| API | Cloudflare Worker (`worker/`), banco D1 (SQLite), agendador, limitador de pedidos | Consultas com parâmetros, proteção contra abuso, totais do bolão guardados |
| Robô | GitHub Actions + Python (`server/`) | Grava `dados/*.json` e envia ao D1 |
| App Android | Capacitor (`app/`), reaproveita o mesmo site | Existe; iOS ainda não |
| Conta | Entrar com Google (comprovante conferido no Worker), sessão por token Bearer | Sem cookies, portanto sem risco de CSRF |

## B. Bugs encontrados e corrigidos

| # | Problema | Gravidade | Causa raiz | Correção |
|---|---|---|---|---|
| 1 | Android 360 px: tocar na busca abria a janela da conta | Alta | Logotipo, busca e dois botões não cabem; a busca encolhia para 10 px e o campo (86 px) ficava embaixo do botão da conta | Até 400 px a busca vira uma lupa de 40 px que abre sobre o cabeçalho (`css/taticas.css`) |
| 2 | Tocar na lupa não fazia nada | Alta | O ícone ficava por cima do campo e recebia o toque | `pointer-events: none` no ícone |
| 3 | iPhone (Safari): tocar no resultado da busca não abria a página. Regressão das correções 1 e 2, pega pelo teste | Alta | No Safari o toque tira o foco do campo antes do clique, e a busca recolhia | A busca fica aberta enquanto houver resultados (`:has(.search-results.open)`) |
| 4 | Tablet em paisagem e iPad Pro (1024 px): botões da conta e do tema ovais (21×40) e o do tema 6 px fora da tela | Média | Cabeçalho cheio; os botões encolhiam | Botões não encolhem; a busca vira lupa entre 901 e 1100 px |
| 5 | iPhone SE de 1ª geração (320 px): botão do tema fora da tela | Média | Mesmo motivo | Botões de 36 px e palavra da marca 12% menor abaixo de 350 px (a marca continua, regra da identidade) |
| 6 | Bolão ausente do menu de baixo (celular e tablet): só dava para chegar nele pelos jogos | Média | O item entrou só no menu do computador | 7º item "Bolão" no menu de baixo, com largura dividida (43 px por item em 320 px) |
| 7 | Manchetes da faixa com 17 a 21 px de altura: alvo de toque abaixo de 24 px (WCAG 2.2, 2.5.8) | Baixa | Altura da linha | 24 px em telas de toque; estrela de favoritar (16 px) e botões do xG (14 px) também |
| 8 | Página inicial com dois h1 | Baixa | Título oculto para leitor de tela além do título visível | O oculto virou h2 |
| 9 | "Menos movimento" no aparelho não parava a faixa de notícias | Baixa | Só reduzia a velocidade | Começa parada; o play continua disponível e fica guardado |
| 10 | API: limite de tamanho do corpo dependia do cabeçalho `content-length`, que pode faltar num envio em partes; algumas rotas não tinham limite | Média | Checagem só pelo cabeçalho | `limitaCorpo` conta os bytes que chegam e para em 700 KB (o robô autenticado fica de fora) |
| 11 | Teste de segurança do site não injetava os dados maliciosos: passava sem testar | Média | Interceptava `js/live-data.js`, mas o site lê `dados/live-data.json`, e o service worker respondia sem passar pela interceptação | Intercepta o JSON e bloqueia o service worker no teste. A limpeza agora é testada de verdade (os 3 links perigosos viraram "#") |
| 12 | Teste do menu esperava 6 itens (são 7 desde o Bolão) | Baixa | Teste desatualizado | Atualizado |

Erros que **não** eram do site: falhas de carga intermitentes ("Load failed", `reading 'esc'`) só no servidor local de
testes sob carga. Nas 9 repetições no site publicado não houve erro.

## C. Testes funcionais

| Conjunto | Verificações | Aprovadas | Reprovadas |
|---|---|---|---|
| Fluxos (`tests/qa/fluxos.mjs`): teclado e controle de TV, busca, menu de baixo, área segura, tema, zoom de 200%, menos movimento, queda de rede | 34 | 34 | 0 |
| Cabeçalho em 8 larguras (`tests/qa/cabecalho.mjs`) | 8 | 8 | 0 |
| Busca (`tests/mobile/busca.mjs`), PC e celular | 88 buscas | 88 | 0 |
| Menu (`tests/mobile/menu.mjs`), 6 perfis | todas | todas | 0 |
| Worker: conta, bolão, totais, rodada, proteção, painel, alertas, torcida, crescimento | 89 | 89 | 0 |

**Não executados:** entrar com Google, palpitar e criar liga de ponta a ponta no navegador (exige conta Google real;
cobertos pelos testes do Worker com comprovantes do Google simulados); notificações push num aparelho; instalação do PWA
e do APK num aparelho; câmera e galeria (o site não usa).

## D e E. Matriz de compatibilidade

Matriz gerada em 2026-11-20T18:20:11.269Z · 264 carregamentos de página · 27 perfis (emulação, não aparelho físico)

| Categoria | Dispositivo/perfil | Tela CSS | Orientação | Motor | Páginas | Resultado | Observações |
|---|---|---|---|---|---|---|---|
| Notebook | Notebook 1366x768 | 1366×768 | Paisagem | Chrome | 22 | APROVADO COM RESSALVAS | texto < 11 px (números da camisa, posições no campinho) em clube, partida, comparar |
| Smartphone | Celular Android 360x640 | 360×640 | Retrato | Chrome | 22 | APROVADO COM RESSALVAS | alvos de toque < 24 px em 9 página(s); texto < 11 px (números da camisa, posições no campinho) em inicio, clubes, clube, elenco, tabela, artilharia, simulador, previsao, xg, rodada, partida, jogador, comparar, bora, bolao, bolao-rodada, copa, widgets, status, creditos, sobre, privacidade |
| Smartphone | iPhone 13/14 390x844 | 390×844 | Retrato | WebKit | 22 | APROVADO COM RESSALVAS | alvos de toque < 24 px em 9 página(s); texto < 11 px (números da camisa, posições no campinho) em clube, partida, comparar |
| Tablet | Tablet 768x1024 retrato | 768×1024 | Retrato | Chrome | 22 | APROVADO COM RESSALVAS | alvos de toque < 24 px em 14 página(s); texto < 11 px (números da camisa, posições no campinho) em clube, partida, comparar |
| Desktop | Full HD 1920x1080 | 1920×1080 | Paisagem | Edge | 22 | APROVADO COM RESSALVAS | texto < 11 px (números da camisa, posições no campinho) em clube, partida, comparar |
| Notebook | HD 1280x720 | 1280×720 | Paisagem | Chrome | 7 | APROVADO COM RESSALVAS | texto < 11 px (números da camisa, posições no campinho) em clube, partida |
| Notebook | 1440x900 | 1440×900 | Paisagem | WebKit | 7 | APROVADO COM RESSALVAS | texto < 11 px (números da camisa, posições no campinho) em clube, partida |
| Desktop | QHD 2560x1440 | 2560×1440 | Paisagem | Chrome | 7 | APROVADO COM RESSALVAS | texto < 11 px (números da camisa, posições no campinho) em clube, partida |
| Desktop | 4K 3840x2160 | 3840×2160 | Paisagem | Chrome | 7 | APROVADO COM RESSALVAS | texto < 11 px (números da camisa, posições no campinho) em clube, partida |
| Desktop | 4K com escala 150% (1920x1080 CSS, DPR 2) | 2560×1440 | Paisagem | Chrome | 7 | APROVADO COM RESSALVAS | texto < 11 px (números da camisa, posições no campinho) em clube, partida |
| Ultrawide | Ultrawide 3440x1440 | 3440×1440 | Paisagem | Chrome | 7 | APROVADO COM RESSALVAS | texto < 11 px (números da camisa, posições no campinho) em clube, partida |
| Tablet | Tablet Android 600x960 | 600×960 | Retrato | Chrome | 7 | APROVADO COM RESSALVAS | alvos de toque < 24 px em 4 página(s); texto < 11 px (números da camisa, posições no campinho) em clube, partida |
| Tablet | iPad Air 820x1180 | 820×1180 | Retrato | WebKit | 7 | APROVADO COM RESSALVAS | alvos de toque < 24 px em 6 página(s); texto < 11 px (números da camisa, posições no campinho) em clube, partida |
| Tablet | iPad Pro 1024x1366 | 1024×1366 | Retrato | WebKit | 7 | APROVADO COM RESSALVAS | alvos de toque < 24 px em 6 página(s); texto < 11 px (números da camisa, posições no campinho) em clube, partida |
| Tablet | iPad Pro paisagem 1366x1024 | 1366×1024 | Paisagem | WebKit | 7 | APROVADO COM RESSALVAS | alvos de toque < 24 px em 6 página(s); texto < 11 px (números da camisa, posições no campinho) em clube, partida |
| Tablet | Tablet paisagem 1024x768 | 1024×768 | Paisagem | Chrome | 7 | APROVADO COM RESSALVAS | alvos de toque < 24 px em 6 página(s); texto < 11 px (números da camisa, posições no campinho) em clube, partida |
| Smartphone | iPhone SE 1ª geração 320x568 | 320×568 | Retrato | WebKit | 7 | APROVADO COM RESSALVAS | alvos de toque < 24 px em 4 página(s); texto < 11 px (números da camisa, posições no campinho) em inicio, clube, tabela, rodada, partida, jogador, bolao |
| Smartphone | iPhone SE 375x667 | 375×667 | Retrato | WebKit | 7 | APROVADO COM RESSALVAS | alvos de toque < 24 px em 4 página(s); texto < 11 px (números da camisa, posições no campinho) em clube, partida |
| Smartphone | iPhone 15/16 393x852 | 393×852 | Retrato | WebKit | 7 | APROVADO COM RESSALVAS | alvos de toque < 24 px em 4 página(s); texto < 11 px (números da camisa, posições no campinho) em clube, partida |
| Smartphone | iPhone Pro Max 430x932 | 430×932 | Retrato | WebKit | 7 | APROVADO COM RESSALVAS | alvos de toque < 24 px em 4 página(s); texto < 11 px (números da camisa, posições no campinho) em clube, partida |
| Smartphone | Galaxy S/A, Pixel 412x915 | 412×915 | Retrato | Chrome | 7 | APROVADO COM RESSALVAS | alvos de toque < 24 px em 4 página(s); texto < 11 px (números da camisa, posições no campinho) em clube, partida |
| Smartphone | iPhone paisagem 844x390 | 844×390 | Paisagem | WebKit | 7 | APROVADO COM RESSALVAS | alvos de toque < 24 px em 6 página(s); texto < 11 px (números da camisa, posições no campinho) em clube, partida |
| Smartphone | Android paisagem 800x360 | 800×360 | Paisagem | Chrome | 7 | APROVADO COM RESSALVAS | alvos de toque < 24 px em 6 página(s); texto < 11 px (números da camisa, posições no campinho) em clube, partida |
| Dobrável | Galaxy Z Fold tela externa 344x882 | 344×882 | Retrato | Chrome | 7 | APROVADO COM RESSALVAS | alvos de toque < 24 px em 4 página(s); texto < 11 px (números da camisa, posições no campinho) em inicio, clube, tabela, rodada, partida, jogador, bolao |
| Dobrável | Galaxy Z Fold tela interna 884x1104 | 884×1104 | Retrato | Chrome | 7 | APROVADO COM RESSALVAS | alvos de toque < 24 px em 6 página(s); texto < 11 px (números da camisa, posições no campinho) em clube, partida |
| Dobrável | Galaxy Z Flip 360x780 | 360×780 | Retrato | Chrome | 7 | APROVADO COM RESSALVAS | alvos de toque < 24 px em 4 página(s); texto < 11 px (números da camisa, posições no campinho) em inicio, clube, tabela, rodada, partida, jogador, bolao |
| Smart TV | Smart TV 1920x1080 | 1920×1080 | Paisagem | Chrome | 7 | APROVADO COM RESSALVAS | texto < 11 px (números da camisa, posições no campinho) em clube, partida |

Leitura das ressalvas:
- "Texto < 11 px" são números da camisa (9 px), siglas de posição no campinho (9,5 px) e legendas de fonte (10,5 px):
  elementos decorativos ou repetidos em texto maior.
- Os "alvos < 24 px" que sobraram são links de nome em linhas de tabela e lista com pelo menos 24 px de altura de linha.
  Eles entram na exceção de espaçamento da WCAG 2.5.8; o teste não mede espaçamento.
- Depois desta matriz, a estrela de favoritar e os botões do xG passaram a 24 px. A rodada rápida de conferência
  (3 perfis × 22 páginas) repetiu o resultado, sem erros e sem rolagem lateral.

| Ambiente | Status |
|---|---|
| Chrome (Windows, também emulando Android) | APROVADO COM RESSALVAS |
| Edge (Windows) | APROVADO COM RESSALVAS |
| WebKit (motor do Safari, emulando iPhone, iPad e Mac) | APROVADO COM RESSALVAS. Não é o Safari de um aparelho real |
| Firefox, Samsung Internet | NÃO TESTADO |
| Smart TV (navegador real) | NÃO TESTADO. Só emulação 1920×1080 com teclado: foco visível e Enter funcionam |
| Dobráveis abrindo e fechando ao vivo | NÃO TESTADO. As duas telas foram testadas separadas |

## F. Segurança

| Item | Resultado |
|---|---|
| SQL injection | Consultas com parâmetros (`?1`); listas de ids validadas por expressão regular |
| XSS | CSP sem `unsafe-inline` em scripts e tudo passa por `SEG.esc`; 90 verificações do site com dados maliciosos reais |
| Clique disfarçado (iframe) | `X-Frame-Options: DENY` no site; o widget libera `frame-ancestors *` de propósito |
| CORS | `*` com token Bearer, sem cookie: outro site não age em nome do torcedor sem o token |
| CSRF | Não se aplica (sem cookies de sessão) |
| Abuso e força bruta | Limitador por origem, bloqueio automático, corpo limitado de verdade (correção 10) |
| API Python do robô | 67 verificações de invasão passaram |
| Risco que fica | O token da conta fica no `localStorage`: um XSS futuro poderia lê-lo. A CSP reduz esse risco; num app maior, considerar cookie `HttpOnly` + `SameSite` num domínio próprio |

## G. Desempenho

Site publicado, Chrome, tela de celular, rede e CPU simuladas (`tests/qa/desempenho.mjs`):

| Rede (CPU) | Página | TTFB | FCP | LCP | CLS | Transferido |
|---|---|---|---|---|---|---|
| Wi-Fi rápido (1x) | início | 74 ms | 392 ms | 2,9 s | 0 | 990 KB / 90 pedidos |
| 4G (CPU 2x mais lenta) | início | 179 ms | 748 ms | 3,3 s | 0 | 990 KB |
| 4G (2x) | clube | 104 ms | 656 ms | 10,5 s | 0 | 1,6 MB / 114 pedidos |
| 3G lento (4x) | início | 431 ms | 4,2 s | 41,9 s | 0 | 988 KB |
| Segunda visita (cache e service worker), 4G | início | – | – | 1,6 s | 0 | 64 KB |

- **Gargalos:** o LCP é o número grande da página, desenhado depois que os 49 scripts e os dados carregam. Na página do
  clube, é o vídeo de abertura (340 KB).
- **O que está bom:** primeira pintura (FCP), estabilidade (CLS) e a segunda visita.
- **Melhorias recomendadas** (não feitas agora, porque mudam o processo de publicação): juntar e minificar os scripts num
  pacote só na montagem (`scripts/montar-site.mjs`); carregar os módulos das páginas internas só quando a página abre;
  imagem estática (poster) antes do vídeo do clube.

## H. Preparação para aplicativo

- **Hoje:** PWA instalável e offline, push pela Web Push, app Android em Capacitor reaproveitando o mesmo código, uma API
  única (Worker) para site e app, conta única (Google) e sincronização no servidor. As regras de cálculo são puras e
  testáveis, em módulos separados (`js/rodada.js`, `js/previsao.js`, `js/chutes.js`, `worker/bolao.mjs`).
- **Feito agora:** manifest com `id`, `scope`, categorias e atalhos (Ao vivo, Tabela, Bolão, Rodada) ao segurar o ícone.
- **Limitações:** sem iOS; código do site sem empacotamento (muitos arquivos); estado espalhado no `localStorage`.
- **Recomendação:** continuar com Capacitor e acrescentar iOS (`@capacitor/ios`, que exige Mac com Xcode e conta Apple de
  desenvolvedor paga, US$ 99 por ano). React Native, Flutter ou Kotlin Multiplatform obrigariam a reescrever a interface
  sem ganho para um produto de conteúdo como este.
- **Próximos passos:** empacotar os scripts; testar em aparelhos reais (ou num serviço como BrowserStack, pago); Firefox e
  Samsung Internet; axe-core e Lighthouse no CI (exigem instalar pacotes).

## I. Arquivos modificados

| Arquivo | Motivo |
|---|---|
| `css/taticas.css` | Cabeçalho de 320 a 1100 px (busca em lupa, botões que não encolhem), alvos de toque de 24 px, menu de baixo com 7 itens |
| `index.html` | Item Bolão no menu de baixo |
| `js/app.js` | Um h1 só na página inicial |
| `js/ticker.js` | Faixa parada com "menos movimento" |
| `manifest.webmanifest` | id, escopo, categorias e atalhos |
| `worker/ao-vivo.mjs` | Limite real do corpo das escritas (`limitaCorpo`) |
| `tests/protecao.mjs` | Teste do limite de corpo |
| `tests/seguranca/site.mjs` | Injeção no arquivo certo, service worker bloqueado no teste, espera pelo WebKit |
| `tests/mobile/menu.mjs` | 7 itens no menu |
| `tests/qa/*.mjs` (novos) | Matriz, fluxos, cabeçalho, desempenho e geração da tabela |
| `.gitignore` | Resultados de `tests/qa/out/` |

## J. Pendências

- Aparelhos físicos, Safari real (iPhone, iPad, Mac), Firefox, Samsung Internet e navegadores de Smart TV: não testados.
- Fluxo com conta Google, push e instalação em aparelho: não testados de ponta a ponta.
- LCP alto na primeira visita em rede lenta: exige empacotar os scripts (mudança na montagem do site).
- Siglas de 9 a 9,5 px no campinho e números da camisa: ficaram (são decorativos; aumentar mudaria o desenho).
- Lighthouse e axe-core: não rodados (não instalados).
