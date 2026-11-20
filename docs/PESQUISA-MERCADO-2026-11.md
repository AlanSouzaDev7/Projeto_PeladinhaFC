# CazéStats.TV — pesquisa de mercado e próximas funções (20/11/2026)

Objetivo: comparar o CazéStats.TV com SofaScore, FlashScore, FotMob, 365Scores, OneFootball e ge, ler as tendências de
2026 e escolher o que mais chama a atenção de um investidor e o que pode ser o nosso diferencial. Continua o estudo de
19/11 ([ROADMAP-FUNCIONALIDADES.md](ROADMAP-FUNCIONALIDADES.md)), cujos itens A1–A8 e D1, D4–D6 já foram feitos.

Pilares de sempre: **escalabilidade** (aguenta 10x/100x sem reescrever e sem estourar o plano grátis), **disponibilidade**
(continua no ar se uma fonte cair) e **autoria** (dado, código e marca nossos).

## 1. O que os líderes fazem hoje (fontes no fim)

| App | Escala | O que lançou ou destaca | Como ganha dinheiro |
|---|---|---|---|
| FlashScore (Livesport) | 155 mi de usuários por mês, 400 mi de downloads; comprou o BeSoccer em 2024 e mira 27 mi de usuários novos na Copa de 2026 | Placar mais rápido, xG, nota própria "mais transparente", alertas por time e atleta | Anúncios; sem anúncios por R$ 19,90 a R$ 149,90 |
| SofaScore | Prêmio "Best for Sports Fan" no Google Play 2026 | Gráfico de momento do ataque, animação do lance do gol, narração em 12 idiomas, comparador, nova tela inicial com "Em alta" e atalhos, Live Activities no iPhone, chat ao vivo da torcida, enquete "quem vence?", cards de estatística, **Torneo** (software grátis de campeonato amador) | Anúncios, Plus (R$ 6,99) e Pro (R$ 69,90), odds |
| FotMob | Referência em profundidade estatística | Mapa de calor da temporada, duração de contrato, zonas de ataque, jogo de previsões com probabilidade de vitória, "supercomputador" | Anúncios e assinatura (R$ 19,90/ano no iPhone) |
| 365Scores | Forte no Brasil | Live Activities, vídeos dos gols, mercado da bola; indicar 3 amigos tira os anúncios por 6 meses | Anúncios e remoção de anúncios (R$ 59,90) |
| ge / OneFootball | Conteúdo e vídeo | Notícias, vídeos, onde assistir | Mídia e streaming |

Concorrência brasileira de nicho: apps "Brasileirão Pro 2026" e "Brasileirão Série A 2026" (só futebol nacional,
foco em tabela e alertas).

## 2. Tendências que pesam numa conversa com investidor

1. **Segunda tela:** 77% dos torcedores fazem outra atividade digital enquanto veem o jogo em casa (Deloitte, citado
   pela WSC Sports). Quem entrega algo para fazer durante o jogo retém mais.
2. **IA e personalização:** 81% dos executivos de mídia esportiva aumentaram o uso de IA; app e vídeo social devem
   passar os sites como principal canal até 2030 (Stats Perform 2026). 54% dos torcedores já usam IA como fonte
   principal de informação esportiva (fanbase.gg).
3. **Esporte feminino:** quase metade dos executivos quer ampliar patrocínio internacional, com destaque para o
   esporte feminino (Stats Perform). No Brasil, o Brasileirão Feminino 2026 alcançou 56,3 milhões de pessoas nos canais
   da Globo, 14% a mais que no ano anterior (Máquina do Esporte, CBF).
4. **Vídeo vertical e conteúdo curto:** o torcedor quer o lance em segundos, no formato do celular.
5. **Comunidade e jogo:** previsões, fantasy (o Cartola fez 20 anos) e ligas entre amigos são o que traz o torcedor
   de volta toda rodada.

## 3. Onde já estamos (e onde já estamos à frente)

| Função dos líderes | CazéStats.TV |
|---|---|
| Momento do ataque (SofaScore) | Gráfico de pressão ao vivo ✔ |
| xG, mapa de chutes, mapa de calor | ✔ (xG próprio, calibrado com os gols do Brasileirão) |
| Nota do jogador | ✔ (critério próprio) |
| Comparador | ✔ (com veredito, radar e carreira lado a lado) |
| Previsões / "supercomputador" (FotMob) | ✔ previsão da tabela final com 10.000 simulações e chance em cada jogo |
| Jogo de previsões | ✔ bolão com ligas, ranking da rodada, rei da rodada e medalhas |
| Onde assistir | ✔ |
| Cards para compartilhar | ✔ jogo, jogador, comparação, rodada, seleção da rodada, bolão |
| Widgets para outros sites | ✔ (caminho B2B) |
| Sem anúncios, sem rastrear pessoas | ✔ diferencial já hoje |

