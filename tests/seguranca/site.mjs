/* Testes de invasão do site (navegador). Simula dados maliciosos chegando pelas fontes externas
   (manchetes, notícias, ESPN), endereços forjados, armazenamento local adulterado e o site dentro de
   moldura de outro endereço. Nada pode executar código nem quebrar a página.
   Uso: python -m http.server 5174 --bind 127.0.0.1  e depois  node tests/seguranca/site.mjs */
import { chromium, webkit, devices } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:5174";
const erros = [], ok = (c, m) => (c ? console.log("ok ·", m) : erros.push(m));

// carga maliciosa: tenta executar código de várias formas; se alguma rodar, window.__xss fica marcado
const P = {
  img: `<img src=x onerror="window.__xss='img'">`,
  svg: `"><svg onload="window.__xss='svg'">`,
  js: "javascript:window.__xss='link'",
  js2: " \tJaVaScRiPt:window.__xss='link2'",
  data: "data:text/html,<script>window.__xss='data'</script>",
  rtl: "Flamengo‮gnp.exe",
};
const agora = Math.floor(Date.now() / 1000);
const manchetes = { updated: "x", items: [
  { title: P.img, link: P.js, source: P.svg, ts: agora, clubes: ["flamengo"] },
  { title: `Gol ${P.svg}`, link: P.js2, source: "ge", ts: agora, clubes: ["__proto__"] },
  { title: P.rtl, link: P.data, source: "UOL", ts: agora },
  { title: "Manchete normal do teste", link: "https://ge.globo.com/", source: "ge", ts: agora },
  { title: "Outra manchete", link: "https://www.lance.com.br/", source: "Lance!", ts: agora },
] };
const noticias = { flamengo: [{ title: P.img, link: P.js, source: P.svg, ts: agora, tag: P.img }] };

