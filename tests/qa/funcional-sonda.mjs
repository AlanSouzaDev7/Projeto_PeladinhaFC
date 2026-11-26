/* Sonda: imprime texto e estrutura de uma rota (apoio do QA funcional). Uso: BASE=... node tests/qa/funcional-sonda.mjs "#/tabela" [js] */
import { chromium } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:5182";
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR", reducedMotion: "reduce" });
await ctx.route(/workers\.dev\/dados\//, (r) => r.fulfill({ status: 404, body: "" }));
const p = await ctx.newPage();
p.on("requestfailed", (r) => console.log("REQFAIL", r.url().slice(0, 150), r.failure()?.errorText));
p.on("response", (r) => { if (r.status() >= 400) console.log("HTTP", r.status(), r.url().slice(0, 150)); });
p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
p.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)); });
await p.goto(`${BASE}/${process.argv[2] || "#/"}`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(+process.env.ESPERA || 3000);
if (process.argv[3]) console.log(JSON.stringify(await p.evaluate(process.argv[3]), null, 1));
else console.log((await p.evaluate(() => document.querySelector("#view, main")?.innerText || document.body.innerText)).slice(0, +process.env.MAX || 4000));
await b.close();
