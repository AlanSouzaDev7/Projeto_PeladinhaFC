/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* Gera um PDF a partir de uma página HTML local (com o Chrome instalado ou o Chromium do Playwright).
   Uso: node scripts/gerar-pdf.mjs docs/funcionalidades-premium.html docs/FUNCIONALIDADES-PREMIUM.pdf */
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = await import(pathToFileURL(path.join(RAIZ, "node_modules", "playwright", "index.mjs")).href);
const [entrada, saida] = process.argv.slice(2);
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}).catch(() => chromium.launch({ channel: "chrome" }));
const page = await browser.newPage();
await page.goto(pathToFileURL(path.resolve(RAIZ, entrada)).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: path.resolve(RAIZ, saida), format: "A4", printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log("PDF gravado em", saida);
