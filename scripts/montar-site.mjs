/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — monta a versão publicada do site em _site/ (Cloudflare Pages), sem framework e sem dependências.
     · versão em cada CSS e JS (E3): index.html passa a pedir css/base.css?v=<hash do conteúdo>. Depois de publicar,
       ninguém fica com código antigo em cache misturado a dados novos;
     · _headers (Cloudflare Pages): cache longo para fontes, marca e fotos; curto para dados; cabeçalhos de segurança;
     · robots.txt e sitemap.xml (E6);
     · só entra o que o site usa (nada de server/, tests/, node_modules/, .git/).
   Uso: node scripts/montar-site.mjs [pasta-de-saida]   (padrão: _site)
   ========================================================================== */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { geraPaginas } from "./paginas-busca.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA = path.resolve(RAIZ, process.argv[2] || "_site");
const SITE = process.env.SITE_URL || "https://cazestats.pages.dev/";
const ENTRA = ["index.html", "sw.js", "manifest.webmanifest", "css", "js", "assets", "dados", "img", "media", "prints"];

fs.rmSync(SAIDA, { recursive: true, force: true });
fs.mkdirSync(SAIDA, { recursive: true });
for (const item of ENTRA) {
  const de = path.join(RAIZ, item);
  if (fs.existsSync(de)) fs.cpSync(de, path.join(SAIDA, item), { recursive: true });
}

// versão pelo conteúdo: muda só o arquivo que mudou
const hash = (arq) => createHash("sha1").update(fs.readFileSync(path.join(SAIDA, arq))).digest("hex").slice(0, 10);
let html = fs.readFileSync(path.join(SAIDA, "index.html"), "utf8");
html = html.replace(/(href|src)="((?:css|js)\/[^"?]+\.(?:css|js))"/g, (_, attr, arq) => `${attr}="${arq}?v=${hash(arq)}"`);
fs.writeFileSync(path.join(SAIDA, "index.html"), html);
// páginas para buscadores e prévia de link: /jogo/..., /clube/..., /jogador/... (scripts/paginas-busca.mjs)
const PAGINAS = geraPaginas({ raiz: RAIZ, saida: SAIDA, site: SITE, html });

fs.writeFileSync(path.join(SAIDA, "_headers"), `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=()
/index.html
  Cache-Control: no-cache
/sw.js
  Cache-Control: no-cache
/jogo/*
  Cache-Control: public, max-age=300
/clube/*
  Cache-Control: public, max-age=3600
/jogador/*
  Cache-Control: public, max-age=3600
/
  Cache-Control: no-cache
/css/*
  Cache-Control: public, max-age=3600
/js/*
  Cache-Control: public, max-age=3600
/assets/*
  Cache-Control: public, max-age=2592000
/img/*
  Cache-Control: public, max-age=604800
/media/*
  Cache-Control: public, max-age=2592000
/dados/*
  Cache-Control: public, max-age=60
`);
// os .js de dados não podem ficar presos por um ano: a versão do index.html só cobre os scripts que ele cita
for (const dado of ["live-data", "player-stats", "departamento-medico", "squads", "club-form", "heatmaps", "raio-x", "fotos", "escalacoes"]) {
  fs.appendFileSync(path.join(SAIDA, "_headers"), `/js/${dado}.js\n  Cache-Control: public, max-age=60\n`);
}
fs.appendFileSync(path.join(SAIDA, "_headers"), "/js/jogadores/*\n  Cache-Control: public, max-age=300\n/js/mercado/*\n  Cache-Control: public, max-age=300\n/js/competicoes/*\n  Cache-Control: public, max-age=300\n");

fs.writeFileSync(path.join(SAIDA, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /dados/\nSitemap: ${SITE}sitemap.xml\n`);
const hoje = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(SAIDA, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<!-- CazéStats.TV · autor: Alan Evangelista de Souza Martins. Página inicial + uma página por jogo, clube e jogador (scripts/paginas-busca.mjs). -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}</loc><lastmod>${hoje}</lastmod><changefreq>hourly</changefreq></url>
${PAGINAS.map((u) => `  <url><loc>${u}</loc><lastmod>${hoje}</lastmod><changefreq>${u.includes("/jogo/") ? "hourly" : "daily"}</changefreq></url>`).join("\n")}
</urlset>
`);
console.log(`páginas para buscadores: ${PAGINAS.length}`);
const tam = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? tam(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log(`site montado em ${path.relative(RAIZ, SAIDA)} (${(tam(SAIDA) / 1e6).toFixed(1)} MB)`);
