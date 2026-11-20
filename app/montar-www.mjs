/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV (app Android) — monta app/www, a pequena parte que vai dentro do APK.
   O app abre o site publicado (capacitor.config.json: server.url = https://cazestats.pages.dev/), com a camada nativa
   do site (js/app-nativo.js e css/app-nativo.css, ligadas só dentro do app pelo user agent "CazeStatsApp/<versão>").
   Por isso o APK só leva a página de "sem conexão" e o index.html que o Capacitor exige: toda atualização do site chega
   ao app na próxima abertura, sem gerar outro APK. Gerar um APK novo só é preciso quando muda a parte nativa
   (plugins, ícone, nome, permissões) — veja app/README.md.
   Uso: node montar-www.mjs   (o "npm run apk" faz tudo: montar, sincronizar e compilar)
   ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.dirname(fileURLToPath(import.meta.url));
const WWW = path.join(APP, "www");
const versao = JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8")).version;
const cfg = JSON.parse(fs.readFileSync(path.join(APP, "capacitor.config.json"), "utf8"));
if (!cfg.android.appendUserAgent.endsWith(`/${versao}`)) throw new Error(`a versão do user agent (${cfg.android.appendUserAgent}) não bate com a do package.json (${versao})`);

fs.rmSync(WWW, { recursive: true, force: true });
fs.cpSync(path.join(APP, "estatico"), WWW, { recursive: true });
fs.writeFileSync(path.join(WWW, "versao.json"), JSON.stringify({ app: "CazéStats.TV", versao, site: cfg.server.url, montado: new Date().toISOString(), autor: "Alan Evangelista de Souza Martins" }));
console.log(`app/www montado (versão ${versao}, abre ${cfg.server.url})`);
