/* Escudos inteiros nas animações (topo do clube, cortina de entrada e aviso de gol ao vivo).
   Para os 20 clubes, no PC, iPhone 15 e Pixel 7, com a animação rodando até o fim:
   mede o desenho real do escudo (object-fit: contain) e confere, ponto a ponto nas bordas,
   se o escudo está visível ou se algo o recorta (clip-path, overflow, outra camada por cima).
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/escudos.mjs */
import { chromium, webkit, devices } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const IDS = (process.env.CLUBES || "athletico-pr,atletico-mg,bahia,botafogo,bragantino,chapecoense,corinthians,coritiba,cruzeiro,flamengo,fluminense,gremio,internacional,mirassol,palmeiras,remo,santos,sao-paulo,vasco,vitoria").split(",");
const SO = process.env.SO;

// roda na página: o escudo está inteiro e visível?
function checkCrest(sel) {
  const img = document.querySelector(sel);
  if (!img || !img.naturalWidth) return { ok: false, motivo: "escudo não carregou" };
  const r = img.getBoundingClientRect(), ar = img.naturalWidth / img.naturalHeight;
  // área desenhada de verdade dentro da caixa (object-fit: contain)
  let w = r.width, h = r.height; if (w / h > ar) w = h * ar; else h = w / ar;
  const x0 = r.left + (r.width - w) / 2, y0 = r.top + (r.height - h) / 2;
  const pts = [[0.5, 0.06], [0.5, 0.94], [0.06, 0.5], [0.94, 0.5], [0.5, 0.5], [0.25, 0.85], [0.75, 0.85], [0.25, 0.15], [0.75, 0.15]];
  const falhas = [];
  // camadas acima que recortam (overflow escondido ou clip-path) e não contêm o desenho inteiro do escudo
  for (let e = img.parentElement; e && e !== document.body; e = e.parentElement) {
    const s = getComputedStyle(e), q = e.getBoundingClientRect();
    const corta = (s.overflowX !== "visible" || s.overflowY !== "visible") && (x0 < q.left - 1 || y0 < q.top - 1 || x0 + w > q.right + 1 || y0 + h > q.bottom + 1);
    if (corta) falhas.push(`recortado por ${String(e.className).split(" ")[0] || e.tagName} (overflow)`);
    if (s.clipPath && s.clipPath !== "none" && !/inset\(-/.test(s.clipPath)) falhas.push(`recortado por ${String(e.className).split(" ")[0]} (clip-path ${s.clipPath.slice(0, 40)})`);
  }
  // a cortina deixa o clique passar (pointer-events: none): lá só vale a conta geométrica acima
  if (img.closest(".curtain")) return { ok: !falhas.length, falhas, caixa: [Math.round(x0), Math.round(y0), Math.round(w), Math.round(h)] };
  for (const [fx, fy] of pts) {
    const x = x0 + w * fx, y = y0 + h * fy;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) { falhas.push(`fora da tela (${fx},${fy})`); continue; }
    const e = document.elementFromPoint(x, y);
    if (!(e === img || img.contains(e) || e?.closest?.(".gb-crest, .cbar-crest") === img.parentElement)) falhas.push(`(${fx},${fy}) coberto por ${e?.className || e?.tagName}`);
  }
  return { ok: !falhas.length, falhas, caixa: [Math.round(x0), Math.round(y0), Math.round(w), Math.round(h)] };
}

const DEVICES = [
  ["pc", chromium, { viewport: { width: 1440, height: 900 } }],
  ["iphone", webkit, devices["iPhone 15"]],
  ["pixel", chromium, devices["Pixel 7"]],
].filter(([n]) => !SO || SO.split(",").includes(n));
const report = {};
for (const [dev, L, opts] of DEVICES) {
  const b = await L.launch(L === chromium ? { channel: "chrome" } : {});
  const ctx = await b.newContext({ ...opts, locale: "pt-BR", colorScheme: "dark" });
  // 4 clubes por vez
  const fila = [...IDS];
  const worker = async () => {
    const page = await ctx.newPage();
    while (fila.length) {
      const id = fila.shift(), r = {};
      // topo do clube: animação inteira (?cena=20 pula a espera da cena do fundo)
      await page.goto(`${BASE}/?cena=20&v=${id}#/clube/${id}`, { waitUntil: "load" });
      await page.waitForTimeout(7600);
      r.topo = await page.evaluate(checkCrest, ".hero .gb-crest img");
      const box = await page.locator(".hero-gb").boundingBox();
      await page.screenshot({ path: `${OUT}escudo-${dev}-${id}.png`, clip: { x: Math.max(0, box.x - 10), y: Math.max(0, box.y - 30), width: Math.min(box.width + 20, (opts.viewport || { width: 412 }).width - Math.max(0, box.x - 10)), height: box.height + 40 } });
      // aviso de gol ao vivo (mesmo placar), já no fim da animação
      await page.evaluate((id) => GOALBUG.alerta({ club: PD.byId[id], de: 0, para: 1, outro: 0, relogio: "34'", texto: "teste", link: "#/" }), id);
      await page.waitForTimeout(6900);
      r.aoVivo = await page.evaluate(checkCrest, ".goal-alert .gb-crest img");
      // cortina de entrada (vindo do início)
      await page.goto(`${BASE}/?v=c${id}#/`, { waitUntil: "load" }); await page.waitForTimeout(900);
      await page.evaluate((id) => { location.hash = `#/clube/${id}`; }, id);
      await page.waitForTimeout(820);
      r.cortina = await page.evaluate(checkCrest, ".curtain .cbar-crest img");
      report[`${dev} ${id}`] = r;
    }
    await page.close();
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  await b.close();
}
writeFileSync(`${OUT}escudos.json`, JSON.stringify(report, null, 2));
const ruins = Object.entries(report).flatMap(([k, r]) => Object.entries(r).filter(([, v]) => !v.ok).map(([onde, v]) => `${k} · ${onde}: ${v.motivo || v.falhas.join("; ")}`));
console.log(ruins.length ? ruins.join("\n") : `todos os escudos inteiros (${Object.keys(report).length} clubes×aparelho, topo + gol ao vivo + cortina)`);
