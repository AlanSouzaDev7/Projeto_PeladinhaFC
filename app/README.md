# CazéStats.TV — app Android

Autor: Alan Evangelista de Souza Martins. O app tem o mesmo nome do site e todas as funções dele.

## Como funciona

O app é um "navegador dedicado" ao site, feito com o [Capacitor](https://capacitorjs.com). Ao abrir, ele carrega o site
publicado (`https://cazestats.pages.dev/`, em `capacitor.config.json`), com uma camada nativa que só liga dentro do app.

| Parte | Onde fica | O que faz |
|---|---|---|
| Site (todas as funções) | raiz do projeto | O mesmo código que roda no navegador |
| Camada nativa | `js/app-nativo.js`, `css/app-nativo.css` | Botão voltar, splash, barra de status, compartilhar imagem, links externos no navegador, login pelo navegador. Liga só quando o user agent tem `CazeStatsApp/<versão>` |
| APK | `app/` | O Capacitor, os plugins nativos, o ícone, o nome e a página `estatico/sem-conexao.html` |

**Dados em tempo real:** o app usa os mesmos dados e o mesmo placar ao vivo do site (o robô atualiza a cada 5 minutos;
o placar da partida é lido a cada 5 segundos com o app aberto e para em segundo plano). Sem internet, o app abre com os
últimos dados guardados (service worker e cópia em arquivo no aparelho).

**Entrar com Google:** o Google não permite login dentro de apps desse tipo (WebView). O botão abre o navegador do
sistema na página `entrar-app.html`, a pessoa entra e volta ao app por `cazestats://entrar`. O código que volta só vale
com um verificador que ficou guardado no app (o esquema PKCE dos apps oficiais) e por 5 minutos.

## Como atualizar

**Quase sempre: só publicar o site.** Qualquer mudança no site (funções novas, correções, textos, dados) chega ao app na
próxima vez que ele abrir. Não precisa gerar outro APK nem reinstalar.

**Gerar um APK novo só quando mudar a parte nativa:** plugin novo do Capacitor, permissão, ícone, nome, splash,
`capacitor.config.json` ou arquivos de `app/android`. Passos:

1. Aumentar a versão em três lugares (o `npm run apk` confere se os dois primeiros batem):
   - `app/package.json` → `"version": "3.1.0"`
   - `app/capacitor.config.json` → `"appendUserAgent": "CazeStatsApp/3.1.0"`
   - `app/android/app/build.gradle` → `versionCode 4` e `versionName "3.1.0"` (o `versionCode` sempre sobe 1)
2. Gerar o APK:

   ```bash
   cd app
   npm run apk
   ```

   O arquivo sai em `app/android/app/build/outputs/apk/debug/app-debug.apk`.
3. Instalar por cima do antigo (os dados e o login continuam).

O site sabe a versão do app instalado (`window.APP_VERSAO`), se um dia for preciso pedir para atualizar.

## Testes

- `tests/qa/apk.mjs`: QA do APK instalado num emulador (abrir do zero, navegar, voltar, login pelo navegador, girar a
  tela, sem internet, erros no console, crash). `tests/qa/apk-todos.sh` roda em todos os aparelhos virtuais.
- `tests/conta.mjs`: o login do app no servidor (código de uso único e verificador).

## Para publicar na Play Store (quando quiser)

- Gerar o pacote assinado (`npm run apk-release` com uma chave de assinatura sua; a chave nunca vai para o repositório).
- Conta de desenvolvedor do Google Play: taxa única de US$ 25.
- A Play Store pede que apps assim tenham recursos próprios além do site; os nativos de hoje (compartilhar imagem,
  login pelo navegador, funcionar sem internet) ajudam, mas a análise é do Google.
- Avisos de gol no celular com o app fechado precisam do Firebase Cloud Messaging (gratuito, mas exige um projeto
  Firebase na sua conta e o arquivo `google-services.json`). Hoje os avisos funcionam no site, não no app.
