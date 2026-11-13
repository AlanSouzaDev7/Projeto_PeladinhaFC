// © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE).
// PLACAR — fotos do elenco nos sites oficiais dos clubes (a foto da temporada, com a camisa atual).
// Abre a página pública do elenco profissional num navegador (os sites montam o elenco com JavaScript), rola até o fim
// para as fotos carregarem e grava cada foto com o texto em volta dela: o cruzamento com o elenco (pelo nome) é feito
// em server/fotos.py. Respeita o robots.txt e não entra em página com login nem em site que recusa acesso automático
// (Athletico-PR e Corinthians respondem 403/405; o elenco do Cruzeiro pede login): esses ficam de fora.
// Uso: node server/fotos_clubes.mjs [saida.json] [clube ...]      (precisa do Playwright e de um Chrome/Chromium)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import crypto from "node:crypto";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PASTA_IMG = path.join(RAIZ, "server", "cache", "fotos-clubes-img");
const { chromium } = await import(pathToFileURL(path.join(RAIZ, "node_modules", "playwright", "index.mjs")).href);

// página do elenco profissional masculino de cada clube (conferidas em 13/11/2026)
export const PAGINAS = {
  "atletico-mg": "https://atletico.com.br/futebol/masculino/elenco/",
  bahia: "https://www.esporteclubebahia.com.br/elenco/masculino/",
  botafogo: "https://www.botafogo.com.br/elenco/futebol",
  bragantino: "https://www.redbullbragantino.com/br-pt/jogadores",
  chapecoense: "https://chapecoense.com/elenco/",
  coritiba: "https://www.coritiba.com.br/elenco/masculino-profissional",
  flamengo: "https://www.flamengo.com.br/futebol/elenco",
  fluminense: "https://www.fluminense.com.br/o-time/futebol/profissional",
  gremio: "https://gremio.net/futebol/profissional",
  internacional: "https://internacional.com.br/equipes/masculino",
  mirassol: "https://mirassolfc.com.br/blogs/elenco",
  palmeiras: "https://www.palmeiras.com.br/elenco/",
  remo: "https://www.clubedoremo.com.br/elenco",
  santos: "https://www.santosfc.com.br/masculino/",
  "sao-paulo": "https://www.saopaulofc.net/esporte/futebol-masculino-profissional/",
  vasco: "https://vasco.com.br/elenco",
  vitoria: "https://ecvitoria.com.br/elenco/masculino/",
};

async function robotsPermite(ctx, url) {
  try {
    const u = new URL(url);
    const r = await ctx.request.get(`${u.origin}/robots.txt`, { timeout: 15000 });
    if (!r.ok()) return true;
    let vale = false;
    const bloqueios = [];
    for (const linha of (await r.text()).split(/\r?\n/)) {
      const [k, ...v] = linha.split(":");
      const chave = (k || "").trim().toLowerCase(), valor = v.join(":").trim();
      if (chave === "user-agent") vale = valor === "*" || /placar/i.test(valor);
      else if (vale && chave === "disallow" && valor) bloqueios.push(valor.replace(/\*/g, ""));
    }
    return !bloqueios.some((b) => u.pathname.startsWith(b));
  } catch { return true; }
}

