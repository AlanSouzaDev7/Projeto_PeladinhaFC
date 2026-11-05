# Política de segurança — PLACAR.

## Como relatar uma falha

Não abra uma issue pública. Use o **[relato privado de vulnerabilidade](https://github.com/AlanSouzaDev7/Projeto_PeladinhaFC/security/advisories/new)** do GitHub com:
- o que acontece;
- como reproduzir;
- o impacto que você imagina.

O relato é respondido em até 7 dias e a correção é publicada assim que confirmada. Testes de segurança de boa-fé, que não derrubem o site nem acessem dados de terceiros, são bem-vindos.

O contato também está em [`/.well-known/security.txt`](.well-known/security.txt), no padrão RFC 9116.

## Versões cobertas

Só a versão publicada no GitHub Pages (ramo `main`) recebe correções.

## Requisitos de segurança implementados

A lista abaixo descreve **o que** é garantido, não **como**. Os detalhes de configuração ficam no código e nos testes, de propósito.

| # | Requisito | Onde vale |
|---|---|---|
| 1 | **Política de conteúdo restritiva:** a página só executa o código do próprio site; scripts embutidos, plugins e moldura de outro endereço são bloqueados | Site |
| 2 | **Dado de fora nunca é confiável:** tudo o que chega das fontes (placar, notícias, manchetes, elencos) é limpo antes de ser gravado e de novo antes de ser exibido | Robô, API e site |
| 3 | **Links seguros:** só endereços web válidos viram link, e as páginas de fora abrem isoladas do site | Site |
| 4 | **Endereços do site validados:** página ou clube inexistente cai em "página não existe", sem efeito colateral | Site |
| 5 | **Armazenamento local tratado como não confiável:** preferências adulteradas são ignoradas | Site |
| 6 | **Exposição mínima:** a API entrega só os arquivos do site, nunca código, configuração, cache ou histórico; não lista pastas | API |
| 7 | **Só leitura:** nenhuma rota aceita escrita; os parâmetros são conferidos contra listas fechadas | API e Worker |
| 8 | **Limites de uso:** número de acessos, conexões, tamanho de pedido e tempo de conexão; downloads das fontes com tamanho máximo | API e Worker |
| 9 | **Erros sem detalhes internos:** quem acessa recebe uma mensagem genérica, e o detalhe fica só no registro | API e Worker |
| 10 | **Cabeçalhos de segurança** em toda resposta e acesso de outros sites só para endereços autorizados | API e Worker |
| 11 | **Escuta local por padrão:** a API só aceita conexões do próprio computador, a não ser que seja configurada para outro uso | API |
| 12 | **Segredos fora do código:** chaves ficam no cofre do provedor, nunca no repositório; o histórico foi varrido | Repositório |
| 13 | **Menor privilégio no robô:** cada trabalho automático tem só a permissão de que precisa | GitHub Actions |
| 14 | **Cadeia de fornecimento controlada:** nenhuma biblioteca de terceiros no site; ações do GitHub fixadas em versão verificada; atualizações monitoradas | Repositório |
| 15 | **Análise automática de código** (CodeQL) a cada mudança e toda semana | Repositório |
| 16 | **Testes de invasão automatizados** no PC, no iPhone e no Android, a cada mudança relevante | `tests/seguranca/` |

## Regras para funcionalidades novas

Toda mudança tem de manter os requisitos acima:

- Nada de script embutido no HTML nem de atributo de evento (`onclick=` etc.).
- Texto que vem de fora só entra na página pelos utilitários de segurança do site (`SEG`).
- Um domínio novo (dados, imagens, fontes) entra na política de conteúdo de forma consciente, um por vez.
- Uma rota nova da API valida cada parâmetro e responde erro genérico.
- Nenhuma chave, senha ou token no repositório.
- Os testes de `tests/seguranca/` passam antes de publicar.

## Responsabilidades do dono do repositório

Algumas proteções dependem da conta e não do código:

- Verificação em duas etapas ativa na conta do GitHub e na da Cloudflare.
- Alertas de dependência, varredura de segredos e bloqueio de envio de segredos ligados nas configurações do repositório.
- Revisão dos pedidos automáticos de atualização (Dependabot) antes de aceitar.
