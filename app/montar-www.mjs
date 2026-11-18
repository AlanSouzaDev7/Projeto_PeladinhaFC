/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   433Fut 2.0 — monta app/www (o conteúdo do app Android) a partir do site CazéStats.TV.
     · o mesmo código do site (todas as funções: placar, tabela, clubes, jogadores, Janela, campinho tático,
       escalações, simulador, competições...), com a camada nativa (www-extra/js/app-nativo.js e css/app-nativo.css);
     · dados: o app lê dados/*.json do endereço publicado (atualizado pelo robô a cada 30 min) e o placar ao vivo
       direto da ESPN (ou do Worker da Cloudflare, se configurado). O retrato dos dados de hoje vai dentro do APK para
       a primeira abertura sem internet;
     · marca: no app o nome é 433Fut (no site, CazéStats.TV).
   Uso: node montar-www.mjs   (depois: npx cap sync android && cd android && gradlew assembleDebug)
   ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(APP, "..");
const WWW = path.join(APP, "www");
const SITE_URL = "https://alansouzadev7.github.io/Projeto_PeladinhaFC/";

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });
const copia = (de, para = de, filtro = () => true) => {
  const a = path.join(SITE, de);
  if (fs.existsSync(a)) fs.cpSync(a, path.join(WWW, para), { recursive: true, filter: (f) => filtro(f) });
};
copia("manifest.webmanifest");
copia("css");
copia("assets");
copia("dados");
copia("img");
// vídeos das cidades: o app leva só os de 540p (js/hero-scenes-clubes.js escolhe 540 no app)
copia("media", "media", (f) => !/\.mp4$/i.test(f) || /-540\.mp4$/i.test(f));
// scripts do site; as coleções em .js (jogadores, mercado, competições) ficam de fora: no app tudo vem em JSON
copia("js", "js", (f) => !/[\\/]js[\\/](jogadores|mercado|competicoes)([\\/]|$)/.test(f));
// camada nativa
fs.cpSync(path.join(APP, "www-extra"), WWW, { recursive: true });

// marca 433Fut no texto do app
const marca = (t) => t.replace(/CazéStats<span class="l433-tv">\.TV<\/span>/g, "433Fut").replace(/CAZÉSTATS\.TV/g, "433FUT").replace(/CazéStats\.TV/g, "433Fut");
for (const dir of ["js", "css"]) {
  for (const f of fs.readdirSync(path.join(WWW, dir))) {
    const p = path.join(WWW, dir, f);
    if (/\.(js|css)$/.test(f) && fs.statSync(p).isFile()) fs.writeFileSync(p, marca(fs.readFileSync(p, "utf8")));
  }
}
let html = marca(fs.readFileSync(path.join(SITE, "index.html"), "utf8"));
html = html
  .replace('<link rel="stylesheet" href="css/identidade.css" />', '<link rel="stylesheet" href="css/identidade.css" />\n  <link rel="stylesheet" href="css/app-nativo.css" />')
  .replace('<script src="js/config.js"></script>', '<script src="js/config.js"></script>\n  <script src="js/app-nativo.js"></script>')
  .replace("connect-src 'self'", `connect-src 'self' ${SITE_URL.replace(/\/[^/]*\/$/, "")}`)
  .replace(/<meta property="og:[^>]+>\n\s*/g, "")
  .replace('<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />', '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />');
if (!html.includes("js/app-nativo.js") || !html.includes("css/app-nativo.css")) throw new Error("index.html mudou: a camada nativa não foi ligada");
fs.writeFileSync(path.join(WWW, "index.html"), html);
fs.writeFileSync(path.join(WWW, "versao.json"), JSON.stringify({ app: "433Fut", versao: "2.0.0", montado: new Date().toISOString(), autor: "Alan Evangelista de Souza Martins" }));

const tam = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? tam(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log(`app/www montado (${(tam(WWW) / 1e6).toFixed(1)} MB)`);