// roda dentro da página: cada foto (em <img> ou imagem de fundo) com o texto do cartão em volta
const COLETAR = () => {
  const maior = (srcset) => (srcset || "").split(",").map((s) => s.trim().split(/\s+/)).filter((p) => p[0]).sort((a, b) => parseInt(b[1] || 0) - parseInt(a[1] || 0))[0]?.[0];
  const fonte = (el) => {
    if (el.tagName === "IMG") {
      const s = el.currentSrc || el.src || "";
      if (s && !s.startsWith("data:")) return s;
      return el.dataset.src || el.dataset.lazySrc || maior(el.getAttribute("data-srcset") || el.srcset) || "";
    }
    const bg = getComputedStyle(el).backgroundImage.match(/url\(["']?([^"')]+)/);
    return bg ? bg[1] : "";
  };
  // imagens grandes (as bandeiras, selos e escudos pequenos do cartão não contam)
  const grandes = (el) => [...el.querySelectorAll("img, [style*='background'], [class*='image'], [class*='foto'], [class*='photo']")].filter((i) => {
    const r = i.getBoundingClientRect();
    if (i.tagName === "IMG") return (r.width || i.naturalWidth) >= 80;
    return r.width >= 80 && getComputedStyle(i).backgroundImage.startsWith("url(");
  }).length;
  // o cartão do jogador: sobe enquanto o elemento tiver só esta foto grande e pouco texto
  const cartao = (el) => {
    let c = el;
    while (c.parentElement && c.parentElement !== document.body && grandes(c.parentElement) <= 1 && (c.parentElement.innerText || "").length < 300) c = c.parentElement;
    return c;
  };
  const out = [];
  const vistos = new Set();
  // todos os elementos, inclusive os de dentro dos componentes (shadow DOM: Bragantino, por exemplo)
  const todos = (raiz, lista = []) => { for (const e of raiz.querySelectorAll("*")) { lista.push(e); if (e.shadowRoot) todos(e.shadowRoot, lista); } return lista; };
  const tudo = todos(document);
  // fotos em <img> e em imagem de fundo (CSS): Palmeiras, Vitória e Grêmio, por exemplo, usam fundo
  const comFundo = tudo.filter((e) => e.tagName !== "IMG" && getComputedStyle(e).backgroundImage.startsWith("url("));
  for (const el of [...tudo.filter((e) => e.tagName === "IMG"), ...comFundo]) {
    const src = fonte(el);
    if (!src || vistos.has(src) || /\.svg(\?|$)|logo|escudo|icon|sprite|patrocin|parceir|bandeira|flag/i.test(src)) continue;
    const r = el.getBoundingClientRect();
    if (el.tagName === "IMG" && el.naturalWidth && (el.naturalWidth < 90 || el.naturalHeight < 90)) continue;
    if (r.width && r.width < 40) continue;
    vistos.add(src);
    const c = cartao(el);
    out.push({ src: new URL(src, location.href).href, alt: el.alt || el.title || c.getAttribute("aria-label") || c.closest("[aria-label]")?.getAttribute("aria-label") || "",
      txt: (c.innerText || c.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160), href: c.closest("a")?.href || c.querySelector("a")?.href || "" });
  }
  return out;
};

// rola devagar até o fim: as fotos são carregadas conforme aparecem
async function rolar(page, vezes = 40) {
  await page.evaluate(() => window.scrollTo(0, 0));
  for (let i = 0; i < vezes; i++) {
    const fim = await page.evaluate(() => { window.scrollBy(0, 900); return window.scrollY + innerHeight >= document.body.scrollHeight - 5; });
    await page.waitForTimeout(350);
    if (fim && i > 4) break;
  }
  await page.waitForTimeout(1200);
}

async function lerClube(ctx, cid, url) {
  if (!(await robotsPermite(ctx, url))) return { cid, url, erro: "robots.txt não permite" };
  const page = await ctx.newPage();
  const recebidas = new Map();
  page.on("response", async (resp) => {
    try {
      if (resp.request().resourceType() !== "image" || !resp.ok()) return;
      const b = await resp.body();
      if (b.length > 8000 && b.length < 12e6) recebidas.set(resp.url(), b);
    } catch { /* imagem que não deu para ler */ }
  });
  try {
    const r = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (!r || r.status() >= 400) return { cid, url, erro: `HTTP ${r?.status()}` };
    if (/login|entrar/i.test(new URL(page.url()).pathname)) return { cid, url, erro: "pede login" };
    await page.waitForTimeout(3500);
    const todas = new Map();
    const juntar = async () => { for (const f of await page.evaluate(COLETAR)) if (!todas.has(f.src)) todas.set(f.src, f); };
    await rolar(page);
    await juntar();
    // elenco em abas por posição (Flamengo, por exemplo): clica em cada aba e coleta de novo
    const abas = await page.$$("button, [role=tab], li, a");
    for (const aba of abas) {
      const t = ((await aba.innerText().catch(() => "")) || "").trim();
      if (t.length > 22 || !/^(goleir|zagueir|defens|laterai|lateral|volant|meias?\b|meio|meio-campo|atacant)/i.test(t)) continue;
      if (await aba.evaluate((e) => e.tagName === "A" && e.href && new URL(e.href).pathname !== location.pathname).catch(() => true)) continue; // não sai da página
      await aba.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(1200);
      await rolar(page, 12);
      await juntar();
    }
    const fotos = [...todas.values()];
    // guarda a imagem que o navegador já recebeu: server/fotos.py usa esta cópia antes de pedir de novo
    fs.mkdirSync(PASTA_IMG, { recursive: true });
    for (const f of fotos) {
      const b = recebidas.get(f.src);
      if (!b) continue;
      const nome = crypto.createHash("sha1").update(f.src).digest("hex") + ".img";
      fs.writeFileSync(path.join(PASTA_IMG, nome), b);
      f.arq = nome;
    }
    return { cid, url: page.url(), fotos };
  } catch (ex) {
    return { cid, url, erro: String(ex).slice(0, 160) };
  } finally {
    await page.close();
  }
}

const saida = process.argv[2] || path.join(RAIZ, "server", "cache", "mercado-fotos-clubes.json");
const so = process.argv.slice(3);
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});
const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (compatible; Placar/1.0)", viewport: { width: 1366, height: 900 }, locale: "pt-BR" });
const resultado = { quando: Date.now() / 1000, clubes: {} };
for (const [cid, url] of Object.entries(PAGINAS)) {
  if (so.length && !so.includes(cid)) continue;
  const r = await lerClube(ctx, cid, url);
  resultado.clubes[cid] = r;
  console.log(`fotos dos clubes: ${cid} ${r.erro ? "ERRO " + r.erro : (r.fotos.length + " fotos")}`);
}
await browser.close();
fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, JSON.stringify(resultado));
