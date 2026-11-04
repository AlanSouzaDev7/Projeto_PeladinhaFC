/* Gol ao vivo: um jogo hipotético (Cruzeiro x Flamengo, roteiro em tests/sim/jogo.mjs) rola com a ESPN
   simulada e o site precisa tocar o GOL! do clube que marcou, com o placar e o minuto certos.
   Confere os 3 gols (Cruzeiro 12', Flamengo 61', Cruzeiro 88' de pênalti) no PC e no celular,
   e grava o celular em vídeo (tests/mobile/out/gol-ao-vivo-*.mp4).
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/gol-ao-vivo.mjs */
import { chromium, devices } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ROTEIRO, ESPN_ID, espnScoreboard, espnSummary } from "../sim/jogo.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const ATE = +(process.env.ATE || 168); // segundos de jogo (o 3º gol sai aos 140 s; o jogo acaba aos 160 s)

const S = Math.ceil((Date.now() + 20e3) / 60e3) * 60e3; // começa no minuto cheio
const tNow = () => (Date.now() - S) / 1000;
const brt = new Date(S - 3 * 3600e3).toISOString();
const raw = readFileSync(`${ROOT}js/live-data.js`, "utf8");
const data = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
data.fixtures[data.round].push(["cruzeiro", "flamengo", null, null, brt.slice(0, 10), brt.slice(11, 16), "Mineirão (simulação)", ESPN_ID, null]);
const liveData = `window.LIVE_DATA = ${JSON.stringify(data)};`;

const browser = await chromium.launch({ channel: "chrome" });
async function abrir(nome, opts, hash) {
  const ctx = await browser.newContext({ ...opts, locale: "pt-BR", colorScheme: "dark" });
  await ctx.route("**/js/live-data.js*", (r) => r.fulfill({ contentType: "application/javascript", body: liveData }));
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 404, body: "" }));
  await ctx.route(/espn\.com/, (r) => {
    const u = r.request().url(), h = { "access-control-allow-origin": "*" };
    if (u.includes("/scoreboard")) {
      const hoje = u.includes(`dates=${brt.slice(0, 10).replace(/-/g, "")}`);
      return r.fulfill({ contentType: "application/json", headers: h, body: JSON.stringify(hoje ? espnScoreboard(tNow(), new Date(S).toISOString()) : { leagues: [{ calendar: [] }], events: [] }) });
    }
    if (u.includes("/summary") && u.includes(ESPN_ID)) return r.fulfill({ contentType: "application/json", headers: h, body: JSON.stringify(espnSummary(tNow())) });
    return r.fulfill({ contentType: "application/json", headers: h, body: "{}" });
  });
  await ctx.addInitScript(() => {
    window.__gols = [];
    new MutationObserver(() => document.querySelectorAll(".goal-alert:not([data-visto])").forEach((el) => {
      el.dataset.visto = "1";
      window.__gols.push({ at: Date.now(), clube: el.querySelector(".gb").dataset.goalbug, texto: el.querySelector(".ga-txt span").textContent, relogio: el.querySelector(".gb-clock span").textContent });
    })).observe(document, { childList: true, subtree: true });
  });
  const page = await ctx.newPage(), erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto(`${BASE}/?v=${Date.now()}${hash}`, { waitUntil: "load" });
  return { nome, ctx, page, erros };
}

const telas = await Promise.all([abrir("pc", { viewport: { width: 1280, height: 720 } }, "#/"), abrir("celular", devices["Pixel 7"], "#/")]);
// grava o celular
const cel = telas[1], dir = `${OUT}quadros-ao-vivo/`, frames = [];
rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
const cdp = await cel.ctx.newCDPSession(cel.page);
cdp.on("Page.screencastFrame", async ({ data: d, metadata, sessionId }) => {
  const f = `${dir}${String(frames.length).padStart(5, "0")}.jpg`; writeFileSync(f, Buffer.from(d, "base64")); frames.push({ f, t: metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85 });
console.log(`jogo começa em ${Math.round((S - Date.now()) / 1000)} s; observando ${ATE} s de jogo`);
await new Promise((r) => setTimeout(r, S - Date.now() + ATE * 1000));
await cdp.send("Page.stopScreencast");

const golsRoteiro = ROTEIRO.filter((e) => /goal/.test(e.kind) && e.t <= ATE - 25);
const result = {};
for (const t of telas) {
  const vistos = await t.page.evaluate(() => window.__gols);
  result[t.nome] = {
    gols: golsRoteiro.map((g) => {
      const clube = g.side === "home" ? "cruzeiro" : "flamengo", at = S + g.t * 1000;
      const v = vistos.find((x) => x.clube === clube && x.at >= at - 500 && x.at < at + 25000);
      return { lance: `${clube} ${g.min}'`, apareceu: !!v, segundos: v ? +((v.at - at) / 1000).toFixed(1) : null, texto: v?.texto, relogio: v?.relogio };
    }),
    alertasAMais: vistos.length - golsRoteiro.length,
    erros: t.erros,
  };
  await t.ctx.close();
}
const list = frames.map((fr, i) => `file '${fr.f}'\nduration ${(((frames[i + 1]?.t ?? fr.t + 0.04) - fr.t)).toFixed(3)}`).join("\n") + `\nfile '${frames.at(-1).f}'\n`;
writeFileSync(`${dir}lista.txt`, list);
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${dir}lista.txt`, "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-movflags", "+faststart", `${OUT}gol-ao-vivo-celular.mp4`]);
rmSync(dir, { recursive: true, force: true });
writeFileSync(`${OUT}gol-ao-vivo.json`, JSON.stringify(result, null, 2));
for (const [k, r] of Object.entries(result)) { console.log(`\n=== ${k} ===`); console.table(r.gols); console.log("alertas a mais:", r.alertasAMais, "erros:", r.erros); }
await browser.close();
