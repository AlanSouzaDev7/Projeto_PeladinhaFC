/* Som do gol (js/sons.js) — o único som do site.
   - o alerta GOL! toca 5 s de grito de gol com a torcida ao fundo; dois gols juntos tocam um depois do outro;
   - nenhum som ao navegar (nem no "Bora pro jogo", nas estatísticas ou nos rankings) e nenhum botão de som;
   - antes do primeiro toque na página o navegador não deixa tocar: nada quebra;
   - os 20 clubes: grito de gol com a torcida ao fundo, som de verdade (não é silêncio), sem estourar, 5 s com final suave e variação própria de cada clube.
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/sons.mjs */
import { chromium, devices } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome" });
const falhas = [];
const erro = (m) => { falhas.push(m); console.log("  ✗", m); };
const ok = (m) => console.log("  ✓", m);

for (const [nome, opts] of [["PC", { viewport: { width: 1366, height: 800 } }], ["celular", devices["Pixel 7"]]]) {
  console.log(nome);
  const ctx = await browser.newContext({ ...opts, locale: "pt-BR" });
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 404, body: "" }));
  const page = await ctx.newPage(), erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto(`${BASE}/?v=${Date.now()}#/`, { waitUntil: "load" });
  await page.waitForSelector(".match");
  const hist = () => page.evaluate(() => window.SONS.historico.map((h) => ({ tipo: h.tipo, clube: h.clube, tocou: h.tocou, motivo: h.motivo, inicio: h.inicio, dur: h.dur })));
  if (await page.locator("#som, .som-btn").count()) erro("ainda existe botão de som"); else ok("sem botão de som");
  await page.evaluate(() => window.SONS.gol("flamengo"));
  const h0 = (await hist()).at(-1);
  const livre = await page.evaluate(() => { const c = new AudioContext(); const s = c.state; c.close(); return s === "running"; });
  if (livre) ok("este navegador libera o áudio sem toque (teste de bloqueio não se aplica)");
  else if (h0.tocou) erro("tocou antes do primeiro toque na página"); else ok(`antes do primeiro toque: não toca (${h0.motivo})`);
  if (opts.hasTouch) await page.tap("h1, body"); else await page.mouse.click(5, 300);
  await page.waitForTimeout(200);
  if (!(await page.evaluate(() => window.SONS.pronto()))) erro("áudio travado depois do toque"); else ok("áudio destravado com o primeiro toque");
  // navegar não toca nada
  const n0 = (await hist()).length;
  for (const h of ["#/bora-pro-jogo", "#/clube/flamengo/estatisticas", "#/tabela/gols", "#/simulador", "#/"]) { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(1600); }
  const navs = (await hist()).slice(n0);
  if (navs.length) erro(`navegar tocou ${navs.length} som(ns): ${navs.map((x) => x.tipo).join(", ")}`); else ok("navegar pelas páginas não toca som (sem apito)");
  // gol: o alerta toca o som do clube; dois seguidos não se sobrepõem
  await page.evaluate(() => {
    const c = window.PD.byId;
    window.GOALBUG.alerta({ club: c.cruzeiro, de: 0, para: 1, outro: 0, relogio: "12'", texto: "Teste · CRU 1 x 0 PAL", link: "#/" });
    window.GOALBUG.alerta({ club: c.palmeiras, de: 0, para: 1, outro: 1, relogio: "13'", texto: "Teste · CRU 1 x 1 PAL", link: "#/" });
  });
  await page.waitForTimeout(600);
  let gols = (await hist()).filter((x) => x.tipo === "gol" && x.tocou);
  if (!gols.some((g) => g.clube === "cruzeiro")) erro("alerta de gol do Cruzeiro sem som"); else ok(`gol do Cruzeiro: ${gols.find((g) => g.clube === "cruzeiro").dur} s de som`);
  await page.waitForTimeout(8500);
  gols = (await hist()).filter((x) => x.tipo === "gol" && x.tocou);
  const cru = gols.find((g) => g.clube === "cruzeiro"), pal = gols.find((g) => g.clube === "palmeiras");
  if (!pal) erro("segundo gol (Palmeiras) sem som");
  else if (pal.inicio < cru.inicio + cru.dur - 0.01) erro("dois gols tocaram por cima um do outro");
  else ok("dois gols seguidos: um som depois do outro");
  if ((await hist()).some((x) => x.tipo !== "gol")) erro("tocou algum som que não é de gol");
  if (erros.length) erro(`${nome}: erros de JavaScript: ${erros.join(" | ")}`);
  await ctx.close();
}

console.log("som do gol dos 20 clubes");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?v=${Date.now()}#/sobre`, { waitUntil: "load" });
  const r = await page.evaluate(async () => {
    const out = [];
    for (const c of window.PD.CLUBS) {
      const bin = atob(await window.SONS.wav(c.id)), n = (bin.length - 44) / 4;
      let soma = 0, pico = 0, somaFim = 0, nFim = 0, somaIni = 0, nIni = 0;
      for (let i = 0; i < n; i++) {
        const v = (((bin.charCodeAt(45 + i * 4) << 8) | bin.charCodeAt(44 + i * 4)) << 16 >> 16) / 32768;
        soma += v * v; pico = Math.max(pico, Math.abs(v));
        if (i > n - 44100 * 0.15) { somaFim += v * v; nFim++; }
        if (i > 44100 * 0.3 && i < 44100 * 1.3) { somaIni += v * v; nIni++; }
      }
      const E = window.SONS.estilo(c.id);
      out.push({ id: c.id, seg: +(n / 44100).toFixed(2), rms: +Math.sqrt(soma / n).toFixed(3), explosao: +Math.sqrt(somaIni / nIni).toFixed(3), pico: +pico.toFixed(3), fim: +Math.sqrt(somaFim / nFim).toFixed(4), estilo: JSON.stringify(E) });
    }
    return out;
  });
  const mudas = r.filter((x) => x.rms < 0.02), estouro = r.filter((x) => x.pico >= 0.999), longo = r.filter((x) => x.seg > 5.3), rabo = r.filter((x) => x.fim > 0.01), fraca = r.filter((x) => x.explosao < x.rms);
  if (mudas.length) erro(`quase mudos: ${mudas.map((x) => x.id).join(", ")}`);
  if (estouro.length) erro(`estourando: ${estouro.map((x) => x.id).join(", ")}`);
  if (longo.length) erro(`mais de 5 s: ${longo.map((x) => x.id).join(", ")}`);
  if (rabo.length) erro(`terminam de repente: ${rabo.map((x) => x.id).join(", ")}`);
  if (fraca.length) erro(`sem a explosão no começo (o grito do gol mais fraco que a média): ${fraca.map((x) => x.id).join(", ")}`);
  const estilos = new Set(r.map((x) => x.estilo)).size;
  if (estilos < 15) erro(`só ${estilos} variações entre os 20 clubes`);
  if (!falhas.some((f) => /mudos|estourando|5 s|repente|explosão|variações/.test(f))) ok(`20 clubes: ${r[0].seg} s, RMS ${Math.min(...r.map((x) => x.rms))}–${Math.max(...r.map((x) => x.rms))}, pico ${Math.max(...r.map((x) => x.pico))}, explosão no 1º segundo, final suave, ${estilos} variações`);
  await ctx.close();
}
await browser.close();
console.log(falhas.length ? `\nFALHOU (${falhas.length}):\n- ${falhas.join("\n- ")}` : "\nOK: som do gol conferido");
process.exitCode = falhas.length ? 1 : 0;
