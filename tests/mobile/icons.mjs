/* gera os ícones PNG (tela inicial do iPhone/Android) a partir de assets/logo-mark.svg */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const svg = readFileSync(new URL("../../assets/logo-mark.svg", import.meta.url), "utf8");
const browser = await chromium.launch({ channel: "chrome" });
for (const size of [180, 192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  // ícone de tela inicial: fundo cheio (o sistema arredonda os cantos sozinho)
  await page.setContent(`<body style="margin:0;background:#3b4fe0">${svg.replace('<rect width="48" height="48" rx="14"', '<rect width="48" height="48" rx="0"').replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body>`);
  await page.screenshot({ path: new URL(`../../assets/icon-${size}.png`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1") });
  await page.close();
}
await browser.close();
console.log("ícones gerados");
