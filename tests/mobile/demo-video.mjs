/* Vídeo de demonstração das novidades (tests/mobile/out/demo-novidades.mp4), com som.
   Roteiro: busca por letra inicial, simulador da tabela, gol ao vivo (Cruzeiro x Palmeiras simulado, com o tempo
   entre o gol na fonte e o alerta na tela), apito nas estatísticas e no "Bora pro jogo" e o botão de som.
   O Playwright grava só a imagem; os sons são gerados pelo próprio site (SONS.wav, o mesmo som que toca no navegador)
   e postos no vídeo nos instantes em que tocaram.
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/demo-video.mjs */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const OUT = `${ROOT}tests/mobile/out/`, TMP = `${OUT}demo-tmp/`;
rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });

// dados: um Cruzeiro x Palmeiras rolando agora (o exemplo do pedido)
const raw = readFileSync(`${ROOT}js/live-data.js`, "utf8");
const D = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const kick = Date.now() - 30 * 60e3, brt = new Date(kick - 3 * 3600e3).toISOString();
// tira o Cruzeiro x Palmeiras de verdade (marcado para outro dia): a rodada não pode ter o mesmo jogo duas vezes
for (const r of Object.keys(D.fixtures)) D.fixtures[r] = D.fixtures[r].filter((g) => !(g[0] === "cruzeiro" && g[1] === "palmeiras"));
D.fixtures[D.round].unshift(["cruzeiro", "palmeiras", null, null, brt.slice(0, 10), brt.slice(11, 16), "Mineirão", "999002", null]);
const body = `window.LIVE_DATA = ${JSON.stringify(D)};`;
const placar = { h: 0, a: 0 }, t0jogo = Date.now();
const sb = () => ({ leagues: [{ calendar: [] }], events: [{ id: "999002", date: new Date(kick).toISOString(), competitions: [{
  competitors: [{ homeAway: "home", team: { id: "2022", displayName: "Cruzeiro" }, score: String(placar.h) }, { homeAway: "away", team: { id: "2029", displayName: "Palmeiras" }, score: String(placar.a) }],
  status: { displayClock: `${Math.min(45, 30 + Math.floor((Date.now() - t0jogo) / 4000))}'`, type: { name: "STATUS_FIRST_HALF", state: "in", shortDetail: "1º tempo" } }, venue: { fullName: "Mineirão" } }] }] });

