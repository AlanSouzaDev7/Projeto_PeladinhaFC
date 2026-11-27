/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* ==========================================================================
   CazéStats.TV — QA da troca entre o banco e os demais do elenco (aba Janela → Escalação), no celular e no computador
   Trocar pelo botão (escolhe um, depois o outro), arrastar um dos demais para cima de alguém do banco, a escolha fica
   depois de recarregar, o reserva que entra no campo deixa a vaga no banco para o titular que saiu, "Escalar sozinho"
   refaz o banco, sem rolagem para os lados e sem erros.
   Uso: BASE=http://localhost:5173 node tests/qa/janela-banco.mjs   (CLUBE=flamengo para outro clube)
   ========================================================================== */
import { chromium } from "playwright";
const BASE = process.env.BASE || "http://localhost:5173";
const CID = process.env.CLUBE || "cruzeiro";
const res = [];
const ok = (c, nome, extra = "") => { res.push(!!c); console.log(`${c ? "ok    " : "FALHOU"} · ${nome}${extra ? ` (${extra})` : ""}`); };
const b = await chromium.launch({ channel: "chrome" });
const listas = (p) => p.evaluate(() => ({
  banco: [...document.querySelectorAll("[data-jt-lista-banco] .jt-res")].map((x) => x.dataset.jtPoe),
  demais: [...document.querySelectorAll("[data-jt-lista-demais] .jt-res")].map((x) => x.dataset.jtPoe),
  campo: [...document.querySelectorAll(".jt-ficha")].map((f) => f.getAttribute("aria-label")),
}));

for (const [perfil, vp] of [["celular", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }], ["computador", { width: 1366, height: 900 }]]) {
  const { width, height, ...resto } = vp;
  const ctx = await b.newContext({ viewport: { width, height }, ...resto, locale: "pt-BR" });
  if (!process.env.USAR_BANCO) await ctx.route(/workers\.dev\/dados\//, (r) => r.fulfill({ status: 404, body: "" }));
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(e.message));
  const abre = async () => {
    await p.goto(`${BASE}/?x=${Date.now()}#/clube/${CID}/mercado/escalacao`, { waitUntil: "load" });
    await p.waitForSelector(`[data-jt="${CID}"] :is(.jt-esc, .jt-escolha)`, { timeout: 60000 });
    if (await p.locator(".jt-escolha").isVisible().catch(() => false)) await p.click('[data-jt-modo="manager"]');
    await p.waitForSelector("[data-jt-lista-banco] .jt-res", { timeout: 60000 });
  };
  await abre();
  let L = await listas(p);
  ok(L.banco.length === 12 && L.demais.length > 0, `${perfil}: banco com 12 e os demais do elenco listados`, `${L.banco.length} no banco, ${L.demais.length} demais`);

  // 1) botão: um dos demais, depois alguém do banco
  const d0 = L.demais[0], b0 = L.banco[0];
  await p.click(`[data-jt-bt="${d0}"]`);
  const dica = await p.locator(".jt-banco-dica").innerText();
  const marcado = await p.locator(`[data-jt-bt="${d0}"]`).getAttribute("aria-pressed");
  ok(marcado === "true" && /quem sai do banco/.test(dica), `${perfil}: tocar em Trocar escolhe o jogador e diz o que fazer`, dica.slice(0, 70));
  await p.click(`[data-jt-bt="${b0}"]`);
  await p.waitForTimeout(300);
  L = await listas(p);
  ok(L.banco.includes(d0) && L.demais.includes(b0) && L.banco.length === 12, `${perfil}: o dos demais entra no banco e o do banco vai para os demais`);

  // 2) cancelar a escolha tocando de novo
  await p.click(`[data-jt-bt="${L.banco[1]}"]`); await p.click(`[data-jt-bt="${L.banco[1]}"]`);
  ok(!(await p.locator('.jt-troca[aria-pressed="true"]').count()), `${perfil}: tocar de novo cancela a escolha`);

  // 3) arrastar um dos demais para cima de alguém do banco (mouse no computador; toque segurando no celular)
  const d1 = L.demais[0], b1 = L.banco[2];
  const de = await p.locator(`[data-jt-lista-demais] [data-jt-poe="${d1}"]`).boundingBox(), para = await p.locator(`[data-jt-lista-banco] [data-jt-poe="${b1}"]`).boundingBox();
  if (perfil === "computador") {
    await p.mouse.move(de.x + 40, de.y + de.height / 2); await p.mouse.down();
    await p.mouse.move(de.x + 60, de.y + de.height / 2 + 10, { steps: 4 });
    await p.mouse.move(para.x + 60, para.y + para.height / 2, { steps: 12 }); await p.mouse.up();
    await p.waitForTimeout(400);
    L = await listas(p);
    ok(L.banco.includes(d1) && L.demais.includes(b1), `${perfil}: arrastar um dos demais para cima de alguém do banco troca os dois`);
  }

  // 4) a escolha continua depois de recarregar
  const antes = (await listas(p)).banco.join();
  await abre();
  ok((await listas(p)).banco.join() === antes, `${perfil}: o banco escolhido continua depois de recarregar`);

  // 5) reserva do banco entra no campo: o titular que saiu fica com a vaga dele no banco
  L = await listas(p);
  await p.locator('.jt-ficha[data-jt-slot="10"]').click();
  const saiNome = (await p.locator('.jt-ficha[data-jt-slot="10"]').getAttribute("aria-label")).split(": ")[1];
  const entra = L.banco[3];
  await p.locator(`[data-jt-lista-banco] [data-jt-poe="${entra}"]`).click();
  await p.waitForTimeout(400);
  const L2 = await listas(p);
  const nomesBanco = await p.locator("[data-jt-lista-banco] .jt-res > span:not(.jt-av) > b").allInnerTexts();
  ok(!L2.banco.includes(entra) && nomesBanco[3] === saiNome && L2.banco.length === 12, `${perfil}: quem sai do campo fica na vaga do reserva que entrou`, `${saiNome} → posição ${nomesBanco.indexOf(saiNome) + 1} do banco`);

  // 6) "Escalar sozinho" refaz o banco pelos que mais jogaram
  await p.click("[data-jt-auto-esc]"); await p.waitForTimeout(400);
  ok((await listas(p)).banco.length === 12, `${perfil}: "Escalar sozinho" refaz o banco com 12`);

  const sobra = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(sobra <= 1, `${perfil}: sem rolagem para os lados`, `${sobra} px`);
  await p.click(`[data-jt-bt="${(await listas(p)).demais[0]}"]`);
  await p.locator(".jt-banco-bloco").screenshot({ path: `tests/qa/out/janela/${perfil}-banco.png` }).catch(() => {});
  ok(!erros.length, `${perfil}: nenhum erro de JavaScript`, erros.slice(0, 2).join(" | "));
  await ctx.close();
}
await b.close();
console.log(`\n${res.filter(Boolean).length} de ${res.length} verificações passaram`);
process.exitCode = res.every(Boolean) ? 0 : 1;
