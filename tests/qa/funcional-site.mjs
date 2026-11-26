/* QA funcional exploratório do site (celular 390x844 e computador 1366x900).
   Tabela (contas e ordem), cartões do campeonato, artilharia nas três páginas, clubes e abas, jogador, busca, comparar,
   rodada (seleção 4-3-3 e craque), partidas, copas, bolão (servidor simulado), compartilhar (canvas sem contaminar),
   tema claro/escuro (contraste), voltar/avançar, recarregar, rotas inexistentes e erros de JavaScript/rede.
   Uso: BASE=http://127.0.0.1:5182 node tests/qa/funcional-site.mjs [celular|computador]
   Saída: tests/qa/out/funcional/site-<perfil>.json */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:5182";
const OUT = new URL("./out/funcional/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
mkdirSync(OUT, { recursive: true });
const PERFIS = { celular: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, computador: { viewport: { width: 1366, height: 900 } } };
const so = process.argv[2];
const b = await chromium.launch({ channel: "chrome" });
const geral = {};

for (const [perfil, vp] of Object.entries(PERFIS)) {
  if (so && so !== perfil) continue;
  console.log(`\n===== ${perfil} =====`);
  const R = { falhas: [], avisos: [], ok: [], erros: [], rede: [] };
  const falha = (m) => { R.falhas.push(m); console.log("FALHA ·", m); };
  const aviso = (m) => { R.avisos.push(m); console.log("aviso ·", m); };
  const ok = (m) => { R.ok.push(m); console.log("ok    ·", m); };
  const ctx = await b.newContext({ ...vp, locale: "pt-BR", timezoneId: "America/Sao_Paulo", reducedMotion: "reduce" });
  await ctx.route(/workers\.dev\/dados\//, (r) => r.fulfill({ status: 404, body: "" }));
  const p = await ctx.newPage();
  let rota = "";
  p.on("pageerror", (e) => R.erros.push(`[${rota}] pageerror: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) R.erros.push(`[${rota}] console: ${m.text().slice(0, 200)}`); });
  p.on("response", (r) => { const u = r.url(); if (u.startsWith(BASE) && r.status() >= 400 && !/\/api\//.test(u)) R.rede.push(`[${rota}] ${r.status()} ${u.replace(BASE, "")}`); });
  p.on("requestfailed", (r) => { const u = r.url(); if (u.startsWith(BASE) && !/\/api\//.test(u) && !/ERR_ABORTED/.test(r.failure()?.errorText || "")) R.rede.push(`[${rota}] falhou ${u.replace(BASE, "")} ${r.failure()?.errorText}`); });
  const vai = async (h, espera = 1800) => { rota = h; await p.evaluate((x) => { location.hash = x; }, h).catch(() => {}); await p.waitForTimeout(espera); };
  const texto = () => p.evaluate(() => document.querySelector("#view").innerText);
  const lixo = async (onde) => {
    const t = await texto();
    const m = t.match(/.{0,40}\b(NaN|undefined|Infinity|\[object Object\])\b.{0,40}/);
    if (m) falha(`${onde}: texto com "${m[1]}": …${m[0].replace(/\s+/g, " ")}…`);
    if (/Carregando…|Montando o resumo…|Escalando…/.test(t)) {
      await p.waitForTimeout(6000);
      const t2 = await texto();
      const mm = t2.match(/.{0,60}(Carregando…|Montando o resumo…|Escalando…).{0,20}/);
      if (mm) aviso(`${onde}: ainda "${mm[1]}" depois de 8 s: …${mm[0].replace(/\s+/g, " ")}…`);
    }
    const sx = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (sx > 2) falha(`${onde}: rolagem lateral de ${sx}px`);
  };

  await p.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded" });
  rota = "#/";
  await p.waitForTimeout(3500);
  await lixo("home");

  /* ---------- A. tabela ---------- */
  await vai("#/tabela", 2500);
  const tab = await p.evaluate(() => {
    const rows = [...document.querySelectorAll("#view table.table tbody tr")].map((tr) => [...tr.children].map((td) => td.innerText.trim()));
    const kpis = [...document.querySelectorAll("#view .kpi, #view [class*=kpi]")].map((k) => k.innerText.replace(/\s+/g, " ").trim());
    return { rows, kpis, head: [...document.querySelectorAll("#view table.table thead th")].map((t) => t.innerText.trim()) };
  });
  const H = tab.head.map((h) => h.toUpperCase());
  const col = (n) => H.indexOf(n);
  const linhas = tab.rows.map((r) => {
    const g = (n) => (col(n) >= 0 ? parseInt(String(r[col(n)]).replace("+", ""), 10) : NaN);
    return { pos: parseInt(r[0], 10), nome: r[1].split("\n")[0].trim(), p: g("P"), j: g("J"), v: g("V"), e: g("E"), d: g("D"), gp: g("GP"), gc: g("GC"), sg: g("SG"), pct: g("%"), ca: g("CA"), cv: g("CV") };
  });
  if (linhas.length !== 20) falha(`tabela: ${linhas.length} linhas (esperado 20)`);
  const completa = !Number.isNaN(linhas[0]?.v) && (await p.locator("#view table.table td.hide-sm").first().isVisible().catch(() => false));
  let errosConta = 0;
  for (const l of linhas) {
    if (completa) {
      if (l.p !== 3 * l.v + l.e) { errosConta++; falha(`tabela ${l.nome}: P ${l.p} != 3V+E ${3 * l.v + l.e}`); }
      if (l.j !== l.v + l.e + l.d) { errosConta++; falha(`tabela ${l.nome}: J ${l.j} != V+E+D`); }
      if (l.sg !== l.gp - l.gc) { errosConta++; falha(`tabela ${l.nome}: SG ${l.sg} != GP-GC ${l.gp - l.gc}`); }
      const pct = Math.round((l.p / (3 * l.j)) * 100);
      if (Math.abs(pct - l.pct) > 1) { errosConta++; falha(`tabela ${l.nome}: % ${l.pct} x ${pct}`); }
    }
  }
  for (let i = 1; i < linhas.length; i++) {
    const a = linhas[i - 1], c = linhas[i];
    if (a.pos >= c.pos) falha(`tabela: posição ${a.pos} antes de ${c.pos}`);
    const ka = completa ? [a.p, a.v, a.sg, a.gp] : [a.p, a.sg], kc = completa ? [c.p, c.v, c.sg, c.gp] : [c.p, c.sg];
    const k = ka.findIndex((x, n) => x !== kc[n]);
    if (k >= 0 && ka[k] < kc[k]) falha(`tabela ordem: ${a.nome} (${ka}) acima de ${c.nome} (${kc})`);
  }
  if (completa) {
    const soma = (k) => linhas.reduce((s, l) => s + l[k], 0);
    if (soma("gp") !== soma("gc")) falha(`tabela: soma GP ${soma("gp")} != soma GC ${soma("gc")}`);
    const kp = tab.kpis.join(" | ");
    const gols = kp.match(/GOLS\s+(\d+)/i), jogos = kp.match(/(\d+)\s+jogos/i);
    if (gols && +gols[1] !== soma("gp")) falha(`tabela: cartão GOLS ${gols[1]} x soma GP ${soma("gp")}`);
    if (jogos && +jogos[1] !== soma("j") / 2) falha(`tabela: cartão "${jogos[1]} jogos" x soma J/2 ${soma("j") / 2}`);
    const maxCA = Math.max(...linhas.map((l) => l.ca)), maxCV = Math.max(...linhas.map((l) => l.cv));
    const am = kp.match(/MAIS AMARELOS\s+(\d+)\s+([^|]+?)\s+Ver/i), vm = kp.match(/MAIS VERMELHOS\s+(\d+)\s+([^|]+?)\s+Ver/i);
    if (am && +am[1] !== maxCA) falha(`tabela: MAIS AMARELOS ${am[1]} x maior CA da tabela ${maxCA}`);
    if (am && !linhas.some((l) => l.ca === maxCA && l.nome === am[2].trim())) falha(`tabela: MAIS AMARELOS clube ${am[2]} não tem CA ${maxCA}`);
    if (vm && +vm[1] !== maxCV) falha(`tabela: MAIS VERMELHOS ${vm[1]} x maior CV ${maxCV}`);
    const at = kp.match(/MELHOR ATAQUE\s+(\d+)\s+([^|]+?)\s+Ver/i);
    if (at) { const best = [...linhas].sort((x, y) => y.gp / y.j - x.gp / x.j)[0]; if (best.nome !== at[2].trim()) aviso(`tabela: MELHOR ATAQUE ${at[2]} (${at[1]}) x maior média ${best.nome} (${best.gp}/${best.j})`); }
    const df = kp.match(/MELHOR DEFESA\s+(\d+)\s+([^|·]+?)\s+·/i);
    if (df) { const best = [...linhas].sort((x, y) => x.gc / x.j - y.gc / y.j)[0]; if (best.nome !== df[2].trim()) aviso(`tabela: MELHOR DEFESA ${df[2]} x menor média ${best.nome}`); }
    if (!errosConta) ok(`tabela: 20 linhas com P, J, SG e % coerentes; cartões do topo batem`);
  } else ok(`tabela (compacta no ${perfil}): ordem por P/SG conferida`);
  await lixo("tabela");

  // rankings
  for (const rk of ["ataque", "defesa", "amarelos", "vermelhos"]) {
    await vai(`#/tabela/${rk}`, 1500);
    const vals = await p.evaluate(() => [...document.querySelectorAll("#view .rk-row, #view .rank-row, #view ol li, #view table tbody tr")].slice(0, 20).map((e) => e.innerText.replace(/\s+/g, " ").trim()));
    if (!vals.length) aviso(`ranking ${rk}: nenhuma linha encontrada`);
    await lixo(`ranking ${rk}`);
  }

  /* ---------- B. artilharia ---------- */
  const artTabela = await (async () => {
    await vai("#/tabela", 2000);
    return p.evaluate(() => {
      const card = [...document.querySelectorAll("#view .card")].find((c) => /Artilharia/i.test(c.querySelector(".card-h")?.innerText || ""));
      if (!card) return [];
      return [...card.querySelectorAll("li, .scorer, [class*=sc-]")].map((li) => li.innerText.replace(/\s+/g, " ").trim()).filter((t) => /^\d+º/.test(t));
    });
  })();
  const parseArt = (arr) => arr.map((t) => { const m = t.match(/^(\d+)º\s+(.+?)\s+(\d+)(\s|›|$)/); return m ? { pos: +m[1], nome: m[2], g: +m[3] } : null; }).filter(Boolean);
  const at = parseArt(artTabela);
  if (!at.length) aviso("artilharia (tabela): lista não encontrada");
  for (let i = 1; i < at.length; i++) if (at[i].g > at[i - 1].g) falha(`artilharia fora de ordem: ${at[i - 1].nome} ${at[i - 1].g} antes de ${at[i].nome} ${at[i].g}`);
  await vai("#/", 2500);
  const artHome = parseArt(await p.evaluate(() => {
    const card = [...document.querySelectorAll("#view .card, #view section")].find((c) => /Artilharia/i.test(c.querySelector(".card-h, h2")?.innerText || ""));
    return card ? [...card.querySelectorAll("li, .scorer, [class*=sc-]")].map((li) => li.innerText.replace(/\s+/g, " ").trim()).filter((t) => /^\d+º/.test(t)) : [];
  }));
  if (at[0] && artHome[0] && (at[0].nome !== artHome[0].nome || at[0].g !== artHome[0].g)) falha(`artilheiro nº1: tabela ${at[0].nome} ${at[0].g} x home ${artHome[0].nome} ${artHome[0].g}`);
  else if (at[0] && artHome[0]) ok(`artilheiro nº1 igual na home e na tabela: ${at[0].nome} (${at[0].g})`);
  else aviso(`artilharia na home não encontrada (${artHome.length})`);
  // clube do artilheiro
  const top = await p.evaluate(() => { const PS = window.PLAYER_STATS || window.PS; const a = PS?.artilheiros?.[0]; return a ? { id: a.id, club: a.club, name: a.name, gols: a.gols } : null; });
  if (top) {
    await vai(`#/clube/${top.club}`, 3500);
    const t = await texto();
    if (!t.includes(top.name)) falha(`página do ${top.club} não mostra o artilheiro ${top.name}`);
    else ok(`página do ${top.club} mostra ${top.name}`);
  }

  /* ---------- C. clubes e abas ---------- */
  await vai("#/clubes", 2000);
  const clubes = await p.evaluate(() => [...new Set([...document.querySelectorAll('#view a[href^="#/clube/"]')].map((a) => a.getAttribute("href").split("/")[2]))]);
  if (clubes.length < 20) falha(`clubes: ${clubes.length} links (esperado 20)`);
  const listaC = perfil === "computador" ? clubes : clubes.slice(0, 5);
  for (const c of listaC) {
    await vai(`#/clube/${c}`, 2600);
    if (/Impedimento!/.test(await texto())) { falha(`clube ${c}: página não existe`); continue; }
    await lixo(`clube ${c}`);
    const abas = await p.evaluate(() => [...document.querySelectorAll('#view .club-tabs a[href^="#/clube/"], #view [data-tabs] a[href^="#/clube/"]')].map((a) => a.getAttribute("href")));
    for (const a of [...new Set(abas)]) {
      if (a.endsWith("/mercado") || a.includes("/mercado/")) continue; // janela tem teste próprio
      await vai(a, 1600);
      await lixo(`clube ${c} aba ${a.split("/").slice(3).join("/") || "geral"}`);
    }
  }
  ok(`clubes: ${listaC.length} clubes e abas percorridos`);

  /* ---------- D. jogador, busca e comparar ---------- */
  if (top) {
    await vai(`#/jogador/${top.id}-${top.club}`, 3000);
    await lixo(`jogador ${top.name}`);
    const t = await texto();
    if (!t.includes(top.name)) falha(`página do jogador ${top.id}-${top.club} não mostra ${top.name}`);
    const nums = await p.evaluate(() => {
      const pega = (re) => { const m = document.querySelector("#view").innerText.replace(/\s+/g, " ").match(re); return m ? +m[1].replace(",", ".") : null; };
      return { gols: pega(/(\d+)\s*Gols\b/i), jogos: pega(/(\d+)\s*Jogos\b/i), chutes: pega(/(\d+)\s*(?:Finaliza|Chutes)/i), min: pega(/([\d.]+)\s*Minutos/i), idade: pega(/(\d+)\s*anos/i) };
    });
    console.log("       números na página do jogador:", JSON.stringify(nums));
    if (nums.gols != null && nums.gols !== top.gols) falha(`jogador ${top.name}: página mostra ${nums.gols} gols, artilharia ${top.gols}`);
    if (nums.idade != null && (nums.idade < 15 || nums.idade > 45)) falha(`jogador ${top.name}: idade ${nums.idade}`);
    for (const ab of ["ultimos", "temporada", "calor", "comparar"]) { await vai(`#/jogador/${top.id}-${top.club}/${ab}`, 1800); await lixo(`jogador aba ${ab}`); }
    // comparar via busca
    const cmp = p.locator("[data-jg-cmp]");
    if (await cmp.count()) {
      await cmp.fill("Pedro");
      await p.waitForTimeout(800);
      const res = p.locator("[data-jg-cmp-res] a, [data-jg-cmp-res] [role=option]").first();
      if (await res.count()) {
        const alvo = await res.innerText();
        await res.click();
        await p.waitForTimeout(1800);
        rota = await p.evaluate(() => location.hash);
        if (!/\/comparar\/.+/.test(rota)) falha(`comparar: clicar no resultado "${alvo}" não abriu a comparação (${rota})`);
        else { ok(`comparar: ${rota}`); await lixo("comparar"); }
      } else falha("comparar: busca por 'Pedro' sem resultados");
    } else aviso("comparar: campo de busca não encontrado");
  }
  // busca do topo
  await vai("#/", 1500);
  const busca = async (q) => {
    if (perfil === "celular") { const bt = p.locator("#search-btn, .search-toggle, [aria-label*='Buscar' i]").first(); if (await bt.isVisible().catch(() => false) && !(await p.locator("#search").isVisible())) await bt.click().catch(() => {}); }
    await p.locator("#search").fill("");
    await p.locator("#search").fill(q, { force: true });
    await p.waitForTimeout(900);
    return p.evaluate(() => [...document.querySelectorAll("#search-results a")].map((a) => ({ t: a.innerText.replace(/\s+/g, " ").trim(), h: a.getAttribute("href") })));
  };
  for (const q of [top?.name || "Kevin", "Flamengo", "Arrascaeta"]) {
    const res = await busca(q).catch((e) => { falha(`busca "${q}": ${e.message.split("\n")[0]}`); return null; });
    if (!res) continue;
    if (!res.length) { falha(`busca "${q}": nenhum resultado`); continue; }
    const j = res.find((r) => r.h?.startsWith("#/jogador/")) || res[0];
    await p.locator(`#search-results a[href="${j.h}"]`).first().click({ force: true }).catch(() => p.evaluate((h) => { location.hash = h; }, j.h));
    await p.waitForTimeout(2200);
    rota = await p.evaluate(() => location.hash);
    const t = await texto();
    const nome = j.t.split(/ · | — |\s{2}/)[0].trim().split(" ").slice(0, 2).join(" ");
    if (rota !== j.h) falha(`busca "${q}": clicou em ${j.h} e abriu ${rota}`);
    else if (/Impedimento!/.test(t)) falha(`busca "${q}": resultado ${j.h} abre página inexistente`);
    else if (!t.toLowerCase().includes(q.split(" ")[0].toLowerCase())) falha(`busca "${q}": página ${j.h} não menciona "${q}"`);
    else ok(`busca "${q}" → ${j.h} (${nome})`);
  }

  /* ---------- E. rodada ---------- */
  const rodadas = await p.evaluate(() => (window.PD?.ROUNDS || []).filter((r) => window.PD.realMatches(r).some((m) => m.status === "ft")));
  for (const rd of rodadas.slice(-3)) {
    await vai(`#/rodada/${rd}`, 4000);
    await lixo(`rodada ${rd}`);
    const s = await p.evaluate(() => ({ n: document.querySelectorAll("#view .rd-jogadores .rd-jg").length, notas: [...document.querySelectorAll("#view .rd-jogadores .rd-jg .nota")].map((e) => parseFloat(e.innerText.replace(",", "."))), craque: parseFloat((document.querySelector("#view .rd-craque-nota")?.innerText || "").replace(",", ".")), craqueNome: document.querySelector("#view .rd-craque b")?.innerText, linhas: [...document.querySelectorAll("#view .rd-linha")].map((l) => l.dataset.n).join("-"), dup: (() => { const hs = [...document.querySelectorAll("#view .rd-jogadores .rd-jg")].map((a) => a.getAttribute("href")); return hs.length - new Set(hs).size; })() }));
    if (!s.n) { aviso(`rodada ${rd}: seleção não montada`); continue; }
    if (s.n !== 11) falha(`rodada ${rd}: seleção com ${s.n} jogadores`);
    if (s.linhas !== "3-3-4-1") falha(`rodada ${rd}: linhas ${s.linhas} (esperado F3-M3-D4-G1)`);
    if (s.dup) falha(`rodada ${rd}: ${s.dup} jogador(es) repetidos na seleção`);
    const mx = Math.max(...s.notas);
    if (s.craque !== mx) falha(`rodada ${rd}: craque ${s.craqueNome} nota ${s.craque} mas a maior nota da seleção é ${mx}`);
    else ok(`rodada ${rd}: 11 jogadores (${s.linhas}), craque ${s.craqueNome} ${s.craque} é a maior nota`);
    // jogos da rodada
    const jogos = await p.evaluate(() => [...document.querySelectorAll('#view .rd-jogos a[href^="#/partida/"]')].map((a) => a.getAttribute("href")));
    for (const j of jogos.slice(0, perfil === "computador" ? 10 : 2)) { await vai(j, 2200); await lixo(`partida ${j}`); }
  }

  /* ---------- F. copas ---------- */
  const copas = await p.evaluate(() => Object.keys(window.COPA?.C || {}));
  for (const c of copas) {
    await vai(`#/copa/${c}`, 2200);
    if (/Impedimento!/.test(await texto())) { falha(`copa ${c}: página não existe`); continue; }
    await lixo(`copa ${c}`);
    const abas = await p.evaluate((c) => [...new Set([...document.querySelectorAll(`#view a[href^="#/copa/${c}/"]`)].map((a) => a.getAttribute("href")))].slice(0, 10), c);
    for (const a of abas) { await vai(a, 1300); await lixo(`copa ${a}`); }
  }
  ok(`copas: ${copas.length} competições (${copas.join(", ")})`);

  /* ---------- G. outras páginas ---------- */
  for (const h of ["#/simulador", "#/bolao", "#/bora-pro-jogo", "#/previsao", "#/xg", "#/pergunte", "#/status", "#/creditos", "#/sobre", "#/privacidade", "#/widgets"]) { await vai(h, 2000); if (/Impedimento!/.test(await texto())) falha(`${h}: página não existe`); await lixo(h); }

  /* ---------- H. simulador ---------- */
  await vai("#/simulador", 2500);
  const sim = await p.evaluate(() => {
    const b1 = document.querySelector("#view [data-sim] button, #view .sim-btn, #view [data-r]");
    return { botoes: document.querySelectorAll("#view button").length, primeiro: b1?.outerHTML.slice(0, 160) || null };
  });
  console.log("       simulador:", JSON.stringify(sim));

  /* ---------- I. compartilhar ---------- */
  const cpRotas = ["#/tabela", "#/", top ? `#/jogador/${top.id}-${top.club}` : null, rodadas.length ? `#/rodada/${rodadas.at(-1)}` : null, "#/bolao"].filter(Boolean);
  const visto = new Set();
  for (const h of cpRotas) {
    await vai(h, 4000);
    const btns = await p.evaluate(() => [...document.querySelectorAll("[data-cp]")].map((b) => [b.dataset.cp, b.dataset.cpId || ""]));
    for (const [tipo, id] of btns) {
      const k = `${tipo}|${id}`; if (visto.has(k)) continue; visto.add(k);
      const r = await p.evaluate(async ([tipo, id]) => {
        try {
          const card = await window.COMPARTILHAR._monta(tipo, id);
          const cv = card.canvas || card;
          const url = cv.toDataURL("image/png");
          return { ok: url.startsWith("data:image/png") && url.length > 5000, w: cv.width, h: cv.height, len: url.length };
        } catch (e) { return { erro: String(e.message || e) }; }
      }, [tipo, id]);
      if (r.erro) falha(`compartilhar ${tipo}(${id}) em ${h}: ${r.erro}`);
      else if (!r.ok) falha(`compartilhar ${tipo}(${id}): imagem vazia (${r.len} bytes)`);
      else ok(`compartilhar ${tipo}(${id}): ${r.w}x${r.h}`);
    }
    // cliques repetidos: uma janela só
    if (btns.length) {
      const bt = p.locator("[data-cp]").first();
      await bt.scrollIntoViewIfNeeded().catch(() => {});
      for (let i = 0; i < 5; i++) await bt.click({ force: true, timeout: 2000 }).catch(() => {});
      await p.waitForTimeout(7000);
      const dl = await p.evaluate(() => ({ n: document.querySelectorAll("dialog.cp-dlg").length, abertos: document.querySelectorAll("dialog.cp-dlg[open]").length, img: document.querySelector("dialog.cp-dlg[open] img")?.naturalWidth || 0 }));
      if (dl.n > 1 || dl.abertos > 1) falha(`compartilhar em ${h}: ${dl.n} janelas (${dl.abertos} abertas) depois de 5 cliques`);
      else if (!dl.abertos) falha(`compartilhar em ${h}: clicar não abriu a pré-visualização`);
      else if (!dl.img) falha(`compartilhar em ${h}: pré-visualização sem imagem`);
      else ok(`compartilhar em ${h}: 5 cliques → 1 janela com imagem`);
      await p.keyboard.press("Escape");
      await p.waitForTimeout(300);
    }
  }

  /* ---------- J. tema e contraste ---------- */
  for (const tema of ["dark", "light"]) {
    for (const h of ["#/", "#/tabela", top ? `#/clube/${top.club}` : "#/clubes", top ? `#/jogador/${top.id}-${top.club}` : "#/", "#/copa/libertadores"]) {
      await vai(h, 1800);
      await p.evaluate((t) => { if (document.documentElement.dataset.theme !== t) document.querySelector("#theme").click(); }, tema);
      await p.waitForTimeout(700);
      const ruins = await p.evaluate(() => {
        const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; let [r, g, b, a = 1] = m.map(Number); if (c.startsWith("color(")) { r *= 255; g *= 255; b *= 255; } const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return { L: 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b), a, rgb: [r, g, b] }; };
        const fundo = (el) => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.backgroundImage !== "none") return null; const c = lum(s.backgroundColor); if (c && c.a > 0.9) return c; } return lum(getComputedStyle(document.body).backgroundColor); };
        const out = [];
        for (const el of document.querySelectorAll("#view *")) {
          if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.data.trim().length > 1)) continue;
          const r = el.getBoundingClientRect(); if (el.closest(".tab, .tabs, svg, .chip, [aria-selected], .on, .active")) continue; if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight * 3) continue;
          const s = getComputedStyle(el); if (s.visibility === "hidden" || +s.opacity < 0.3) continue;
          const c = lum(s.color), f = fundo(el); if (!c || !f || c.a < 0.5) continue;
          const ratio = (Math.max(c.L, f.L) + 0.05) / (Math.min(c.L, f.L) + 0.05);
          if (ratio < 3) out.push(`${ratio.toFixed(2)} "${(el.textContent || "").trim().slice(0, 30)}" <${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}> cor ${s.color} fundo rgb(${f.rgb})`);
        }
        return out;
      });
      if (ruins.length) aviso(`tema ${tema} ${h}: ${ruins.length} textos com contraste < 3:1, ex.: ${ruins.slice(0, 3).join(" | ")}`);
    }
  }
  await p.evaluate(() => { if (document.documentElement.dataset.theme !== "dark") document.querySelector("#theme").click(); });

  /* ---------- K. voltar/avançar e recarregar ---------- */
  await vai("#/", 1200); await vai("#/tabela", 1200); await vai(top ? `#/clube/${top.club}` : "#/clubes", 2500);
  await p.goBack(); await p.waitForTimeout(1500);
  rota = await p.evaluate(() => location.hash);
  if (rota !== "#/tabela" || !(await p.locator("#view table.table").count())) falha(`voltar: esperado #/tabela com a tabela, veio ${rota}`); else ok("voltar → #/tabela");
  await p.goForward(); await p.waitForTimeout(2500);
  if (top && !(await texto()).includes(top.name)) falha("avançar: página do clube sem conteúdo");
  for (const h of ["#/tabela/amarelos", top ? `#/jogador/${top.id}-${top.club}/temporada` : "#/", rodadas.length ? `#/rodada/${rodadas.at(-1)}` : "#/", "#/copa/libertadores", "#/clube/flamengo/mercado/reforcos"]) {
    rota = h;
    await p.goto(`${BASE}/${h}`, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3000);
    const t = await texto();
    if (/Impedimento!/.test(t) || t.trim().length < 50) falha(`recarregar em ${h}: página vazia ou inexistente`); else ok(`link direto ${h} abre`);
  }

  /* ---------- L. rotas inexistentes ---------- */
  for (const h of ["#/naoexiste", "#/clube/xyz", "#/jogador/000-xyz", "#/partida/123", "#/rodada/999", "#/copa/xyz", "#/tabela/xyz", "#/clube/flamengo/xyz", "#/<script>", "#/rodada/abc", "#/jogador/", "#/clube/"]) {
    await vai(h, 1500);
    const t = await texto();
    const errosAntes = R.erros.filter((e) => e.startsWith(`[${h}]`)).length;
    if (errosAntes) falha(`rota ${h}: erro de JavaScript (${R.erros.find((e) => e.startsWith(`[${h}]`))})`);
    else if (!t.trim()) falha(`rota ${h}: página em branco`);
    else if (/Impedimento!/.test(t)) ok(`rota ${h}: "Impedimento!"`);
    else aviso(`rota ${h}: não mostra "Impedimento!" (mostra: ${t.replace(/\s+/g, " ").slice(0, 90)})`);
  }

  /* ---------- M. bolão com servidor simulado ---------- */
  const palpites = [];
  await ctx.route(/workers\.dev\/bolao\//, async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith("/bolao/eu")) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ apelido: "teste", palpites, ligas: [], pontos: 0 }) });
    if (u.pathname.endsWith("/bolao/palpite") && r.request().method() === "PUT") { const c = JSON.parse(r.request().postData() || "{}"); palpites.push({ ...c, pontos: null }); return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, palpite: c }) }); }
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ linhas: [], ranking: [], ok: true }) });
  });
  await ctx.route(/workers\.dev\/conta\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await p.evaluate(() => localStorage.setItem("cazestats:conta", JSON.stringify({ sessao: "sessao-de-teste", nome: "Teste", foto: "" })));
  const prox = await p.evaluate(() => { for (const r of window.PD?.ROUNDS || []) { const m = window.PD.realMatches(r).find((x) => x.status !== "ft" && x.status !== "progress" && x.espn); if (m) return m.id; } return null; });
  if (prox) {
    rota = `#/partida/${prox}`;
    await p.goto(`${BASE}/#/partida/${prox}`, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3500);
    const card = p.locator("[data-bolao]");
    if (!(await card.count())) aviso(`bolão: partida ${prox} sem cartão de palpite`);
    else {
      await card.scrollIntoViewIfNeeded();
      const mais = card.locator('[data-bl-passo="casa"][data-d="1"]');
      if (!(await mais.count())) falha(`bolão: cartão sem botões de placar (logado com servidor simulado): ${(await card.innerText()).slice(0, 120)}`);
      else {
        await mais.click(); await mais.click();
        await card.locator('[data-bl-passo="fora"][data-d="1"]').click();
        await card.locator('[data-bl-passo="fora"][data-d="-1"]').click();
        await card.locator('[data-bl-passo="fora"][data-d="-1"]').click(); // não pode ficar negativo
        const g = await card.evaluate((c) => [c.querySelector('[data-bl-gols="casa"]').textContent, c.querySelector('[data-bl-gols="fora"]').textContent]);
        if (g[0] !== "2" || g[1] !== "0") falha(`bolão: placar depois de +2/+1-2 = ${g.join("x")} (esperado 2x0)`);
        await card.locator('[data-bl="salvar"]').click(); await p.waitForTimeout(1500);
        const msg = await card.innerText();
        if (!palpites.length) falha("bolão: salvar não enviou o palpite");
        else if (palpites[0].casa !== 2 || palpites[0].fora !== 0) falha(`bolão: enviado ${JSON.stringify(palpites[0])}`);
        else ok(`bolão: palpite 2x0 enviado e card diz "${msg.replace(/\s+/g, " ").slice(0, 80)}"`);
      }
    }
  } else aviso("bolão: nenhum jogo futuro com id da ESPN");
  await p.evaluate(() => localStorage.removeItem("cazestats:conta"));

  /* ---------- N. offline ---------- */
  await vai("#/", 1500);
  await ctx.setOffline(true);
  await p.evaluate(() => window.dispatchEvent(new Event("offline")));
  await p.waitForTimeout(1500);
  const off = await p.evaluate(() => { const el = [...document.querySelectorAll("body *")].find((e) => /sem (conexão|internet)|offline|desconectad/i.test(e.textContent || "") && e.children.length < 4 && e.getBoundingClientRect().height > 0); return el ? el.textContent.trim().slice(0, 80) : null; });
  if (!off) falha("offline: nenhum aviso visível de sem conexão"); else ok(`offline: aviso "${off}"`);
  await ctx.setOffline(false);
  await p.evaluate(() => window.dispatchEvent(new Event("online")));
  await p.waitForTimeout(1500);
  const off2 = await p.evaluate(() => [...document.querySelectorAll("body *")].some((e) => /sem (conexão|internet)/i.test(e.textContent || "") && e.children.length < 4 && e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== "hidden"));
  if (off2) aviso("offline: aviso continua visível depois de voltar a conexão (1,5 s)");

  R.erros = [...new Set(R.erros)]; R.rede = [...new Set(R.rede)];
  console.log(`\nerros JS (${R.erros.length}):\n  ` + R.erros.slice(0, 40).join("\n  "));
  console.log(`rede same-origin (${R.rede.length}):\n  ` + R.rede.slice(0, 40).join("\n  "));
  geral[perfil] = R;
  writeFileSync(`${OUT}site-${perfil}.json`, JSON.stringify(R, null, 1));
  await ctx.close();
}
await b.close();
const nf = Object.values(geral).reduce((s, r) => s + r.falhas.length + r.erros.length, 0);
console.log(`\n${nf ? `${nf} falhas/erros` : "sem falhas"}`);
process.exitCode = nf ? 1 : 0;
