# CazéStats.TV — análise de produto e roteiro de funcionalidades (19/11/2026)

Análise do projeto inteiro e pesquisa do mercado de sites e apps esportivos (FotMob, Sofascore, Flashscore, 365Scores,
OneFootball, ESPN, ge), com cada funcionalidade avaliada por três pilares:

- **Escalabilidade**: aguenta 10x, 100x mais torcedores sem reescrever e sem estourar o plano grátis?
- **Disponibilidade**: continua no ar se uma fonte de dados cair ou num clássico com pico de acesso?
- **Autoria**: o que é nosso (código, dados próprios, marca) e o que depende de terceiros sem contrato?

## 1. O que o mercado oferece e onde ele falha

**O básico de todos** (já temos tudo): placar ao vivo, tabela, calendário, escalações, estatísticas da partida,
notas dos jogadores, mapa de calor, perfil de jogador e clube, notícias, alertas de gol.

**Os diferenciais de quem lidera**: gráfico de momento/pressão ao vivo (FotMob), notas e comparação de jogadores
(Sofascore), xG e probabilidade do resultado, previsões e bolões, enquetes durante o jogo, compartilhamento social.

**Por que o torcedor dá 1 estrela** (avaliações dos 5 maiores apps, 2026):

| Reclamação | Quem sofre | Nossa posição |
|---|---|---|
| Estatísticas avançadas atrás de assinatura (xG, notas) | FotMob, Sofascore | Grátis aqui: chance de vitória, notas, mapa de calor |
| Excesso de anúncios em tela cheia | OneFootball, 365Scores, Sofascore | Sem anúncios hoje |
| Notificação de jogo que a pessoa não segue; configuração que se perde | 365Scores, OneFootball, FotMob | Avisos escolhidos por tipo, do clube seguido, sem spam |
| Placar atrasado em relação à TV | FotMob, OneFootball | Mesmo risco (dependemos da ESPN); ver item D2 |
| Lento ou fora do ar em dia de clássico | FotMob, 365Scores | Site estático na borda + banco com cache: bom ponto de partida |

**Mercado**: apps de "segunda tela" (usados durante a transmissão) devem ir de US$ 3,5 bi (2026) a US$ 10,8 bi (2033),
17,5% ao ano; 77% dos torcedores usam outro aparelho enquanto assistem. O que retém: personalização, previsões,
enquetes e ranking, e notificação relevante (a irrelevante faz desinstalar).

**Posicionamento que sai disso**: *o placar do futebol brasileiro sem paywall, sem spam e sem anúncio na cara*, com
interação de torcida (bolão, ligas, avisos) que os gigantes cobram ou não têm.

## 2. Inventário do que já existe (CazéStats.TV hoje)

- **Jogo**: placar ao vivo, minuto a minuto, notas da partida, campinho tático, confronto direto, chance de vitória,
  palpite 1x2, bolão, card para compartilhar.
- **Clube**: visão geral, partidas, escalações, histórico desde 2023, elenco, janela de transferências, estatísticas,
  comparação, agenda no celular, avisos.
- **Jogador**: temporada, últimos 10, mapa de calor, comparação, linha do tempo da carreira (876 de 942 jogadores).
- **Campeonato**: tabela ao vivo, simulador, rankings, artilharia, Libertadores, Sul-Americana, Copa do Brasil e estaduais.
- **Torcedor**: conta com Google sem guardar e-mail, sincronização, bolão com ligas, alertas por tipo, Bora pro jogo.
- **Plataforma**: site estático (Cloudflare Pages + reserva no GitHub Pages), Worker + banco D1, robô a cada 5 min,
  68 testes do Worker + testes de dados + ~55 roteiros de teste de tela, app Android (433Fut).

## 3. Riscos que um investidor vai perguntar (e o que fazer)

| Risco | Pilar | Gravidade | Ação |
|---|---|---|---|
| Placar e estatísticas vêm da ESPN por endereço público, **sem contrato** | Disponibilidade, Autoria | Alta | Contratar fonte licenciada antes de escalar (API-Football ~US$ 20–40/mês, Sportmonks, Opta para grande porte); manter ESPN como reserva. O código já tem o caminho da API-Football (`LIVE.proxy`) |
| Alerta de gol: 30 envios por minuto (limite do plano grátis) | Escalabilidade | Alta quando crescer | Com 10 mil inscritos num clube, um gol levaria ~5 h para chegar a todos. Solução: Cloudflare Queues (plano pago, US$ 5/mês) espalhando os envios em paralelo |
| Ranking do bolão soma todos os palpites a cada consulta | Escalabilidade | Resolvido (20/11) | Tabela de totais (`bolao_totais`) refeita quando o jogo termina; com 120 mil palpites o ranking geral cai de ~60 ms para ~3 ms (tests/bolao-rodada.mjs) |
| Carreiras vêm da Wikipédia (licença CC BY-SA): exige **crédito** | Autoria | Média | Página "Fontes e créditos" e crédito na linha do tempo (item A6) |
| Fotos do TheSportsDB/Flickr sem licença comercial | Autoria | Alta para vender | Já previsto: `MODO_VENDA=1` antes de apresentar ou vender |
| Sem monitoramento: se o robô ou o Worker parar, ninguém fica sabendo | Disponibilidade | Média | Verificação a cada 5 min com aviso (item D1) |
| Endereços com `#` (`#/partida/...`) não aparecem no Google e o link compartilhado mostra prévia genérica | Escalabilidade (crescimento) | Alta para crescer | Páginas com endereço próprio e prévia por jogo/jogador (item A1) |

## 4. Lista priorizada