O que **nenhum** dos grandes faz bem e nós já fazemos: foco total no futebol brasileiro (Séries A a D, estaduais),
identidade própria, seleção e resumo da rodada automáticos, carreira de 876 jogadores, e um custo de operação perto de
zero (plano grátis da Cloudflare) que aguenta crescer.

## 4. O que falta: lista priorizada

Valor para investidor: ★★★ alto, ★★ médio, ★ baixo. Custo: P (dias), M (1–2 semanas), G (mais).

### Grupo 1 — diferenciais que nenhum concorrente tem no Brasil

| # | Função | Valor | Custo | Pilares | Por que importa |
|---|---|---|---|---|---|
| N1 | **Campeonato da várzea / pelada**: qualquer pessoa cria o próprio campeonato (times, tabela, jogos, artilharia, página pública com link) usando a mesma tela e a mesma identidade do site | ★★★ | G | Autoria (dado 100% nosso), Escala (cada campeonato traz jogadores, família e amigos) | É o Torneo do SofaScore aplicado ao maior futebol amador do mundo. Cria uma base de dados que nenhuma fonte tem e um motor de crescimento por convite. O nome do repositório (Peladinha FC) já aponta para isso |
| N2 | **Futebol feminino** (Brasileirão Feminino A1 e A2): tabela, jogos, notas, bolão | ★★★ | M + fonte de dados | Escala, Autoria | Público de 56 mi e crescendo, prioridade de patrocinadores, pouca cobertura estatística. A ESPN não traz essa liga (testado: o código `bra.w.1` não existe); precisa de outra fonte, provavelmente a API-Football (paga, US$ 20 a 40 por mês, a confirmar a cobertura) |
| N3 | **Replay animado do gol** desenhado a partir dos lances, no nosso campinho | ★★★ | M | Autoria (sem vídeo de terceiros, sem direito de imagem) | Feito em 20/11 (js/replay.js): local do chute, lado e altura no gol, autor e tipo de passe são reais; o caminho do passe é aproximado (a ESPN não o informa) e a tela avisa |
| N4 | **"Pergunte ao CazéStats"** (feito em 20/11, versão por regras, `#/pergunte`): perguntas em português ("quem fez mais gols de cabeça?", "o Cruzeiro vence em casa?") respondidas com os nossos dados | ★★★ | M | Autoria (resposta sai do nosso banco) | É a tendência número 1 (IA como fonte principal). Começar sem custo, com respostas montadas por regras para as 30 perguntas mais comuns; depois um modelo de IA com cache. A versão com IA tem custo por pergunta, a documentar antes de ligar |
| N5 | **Vídeo vertical automático da rodada** (15 s: placares, seleção da rodada, craque), pronto para Instagram, TikTok e Status do WhatsApp | ★★ | M | Escala (cada post é anúncio grátis), Autoria | Usa os cards que já existem; gravado no próprio navegador, sem servidor de vídeo |

### Grupo 2 — o que os líderes têm e ainda nos falta

| # | Função | Valor | Custo | Pilares | Observação |
|---|---|---|---|---|---|
| L1 | **Início personalizado ("Meu CazéStats")**: jogos dos favoritos primeiro, "Em alta agora" e atalhos | ★★ | P | Escala | A nova tela inicial do SofaScore; já temos favoritos e "Em alta" na busca |
| L2 | **Torcida x modelo**: a enquete "quem vence?" já existia (Voz da torcida); faltava pôr a nossa chance calculada ao lado e dizer quem acertou | ★★ | P | Autoria | Feito em 20/11: "a torcida aposta no empate (60%); o modelo vê o Mirassol (39%)" e, no fim, quem acertou |
| L3 | **Por que essa nota?** Ao tocar na nota, os números que pesaram (gols, passes, desarmes, erros) | ★★ | P | Autoria, confiança | Feito em 20/11 (js/nota.js): a conta bate com as 15.753 notas gravadas pelo robô |
| L4 | **Placar na tela de bloqueio** (Live Activities no iPhone e notificação contínua no Android) | ★★ | M | Escala | Só no app (Capacitor); no Android dá para começar já |
| L5 | **Narração em texto automática** dos lances em português, com o nosso estilo | ★★ | M | Autoria | O SofaScore oferece em 12 idiomas; podemos ser o melhor em português |
| L6 | **Valor de mercado e fim de contrato** dos jogadores | ★ | M | Depende de fonte | Exige uma fonte de dados com licença |

### Grupo 3 — produto e negócio (o que o investidor pergunta primeiro)

