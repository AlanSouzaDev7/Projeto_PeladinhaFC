/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. */
/* Tomada de drone do estádio na faixa da partida (js/drone.js):
   - para cada um dos 20 estádios, abre um jogo nele, espera a câmera parar e confere: foto carregada, sem erro,
     placar e escudos por cima da foto, créditos da foto, nada saindo da tela; guarda um print do quadro final;
   - fluidez: mede os quadros durante o voo no PC, num Android (Pixel 7, processador 4x mais lento) e num iPhone;
   - sem animação (movimento reduzido): a foto aparece direto no quadro final.
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/drone.mjs   (SO=fps: só a fluidez) */
import { chromium, webkit, devices } from "playwright";
import fs from "node:fs";
const BASE = process.env.BASE || "http://127.0.0.1:5173";
const OUT = new URL("./out/drone/", import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? "ok  " : "FALHA"} · ${msg}`); if (!c) falhas++; };

// um jogo em cada estádio (pelo nome do estádio do jogo ou, sem ele, pela casa do mandante)
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const erros = [];
p.on("pageerror", (e) => erros.push(e.message));
await p.goto(`${BASE}/?v=${Date.now()}#/`, { waitUntil: "load" });
await p.waitForTimeout(1500);
const jogos = await p.evaluate(() => {
  const out = {};
  for (const [rd, lista] of Object.entries(window.PD.FIXTURES)) for (const g of lista) {
    const k = window.DRONE.estadioDe(g[6], g[0]);
    if (k && !out[k]) out[k] = `${g[0]}-x-${g[1]}-r${rd}`;
  }
  return { out, todos: Object.keys(window.DRONE.EST) };
});
const faltando = jogos.todos.filter((k) => !jogos.out[k]);
ok(Object.keys(jogos.out).length >= 18, `jogos encontrados em ${Object.keys(jogos.out).length} de ${jogos.todos.length} estádios${faltando.length ? ` (sem jogo no calendário: ${faltando.join(", ")})` : ""}`);

