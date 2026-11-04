/* Prints de identidade visual: início e página de clube, tema escuro e claro, PC e celular.
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  BASE=http://127.0.0.1:5173 node tests/mobile/visual.mjs [rota...] */
import { chromium, devices } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:5173";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const ROUTES = process.argv.slice(2).length ? process.argv.slice(2) : ["#/", "#/clube/cruzeiro"];
const b = await chromium.launch({ channel: "chrome" });
for (const [dev, opts] of [["pc", { viewport: { width: 1440, height: 900 } }], ["pixel7", devices["Pixel 7"]]]) {
  for (const theme of ["dark", "light"]) {
    const ctx = await b.newContext({ ...opts, locale: "pt-BR", colorScheme: theme });
    await ctx.addInitScript((t) => { try { localStorage.setItem("placar:theme", JSON.stringify(t)); } catch {} }, theme);
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    for (const r of ROUTES) {
      await p.goto(`${BASE}/?estatico&v=${Date.now()}${r}`, { waitUntil: "load" });
      await p.waitForTimeout(2500);
      if (dev === "pc") { await p.mouse.move(380, 520); await p.waitForTimeout(200); }
      const f = `${OUT}visual-${dev}-${theme}-${r.replace(/[#/]+/g, "-").replace(/^-|-$/g, "") || "inicio"}.png`;
      await p.screenshot({ path: f });
      console.log(f, errs.length ? errs : "");
    }
    await ctx.close();
  }
}
await b.close();
