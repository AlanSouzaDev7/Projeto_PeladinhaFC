/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* ==========================================================================
   CazéStats.TV — fluxos de uso em vários aparelhos (emulação Playwright: Chrome e WebKit)
   · teclado / controle remoto de TV: Tab percorre o topo com foco visível, Enter abre a página;
   · busca: digitar um clube, escolher o resultado e cair na página dele (desktop e celular);
   · menu de baixo no celular: tocar em "Tabela" abre a tabela;
   · tema claro/escuro continua depois de recarregar;
   · zoom de 200% (1280x720 com o dobro de densidade = 640x360 CSS): nada rola para os lados;
   · menos movimento (prefers-reduced-motion): a faixa de notícias fica parada;
   · rede caindo no meio do uso: aviso de sem internet e a página continua navegável; ao voltar, atualiza.
   Uso: BASE=http://localhost:5173 node tests/qa/fluxos.mjs
   ========================================================================== */
import { chromium, webkit } from "playwright";

const BASE = process.env.BASE || "http://localhost:5173";
const res = [];
const ok = (cond, perfil, nome, extra = "") => { res.push({ perfil, nome, ok: !!cond, extra }); console.log(`${cond ? "ok  " : "FALHOU"} · ${perfil} · ${nome}${extra ? ` (${extra})` : ""}`); };
const PERFIS = [
  ["Desktop Chrome 1366x768", chromium, { viewport: { width: 1366, height: 768 } }],
  ["TV 1920x1080 (teclado/controle)", chromium, { viewport: { width: 1920, height: 1080 } }],
  ["iPhone 390x844 (WebKit)", webkit, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ["Android 360x640 (Chrome)", chromium, { viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ["iPad 820x1180 (WebKit)", webkit, { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
];
const lancados = new Map();
const abre = async (motor) => { if (!lancados.has(motor)) lancados.set(motor, await (motor === webkit ? webkit.launch() : chromium.launch({ channel: "chrome" }))); return lancados.get(motor); };

for (const [perfil, motor, opcoes] of PERFIS) {
  const b = await abre(motor);
  const ctx = await b.newContext({ ...opcoes, locale: "pt-BR" });
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(e.message));
  await p.goto(`${BASE}/?estatico#/`, { waitUntil: "load" });
  await p.waitForTimeout(1500);

  // teclado: os 12 primeiros Tabs param em elementos visíveis e com indicador de foco
  if (!opcoes.hasTouch) {
    const focos = [];
    for (let i = 0; i < 12; i++) {
      await p.keyboard.press("Tab");
      focos.push(await p.evaluate(() => {
        const el = document.activeElement; if (!el || el === document.body) return { ok: false, el: "body" };
        const s = getComputedStyle(el), r = el.getBoundingClientRect();
        const marca = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
        return { ok: marca && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight, el: `${el.tagName.toLowerCase()} ${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 20)}` };
      }));
    }
    const sem = focos.filter((f) => !f.ok);
    ok(!sem.length, perfil, "Tab: foco sempre visível no topo da página", sem.map((f) => f.el).slice(0, 4).join(", "));
    // Enter num item do menu abre a página (uso com controle remoto: setas/Tab + OK)
    await p.focus('.nav a[data-nav="tabela"]');
    await p.keyboard.press("Enter");
    await p.waitForTimeout(1200);
    ok(/#\/tabela/.test(p.url()) && (await p.locator("h1").first().innerText()).length > 0, perfil, "Enter no menu abre a Tabela");
  }

  // busca: clube pelo nome
  await p.goto(`${BASE}/?estatico#/`, { waitUntil: "load" });
  await p.waitForTimeout(1200);
  const campo = p.locator("#search");
  if (await campo.isVisible()) {
    await campo.click();
    await campo.fill("cruzeiro");
    await p.waitForTimeout(700);
    const n = await p.locator("#search-results a, #search-results [role=option]").count();
    if (n) { await p.keyboard.press("ArrowDown").catch(() => {}); await p.locator("#search-results a, #search-results [role=option]").first().click(); }
    await p.waitForTimeout(1200);
    ok(n > 0 && /cruzeiro/.test(p.url()), perfil, "Busca: digitar \"cruzeiro\" e abrir o resultado", `${n} resultados → ${p.url().split("#")[1] || ""}`);
  } else {
    // no celular a busca fica atrás de um botão
    const botao = p.locator('[aria-label*="Buscar" i]:visible, .search-toggle:visible').first();
    if (await botao.count()) {
      await botao.click(); await p.waitForTimeout(400);
      const c2 = p.locator("input[type=search]:visible").first();
      await c2.fill("cruzeiro"); await p.waitForTimeout(700);
      const r = p.locator("#search-results a:visible, [role=option]:visible").first();
      const n = await r.count();
      if (n) await r.tap().catch(() => r.click());
      await p.waitForTimeout(1200);
      ok(n > 0 && /cruzeiro/.test(p.url()), perfil, "Busca (celular): abrir, digitar e tocar no resultado", p.url().split("#")[1] || "");
    } else ok(false, perfil, "Busca (celular): botão de busca visível");
  }

  // menu de baixo (celular e tablet em retrato)
  const menuBaixo = p.locator(".bottom-nav:visible");
  if (await menuBaixo.count()) {
    const alvo = menuBaixo.locator('a[href="#/tabela"]').first();
    const box = await alvo.boundingBox();
    await alvo.tap().catch(() => alvo.click());
    await p.waitForTimeout(1200);
    ok(/#\/tabela/.test(p.url()), perfil, "Menu de baixo: tocar em Tabela", box ? `alvo ${Math.round(box.width)}x${Math.round(box.height)} px` : "");
    // área segura (iPhone com notch/Dynamic Island): o menu usa env(safe-area-inset-bottom)
    const seguro = await p.evaluate(() => [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => /safe-area-inset-bottom/.test(r.cssText)); } catch { return false; } }));
    ok(seguro, perfil, "Menu de baixo respeita a área segura (safe-area-inset)");
  }

  // tema: troca e continua depois de recarregar
  const antes = await p.evaluate(() => document.documentElement.dataset.theme || "");
  await p.locator("#theme").click();
  await p.waitForTimeout(300);
  const depois = await p.evaluate(() => document.documentElement.dataset.theme || "");
  await p.reload({ waitUntil: "load" }); await p.waitForTimeout(800);
  const apos = await p.evaluate(() => document.documentElement.dataset.theme || "");
  ok(antes !== depois && depois === apos, perfil, "Tema claro/escuro troca e continua depois de recarregar", `${antes || "padrão"} → ${depois} → ${apos}`);

  ok(!erros.length, perfil, "Nenhum erro de JavaScript durante os fluxos", erros.slice(0, 2).join(" | "));
  await ctx.close();
}

// zoom de 200% e menos movimento
{
  const b = await abre(chromium);
  const ctx = await b.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 2, reducedMotion: "reduce", locale: "pt-BR" });
  const p = await ctx.newPage();
  for (const h of ["#/", "#/tabela", "#/clube/flamengo", "#/rodada", "#/bolao"]) {
    await p.goto(`${BASE}/${h}`, { waitUntil: "load" }); await p.waitForTimeout(1300);
    const r = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
    ok(r.sw <= r.vw + 1, "Zoom 200% (1280x720)", `sem rolar para os lados em ${h}`, `${r.sw}/${r.vw}`);
  }
  await p.goto(`${BASE}/#/`, { waitUntil: "load" }); await p.waitForTimeout(1500);
  const anda = await p.evaluate(() => { const c = document.querySelector(".tk-copy, .tk-track"); return c ? getComputedStyle(c).animationPlayState + "/" + getComputedStyle(c).animationName : "sem faixa"; });
  const pos1 = await p.evaluate(() => document.querySelector(".tk-track, .tk-copy")?.getBoundingClientRect().left);
  await p.waitForTimeout(1500);
  const pos2 = await p.evaluate(() => document.querySelector(".tk-track, .tk-copy")?.getBoundingClientRect().left);
  ok(pos1 === pos2, "Menos movimento", "a faixa de notícias fica parada", `${anda}; ${pos1} → ${pos2}`);
  await ctx.close();
}

// rede caindo no meio do uso (Chrome, celular)
{
  const b = await abre(chromium);
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "pt-BR" });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/#/`, { waitUntil: "load" }); await p.waitForTimeout(2500); // o service worker guarda o necessário
  await p.goto(`${BASE}/#/tabela`, { waitUntil: "load" }); await p.waitForTimeout(1500);
  await ctx.setOffline(true);
  await p.evaluate(() => { location.hash = "#/clube/palmeiras"; }); await p.waitForTimeout(1500);
  const off = await p.evaluate(() => ({ view: !!document.querySelector("#view")?.children.length, aviso: /sem internet|sem conexão|offline/i.test(document.body.innerText) }));
  ok(off.view, "Rede caindo (Android)", "sem internet: navegar para outro clube continua funcionando");
  ok(off.aviso, "Rede caindo (Android)", "sem internet: aparece um aviso");
  await ctx.setOffline(false);
  await p.waitForTimeout(2500);
  const volta = await p.evaluate(() => !/sem internet: mostrando/i.test(document.body.innerText));
  ok(volta, "Rede caindo (Android)", "a internet voltou: o aviso some");
  await ctx.close();
}
for (const b of lancados.values()) await b.close();
const f = res.filter((r) => !r.ok);
console.log(`\n${res.length - f.length} de ${res.length} verificações passaram`);
