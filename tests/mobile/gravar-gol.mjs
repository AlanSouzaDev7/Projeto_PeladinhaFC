/* Grava em vídeo a entrada num clube (cortina com a faixa do clube) e o "GOL!" do topo.
   Usa o screencast do Chrome (quadros com horário) e monta o MP4 com o ffmpeg do sistema.
   Sai em tests/mobile/out/simulacao-gol-pc.mp4 e simulacao-gol-celular.mp4.
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/gravar-gol.mjs */
import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const CLUBES = (process.env.CLUBES || "cruzeiro,flamengo,vasco").split(",");
const browser = await chromium.launch({ channel: "chrome" });

for (const [nome, opts] of [["pc", { viewport: { width: 1280, height: 720 } }], ["celular", devices["Pixel 7"]]]) {
  const ctx = await browser.newContext({ ...opts, locale: "pt-BR", colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const dir = `${OUT}quadros-${nome}/`;
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const cdp = await ctx.newCDPSession(page), frames = [];
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const f = `${dir}${String(frames.length).padStart(5, "0")}.jpg`;
    writeFileSync(f, Buffer.from(data, "base64")); frames.push({ f, t: metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, everyNthFrame: 1 });
  for (const id of CLUBES) {
    await page.evaluate((id) => { location.hash = `#/clube/${id}`; }, id);
    await page.waitForTimeout(9000);
    await page.evaluate(() => { location.hash = "#/"; });
    await page.waitForTimeout(1400);
  }
  await cdp.send("Page.stopScreencast");
  await ctx.close();
  // cada quadro dura até o próximo (o Chrome só manda quadro quando a tela muda)
  const list = frames.map((fr, i) => `file '${fr.f}'\nduration ${(((frames[i + 1]?.t ?? fr.t + 0.04) - fr.t)).toFixed(3)}`).join("\n") + `\nfile '${frames.at(-1).f}'\n`;
  writeFileSync(`${dir}lista.txt`, list);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${dir}lista.txt`, "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", "-movflags", "+faststart", `${OUT}simulacao-gol-${nome}.mp4`]);
  rmSync(dir, { recursive: true, force: true });
  console.log(nome, frames.length, "quadros");
}
await browser.close();
