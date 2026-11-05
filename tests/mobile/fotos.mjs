/* Fotos das páginas principais (PC e celular, claro e escuro) para revisão visual: tests/mobile/out/foto-*.png
   Uso: python -m http.server 5174 --bind 127.0.0.1  e depois  node tests/mobile/fotos.mjs [prefixo] */
import { chromium, devices } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:5174", PRE = process.argv[2] || "foto";
const ROTAS = (process.env.ROTAS || "#/,#/clubes,#/clube/flamengo,#/tabela,#/partida/athletico-pr-x-vasco-r34,#/bora-pro-jogo").split(",");
const b = await chromium.launch({ channel: "chrome" });
for (const [dev, opts, tema] of [["pc", { viewport: { width: 1440, height: 900 } }, "dark"], ["cel", devices["Pixel 7"], "light"]]) {
  const p = await (await b.newContext({ ...opts, colorScheme: tema, locale: "pt-BR" })).newPage();
  for (const r of ROTAS) {
    await p.goto(`${BASE}/?estatico&cena=20&f=${Date.now()}${r}`, { waitUntil: "load" });
    await p.waitForTimeout(r.includes("clube/") ? 8000 : 2500);
    await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); document.querySelectorAll(".reveal").forEach((e) => e.classList.add("seen")); document.querySelectorAll(".bar i[data-w]").forEach((i) => (i.style.width = i.dataset.w + "%")); });
    await p.waitForTimeout(500);
    const nome = r.replace(/[#/]+/g, "-").replace(/^-|-$/g, "") || "inicio";
    await p.screenshot({ path: `tests/mobile/out/${PRE}-${dev}-${nome}.png`, fullPage: true });
  }
  await p.context().close();
}
await b.close();
