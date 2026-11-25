<!-- © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. -->
# CazéStats.TV / 433Fut — riscos para lembrar ao apresentar a uma empresa

> **Para que serve:** lista de lembrete antes de apresentar o site ou o app. **Nenhum item aqui impede de construir
> uma função** (decisão do dono, 17/11/2026). Cada função nova que traga risco entra nesta lista.
> Base: relatórios de José Cota de 13/11/2026 (`pontos-fracos.pdf` e `riscos-juridico-escala.pdf`). Riscos jurídicos
> são pontos a confirmar com advogado, não conclusões.

## Antes de qualquer reunião (5 minutos)

1. Rodar o robô com `MODO_VENDA=1` se a empresa vai ver o site publicado (tira fotos sem licença comercial).
2. Avaliar desligar os escudos oficiais em `js/config.js` (`escudosOficiais: false`) — o site passa a desenhar escudos próprios.
3. Ter pronta a resposta sobre o nome (item N1) e sobre a fonte de dados (item J4/E1).

## Riscos de marca e nome

| # | Risco | Situação hoje | O que dizer / fazer |
|---|---|---|---|
| N1 | **"CazéStats.TV" usa "Cazé", marca da CazéTV** (canal real). Quem vê pode achar que é da CazéTV. | Nome escolhido pelo dono em 17/11/2026, avisado do risco. | Consultar INPI e advogado de marcas antes de divulgar. Alternativa pronta: usar "433Fut" (mesma identidade do app). |
| J1 | Nome antigo "PLACAR." conflitava com a Revista PLACAR. | Resolvido: o nome mudou. | — |
| J3 | **Escudos dos clubes são marcas registradas.** | Escudos oficiais ligados no site (`escudosOficiais: true`). O app já usa escudos desenhados. | Desligar antes de apresentar ou negociar licença/pacote de imagens. |

## Conteúdo e dados de terceiros

| # | Risco | Situação hoje | O que dizer / fazer |
|---|---|---|---|
| F2 | **Fotos de jogadores sem licença comercial** (sites dos clubes, TheSportsDB, ESPN) publicadas no site aberto. | Mantidas por decisão do dono até o comando de retirada (`MODO_VENDA=1` apaga `img/jogadores/`). | Para produto: agência de fotos (Getty, AGIF) ou pacote do provedor de dados. Ver lista premium. |
| J4 | **Dados lance a lance da ESPN** (mapa de calor, notas, Raio-X, minuto a minuto) costumam ser licenciados. | Lidos de endpoints públicos sem contrato. | Ao cotar provedor, exigir dados de evento com coordenadas (Opta, Sportmonks, API-Football). |
| F3 / E1 | **Dependência da ESPN sem contrato**; cada visitante consulta a ESPN direto. | Worker com cache compartilhado pronto (`worker/`), aguardando a conta Cloudflare do dono. | Fonte licenciada antes de lançar comercialmente (lista premium). |
| J5 | Google Notícias como motor de busca do robô (termos podem restringir uso automatizado). | Em uso para manchetes, lesões, arbitragem, finanças e escalações. | Trocar por RSS dos próprios veículos ou API de notícias paga. |
| J6 | Chave de teste do TheSportsDB ("123") e Flickr grátis em produto publicado. | Em uso. | Plano Patreon do TheSportsDB (pago) ou deixar de usar. |
| J8 | Salário individual estimado. | Mostrado **em faixa** com o aviso "estimativa" sempre visível (resolvido no código do app). | — |
| J9 | Robô sem contato na identificação. | Identificador completo com o endereço do site. | — |
| J10 | **Valores, posições, contratos e fotos do Transfermarkt.** O `license.xml` do site declara proibido o uso do conteúdo por IA (padrão RSL, `ai-all`) e os termos de uso do Transfermarkt costumam restringir reuso comercial dos valores de mercado. | Duas fontes: o conjunto público transfermarkt-datasets (CC0, julho de 2026) e, uma vez por janela (janeiro e julho), as páginas de elenco lidas por `server/tm_elencos.py`, permitidas no robots.txt para leitores comuns, com identificação e uma página a cada 3 s, parando no primeiro bloqueio. O robô não usa IA. | Para produto: licenciar valores de mercado (o próprio Transfermarkt vende dados) ou trocar por estimativa própria; remover as fotos do Transfermarkt junto com o `MODO_VENDA=1`. |

## Dados pessoais (LGPD)

| # | Risco | Situação hoje | O que dizer / fazer |
|---|---|---|---|
| J2 | **Departamento médico publica dados de saúde** de pessoas identificadas, inclusive jogadores da base (possíveis menores). | Monitor completo, com o selo "base" (função mantida por decisão do dono). | Parecer jurídico sobre base legal; medida rápida se pedirem: tirar a base e limitar o histórico. |
| J7 | Política de privacidade e termos. | **Resolvido**: página `#/privacidade` (rascunho a revisar por advogado) e fontes servidas pelo próprio site. | Revisão por advogado antes do lançamento. |

## Escala e operação

| # | Risco | Situação hoje |
|---|---|---|
| E2 | Servidor Python não aguenta público | O site público é estático (Cloudflare Pages / GitHub Pages); o Python fica só como robô. API pública no Worker. |
| E3 | Primeira carga pesada, arquivos sem versão | Build com versão nos arquivos: ver `docs/HOSPEDAGEM.md`. |
| E4 | Imagens servidas por terceiros | Fotos de jogadores guardadas no próprio site; escudos ainda vêm da ESPN/Wikimedia. |
| E5 | Sem observabilidade | Aviso de dados velhos no site (mais de 1 h); anotação vermelha no GitHub Actions quando uma etapa do robô falha. |
| E6 | Site invisível para busca | `robots.txt`, `sitemap.xml` e metadados de compartilhamento; rotas por `#` ainda limitam (mudança grande, planejada). |
| E7 | Cache do Worker por instância | Resolvido no código: Cache API compartilhada da Cloudflare. |

## Funções novas e seus riscos (atualizar a cada entrega)

| Data | Função | Risco a lembrar |
|---|---|---|
| 17/11/2026 | Identidade 433 no site e nome CazéStats.TV | N1 (marca CazéTV). |
| 17/11/2026 | Campinho tático editável da partida e aba Escalações | Usa escalações da ESPN (J4). |
| 17/11/2026 | Banco de dados (Cloudflare D1) para dados não essenciais | Guarda contagens de busca e palpites anônimos: citar na política de privacidade (J7). |
