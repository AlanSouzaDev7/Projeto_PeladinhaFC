/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* ==========================================================================
   CazéStats.TV — matriz de compatibilidade (QA multidispositivo)
   Rotas x perfis de tela em três motores: Chrome (Chromium), Edge (Chromium) e WebKit (o motor do Safari).
   É EMULAÇÃO de navegador (tamanho de tela, toque, densidade de pixels, user agent), não aparelho físico.
   Para cada página: erros de JavaScript, rolagem para os lados, alvos de toque menores que 24x24 (WCAG 2.2, 2.5.8),
   texto menor que 11px, botões e links sem nome, imagens sem alt, campos sem rótulo, ids repetidos, título h1.
   Uso:  BASE=http://localhost:5173 node tests/qa/matriz.mjs [rapido]   (resultado em tests/qa/out/)
   ========================================================================== */
import { chromium, webkit } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:5173";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
mkdirSync(OUT, { recursive: true });
const RAPIDO = process.argv.includes("rapido");

const ROTAS_TODAS = [
  ["inicio", "#/"], ["clubes", "#/clubes"], ["clube", "#/clube/flamengo"], ["elenco", "#/clube/flamengo/elenco"],
  ["tabela", "#/tabela"], ["artilharia", "#/tabela/gols"], ["simulador", "#/simulador"], ["previsao", "#/previsao"],
  ["xg", "#/xg"], ["rodada", "#/rodada"], ["partida", "PARTIDA"], ["jogador", "#/jogador/216098-cruzeiro"],
  ["comparar", "#/jogador/216098-cruzeiro/comparar/235017-flamengo"], ["bora", "#/bora-pro-jogo/flamengo/palmeiras"],
  ["bolao", "#/bolao"], ["bolao-rodada", "#/bolao/rodada"], ["copa", "#/copa/libertadores"], ["widgets", "#/widgets"],
  ["status", "#/status"], ["creditos", "#/creditos"], ["sobre", "#/sobre"], ["privacidade", "#/privacidade"],
];
const NUCLEO = ["inicio", "tabela", "partida", "clube", "jogador", "bolao", "rodada"];
const cel = (w, h, dpr = 3) => ({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
const tab = (w, h, dpr = 2) => ({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
const pc = (w, h, dpr = 1) => ({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
const UA_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const UA_IPAD = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const UA_AND = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const UA_TAB = "Mozilla/5.0 (Linux; Android 15; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

// [nome, categoria, motor, opções, rotas]  — "todas" = todas as rotas; senão o núcleo
const PERFIS = [
  ["Notebook 1366x768 (Chrome)", "Notebook", "chrome", pc(1366, 768), "todas"],
  ["Celular Android 360x640 (Chrome)", "Smartphone", "chrome", { ...cel(360, 640), userAgent: UA_AND }, "todas"],
  ["iPhone 13/14 390x844 (WebKit)", "Smartphone", "webkit", { ...cel(390, 844), userAgent: UA_IOS }, "todas"],
  ["Tablet 768x1024 retrato (Chrome)", "Tablet", "chrome", { ...tab(768, 1024), userAgent: UA_TAB }, "todas"],
  ["Full HD 1920x1080 (Edge)", "Desktop", "edge", pc(1920, 1080), "todas"],
  ["HD 1280x720 (Chrome)", "Notebook", "chrome", pc(1280, 720)],
  ["1440x900 (WebKit, como Safari no Mac)", "Notebook", "webkit", pc(1440, 900, 2)],
  ["QHD 2560x1440 (Chrome)", "Desktop", "chrome", pc(2560, 1440)],
  ["4K 3840x2160 (Chrome, escala 100%)", "Desktop", "chrome", pc(3840, 2160)],
  ["4K com escala 150% (1920x1080 CSS, DPR 2)", "Desktop", "chrome", pc(2560, 1440, 1.5)],
  ["Ultrawide 3440x1440 (Chrome)", "Ultrawide", "chrome", pc(3440, 1440)],
  ["Tablet Android 600x960 (Chrome)", "Tablet", "chrome", { ...tab(600, 960), userAgent: UA_TAB }],
  ["iPad Air 820x1180 (WebKit)", "Tablet", "webkit", { ...tab(820, 1180), userAgent: UA_IPAD }],
  ["iPad Pro 1024x1366 (WebKit)", "Tablet", "webkit", { ...tab(1024, 1366), userAgent: UA_IPAD }],
  ["iPad Pro paisagem 1366x1024 (WebKit)", "Tablet", "webkit", { ...tab(1366, 1024), userAgent: UA_IPAD }],
  ["Tablet paisagem 1024x768 (Chrome)", "Tablet", "chrome", { ...tab(1024, 768), userAgent: UA_TAB }],
  ["iPhone SE 1ª geração 320x568 (WebKit)", "Smartphone", "webkit", { ...cel(320, 568, 2), userAgent: UA_IOS }],
  ["iPhone SE 375x667 (WebKit)", "Smartphone", "webkit", { ...cel(375, 667, 2), userAgent: UA_IOS }],
  ["iPhone 15/16 393x852 (WebKit)", "Smartphone", "webkit", { ...cel(393, 852), userAgent: UA_IOS }],
  ["iPhone Pro Max 430x932 (WebKit)", "Smartphone", "webkit", { ...cel(430, 932), userAgent: UA_IOS }],
  ["Galaxy S/A, Pixel 412x915 (Chrome)", "Smartphone", "chrome", { ...cel(412, 915, 2.6), userAgent: UA_AND }],
  ["iPhone paisagem 844x390 (WebKit)", "Smartphone", "webkit", { ...cel(844, 390), userAgent: UA_IOS }],
  ["Android paisagem 800x360 (Chrome)", "Smartphone", "chrome", { ...cel(800, 360), userAgent: UA_AND }],
  ["Galaxy Z Fold tela externa 344x882 (Chrome)", "Dobrável", "chrome", { ...cel(344, 882), userAgent: UA_AND }],
  ["Galaxy Z Fold tela interna 884x1104 (Chrome)", "Dobrável", "chrome", { ...tab(884, 1104, 2.6), userAgent: UA_AND }],
  ["Galaxy Z Flip 360x780 (Chrome)", "Dobrável", "chrome", { ...cel(360, 780), userAgent: UA_AND }],
  ["Smart TV 1920x1080 (Chrome, sem toque)", "Smart TV", "chrome", pc(1920, 1080)],
];

/* roda dentro da página */
function audit(toque) {
  const vw = document.documentElement.clientWidth, out = { vw, vh: innerHeight };
  out.scrollW = document.documentElement.scrollWidth;
  out.overflow = out.scrollW > vw + 1;
  const vis = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity !== 0; };
  const nome = (el) => (el.getAttribute("aria-label") || el.textContent || el.title || el.querySelector("img[alt]")?.alt || "").trim().replace(/\s+/g, " ");
  const rot = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""} "${nome(el).slice(0, 30)}"`;
  const recortado = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== "visible" && p.getBoundingClientRect().right <= vw + 2) return true; } return false; };
  out.largos = out.overflow ? [...document.querySelectorAll("body *")].filter((el) => vis(el) && el.getBoundingClientRect().right > vw + 2 && !recortado(el)).slice(0, 6).map((el) => `${rot(el)} → ${Math.round(el.getBoundingClientRect().right)}px`) : [];
  // WCAG 2.2 (2.5.8): alvo de pelo menos 24x24 px, salvo link dentro de texto corrido
  const alvos = [...document.querySelectorAll("a[href], button, select, input:not([type=hidden]), [role=button], [tabindex='0']")].filter(vis);
  const emTexto = (el) => el.tagName === "A" && /^(P|LI|SMALL|SPAN|TD|EM)$/.test(el.parentElement?.tagName || "") && (el.parentElement.textContent || "").trim().length > (el.textContent || "").trim().length + 10;
  const pequenos = alvos.filter((el) => { const r = el.getBoundingClientRect(); return (r.width < 24 || r.height < 24) && !emTexto(el); });
  out.alvos = alvos.length; out.alvosPequenos = toque ? pequenos.length : 0;
  out.alvosPequenosEx = toque ? [...new Set(pequenos.map((el) => `${rot(el)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`))].slice(0, 6) : [];
  const textos = [...document.querySelectorAll("body *")].filter((el) => vis(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  const mini = textos.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 11);
  out.textoMini = mini.length; out.textoMiniEx = [...new Set(mini.map((el) => `${rot(el)} ${getComputedStyle(el).fontSize}`))].slice(0, 4);
  out.semNome = [...document.querySelectorAll("a[href], button")].filter((el) => vis(el) && !nome(el)).map((el) => el.outerHTML.slice(0, 90)).slice(0, 4);
  out.semAlt = [...document.querySelectorAll("img:not([alt])")].map((i) => i.src.split("/").pop().slice(0, 40)).slice(0, 4);
  out.camposSemRotulo = [...document.querySelectorAll("input:not([type=hidden]), select, textarea")].filter((el) => vis(el) && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby") && !(el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) && !el.closest("label")).map((el) => el.outerHTML.slice(0, 80)).slice(0, 4);
  const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
  out.idsRepetidos = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))].slice(0, 5);
  out.h1 = document.querySelectorAll("h1").length;
  out.titulo = document.title;
  out.lang = document.documentElement.lang;
  return out;
}

const motores = {};
async function navegador(m) {
  if (!motores[m]) motores[m] = await (m === "webkit" ? webkit.launch() : chromium.launch({ channel: m === "edge" ? "msedge" : "chrome" }));
  return motores[m];
}

// descobre um jogo encerrado de verdade (os ids mudam a cada rodada)
let PARTIDA = "#/";
{
  const b = await navegador("chrome"), p = await b.newPage();
  await p.goto(`${BASE}/?estatico#/rodada`, { waitUntil: "load" });
  await p.waitForSelector(".rd-jogos a", { timeout: 15000 }).catch(() => {});
  PARTIDA = (await p.evaluate(() => document.querySelector(".rd-jogos a")?.getAttribute("href"))) || "#/";
  await p.close();
}

const resultado = [];
const perfis = RAPIDO ? PERFIS.slice(0, 3) : PERFIS;
for (const [nomePerfil, categoria, motor, opcoes, quais] of perfis) {
  const b = await navegador(motor);
  const ctx = await b.newContext({ ...opcoes, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const rotas = ROTAS_TODAS.filter(([n]) => quais === "todas" || NUCLEO.includes(n));
  for (const [n, h] of rotas) {
    const page = await ctx.newPage(), erros = [];
    page.on("pageerror", (e) => erros.push(e.message.slice(0, 160)));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|404|net::ERR|CORS|Content Security Policy.*report/i.test(m.text())) erros.push(m.text().slice(0, 160)); });
    const t0 = Date.now();
    let r;
    try {
      await page.goto(`${BASE}/?estatico${h === "PARTIDA" ? PARTIDA : h}`, { waitUntil: "load", timeout: 30000 });
      await page.waitForTimeout(1600);
      r = await page.evaluate(audit, !!opcoes.hasTouch);
    } catch (e) { r = { falha: String(e.message).slice(0, 160) }; }
    r.ms = Date.now() - t0;
    r.erros = erros;
    if (NUCLEO.includes(n) || quais === "todas") await page.screenshot({ path: `${OUT}${nomePerfil.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}--${n}.png` }).catch(() => {});
    resultado.push({ perfil: nomePerfil, categoria, motor, rota: n, ...r });
    await page.close();
  }
  await ctx.close();
}
for (const b of Object.values(motores)) await b.close();
writeFileSync(`${OUT}matriz.json`, JSON.stringify({ base: BASE, partida: PARTIDA, quando: new Date().toISOString(), resultado }, null, 2));

// resumo: problemas por perfil
const prob = (r) => [r.falha && `FALHOU: ${r.falha}`, r.overflow && `rola para o lado (${r.scrollW}>${r.vw})`, r.erros?.length && `${r.erros.length} erro(s) JS`, r.alvosPequenos && `${r.alvosPequenos} alvos < 24px`,
  r.textoMini && `${r.textoMini} textos < 11px`, r.semNome?.length && `${r.semNome.length} sem nome`, r.semAlt?.length && `${r.semAlt.length} img sem alt`, r.camposSemRotulo?.length && `${r.camposSemRotulo.length} campo sem rótulo`,
  r.idsRepetidos?.length && `ids repetidos`, r.h1 !== undefined && r.h1 !== 1 && `${r.h1} h1`].filter(Boolean);
let atual = "";
for (const r of resultado) {
  if (r.perfil !== atual) { atual = r.perfil; console.log(`\n=== ${atual} ===`); }
  const p = prob(r);
  console.log(`${r.rota.padEnd(13)} ${String(r.ms).padStart(5)}ms  ${p.join(" · ") || "ok"}`);
  if (r.largos?.length) console.log("    largos:", r.largos.join(" | "));
  if (r.erros?.length) console.log("    erros:", r.erros.slice(0, 2).join(" | "));
}
