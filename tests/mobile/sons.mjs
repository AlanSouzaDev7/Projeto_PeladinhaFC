/* Sons do site (js/sons.js).
   - apito ao ENTRAR no "Bora pro jogo", nas estatísticas do clube e nos rankings (e só na entrada);
   - nada toca nas outras páginas;
   - gol: o alerta GOL! toca 5 s do som do clube que marcou; dois gols juntos tocam um depois do outro;
   - botão de som: desliga (nada toca), lembra depois de recarregar e liga de novo (com um apito);
   - antes do primeiro toque na página o navegador não deixa tocar: nada quebra;
   - a fanfarra de cada um dos 20 clubes é diferente das outras, tem som de verdade (não é silêncio) e não estoura.
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
  // antes de qualquer toque: o navegador bloqueia, o site só registra
  await page.evaluate(() => window.SONS.gol("flamengo"));
  const h0 = (await hist()).at(-1);
  // alguns navegadores automáticos já liberam o áudio sem toque; aí a regra do navegador não tem o que bloquear
  const livre = await page.evaluate(() => { const c = new AudioContext(); const s = c.state; c.close(); return s === "running"; });
  if (livre) ok("este navegador libera o áudio sem toque (teste de bloqueio não se aplica)");
  else if (h0.tocou) erro("tocou antes do primeiro toque na página (o navegador deveria bloquear)"); else ok(`antes do primeiro toque: não toca (${h0.motivo})`);
  // primeiro toque (gesto de verdade) destrava
  if (opts.hasTouch) await page.tap(".page-head, .round-head, h1, body"); else await page.mouse.click(5, 300);
  await page.waitForTimeout(200);
  if (!(await page.evaluate(() => window.SONS.pronto()))) erro("áudio continuou travado depois do toque"); else ok("áudio destravado com o primeiro toque");
  const n0 = (await hist()).length;
  // navegação pelos links (como o usuário faz)
  const vai = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(1600); };
  const casos = [["#/bora-pro-jogo", 1], ["#/bora-pro-jogo", 0], ["#/", 0], ["#/clube/flamengo", 0], ["#/clube/flamengo/estatisticas", 1], ["#/clube/flamengo/elenco", 0], ["#/clube/palmeiras/estatisticas", 1], ["#/tabela", 0], ["#/tabela/gols", 1], ["#/tabela/ataque", 0], ["#/simulador", 0], ["#/clubes", 0], ["#/bora-pro-jogo", 1]];
  let antes = n0;
  for (const [h, esp] of casos) {
    await vai(h);
    const l = await hist(), novos = l.slice(antes); antes = l.length;
    const apitos = novos.filter((x) => x.tipo === "apito");
    if (apitos.length !== esp) erro(`${h}: ${apitos.length} apito(s), esperava ${esp}`);
    if (apitos.some((x) => !x.tocou)) erro(`${h}: apito registrado mas não tocou (${apitos[0].motivo})`);
  }
  if (!falhas.some((f) => f.startsWith("#/"))) ok(`apito nas entradas certas (${casos.filter((c) => c[1]).length} de ${casos.length} navegações) e silêncio nas outras`);
  // gol: o alerta toca o som do clube
  await vai("#/");
  await page.evaluate(() => {
    const c = window.PD.byId;
    window.GOALBUG.alerta({ club: c.cruzeiro, de: 0, para: 1, outro: 0, relogio: "12'", texto: "Teste · CRU 1 x 0 PAL", link: "#/" });
    window.GOALBUG.alerta({ club: c.palmeiras, de: 0, para: 1, outro: 1, relogio: "13'", texto: "Teste · CRU 1 x 1 PAL", link: "#/" });
  });
  await page.waitForTimeout(600);
  let gols = (await hist()).filter((x) => x.tipo === "gol" && x.tocou);
  if (!gols.some((g) => g.clube === "cruzeiro")) erro("alerta de gol do Cruzeiro sem som");
  else ok(`gol do Cruzeiro: ${gols.find((g) => g.clube === "cruzeiro").dur} s de som`);
  await page.waitForTimeout(8500); // o segundo alerta entra depois do primeiro
  gols = (await hist()).filter((x) => x.tipo === "gol" && x.tocou);
  const cru = gols.find((g) => g.clube === "cruzeiro"), pal = gols.find((g) => g.clube === "palmeiras");
  if (!pal) erro("segundo gol (Palmeiras) sem som");
  else if (pal.inicio < cru.inicio + cru.dur - 0.01) erro("dois gols tocaram por cima um do outro");
  else ok("dois gols seguidos: um som depois do outro, sem sobrepor");
  // botão de som
  await page.locator("#som").click();
  await page.evaluate(() => window.SONS.gol("santos"));
  const desl = (await hist()).at(-1);
  if (desl.tocou || (await page.locator("#som").getAttribute("aria-pressed")) !== "false") erro("botão desligado e o som tocou"); else ok("botão desliga o som");
  await page.reload(); await page.waitForSelector(".match");
  if ((await page.locator("#som").getAttribute("aria-pressed")) !== "false") erro("som voltou ligado depois de recarregar"); else ok("som desligado continua desligado depois de recarregar");
  await vai("#/bora-pro-jogo");
  if ((await hist()).some((x) => x.tocou)) erro("tocou com o som desligado");
  await page.locator("#som").click();
  await page.waitForTimeout(300);
  const lig = (await hist()).at(-1);
  if (!(lig.tipo === "apito" && lig.tocou)) erro("ligar o som não tocou o apito de confirmação"); else ok("ligar o som toca um apito de confirmação");
  const tam = await page.locator("#som").boundingBox();
  if (tam.width < 40 || tam.height < 40) erro(`botão de som pequeno (${tam.width}x${tam.height})`);
  if (erros.length) erro(`${nome}: erros de JavaScript: ${erros.join(" | ")}`);
  await ctx.close();
}

// as 20 fanfaras: diferentes entre si, com som e sem estourar
console.log("fanfarras dos clubes");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?v=${Date.now()}#/sobre`, { waitUntil: "load" });
  const r = await page.evaluate(async () => {
    const out = [];
    for (const c of window.PD.CLUBS) {
      const b64 = await window.SONS.wav("gol", c.id), bin = atob(b64), n = (bin.length - 44) / 4;
      let soma = 0, pico = 0, somaFim = 0, nFim = 0;
      for (let i = 0; i < n; i++) {
        const lo = bin.charCodeAt(44 + i * 4), hi = bin.charCodeAt(45 + i * 4), v = ((hi << 8 | lo) << 16 >> 16) / 32768;
        soma += v * v; pico = Math.max(pico, Math.abs(v));
        if (i > n - 44100 * 0.15) { somaFim += v * v; nFim++; }
      }
      const F = window.SONS.fanfarra(c.id);
      out.push({ id: c.id, seg: +(n / 44100).toFixed(2), rms: +Math.sqrt(soma / n).toFixed(3), pico: +pico.toFixed(3), fim: +Math.sqrt(somaFim / nFim).toFixed(4), melodia: F.notas.map((x) => x.m).join(","), bpm: F.bpm });
    }
    const a = await window.SONS.wav("apito"), bin = atob(a);
    return { out, apitoSeg: +((bin.length - 44) / 4 / 44100).toFixed(2) };
  });
  const mel = new Set(r.out.map((x) => `${x.melodia}|${x.bpm}`));
  if (mel.size !== r.out.length) erro(`fanfarras repetidas: ${r.out.length - mel.size}`); else ok(`${r.out.length} fanfarras diferentes (melodia e andamento)`);
  const mudas = r.out.filter((x) => x.rms < 0.02), estouro = r.out.filter((x) => x.pico >= 0.999), longo = r.out.filter((x) => x.seg > 5.3), rabo = r.out.filter((x) => x.fim > 0.01);
  if (mudas.length) erro(`fanfarras quase mudas: ${mudas.map((x) => x.id).join(", ")}`);
  if (estouro.length) erro(`fanfarras estourando: ${estouro.map((x) => x.id).join(", ")}`);
  if (longo.length) erro(`fanfarras com mais de 5 s: ${longo.map((x) => x.id).join(", ")}`);
  if (rabo.length) erro(`fanfarras terminando de repente (sem final suave): ${rabo.map((x) => x.id).join(", ")}`);
  if (!mudas.length && !estouro.length) ok(`volume ok: RMS ${Math.min(...r.out.map((x) => x.rms))}–${Math.max(...r.out.map((x) => x.rms))}, pico máximo ${Math.max(...r.out.map((x) => x.pico))}; duração ${r.out[0].seg} s com final suave`);
  ok(`apito: ${r.apitoSeg} s`);
  await ctx.close();
}
await browser.close();
console.log(falhas.length ? `\nFALHOU (${falhas.length}):\n- ${falhas.join("\n- ")}` : "\nOK: sons conferidos");
process.exitCode = falhas.length ? 1 : 0;