async function cenario(L, nome, opts) {
  const b = await L.launch(L === chromium ? { channel: "chrome" } : {});
  const ctx = await b.newContext({ ...opts, locale: "pt-BR" });
  const p = await ctx.newPage();
  const bloqueios = [];
  p.on("console", (m) => { if (/bloqueado pela política/.test(m.text())) bloqueios.push(m.text()); });
  p.on("dialog", (d) => { erros.push(`${nome}: abriu uma caixa de diálogo (${d.message()})`); d.dismiss(); });

  // 1) páginas normais: nenhuma violação da política de segurança (nada legítimo foi bloqueado)
  for (const rota of ["#/", "#/clubes", "#/clube/flamengo", "#/clube/cruzeiro/elenco", "#/tabela", "#/simulador", "#/bora-pro-jogo", "#/sobre"]) {
    await p.goto(`${BASE}/?s=${Date.now()}${rota}`, { waitUntil: "load" });
    await p.waitForTimeout(900);
  }
  ok(!bloqueios.length, `${nome}: páginas abrem sem nada legítimo bloqueado pela política de segurança${bloqueios.length ? ` (${bloqueios.slice(0, 3).join(" | ")})` : ""}`);
  const csp = await p.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || "");
  ok(/script-src 'self'/.test(csp) && /object-src 'none'/.test(csp) && /base-uri 'none'/.test(csp), `${nome}: política de segurança de conteúdo ativa`);
  ok(await p.evaluate(() => ![...document.scripts].some((s) => !s.src)), `${nome}: nenhum script embutido no HTML`);

  // 2) código injetado direto na página não roda (a política bloqueia atributos de evento)
  await p.evaluate(() => { const d = document.createElement("div"); d.innerHTML = `<img src="x" onerror="window.__xss='injetado'">`; document.body.append(d); });
  await p.waitForTimeout(600);
  ok(!(await p.evaluate(() => window.__xss)), `${nome}: marcação injetada na página não executa`);

  // 3) dados maliciosos chegando pelas fontes (arquivo de dados do robô e ESPN)
  await p.route(/js\/live-data\.js/, async (r) => {
    const res = await r.fetch(); let s = await res.text();
    const i = s.indexOf("{"), j = s.lastIndexOf("}");
    const d = JSON.parse(s.slice(i, j + 1));
    d.manchetes = manchetes; d.news = { ...(d.news || {}), ...noticias };
    d.__proto__poluido = 1;
    const txt = JSON.stringify(d).replace('"__proto__poluido":1', '"__proto__":{"poluido":1}');
    r.fulfill({ body: `${s.slice(0, i)}${txt};\n`, contentType: "application/javascript" });
  });
  await p.route(/site(\.web)?\.api\.espn\.com\/.*scoreboard/, async (r) => {
    let d; try { d = await (await r.fetch()).json(); } catch { d = { events: [] }; }
    for (const ev of d.events || []) { const c = ev.competitions?.[0]; if (c?.status?.type) c.status.type.shortDetail = P.img; if (c?.status) c.status.displayClock = P.svg; }
    r.fulfill({ body: JSON.stringify(d), contentType: "application/json" });
  });
  for (const rota of ["#/", "#/clube/flamengo", "#/tabela"]) {
    await p.goto(`${BASE}/?s=${Date.now()}${rota}`, { waitUntil: "load" });
    await p.waitForTimeout(2200);
    const r = await p.evaluate(() => ({
      xss: window.__xss || null,
      img: document.querySelectorAll('img[src="x"], svg[onload], [onerror], [onload]').length,
      links: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /^\s*(javascript|data|vbscript):/i.test(h)).length,
      poluido: ({}).poluido,
      faixa: document.querySelectorAll(".tk-item").length,
      rtl: /‮/.test(document.body.innerText),
    }));
    ok(!r.xss && !r.img, `${nome} ${rota}: manchete/placar com código malicioso não executa nem vira elemento`);
    ok(!r.links, `${nome} ${rota}: nenhum link "javascript:" ou "data:" na página`);
    ok(r.poluido === undefined, `${nome} ${rota}: dado com "__proto__" não contamina os objetos do site`);
    ok(!r.rtl, `${nome} ${rota}: caracteres de inversão de texto removidos`);
    if (rota === "#/") ok(r.faixa >= 5, `${nome}: a faixa continua funcionando com as manchetes limpas (${r.faixa} itens)`);
  }
  // os links da faixa: os maliciosos viraram "#", os normais continuam
  const hrefs = await p.evaluate(() => [...document.querySelectorAll(".tk-copy:first-child .tk-item")].map((a) => a.getAttribute("href")));
  ok(hrefs.filter((h) => h === "#").length === 3 && hrefs.includes("https://ge.globo.com/"), `${nome}: links perigosos neutralizados, os normais preservados (${hrefs.join(" , ")})`);
  const rels = await p.evaluate(() => [...document.querySelectorAll('a[target="_blank"]')].every((a) => /noopener/.test(a.rel) && /noreferrer/.test(a.rel)));
  ok(rels, `${nome}: todo link que abre outra aba vai isolado (noopener noreferrer)`);
  await p.unroute(/js\/live-data\.js/); await p.unroute(/site(\.web)?\.api\.espn\.com\/.*scoreboard/);

  // 4) endereços forjados
  for (const h of [`#/clube/${P.img}`, `#/partida/${P.svg}`, `#/bora-pro-jogo/${P.svg}/x`, `#/tabela/${P.img}`, "#/clube/__proto__", "#/clube/constructor", "#/../../etc/passwd"]) {
    await p.goto(`${BASE}/?s=${Date.now()}${h}`, { waitUntil: "load" });
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => ({ xss: window.__xss || null, el: document.querySelectorAll('img[src="x"], svg[onload], [onerror], [onload]').length, view: !!document.querySelector("#view")?.children.length }));
    ok(!r.xss && !r.el && r.view, `${nome}: endereço forjado ${h.slice(0, 34)}… não executa e a página continua de pé`);
  }

  // 5) armazenamento local adulterado
  await p.evaluate((x) => { for (const k of Object.keys(localStorage)) localStorage.removeItem(k); localStorage.setItem("placar:theme", JSON.stringify(x)); localStorage.setItem("placar:bora:flamengo", JSON.stringify({ name: x, __proto__x: 1 })); }, P.svg);
  await p.goto(`${BASE}/?s=${Date.now()}#/bora-pro-jogo`, { waitUntil: "load" }); await p.waitForTimeout(800);
  const t = await p.evaluate(() => ({ tema: document.documentElement.dataset.theme, xss: window.__xss || null }));
  ok((t.tema === "dark" || t.tema === "light") && !t.xss, `${nome}: tema adulterado no armazenamento é ignorado (ficou "${t.tema}")`);
  await p.evaluate(() => localStorage.clear());

  // 6) as defesas não podem ser desligadas por outro script
  const trava = await p.evaluate(() => { const a = JSON.parse; try { JSON.parse = (x) => x; } catch {} return JSON.parse === a && JSON.parse('{"t":"<b>"}').t === "‹b›" && Object.isFrozen(window.SEG); });
  ok(trava, `${nome}: limpeza de dados travada (não pode ser trocada) e funcionando`);
  const urls = await p.evaluate(() => [SEG.url("javascript:alert(1)"), SEG.url(" java\tscript:x"), SEG.url("https://user:senha@ge.globo.com/"), SEG.url("https://ge.globo.com/a?b=1"), SEG.url("#/clube/flamengo"), SEG.url("//evil.example/"), SEG.url("\\\\evil.example"), SEG.url("/\\evil.example")]);
  ok(urls[0] === "#" && urls[1] === "#" && urls[2] === "#" && urls[3] === "https://ge.globo.com/a?b=1" && urls[4] === "#/clube/flamengo" && urls[5] === "#" && urls[6] === "#" && urls[7] === "#", `${nome}: validação de endereços (${urls.join(" , ")})`);

  // 7) o site dentro de moldura (iframe) de outro endereço fica escondido
  await p.route("http://site-falso.test/", (r) => r.fulfill({ contentType: "text/html", body: `<h1>site falso</h1><iframe id="f" src="${BASE}/#/" width="800" height="600"></iframe>` }));
  await p.goto("http://site-falso.test/", { waitUntil: "load" }); await p.waitForTimeout(1500);
  const fr = p.frames().find((f) => f.url().startsWith(BASE));
  const esc = fr ? await fr.evaluate(() => getComputedStyle(document.documentElement).display).catch(() => "none") : "none";
  ok(esc === "none" || !p.url().startsWith("http://site-falso.test"), `${nome}: dentro de moldura de outro site, a página não aparece (proteção contra clique disfarçado)`);
  await b.close();
}

await cenario(chromium, "pc", { viewport: { width: 1440, height: 900 } });
await cenario(webkit, "iphone", devices["iPhone 15"]);
await cenario(chromium, "pixel", devices["Pixel 7"]);

if (erros.length) { console.log(`\n${erros.length} falha(s):\n- ` + erros.join("\n- ")); process.exit(1); }
console.log("\nTodos os testes de invasão do site passaram.");