Legenda: ★★★ pode decidir um investimento · ★★ melhora retenção e produto · ★ bom ter.
Custo: P (até 1 dia), M (2 a 4 dias), G (semana+). Todos no plano grátis, salvo indicação.

### A. Diferenciais (investimento)

| # | Funcionalidade | Valor | Custo | Pilares | Por quê |
|---|---|---|---|---|---|
| A1 | **Páginas indexáveis e prévia de link** (`/jogo/sao-paulo-x-fluminense`, `/jogador/...`): o Worker devolve título, descrição e imagem de cada página | ★★★ | M | Escala (busca orgânica grátis) | Hoje o site é invisível no Google e todo link compartilhado tem a mesma prévia. É o motor de crescimento barato |
| A2 | **Craque do jogo votado pela torcida** + enquetes durante a partida | ★★★ | P | Autoria (dado 100% nosso) | Segunda tela, engajamento ao vivo e um dado próprio que nenhuma fonte tem; vira conteúdo e card compartilhável |
| A3 | **Onde assistir** cada jogo (TV aberta, fechada, streaming) | ★★★ | P–M | Escala (é uma das buscas mais feitas no Brasil em dia de jogo) | As manchetes que já coletamos trazem "onde vai passar"; vira campo do jogo, filtro e aviso |
| A4 | **Gráfico de pressão ao vivo** (quem está melhor no jogo, minuto a minuto) | ★★ | M | Autoria (cálculo nosso sobre os lances) | É a marca do FotMob; usa os lances do minuto a minuto que já temos |
| A5 | **Widgets para outros sites** (placar, tabela e chance de vitória para blogs, rádios e sites de torcida colarem) | ★★★ | M | Escala (distribuição), Autoria (marca em cada widget) | Caminho de receita B2B e de alcance: cada widget é um anúncio da marca. Investidor gosta de canal B2B |
| A6 | **Fontes e créditos** (página + crédito nas carreiras) | ★★ | P | Autoria | Exigência da licença da Wikipédia; mostra seriedade jurídica numa auditoria |
| A7 | **Resumo automático da partida** em texto, por regras (sem IA paga) | ★★ | M | Autoria (texto próprio), Escala (SEO) | Conteúdo original para cada jogo, junto com A1 |
| A8 | **Ranking por rodada e conquistas no bolão** (sequências, "rei do placar exato") | ★★ | P | Autoria | Gamificação: motivo para voltar toda rodada |

### B. Plataforma (os pilares em si)

| # | Funcionalidade | Valor | Custo | Pilares |
|---|---|---|---|---|
| D1 | **Monitoramento e página de status** (robô, Worker, banco e atraso dos dados; aviso no seu celular se algo parar) | ★★★ | P | Disponibilidade |
| D2 | **Segunda fonte ao vivo** automática quando a ESPN atrasar ou cair (API-Football, plano pago) | ★★★ | M + US$ 20–40/mês | Disponibilidade, Autoria |
| D3 | **Fila para os alertas** (Cloudflare Queues) | ★★ | M + US$ 5/mês | Escalabilidade |
| D4 | **Site instalável e com modo offline** (tabela e jogos do dia abrem sem internet) | ★★ | P | Disponibilidade |
| D5 | **Proteção contra abuso** nas rotas abertas (limite de pedidos por IP no bolão e nas inscrições) | ★★ | P | Disponibilidade |
| D6 | **Painel do dono** (inscritos, contas, palpites, páginas mais vistas, sem rastrear pessoas) | ★★★ | M | Métricas para a conversa com investidor |

### C. Redundante ou que não serve agora

| Ideia | Por que não |
|---|---|
| Transmissão de jogos ao vivo | Direitos de transmissão custam milhões e são exclusivos; sem contrato é ilegal |
| Odds e integração com casas de aposta | Receita possível, mas regulada (Lei 14.790/2023), com risco reputacional e conflito com "sem spam"; só com parceiro licenciado e decisão de negócio |
| Cobertura de outros esportes | Dilui o foco; o diferencial é o futebol brasileiro bem feito |
| Chat aberto durante o jogo | Moderação cara, risco jurídico e de LGPD; enquetes e craque do jogo (A2) entregam a interação sem esse custo |
| Feed de notícias próprio e vídeos | Custo de redação e direitos de imagem; já linkamos as manchetes dos veículos |
| Fantasy completo no estilo Cartola | O Cartola domina; o bolão com ligas cobre a vontade de competir |
| App nativo de iPhone separado | O site instalável (D4) cobre; o app Android já existe |
| Realidade aumentada, "5G", IA de conversa | Modismo de relatório; custo alto, pouco uso real num placar |

## 5. Ordem recomendada

1. **Agora (rápido e visível)**: A2 Craque do jogo, A3 Onde assistir, D1 Monitoramento, A6 Créditos.
2. **Crescimento**: A1 Páginas indexáveis e prévia de link, A7 Resumo automático, D4 Instalável e offline.
3. **Para a conversa de investimento**: D6 Painel do dono, A5 Widgets, D2 Segunda fonte licenciada, D3 Fila de alertas.
4. **Depois**: A4 Gráfico de pressão, A8 Conquistas, D5 Proteção contra abuso.

Custos mensais para escalar (todos opcionais hoje): Cloudflare Workers pago US$ 5 (inclui Queues), fonte de dados
licenciada US$ 20–40 no começo. Nada disso é necessário enquanto o público for pequeno; está aqui para o plano de
investimento.

**Fontes da pesquisa**: comparativos de apps de futebol 2026 (Coherent Lab, The Punters Page), análise de avaliações
de 1 estrela (Unstar, 31/05/2026), mercado de segunda tela (Persistence Market Research, 2026), retenção em apps
esportivos (WSC Sports, 15/11/2026).