if (process.env.SO !== "fps") {
  for (const [k, id] of Object.entries(jogos.out)) {
    await p.goto(`${BASE}/?v=${Date.now()}#/partida/${id}`, { waitUntil: "load" });
    let parado = false;
    for (let i = 0; i < 30 && !(parado = await p.evaluate(() => !!document.querySelector(".mh-drone.parado"))); i++) await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const d = document.querySelector(".mh-drone"), img = d?.querySelector(".dr-img"), hero = document.querySelector(".match-hero");
      const sc = hero.querySelector(".scoreline").getBoundingClientRect(), hr = hero.getBoundingClientRect();
      const cred = hero.querySelector(".dr-credit");
      return { estadio: d?.dataset.drone, carregou: !!(img && img.complete && img.naturalWidth > 300), largura: img?.naturalWidth,
        placarDentro: sc.top >= hr.top && sc.bottom <= hr.bottom, credito: cred?.textContent || "", rolagem: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    ok(parado && r.estadio === k && r.carregou && r.placarDentro && /Wikimedia Commons/.test(r.credito) && !r.rolagem,
      `${k} (${id}) · câmera parou: ${parado} · foto ${r.largura}px · créditos: ${r.credito.slice(0, 60)}`);
    await p.locator(".match-hero").screenshot({ path: new URL(`${k}.jpg`, OUT).pathname.replace(/^\/([A-Z]:)/, "$1"), type: "jpeg", quality: 70 });
  }
  ok(!erros.length, `sem erros de JavaScript${erros.length ? `: ${erros.slice(0, 3).join(" | ")}` : ""}`);
}
await b.close();

// fluidez: quadros durante o voo
async function fps(nome, eng, opts, launch, lento) {
  const br = await eng.launch(launch);
  const c = await br.newContext({ ...opts });
  const pg = await c.newPage();
  if (lento && eng === chromium) { const s = await c.newCDPSession(pg); await s.send("Emulation.setCPUThrottlingRate", { rate: 4 }); }
  const id = jogos.out.mineirao || Object.values(jogos.out)[0];
  await pg.goto(`${BASE}/?v=${Date.now()}#/`, { waitUntil: "load" });
  await pg.waitForTimeout(1200);
  // a medição começa antes de abrir a partida e segue até a câmera parar
  // só os quadros com a câmera voando (o desenho da página e a decodificação da foto ficam de fora)
  await pg.evaluate(() => { window.__q = []; let t0 = null; const f = (t) => { const voando = document.querySelector(".mh-drone.voando"); if (voando) { if (t0 != null) window.__q.push(t - t0); t0 = t; } if (!document.querySelector(".mh-drone.parado")) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await pg.evaluate((id) => (location.hash = `#/partida/${id}`), id);
  for (let i = 0; i < 40 && !(await pg.evaluate(() => !!document.querySelector(".mh-drone.parado"))); i++) await pg.waitForTimeout(300);
  const q = await pg.evaluate(() => {
    const v = window.__q.slice(2);
    const ord = [...v].sort((a, b) => a - b), med = v.reduce((a, b) => a + b, 0) / (v.length || 1);
    return { n: v.length, fps: Math.round(1000 / med), p95: Math.round(ord[Math.floor(ord.length * 0.95)] || 0), longos: v.filter((x) => x > 50).length, largo: document.querySelector(".mh-drone")?.classList.contains("largo") };
  });
  // controle no mesmo navegador: uma faixa simples do mesmo tamanho se movendo (mostra o limite do próprio ambiente)
  await pg.setContent(`<style>body{margin:0}.f{height:420px;overflow:hidden;position:relative}.f div{position:absolute;inset:0;background:linear-gradient(120deg,#246,#8ac,#fe9,#263)}</style><div class=f><div></div></div>`);
  q.controle = await pg.evaluate(() => new Promise((r) => {
    const a = document.querySelector(".f div").animate([{ transform: "translateY(30%) scale(1.6) rotate(-3deg)" }, { transform: "none" }], { duration: 4000, easing: "ease-out" });
    const v = []; let t0 = null; const f = (t) => { if (t0 != null) v.push(t - t0); t0 = t; if (a.playState === "running") requestAnimationFrame(f); else r(Math.round(1000 / (v.reduce((x, y) => x + y, 0) / v.length))); }; requestAnimationFrame(f);
  }));
  await br.close();
  return q;
}
for (const [nome, eng, opts, launch, lento, minimo] of [
  ["PC", chromium, { viewport: { width: 1440, height: 900 } }, { channel: "chrome" }, false, 50],
  ["Pixel 7 (CPU 4x mais lenta)", chromium, devices["Pixel 7"], { channel: "chrome" }, true, 30],
  ["iPhone 15", webkit, devices["iPhone 15"], {}, false, 40],
]) {
  const q = await fps(nome, eng, opts, launch, lento);
  // o WebKit do Playwright no Windows desenha sem placa de vídeo (até uma faixa simples fica em ~35 quadros/s): lá vale a proporção do controle
  const semGPU = eng === webkit && q.controle < 50;
  const passou = semGPU ? q.fps >= q.controle * 0.25 && q.n > 20 : q.n > 60 && q.fps >= minimo && q.longos <= 4;
  ok(passou, `${nome} · ${q.fps} quadros/s em média, 95% dos quadros em até ${q.p95} ms, ${q.longos} engasgo(s) acima de 50 ms (${q.n} quadros, ${q.largo ? "estádio inteiro no centro" : "foto preenchendo a faixa"}) · controle do ambiente: ${q.controle} quadros/s${semGPU ? " (ambiente sem placa de vídeo)" : ""}`);
}

// movimento reduzido: direto no quadro final
{
  const br = await chromium.launch({ channel: "chrome" });
  const pg = await (await br.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })).newPage();
  await pg.goto(`${BASE}/?v=${Date.now()}#/partida/${jogos.out.mineirao || Object.values(jogos.out)[0]}`, { waitUntil: "load" });
  await pg.waitForTimeout(2500);
  const r = await pg.evaluate(() => { const d = document.querySelector(".mh-drone"); return { parado: d?.classList.contains("parado"), voando: d?.classList.contains("voando"), anim: d ? d.querySelector(".dr-cam").getAnimations().length : -1 }; });
  ok(r.parado && !r.voando && r.anim === 0, `movimento reduzido · foto já parada, sem animação`);
  await br.close();
}
console.log(falhas ? `\n${falhas} falha(s)` : "\nTomada de drone ok em todos os estádios e fluida no PC e no celular.");
process.exit(falhas ? 1 : 0);
