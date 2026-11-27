/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* ==========================================================================
   CazéStats.TV — QA só da aba Janela (janela de transferências), em celular 390x844 e computador 1366x900.
   1) recarregar a página não perde nada: modo escolhido, etapa, decisões, filtros dos reforços e rolagem;
      entrar de novo pela aba Janela ainda pergunta o modo; depois de 12 h o recarregar volta à escolha de modo;
   2) fotos: os homônimos da ESPN (o mesmo id para duas pessoas) mostram cada um a foto baixada para o próprio clube;
   3) rótulos de cria da base e o selo "conferido no elenco";
   4) sem rolagem para os lados e sem erro de JavaScript.
   Uso: BASE=http://localhost:5173 node tests/qa/janela.mjs   (com os dados da verificação em dados/)
   ========================================================================== */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:5173";
const OUT = new URL("./out/janela/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
mkdirSync(OUT, { recursive: true });
const res = [];
const ok = (cond, nome, extra = "") => { res.push({ nome, ok: !!cond }); console.log(`${cond ? "ok    " : "FALHOU"} · ${nome}${extra ? ` (${extra})` : ""}`); };
const b = await chromium.launch({ channel: "chrome" });

for (const [perfil, vp] of [["celular", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }], ["computador", { width: 1366, height: 900 }]]) {
  console.log(`\n=== ${perfil} ===`);
  const { width, height, ...resto } = vp;
  const ctx = await b.newContext({ viewport: { width, height }, ...resto, locale: "pt-BR" });
  // os dados vêm da cópia em dados/ deste computador (com a verificação recém-rodada), não do banco publicado (D1)
  if (!process.env.USAR_BANCO) await ctx.route(/workers\.dev\/dados\//, (r) => r.fulfill({ status: 404, body: "" }));
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR|favicon/.test(m.text())) erros.push(m.text()); });
  const escolha = () => p.locator(".jt-escolha").isVisible();
  const espera = (sel) => p.waitForSelector(sel, { timeout: 20000 });

  // 1) primeira visita: pergunta o modo
  await p.goto(`${BASE}/#/clube/cruzeiro/mercado`, { waitUntil: "load" });
  await espera(".jt-escolha");
  ok(await escolha(), `${perfil}: primeira visita pela aba Janela pergunta o modo`);
  await p.click('[data-jt-modo="real"]');
  await espera(".jt-cards");
  ok(/#\/clube\/cruzeiro\/mercado\/elenco$/.test(p.url()), `${perfil}: escolher o modo leva o endereço para a etapa`, p.url().split("#")[1]);
  // balancete: folha mensal em reais (ranking do ge), caixa em euros com a base do ge e a janela da CBF
  const painel = (await p.locator(".jt-stats").innerText()).replace(/\s+/g, " ");
  ok(/Folha mensal R\$ [\d,]+ mi/.test(painel) && /limite R\$ [\d,]+ mi/.test(painel), `${perfil}: folha mensal e limite em reais`, painel.match(/Folha mensal[^·]+/)?.[0]);
  ok(/Caixa disponível € [\d,]+ (mi|mil)/.test(painel) && /média do que o clube gastou/.test(painel) && /; ge\)/.test(painel), `${perfil}: caixa em euros com a base do ge`);
  ok(/1ª janela de 2027: 04\/01\/2027 a 02\/03\/2027/.test(await p.locator(".jt-mesa-tit small").innerText()), `${perfil}: datas da janela pelo calendário da CBF`);

  // decisão e recarregar
  const primeiro = p.locator(".jt-card").first();
  const idJ = await primeiro.getAttribute("data-jt-j");
  await primeiro.locator('[data-jt-dec]').nth(1).click();
  const decidido = await p.locator(`.jt-card[data-jt-j="${idJ}"] [aria-checked="true"]`).getAttribute("data-jt-dec");
  await p.reload({ waitUntil: "load" });
  await espera(".jt-cards");
  ok(!(await escolha()), `${perfil}: recarregar no elenco NÃO volta para a escolha de modo`);
  ok(await p.locator(`.jt-card[data-jt-j="${idJ}"] [aria-checked="true"]`).getAttribute("data-jt-dec") === decidido, `${perfil}: a decisão continua depois de recarregar`, decidido);

  // 2) reforços: filtros e rolagem
  await p.goto(`${BASE}/#/clube/cruzeiro/mercado/reforcos`);
  await espera('[data-jt-f="q"]');
  await p.fill('[data-jt-f="q"]', "silva");
  await p.waitForTimeout(600);
  const posBtn = p.locator("[data-jt-pos]").nth(2);
  const posVal = await posBtn.getAttribute("data-jt-pos");
  await posBtn.click();
  await p.waitForTimeout(400);
  await p.mouse.wheel(0, 900);
  await p.waitForTimeout(700);
  const rolou = await p.evaluate(() => Math.round(scrollY));
  await p.reload({ waitUntil: "load" });
  await espera('[data-jt-f="q"]');
  await p.waitForTimeout(1800);
  ok(await p.inputValue('[data-jt-f="q"]') === "silva", `${perfil}: a busca dos reforços continua depois de recarregar`);
  ok(await p.locator(`[data-jt-pos="${posVal}"]`).first().evaluate((n) => n.classList.contains("on") || n.getAttribute("aria-pressed") === "true" || n.getAttribute("aria-checked") === "true"), `${perfil}: o filtro de posição continua`, posVal || "todas");
  const voltou = await p.evaluate(() => Math.round(scrollY));
  ok(rolou > 200 && Math.abs(voltou - rolou) < 80, `${perfil}: a rolagem volta ao mesmo ponto`, `${rolou} → ${voltou} px`);
  await p.screenshot({ path: `${OUT}${perfil}-reforcos-recarregado.png` });

  // 3) entrar de novo pela aba Janela (navegação dentro do site): pergunta o modo, com as decisões guardadas
  await p.goto(`${BASE}/#/clube/cruzeiro/geral`);
  await p.waitForTimeout(800);
  await p.locator('a.tab[href="#/clube/cruzeiro/mercado"]').click();
  await espera(".jt-escolha");
  ok(/continuam guardadas/.test(await p.locator(".jt-escolha").innerText()), `${perfil}: pela aba Janela pergunta o modo e avisa que as decisões estão guardadas`);

  // sessão vencida (mais de 12 h): recarregar na entrada da aba volta à escolha
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("cazestats:janela-sessao")); s.cruzeiro.t -= 13 * 3600e3; localStorage.setItem("cazestats:janela-sessao", JSON.stringify(s)); });
  await p.reload({ waitUntil: "load" });
  await espera(".jt-escolha");
  ok(await escolha(), `${perfil}: depois de 12 h o recarregar pergunta o modo de novo`);
  await p.click('[data-jt-modo="real"]');
  await espera(".jt-cards");

  // 4) fotos dos homônimos (id 176810 e 216098)
  const fotoDe = async (cid, id) => {
    await p.goto(`${BASE}/#/clube/${cid}/mercado/elenco`);
    // espera a tela DESTE clube (trocar de clube não recarrega a página: a do anterior ainda está lá por um instante)
    await espera(`[data-jt="${cid}"] :is(.jt-cards, .jt-escolha)`);
    if (await p.locator(`[data-jt="${cid}"] .jt-escolha`).isVisible().catch(() => false)) await p.click('[data-jt-modo="real"]');
    await espera(`[data-jt="${cid}"] .jt-cards`);
    const card = p.locator(`[data-jt="${cid}"] .jt-card[data-jt-j="${id}"]`);
    if (!(await card.count())) return "sem cartão";
    const img = card.locator(".jt-av img");
    return (await img.count()) ? (await img.getAttribute("src")) : "número";
  };
  const vCru = await fotoDe("cruzeiro", "176810"), vBot = await fotoDe("botafogo", "176810");
  ok(/jogadores\/cruzeiro\//.test(vCru), `${perfil}: Lucas Villalba do Cruzeiro com a foto do Cruzeiro`, vCru.split("/").slice(-2).join("/"));
  ok(/jogadores\/botafogo\//.test(vBot), `${perfil}: Lucas Villalba do Botafogo com a foto do Botafogo`, vBot.split("/").slice(-2).join("/"));
  const mCor = await fotoDe("corinthians", "216098"), mCru = await fotoDe("cruzeiro", "216098");
  ok(!/jogadores\/cruzeiro\//.test(mCor), `${perfil}: Matheus Pereira do Corinthians não usa a foto do Cruzeiro`, mCor.split("/").slice(-2).join("/"));
  ok(/jogadores\/cruzeiro\//.test(mCru), `${perfil}: Matheus Pereira do Cruzeiro com a foto dele`);

  // 5) rótulos de cria e selo de conferido
  await fotoDe("corinthians", "x");
  const crias = await p.locator(".jt-sit.cria").allInnerTexts();
  ok(crias.some((t) => /Cria do Terrão/.test(t)), `${perfil}: cria da base do Corinthians com o rótulo do clube`, crias.join(", "));
  await fotoDe("flamengo", "x");
  const pedro = p.locator('.jt-card:has(.jt-nome:text-is("Pedro")) .jt-sit.cria');
  ok((await pedro.count()) && /Revelado pelo Fluminense/.test(await pedro.innerText()), `${perfil}: Pedro (base no Fluminense) aparece como revelado pelo Fluminense`);
  // quem joga (10 jogos ou mais na temporada) tem de estar conferido em duas fontes; garoto da base só no cadastro da
  // ESPN fica "provável", e isso é o certo
  const titulares = await p.evaluate(() => [...document.querySelectorAll(".jt-card")].map((c) => ({ jogos: +((c.querySelector(".jt-uso small")?.textContent || "").match(/(\d+) jogos?/) || [0, 0])[1], selo: !!c.querySelector(".jt-conf") })).filter((x) => x.jogos >= 10));
  const comSelo = titulares.filter((x) => x.selo).length;
  ok(titulares.length && comSelo >= titulares.length * 0.85, `${perfil}: selo de conferido em quem joga (10+ jogos)`, `${comSelo} de ${titulares.length}`);
  const sobra = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(sobra <= 1, `${perfil}: sem rolagem para os lados`, `${sobra} px`);
  await p.locator(".jt-sit.cria").first().scrollIntoViewIfNeeded().catch(() => {});
  await p.screenshot({ path: `${OUT}${perfil}-rotulos.png` });

  // 6) link compartilhado (modo de ver) não mexe na sessão
  const antes = await p.evaluate(() => localStorage.getItem("cazestats:janela-sessao"));
  await p.goto(`${BASE}/#/clube/flamengo/mercado/vr0-`);
  await p.waitForTimeout(2500);
  ok(await p.evaluate(() => localStorage.getItem("cazestats:janela-sessao")) === antes, `${perfil}: abrir um link compartilhado não mexe na sessão`);
  ok(!erros.length, `${perfil}: nenhum erro de JavaScript`, erros.slice(0, 2).join(" | ").slice(0, 200));
  await ctx.close();
}
await b.close();
console.log(`\n${res.filter((r) => r.ok).length} de ${res.length} verificações passaram`);
process.exit(res.every((r) => r.ok) ? 0 : 1);
