/* Contraste do texto do topo dos 20 clubes sobre a cena animada (o que se vê de verdade, com a sombra).
   Fotografa o topo com o texto escondido, lê os pixels atrás do nome, dos dados e da frase e calcula o
   contraste com a cor do texto (pixel 90% mais claro, para não contar estrelinhas soltas). Meta: ≥ 4,5:1.
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/topo-contraste.mjs */
import { chromium, devices } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const IDS = (process.env.CLUBES || "athletico-pr,atletico-mg,bahia,botafogo,bragantino,chapecoense,corinthians,coritiba,cruzeiro,flamengo,fluminense,gremio,internacional,mirassol,palmeiras,remo,santos,sao-paulo,vasco,vitoria").split(",");
const b = await chromium.launch({ channel: "chrome" });
const ruins = [];
for (const [dev, opts] of [["pc", { viewport: { width: 1440, height: 900 } }], ["pixel", devices["Pixel 7"]]]) {
  const p = await (await b.newContext({ ...opts, colorScheme: "dark" })).newPage();
  for (const id of IDS) {
    for (const t of [3, 9]) { // durante a cena e depois que ela assenta
      await p.goto(`${BASE}/?cena=${t}&z=${id}${t}#/clube/${id}`, { waitUntil: "load" });
      await p.waitForTimeout(3300); // a frase (e a tarja dela) aparece ~2,7 s depois do placar
      const boxes = await p.evaluate(() => {
        const sel = { nome: ".hero h1", dados: ".hero .facts", frase: ".gb-motto b" }, out = {};
        for (const [k, s] of Object.entries(sel)) { const e = document.querySelector(s); const r = e.getBoundingClientRect(); out[k] = { r: [r.left, r.top, r.width, r.height], c: getComputedStyle(e).color }; }
        document.querySelectorAll(".hero-text, .gb-motto > *, .hero-gb .gb").forEach((e) => (e.style.visibility = "hidden"));
        return out;
      });
      await p.waitForTimeout(60);
      const png = (await p.screenshot()).toString("base64");
      const res = await p.evaluate(async ({ png, boxes }) => {
        const img = new Image(); img.src = "data:image/png;base64," + png; await img.decode();
        const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
        const g = cv.getContext("2d"); g.drawImage(img, 0, 0);
        const k = img.width / innerWidth;
        const L = ([r, gg, bb]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(bb); };
        const out = {};
        for (const [name, { r: [x, y, w, h], c }] of Object.entries(boxes)) {
          const d = g.getImageData(x * k, y * k, Math.max(1, w * k), Math.max(1, h * k)).data, ls = [];
          for (let i = 0; i < d.length; i += 4 * 7) ls.push(L([d[i], d[i + 1], d[i + 2]]));
          ls.sort((a, b) => a - b);
          const bg = ls[Math.floor(ls.length * 0.9)] || 0, fg = L(c.match(/\d+/g).map(Number));
          out[name] = +((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)).toFixed(1);
        }
        return out;
      }, { png, boxes });
      const pior = Math.min(...Object.values(res));
      const linha = `${dev.padEnd(5)} ${id.padEnd(13)} cena ${t}s  nome ${res.nome}:1  dados ${res.dados}:1  frase ${res.frase}:1`;
      console.log(linha + (pior < 4.5 ? "   ← abaixo de 4,5" : ""));
      if (pior < 4.5) ruins.push(linha);
    }
  }
  await p.context().close();
}
console.log(ruins.length ? `\n${ruins.length} casos abaixo de 4,5:1` : "\ntodos ≥ 4,5:1");
await b.close();