const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: "pt-BR", colorScheme: "dark" });
await ctx.route("**/js/live-data.js*", (r) => r.fulfill({ contentType: "application/javascript", body }));
await ctx.route("**/api/**", (r) => r.fulfill({ status: 404, body: "" }));
await ctx.route(/espn\.com/, (r) => {
  const u = r.request().url(), h = { "access-control-allow-origin": "*" };
  if (u.includes("/scoreboard") && u.includes(`dates=${brt.slice(0, 10).replace(/-/g, "")}`)) return r.fulfill({ contentType: "application/json", headers: h, body: JSON.stringify(sb()) });
  if (u.includes("/scoreboard")) return r.fulfill({ contentType: "application/json", headers: h, body: JSON.stringify({ leagues: [{ calendar: [] }], events: [] }) });
  return r.fulfill({ contentType: "application/json", headers: h, body: "{}" });
});
// legenda, cursor visível e cronômetro do gol (só no vídeo)
await ctx.addInitScript(() => {
  const css = `#__leg{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:99999;max-width:86vw;padding:12px 22px;border-radius:14px;background:rgba(8,12,22,.92);color:#fff;font:700 21px/1.35 system-ui,sans-serif;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.15);transition:opacity .3s}
    #__leg small{display:block;font-weight:500;font-size:15px;opacity:.8;margin-top:2px}
    #__cur{position:fixed;z-index:100000;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,215,0,.55);border:2px solid #fff;pointer-events:none;transition:transform .15s}
    #__cur.d{transform:scale(.6);background:rgba(255,80,80,.8)}
    #__cron{position:fixed;right:18px;top:120px;z-index:99999;padding:10px 14px;border-radius:12px;background:rgba(8,12,22,.92);color:#fff;font:600 15px/1.4 system-ui;border:1px solid rgba(255,255,255,.15)}
    #__cron b{color:#19c37d;font-size:20px}`;
  addEventListener("DOMContentLoaded", () => {
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    const cur = document.createElement("div"); cur.id = "__cur"; document.body.appendChild(cur);
    addEventListener("mousemove", (e) => { cur.style.left = e.clientX + "px"; cur.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => cur.classList.add("d"), true); addEventListener("mouseup", () => cur.classList.remove("d"), true);
  });
  window.__legenda = (t, s = "") => {
    let el = document.getElementById("__leg");
    if (!t) { el && el.remove(); return; }
    if (!el) { el = document.createElement("div"); el.id = "__leg"; document.body.appendChild(el); }
    el.innerHTML = `${t}${s ? `<small>${s}</small>` : ""}`;
  };
  window.__cron = (fonte) => {
    let el = document.getElementById("__cron");
    if (!el) { el = document.createElement("div"); el.id = "__cron"; document.body.appendChild(el); }
    el.innerHTML = "Gol registrado na fonte (ESPN)…";
    const obs = new MutationObserver(() => {
      if (!document.querySelector(".goal-alert")) return;
      obs.disconnect();
      el.innerHTML = `Na tela em <b>${((Date.now() - fonte) / 1000).toFixed(1).replace(".", ",")} s</b><br><small>antes: em média 6 s</small>`;
      setTimeout(() => el.remove(), 6000);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  };
});
const page = await ctx.newPage();
// grava a tela quadro a quadro (screencast do Chrome)
const frames = [], cdp = await ctx.newCDPSession(page);
cdp.on("Page.screencastFrame", async ({ data: d, metadata, sessionId }) => {
  const f = `${TMP}${String(frames.length).padStart(5, "0")}.jpg`; writeFileSync(f, Buffer.from(d, "base64")); frames.push({ f, t: metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 1280, maxHeight: 720 });
const tVideo = Date.now();
const erros = [];
page.on("pageerror", (e) => erros.push(e.message));
const w = (ms) => page.waitForTimeout(ms);
const leg = (t, s) => page.evaluate(([a, b]) => window.__legenda(a, b), [t, s]);
async function clica(sel, opts = {}) {
  const el = page.locator(sel).first();
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 18 });
  await w(250);
  await page.mouse.down(); await w(90); await page.mouse.up();
  if (opts.depois) await w(opts.depois);
}

await page.goto(`${BASE}/?v=${Date.now()}#/`, { waitUntil: "load" });
await page.waitForSelector(".match");
await page.mouse.move(640, 360);
await leg("PLACAR. — novidades desta versão", "busca · simulador · placar ao vivo mais rápido · sons");
await w(3500);

// 1) busca
await leg("1. Busca corrigida", "só aparecem clubes que começam com a letra digitada");
await clica("#search", { depois: 300 });
await page.keyboard.type("f", { delay: 350 }); await w(2600);
await page.locator("#search").fill(""); await page.keyboard.type("co", { delay: 300 }); await w(2200);
await page.locator("#search").fill(""); await page.keyboard.type("s", { delay: 300 }); await w(2200);
await page.keyboard.press("Escape"); await w(400);

// 2) simulador
await leg("2. Simulador da tabela", "dê o placar dos jogos que faltam e veja a classificação mudar");
await page.evaluate(() => localStorage.removeItem("placar:simulador"));
await clica('.nav a[data-nav="simulador"]', { depois: 2200 });
const k36 = await page.$$eval(".sim-chips a", (l) => l.find((a) => a.textContent.startsWith("36"))?.getAttribute("href"));
if (k36) { await clica(`.sim-chips a[href="${k36}"]`, { depois: 1500 }); }
const jogo = (await page.$$eval(".sim-j", (l) => l.map((li) => li.dataset.k))).find((k) => /palmeiras-x-flamengo/.test(k));
if (jogo) {
  await leg("Palmeiras x Flamengo: Palmeiras vence por 3 x 1", "a tabela ao lado se reorganiza na hora");
  await clica(`.sim-j[data-k="${jogo}"] input >> nth=0`); await page.keyboard.type("3", { delay: 200 });
  await clica(`.sim-j[data-k="${jogo}"] input >> nth=1`); await page.keyboard.type("1", { delay: 200 }); await w(2800);
  await leg("E se o Flamengo virar? 1 x 3", "pontos, saldo e posição recalculados");
  await clica(`.sim-j[data-k="${jogo}"] input >> nth=0`); await page.keyboard.type("1", { delay: 200 });
  await clica(`.sim-j[data-k="${jogo}"] input >> nth=1`); await page.keyboard.type("3", { delay: 200 }); await w(2800);
}
const cc = (await page.$$eval(".sim-j", (l) => l.map((li) => li.dataset.k))).find((k) => /cruzeiro/.test(k));
if (cc) { await leg("Botões rápidos: vitória, empate ou derrota com um clique"); await clica(`.sim-j[data-k="${cc}"] [data-rap="h"]`, { depois: 2200 }); }
await leg("“Tudo empate” completa o resto da rodada"); await clica('[data-sim-auto="empate"]', { depois: 2600 });
await clica(".sim-chips a:last-child", { depois: 600 });
await leg("“Todas”: simula até o fim do campeonato", "os jogos do ano que vem entram sozinhos quando ganharem data");
await page.mouse.wheel(0, 900); await w(2400); await page.mouse.wheel(0, -900); await w(800);

// 3) placar ao vivo
await leg("3. Placar ao vivo mais rápido", "o site consulta o placar a cada 0,8 s (antes: 12 s)");
await clica('.nav a[data-nav="home"]', { depois: 2500 });
const golAgora = async (lado) => { placar[lado]++; const t = Date.now(); await page.evaluate((f) => window.__cron(f), t); };
await leg("Cruzeiro x Palmeiras ao vivo: gol do Cruzeiro!", "alerta GOL! e 5 s de festa do clube que marcou");
await golAgora("h"); await w(9000);
await leg("Gol do Palmeiras!", "cada clube tem a sua fanfarra");
await golAgora("a"); await w(9000);

// 4) apito
await leg("4. Apito do árbitro ao entrar no “Bora pro jogo”…");
await clica('.nav a[data-nav="bora-pro-jogo"]', { depois: 3200 });
await leg("…e nas estatísticas (do clube e rankings)");
await page.evaluate(() => { location.hash = "#/clube/cruzeiro"; }); await w(2200);
const est = page.locator('a[href="#/clube/cruzeiro/estatisticas"]').first();
if (await est.count()) await clica('a[href="#/clube/cruzeiro/estatisticas"]', { depois: 3000 }); else { await page.evaluate(() => { location.hash = "#/clube/cruzeiro/estatisticas"; }); await w(3000); }
await clica('.nav a[data-nav="tabela"]', { depois: 1500 });
await clica('a.kpi-link[href="#/tabela/gols"]', { depois: 3000 });

// 5) botão de som
await leg("5. Botão de som no topo", "desliga e liga (com um apito de confirmação); o site lembra a escolha");
await clica("#som", { depois: 1500 }); await clica("#som", { depois: 2500 });
await leg("Tudo testado no PC e no celular", "busca · simulador · placar ao vivo · sons · QA");
await w(3200);

const hist = await page.evaluate(() => window.SONS.historico.filter((h) => h.tocou).map((h) => ({ tipo: h.tipo, clube: h.clube, em: h.em })));
// sons em arquivos WAV, gerados pelo próprio site
const wavs = [];
for (const [i, h] of hist.entries()) {
  const b64 = await page.evaluate(([t, c]) => window.SONS.wav(t, c), [h.tipo, h.clube]);
  const f = `${TMP}som${i}.wav`; writeFileSync(f, Buffer.from(b64, "base64"));
  wavs.push({ f, ms: Math.max(0, h.em - tVideo) });
}
await cdp.send("Page.stopScreencast");
await page.close(); await ctx.close(); await browser.close();
// o vídeo começa no primeiro quadro: os sons são alinhados a ele
const t1 = frames[0].t * 1000;
wavs.forEach((x, i) => { x.ms = Math.max(0, hist[i].em - t1); });
writeFileSync(`${TMP}lista.txt`, frames.map((fr, i) => `file '${fr.f}'\nduration ${(((frames[i + 1]?.t ?? fr.t + 0.04) - fr.t)).toFixed(3)}`).join("\n") + `\nfile '${frames.at(-1).f}'\n`);
const args = ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${TMP}lista.txt`];
wavs.forEach((x) => args.push("-i", x.f));
const fil = wavs.map((x, i) => `[${i + 1}:a]adelay=${x.ms}|${x.ms}[s${i}]`).join(";") + `;${wavs.map((_, i) => `[s${i}]`).join("")}amix=inputs=${wavs.length}:normalize=0:duration=longest[a]`;
const dest = `${OUT}demo-novidades.mp4`;
execFileSync("ffmpeg", [...args, "-filter_complex", fil, "-map", "0:v", "-map", "[a]", "-vf", "fps=30,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2", "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", dest]);
rmSync(TMP, { recursive: true, force: true });
console.log(`vídeo: ${dest}`);
console.log(`sons no vídeo: ${hist.map((h) => `${h.tipo}${h.clube ? ` (${h.clube})` : ""} aos ${((h.em - tVideo) / 1000).toFixed(1)} s`).join(", ")}`);
console.log(erros.length ? `erros de JavaScript: ${erros.join(" | ")}` : "sem erros de JavaScript");
void renameSync;