| # | Item | Por quê |
|---|---|---|
| B1 | **CazéStats Plus** (temas do clube, avisos extras, cards sem marca d'água, estatísticas avançadas) | Mostra receita recorrente possível sem colocar anúncio; todos os concorrentes vendem algo parecido entre R$ 6,99 e R$ 149,90 |
| B2 | **Tabela de preços dos widgets** e uma página para veículos e rádios | Transforma o B2B que já existe em linha de receita |
| B3 | **Painel de métricas para apresentação** (usuários por mês, retenção da rodada, palpites, compartilhamentos) | A administração já tem quase tudo; falta a visão de 30/90 dias que o investidor pede |
| B4 | **Modo evento** (final de Libertadores, clássicos, Copa): página especial, alerta e card | O FlashScore ganha 16 a 27 milhões de usuários em Copa; picos são o melhor momento para crescer |
| B5 | **Fonte de dados licenciada** (já no roteiro, D2) | Continua sendo o maior risco numa auditoria |

### O que não fazer agora

| Ideia | Por que não |
|---|---|
| Vídeos dos gols | Direito de imagem caro e exclusivo; o replay animado (N3) resolve sem esse risco |
| Chat aberto da torcida | Exige moderação 24 horas e cria risco jurídico; a enquete (L2) entrega a interação sem esse custo |
| Odds e casas de aposta | Regulado (Lei 14.790/2023), conflita com "sem anúncio"; só com parceiro licenciado e decisão de negócio |
| Muitos esportes | O foco no futebol brasileiro é o nosso diferencial; diluir copia o SofaScore sem a escala dele |

## 5. Recomendação de ordem

1. **L3 "Por que essa nota?" e L2 enquete "quem vence?"**: poucos dias cada, dado próprio, visível em todo jogo.
2. **N3 replay animado do gol**: o recurso mais "uau" da lista, 100% nosso.
3. **N4 "Pergunte ao CazéStats" (versão por regras)**: a tendência que todo investidor vai perguntar.
4. **N1 campeonato da várzea**: o maior diferencial e o maior projeto; começar com um campeonato simples.
5. **N2 futebol feminino**: assim que houver fonte de dados com a liga.

## Fontes

- FlashScore: 155 mi de usuários por mês e 400 mi de downloads — [SBC News](https://sbcnews.co.uk/technology/2025/11/12/flashscore-150m-soccer/), [FlashScore](https://www.flashscore.co.uk/news/flashscore-celebrates-155-million-monthly-users-400-million-app-downloads/zBzlekzi/); compra do BeSoccer — [Expats.cz](https://www.expats.cz/czech-news/article/czech-sports-app-acquires-spanish-rival-to-boost-dominance-on-world-market); plano para a Copa — [Behind Sport](https://behindsport.com/flashscore-world-cup-2026-marketing-playbook/)
- SofaScore: novidades — [SofaScore News](https://www.sofascore.com/news/whats-new-in-sofascore-features-that-will-make-your-sport-experience-complete), [nova tela inicial](https://www.sofascore.com/news/sofascores-new-home-screen-a-smarter-faster-way-to-follow-sports), [momento do ataque](https://www.sofascore.com/news/how-sofascores-attack-momentum-changed-sport-analysis), [Live Activities](https://sofascore.helpscoutdocs.com/article/77-how-to-activate-live-activities), [prêmio Google Play 2026](https://www.sofascore.com/news/sofascore-wins-google-play-best-of-2026-award), [Torneo](https://torneo.com/features)
- FotMob: [novidades da temporada](https://x.com/FotMob/status/2082435194313646376), [jogo de previsões](https://predict.fotmob.com/1000086)
- Mercado brasileiro e preços: [TechTudo, 8 apps para o Brasileirão 2026](https://www.techtudo.com.br/listas/2026/09/brasileirao-2026-8-apps-para-acompanhar-tabela-jogos-e-seu-time-edapps.ghtml)
- Tendências: [Stats Perform 2026](https://www.statsperform.com/insights/2026-fan-engagement-monetisation-and-ai-trends-survey/), [WSC Sports (Deloitte)](https://wsc-sports.com/blog/industry-insights/fan-engagement-strategies-that-actually-drive-mobile-app-retention/), [fanbase.gg](https://fanbase.gg/blog/the-state-of-fan-engagement-in-2026), [PwC](https://www.pwc.com/us/en/industries/tmt/library/digital-fan-engagement-sports.html)
- Futebol feminino: [Máquina do Esporte](https://maquinadoesporte.com.br/midia/brasileirao-feminino-2026-amplia-audiencia-e-atinge-563-milhoes-de-espectadores-nos-canais-do-grupo-globo/), [CBF](https://www.cbf.com.br/futebol-brasileiro/noticias/campeonato-brasileiro-feminino-a1/a/campeonato-brasileiro-feminino-tem-crescimento-recorde-de-publico-e-audiencia-em-2026)
