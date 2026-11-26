/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — card para compartilhar (imagem 1080 x 1350, retrato do Instagram)
     · partida: escudos, placar (ou data e hora) e a chance de vitória antes do jogo
     · jogador: nome, clube e os números da temporada
     · bolão: apelido, pontos e posição no ranking
     · artilharia: os 5 primeiros, cada um na faixa do clube (js/arte-artilharia.js)
   Desenhado num <canvas> no próprio aparelho (nada vai para servidor). No celular abre o menu de compartilhar
   (WhatsApp, Instagram...); onde não dá, baixa a imagem. Escudos: o mesmo arquivo da página (Wikimedia, que libera
   o uso em canvas) ou, se não carregar, o escudo desenhado pelo site.
   ========================================================================== */
(() => {
  "use strict";
  const L = 1080, A = 1350, SITE = "cazestats.pages.dev";
  const fontes = {};
  const fonte = (peso, px, tipo = "texto") => `${peso} ${px}px ${fontes[tipo] || "system-ui, sans-serif"}`;
  const pegaFontes = () => {
    const cs = getComputedStyle(document.documentElement);
    fontes.texto = cs.getPropertyValue("--font").trim() || "system-ui, sans-serif";
    fontes.titulo = cs.getPropertyValue("--font-display").trim() || fontes.texto;
  };
  const origens = {}; // quem sabe montar os dados de cada tipo (o app registra a busca do jogo)
  const esc = (t) => SEG.esc(t);

  /* ---------- desenho ---------- */
  function carregaImg(src, cors = true) {
    return new Promise((ok, falha) => {
      const im = new Image();
      if (cors) im.crossOrigin = "anonymous";
      im.onload = () => ok(im);
      im.onerror = () => falha(new Error("imagem não carregou"));
      im.src = src;
    });
  }
  async function escudo(club) {
    const src = /src="([^"]+)"/.exec(window.GFX.crest(club, 300))?.[1];
    if (src && /^https:\/\//.test(src)) { try { return await carregaImg(src); } catch { /* cai no desenhado */ } }
    const svg = window.GFX.svgCrest(club, 300);
    const url = URL.createObjectURL(new Blob([svg.includes("xmlns") ? svg : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"')], { type: "image/svg+xml" }));
    try { return await carregaImg(url, false); } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
  }
  function fundo(ctx, c1, c2) {
    const g = ctx.createLinearGradient(0, 0, L, A);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, L, A);
    const v = ctx.createLinearGradient(0, 0, 0, A); // escurece para o texto ler bem sobre qualquer cor de clube
    v.addColorStop(0, "rgba(8,8,12,0.55)"); v.addColorStop(0.55, "rgba(8,8,12,0.72)"); v.addColorStop(1, "rgba(8,8,12,0.92)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, L, A);
  }
  function texto(ctx, t, x, y, { peso = 800, px = 48, tipo = "texto", cor = "#fff", alinha = "center", max = L - 120 } = {}) {
    let tam = px;
    ctx.font = fonte(peso, tam, tipo);
    while (ctx.measureText(t).width > max && tam > 18) { tam -= 2; ctx.font = fonte(peso, tam, tipo); }
    ctx.fillStyle = cor; ctx.textAlign = alinha; ctx.textBaseline = "alphabetic";
    ctx.fillText(t, x, y);
  }
  function moldura(ctx, subtitulo) {
    texto(ctx, "CazéStats.TV", 70, 120, { px: 52, tipo: "titulo", alinha: "left" });
    if (subtitulo) texto(ctx, subtitulo, L - 70, 118, { peso: 700, px: 30, cor: "rgba(255,255,255,0.75)", alinha: "right", max: 520 });
    ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(70, A - 150, L - 140, 2);
    texto(ctx, SITE, L / 2, A - 85, { peso: 700, px: 34, cor: "rgba(255,255,255,0.85)" });
  }
  function barra(ctx, x, y, w, h, partes) {
    let px = x;
    for (const [p, cor] of partes) { const lw = (w * p) / 100; ctx.fillStyle = cor; ctx.fillRect(px, y, Math.max(0, lw - 4), h); px += lw; }
  }
  const novoCanvas = () => { const c = document.createElement("canvas"); c.width = L; c.height = A; return c; };

  async function cardPartida(m) {
    const h = byId[m.home], a = byId[m.away], cv = novoCanvas(), ctx = cv.getContext("2d");
    fundo(ctx, h.colors[0], a.colors[0]);
    moldura(ctx, `Brasileirão · ${m.round}ª rodada`);
    const [eh, ea] = await Promise.all([escudo(h), escudo(a)]);
    ctx.drawImage(eh, 110, 300, 340, 340); ctx.drawImage(ea, L - 450, 300, 340, 340);
    texto(ctx, h.name, 280, 710, { px: 44, max: 400 }); texto(ctx, a.name, L - 280, 710, { px: 44, max: 400 });
    const comecou = m.status === "ft" || (m.status === "progress" && m.hs != null);
    if (comecou) {
      texto(ctx, `${m.hs}  x  ${m.as}`, L / 2, 905, { px: 190, tipo: "titulo" });
      texto(ctx, m.status === "ft" ? "Fim de jogo" : `Ao vivo${m.clock ? ` · ${m.clock}` : ""}`, L / 2, 990, { peso: 700, px: 40, cor: m.status === "ft" ? "rgba(255,255,255,0.8)" : "#7CFF9B" });
    } else {
      texto(ctx, "x", L / 2, 520, { px: 90, cor: "rgba(255,255,255,0.7)" });
      texto(ctx, m.time ? `${m.date ? m.date.split("-").reverse().slice(0, 2).join("/") + " · " : ""}${m.time}` : "Horário a definir", L / 2, 880, { px: 70, tipo: "titulo" });
      if (window.CHANCE && window.CLUB_FORM) {
        const c = CHANCE.calcula(m), [pc, pe, pf] = CHANCE._cem([c.casa, c.empate, c.fora]);
        texto(ctx, "Chance de vitória", L / 2, 1000, { peso: 700, px: 34, cor: "rgba(255,255,255,0.75)" });
        barra(ctx, 110, 1030, L - 220, 22, [[pc, h.colors[0] === "#ffffff" ? h.colors[1] : h.colors[0]], [pe, "rgba(255,255,255,0.45)"], [pf, a.colors[0] === "#ffffff" ? a.colors[1] : a.colors[0]]]);
        texto(ctx, `${pc}%`, 110, 1110, { px: 48, alinha: "left" }); texto(ctx, `${pe}%`, L / 2, 1110, { px: 48 }); texto(ctx, `${pf}%`, L - 110, 1110, { px: 48, alinha: "right" });
      }
    }
    if (m.venue) texto(ctx, m.venue, L / 2, 1170, { peso: 600, px: 32, cor: "rgba(255,255,255,0.7)" });
    return { canvas: cv, nome: `${h.id}-x-${a.id}` };
  }
  async function cardJogador(key) {
    const p = window.JOGADOR?.get(key);
    if (!p) throw new Error("jogador não encontrado");
    const c = byId[p.cid], cv = novoCanvas(), ctx = cv.getContext("2d");
    fundo(ctx, c.colors[0], c.colors[1] || c.colors[0]);
    moldura(ctx, "Temporada");
    ctx.drawImage(await escudo(c), L / 2 - 170, 210, 340, 340);
    if (p.num != null) texto(ctx, `#${p.num}`, L / 2, 640, { peso: 800, px: 54, cor: "rgba(255,255,255,0.7)" });
    texto(ctx, p.nome, L / 2, 740, { px: 110, tipo: "titulo" });
    texto(ctx, c.name, L / 2, 810, { peso: 700, px: 40, cor: "rgba(255,255,255,0.8)" });
    // os números são os do topo da página do jogador (jogos, minutos, gols, assistências da temporada)
    const ks = [...document.querySelectorAll(`[data-jogador="${CSS.escape(key)}"] [data-jg-kpis] .jg-k`)].map((k) => [k.querySelector("b")?.textContent.trim(), k.querySelector("small")?.textContent.trim()]).filter(([v, l]) => v && l).slice(0, 4);
    ks.forEach(([v, l], i) => {
      const x = 70 + ((L - 140) / ks.length) * (i + 0.5);
      texto(ctx, v, x, 1010, { px: 96, tipo: "titulo", max: (L - 140) / ks.length - 20 });
      texto(ctx, l, x, 1070, { peso: 700, px: 32, cor: "rgba(255,255,255,0.75)", max: (L - 140) / ks.length - 20 });
    });
    return { canvas: cv, nome: `${p.cid}-${p.nome}` };
  }
  async function cardComparacao(chaves) {
    const [ka, kb] = String(chaves).split("|"), pa = window.JOGADOR?.get(ka), pb = window.JOGADOR?.get(kb);
    const card = document.querySelector(`[data-cmp-a="${CSS.escape(ka)}"][data-cmp-b="${CSS.escape(kb)}"]`);
    if (!pa || !pb || !card) throw new Error("abra a comparação para compartilhar");
    const ca = byId[pa.cid], cb = byId[pb.cid], cv = novoCanvas(), ctx = cv.getContext("2d");
    fundo(ctx, ca.colors[0], cb.colors[0]);
    moldura(ctx, "Comparação · por 90 minutos");
    const [ea, eb] = await Promise.all([escudo(ca), escudo(cb)]);
    ctx.drawImage(ea, 120, 190, 200, 200); ctx.drawImage(eb, L - 320, 190, 200, 200);
    texto(ctx, pa.nome, 220, 450, { px: 50, tipo: "titulo", max: 420 }); texto(ctx, pb.nome, L - 220, 450, { px: 50, tipo: "titulo", max: 420 });
    texto(ctx, "x", L / 2, 320, { px: 80, cor: "rgba(255,255,255,0.6)" });
    // as linhas por 90 minutos da própria comparação (as que têm número dos dois lados)
    const linhas = [...card.querySelectorAll(".jg-cmp-l li")].map((li) => {
      const b = li.querySelectorAll(":scope > b"), nome = li.querySelector(".jg-cl > span")?.textContent.replace("/90", "").trim();
      return { nome, a: b[0]?.textContent.trim(), b: b[1]?.textContent.trim(), m: li.className };
    }).filter((x) => x.nome && /,/.test(`${x.a}${x.b}`)).slice(0, 8);
    linhas.forEach((x, i) => {
      const y = 560 + i * 72;
      ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fillRect(90, y - 46, L - 180, 60);
      texto(ctx, x.a, 150, y, { px: 40, alinha: "left", cor: x.m.includes("m-a") ? "#7CFF9B" : "#fff" });
      texto(ctx, x.nome, L / 2, y, { peso: 600, px: 30, cor: "rgba(255,255,255,0.85)", max: 520 });
      texto(ctx, x.b, L - 150, y, { px: 40, alinha: "right", cor: x.m.includes("m-b") ? "#7CFF9B" : "#fff" });
    });
    texto(ctx, card.querySelector("[data-cmp-veredito]")?.textContent || "", L / 2, A - 190, { px: 34, max: L - 160 });
    return { canvas: cv, nome: `${pa.nome}-x-${pb.nome}` };
  }
  async function cardRodada(rd) {
    const PD = window.PD, jogos = (PD?.realMatches?.(Number(rd)) || []).filter((m) => m.status === "ft");
    if (!jogos.length) throw new Error("rodada sem jogos encerrados");
    const cv = novoCanvas(), ctx = cv.getContext("2d");
    fundo(ctx, "#0f3d2e", "#1d4ed8");
    moldura(ctx, `Brasileirão · ${rd}ª rodada`);
    texto(ctx, `Resumo da ${rd}ª rodada`, L / 2, 250, { px: 64, tipo: "titulo" });
    const lista = jogos.slice(0, 10);
    lista.forEach((m, i) => {
      const y = 340 + i * 72;
      ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fillRect(90, y - 46, L - 180, 60);
      texto(ctx, byId[m.home]?.abbr || m.home, L / 2 - 90, y, { px: 36, alinha: "right", max: 380 });
      texto(ctx, `${m.hs} x ${m.as}`, L / 2, y, { px: 40, tipo: "titulo" });
      texto(ctx, byId[m.away]?.abbr || m.away, L / 2 + 90, y, { px: 36, alinha: "left", max: 380 });
    });
    const d = document.querySelector(`[data-rodada="${CSS.escape(String(rd))}"] .rd-dest`);
    const frase = d ? [...d.querySelectorAll("li")].slice(0, 2).map((li) => li.textContent.replace(/\s+/g, " ").trim()).join(" · ") : "";
    if (frase) texto(ctx, frase, L / 2, A - 190, { peso: 600, px: 30, cor: "rgba(255,255,255,0.85)", max: L - 140 });
    return { canvas: cv, nome: `rodada-${rd}` };
  }
  /* seleção da rodada: gramado em perspectiva (faixas, linhas oficiais, luz de estádio e a espessura da borda), cada
     jogador com a foto em destaque, o escudo pequeno, a nota e o nome; embaixo, o craque da rodada em evidência */
  const NOTA_FUNDO = (n) => (n >= 8 ? "#2f6bff" : n >= 7 ? "#17a058" : n >= 6.5 ? "#79b928" : n >= 6 ? "#ee9d1c" : "#e04848");
  const nomeCurto = (n) => { const p = String(n).trim().split(/\s+/); return n.length <= 14 || p.length < 2 ? n : `${p[0][0]}. ${p[p.length - 1]}`; };
  function pilula(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  async function fichaFoto(j) {
    const A2 = window.ARTE_ARTILHARIA;
    const [f, e] = await Promise.all([A2 ? A2.fotoJogador(j.aid, j.clube).catch(() => null) : null, A2 ? A2.escudoClube(j.clube).catch(() => null) : escudo(byId[j.clube]).catch(() => null)]);
    const ini = String(j.nome).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    return { f, e, ini, cor: A2?.corDoClube(j.clube) || byId[j.clube]?.colors?.[0] || "#1f6b3a" };
  }
  // foto num círculo: recortada, do alto da cabeça ao peito; com fundo, cobrindo o círculo
  function fotoCirculo(ctx, x, y, r, d, anel, brilho) {
    ctx.save();
    ctx.shadowColor = brilho || "rgba(0,0,0,0.5)"; ctx.shadowBlur = brilho ? 34 : 18; ctx.shadowOffsetY = brilho ? 0 : 8;
    ctx.beginPath(); ctx.arc(x, y, r + anel, 0, Math.PI * 2); ctx.fillStyle = brilho ? "#f5c84b" : "#fff"; ctx.fill();
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    const g = ctx.createRadialGradient(x, y - r * 0.4, r * 0.1, x, y, r * 1.1);
    g.addColorStop(0, "rgba(255,255,255,0.35)"); g.addColorStop(0.45, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = d.cor; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    if (!d.f && d.ini) { ctx.font = fonte(800, Math.round(r * 0.72), "titulo"); ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(d.ini, x, y + r * 0.04); ctx.textBaseline = "alphabetic"; }
    if (d.f) {
      const im = d.f.im, iw = im.width, ih = im.height;
      if (d.f.recorte) { const k = (r * 2.15) / iw, w = iw * k, h = ih * k; ctx.drawImage(im, x - w / 2, y - r * 0.95, w, h); }
      else { const k = Math.max((r * 2) / iw, (r * 2) / (ih * 0.68)), w = iw * k, h = ih * k; ctx.drawImage(im, x - w / 2, y - r - h * 0.03, w, h); }
    }
    ctx.restore();
  }
  function escudoEm(ctx, im, x, y, lado) {
    if (!im) return;
    const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height, k = lado / Math.max(iw, ih);
    ctx.drawImage(im, x - (iw * k) / 2, y - (ih * k) / 2, iw * k, ih * k);
  }
  async function cardSelecao(rd) {
    const S = window.RODADA?.selecaoDa?.(Number(rd));
    if (!S) throw new Error("abra o resumo da rodada para montar a seleção");
    const cv = novoCanvas(), ctx = cv.getContext("2d");
    // fundo de estádio à noite com refletores
    const bg = ctx.createLinearGradient(0, 0, 0, A); bg.addColorStop(0, "#0e2a1b"); bg.addColorStop(0.6, "#07160e"); bg.addColorStop(1, "#040b07");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, L, A);
    for (const fx of [140, L - 140]) { const rg = ctx.createRadialGradient(fx, -40, 10, fx, -40, 760); rg.addColorStop(0, "rgba(220,255,230,0.20)"); rg.addColorStop(1, "rgba(220,255,230,0)"); ctx.fillStyle = rg; ctx.fillRect(0, 0, L, A); }
    moldura(ctx, `Brasileirão · ${rd}ª rodada`);
    texto(ctx, `SELEÇÃO DA ${rd}ª RODADA`, L / 2, 222, { px: 66, tipo: "titulo" });
    // gramado em perspectiva: (u, t) do campo -> ponto na tela (t = 0 ao fundo, 1 na frente)
    const TOP = 270, BAS = 985, WT = 640, WB = 990, pp = 0.55;
    const gy = (t) => TOP + (BAS - TOP) * (t / (1 + pp * (1 - t)));
    const P = (u, t) => { const y = gy(t), k = (y - TOP) / (BAS - TOP), w = WT + (WB - WT) * k; return [L / 2 + (u - 0.5) * w, y]; };
    const quad = (u0, t0, u1, t1) => { const a = P(u0, t0), b = P(u1, t0), c = P(u1, t1), d = P(u0, t1); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.lineTo(...d); ctx.closePath(); };
    // espessura e sombra
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 50; ctx.shadowOffsetY = 26;
    quad(-0.03, -0.02, 1.03, 1.02); ctx.fillStyle = "#123d22"; ctx.fill(); ctx.restore();
    const b0 = P(-0.03, 1.02), b1 = P(1.03, 1.02);
    ctx.beginPath(); ctx.moveTo(...b0); ctx.lineTo(...b1); ctx.lineTo(b1[0] - 6, b1[1] + 22); ctx.lineTo(b0[0] + 6, b0[1] + 22); ctx.closePath(); ctx.fillStyle = "#0c2a17"; ctx.fill();
    // faixas do corte da grama
    const N = 12;
    for (let i = 0; i < N; i++) { quad(-0.03, -0.02 + (1.04 * i) / N, 1.03, -0.02 + (1.04 * (i + 1)) / N); ctx.fillStyle = i % 2 ? "#2b7f44" : "#33914f"; ctx.fill(); }
    // luz dos refletores sobre a grama e a textura do corte
    ctx.save(); quad(-0.03, -0.02, 1.03, 1.02); ctx.clip();
    const luz = ctx.createRadialGradient(L / 2, gy(0.42), 40, L / 2, gy(0.42), 620); luz.addColorStop(0, "rgba(255,255,255,0.20)"); luz.addColorStop(1, "rgba(0,0,0,0.30)");
    ctx.fillStyle = luz; ctx.fillRect(0, TOP - 40, L, BAS - TOP + 80);
    ctx.globalAlpha = 0.05; ctx.fillStyle = "#fff"; for (let x = 0; x < L; x += 7) ctx.fillRect(x, TOP - 40, 2, BAS - TOP + 80);
    ctx.restore();
    // linhas oficiais (medidas em metros, campo de 68 x 105)
    const M = (x, y) => P(0.03 + (x / 68) * 0.94, 0.02 + (y / 105) * 0.96);
    ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 4; ctx.lineJoin = "round";
    const ret = (x, y, w, h) => { ctx.beginPath(); [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].forEach((q, k) => (k ? ctx.lineTo(...M(...q)) : ctx.moveTo(...M(...q)))); ctx.closePath(); ctx.stroke(); };
    const arco = (cx, cy, r, a0, a1) => { ctx.beginPath(); for (let k = 0; k <= 48; k++) { const a = a0 + ((a1 - a0) * k) / 48; const q = M(cx + Math.cos(a) * r, cy + Math.sin(a) * r); if (k) ctx.lineTo(...q); else ctx.moveTo(...q); } ctx.stroke(); };
    ret(0, 0, 68, 105); ctx.beginPath(); ctx.moveTo(...M(0, 52.5)); ctx.lineTo(...M(68, 52.5)); ctx.stroke(); arco(34, 52.5, 9.15, 0, Math.PI * 2);
    ret(13.84, 0, 40.32, 16.5); ret(24.84, 0, 18.32, 5.5); arco(34, 11, 9.15, 0.65, Math.PI - 0.65);
    ret(13.84, 88.5, 40.32, 16.5); ret(24.84, 99.5, 18.32, 5.5); arco(34, 94, 9.15, Math.PI + 0.65, 2 * Math.PI - 0.65);
    // jogadores: do fundo para a frente (os da frente ficam por cima)
    const linhas = [["F", 0.15], ["M", 0.4], ["D", 0.66], ["G", 0.9]];
    const todos = linhas.flatMap(([pos]) => S.time[pos]), dados = await Promise.all(todos.map(fichaFoto));
    let k = 0;
    for (const [pos, t] of linhas) {
      const js = S.time[pos], marg = 0.16 - t * 0.08;
      js.forEach((j, i) => {
        const d = dados[k++], u = js.length === 1 ? 0.5 : marg + ((1 - 2 * marg) * (i + 0.5)) / js.length, [x, y] = P(u, t), e2 = 0.78 + 0.32 * t, r = 52 * e2, craque = j === S.craque;
        fotoCirculo(ctx, x, y, r, d, 5 * e2, craque ? "rgba(245,200,75,0.85)" : null);
        if (d.e) { const er = r * 0.42, ex = x + r * 0.74, ey = y + r * 0.7; ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.restore(); escudoEm(ctx, d.e, ex, ey, er * 1.4); }
        // nota
        const nt = j.nota.toFixed(1).replace(".", ","), nw = 66 * e2, nh = 34 * e2, nx = x - r - nw * 0.25, ny = y - r - nh * 0.35;
        ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 8; pilula(ctx, nx, ny, nw, nh, 9 * e2); ctx.fillStyle = NOTA_FUNDO(j.nota); ctx.fill(); ctx.restore();
        texto(ctx, nt, nx + nw / 2, ny + nh * 0.74, { px: Math.round(24 * e2), tipo: "titulo" });
        // nome
        const nome = nomeCurto(j.nome), px = Math.round(25 * e2); ctx.font = fonte(800, px); const tw = Math.min(ctx.measureText(nome).width + 26, 230), th = 38 * e2, ty = y + r + 14 * e2;
        ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 10; pilula(ctx, x - tw / 2, ty, tw, th, th / 2);
        if (craque) { const gg = ctx.createLinearGradient(0, ty, 0, ty + th); gg.addColorStop(0, "#fbe07a"); gg.addColorStop(1, "#d6a51a"); ctx.fillStyle = gg; } else ctx.fillStyle = "rgba(6,14,9,0.82)";
        ctx.fill(); ctx.restore();
        texto(ctx, nome, x, ty + th * 0.71, { px, max: tw - 16, cor: craque ? "#2b2100" : "#fff" });
      });
    }
    // craque da rodada em evidência
    const c = S.craque, dc = dados[todos.indexOf(c)] || (await fichaFoto(c)), y0 = 1028, h0 = 150;
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
    pilula(ctx, 70, y0, L - 140, h0, 26); const cg = ctx.createLinearGradient(70, y0, L - 70, y0 + h0); cg.addColorStop(0, "#2a2208"); cg.addColorStop(1, "#14110a"); ctx.fillStyle = cg; ctx.fill(); ctx.restore();
    pilula(ctx, 70, y0, L - 140, h0, 26); ctx.strokeStyle = "rgba(245,200,75,0.85)"; ctx.lineWidth = 3; ctx.stroke();
    fotoCirculo(ctx, 160, y0 + h0 / 2, 56, dc, 5, "rgba(245,200,75,0.9)");
    texto(ctx, "★ CRAQUE DA RODADA", 250, y0 + 46, { peso: 800, px: 26, cor: "#f5c84b", alinha: "left", max: 480 });
    texto(ctx, c.nome, 250, y0 + 98, { px: 50, tipo: "titulo", alinha: "left", max: 480 });
    texto(ctx, [byId[c.clube]?.name || c.clube, c.g ? `${c.g} gol${c.g > 1 ? "s" : ""}` : "", c.a ? `${c.a} assist.` : ""].filter(Boolean).join(" · "), 250, y0 + 134, { peso: 600, px: 26, cor: "rgba(255,255,255,0.78)", alinha: "left", max: 480 });
    escudoEm(ctx, dc.e, L - 320, y0 + h0 / 2, 84);
    pilula(ctx, L - 250, y0 + 28, 150, h0 - 56, 18); ctx.fillStyle = "#f5c84b"; ctx.fill();
    texto(ctx, c.nota.toFixed(1).replace(".", ","), L - 175, y0 + h0 / 2 + 24, { px: 64, tipo: "titulo", cor: "#1d1600" });
    return { canvas: cv, nome: `selecao-rodada-${rd}` };
  }
  /* replay do gol: meio campo de ataque em pé (o gol no alto), com o caminho da bola, quem passou e quem fez */
  async function cardReplay(espn) {
    const R = window.REPLAY, at = R?.atual?.(espn);
    if (!at) throw new Error("abra o replay do gol primeiro");
    const { g, h: hid, a: aid } = at, h = byId[hid], a = byId[aid], dono = g.time === "casa" ? h : a;
    const corDono = dono.colors[0] === "#ffffff" || dono.colors[0] === "#111111" ? dono.colors[1] || dono.colors[0] : dono.colors[0];
    const cv = novoCanvas(), ctx = cv.getContext("2d");
    fundo(ctx, dono.colors[0], "#0f3d2e");
    moldura(ctx, "Replay do gol");
    texto(ctx, `${g.min} ${g.autor}`, L / 2, 215, { px: 64, tipo: "titulo" });
    const como = [R.NOME_PASSE[g.passe], g.contraAtaque && "contra-ataque"].filter(Boolean).join(" em ");
    texto(ctx, [dono.abbr, g.assist && g.passe !== "contra" ? `passe de ${g.assist}` : "", como].filter(Boolean).join(" · "), L / 2, 270, { peso: 700, px: 32, cor: "rgba(255,255,255,0.8)" });
    // campo: largura 68 m em 900 px; profundidade de 52,5 m (meio campo de ataque)
    const ox = 90, oy = 330, k = 900 / 68, X = (y) => ox + y * 0.68 * k, Y = (x) => oy + (100 - Math.max(47.6, x)) * 1.05 * k;
    ctx.fillStyle = "#1f6b3a"; ctx.fillRect(ox, oy, 900, 52.5 * k);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)"; ctx.fillRect(ox, oy + i * 52.5 * k / 6, 900, 52.5 * k / 6); }
    ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 4;
    ctx.strokeRect(ox, oy, 900, 52.5 * k);
    ctx.strokeRect(X(50 - 40.32 / 0.68 / 2), oy, 40.32 * k, 16.5 * k);   // grande área
    ctx.strokeRect(X(50 - 18.32 / 0.68 / 2), oy, 18.32 * k, 5.5 * k);    // pequena área
    ctx.beginPath(); ctx.arc(X(50), oy + 11 * k, 4, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fill();
    ctx.beginPath(); ctx.arc(X(50), oy + 52.5 * k, 9.15 * k, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fillRect(X(50 - 7.32 / 0.68 / 2), oy - 14, 7.32 * k, 14); // gol
    // caminho da bola: o plano inteiro, amostrado
    const P = R.plano(g);
    ctx.setLineDash([16, 12]); ctx.lineWidth = 6; ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) { const b = R.quadro(P, (P.total - 900) * i / 120).bola; const px = X(b.y), py = Y(b.x); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke(); ctx.setLineDash([]);
    const jogador = (p, nome) => {
      const px = X(p.y), py = Y(p.x);
      ctx.beginPath(); ctx.arc(px, py, 26, 0, Math.PI * 2); ctx.fillStyle = corDono; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = "#fff"; ctx.stroke();
      ctx.lineWidth = 8; ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.font = fonte(800, 34); ctx.textAlign = "center"; ctx.strokeText(nome, px, py - 40); texto(ctx, nome, px, py - 40, { px: 34, max: 300 });
    };
    const curto = (n) => { const s = String(n || ""), q = s.split(" "); return s.length <= 12 || q.length < 2 ? s : q[q.length - 1]; };
    if (P.origem && !P.origem.conducao && g.assist) jogador(P.fases.find((f) => f.tipo === "passe").de, curto(g.assist));
    jogador(g.de, curto(g.autor));
    const fim = R.quadro(P, P.total).bola;
    ctx.beginPath(); ctx.arc(X(fim.y), Y(fim.x) - 4, 15, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = "#f5b800"; ctx.stroke();
    if (g.placar) texto(ctx, `${h.abbr} ${g.placar[0]} x ${g.placar[1]} ${a.abbr}`, L / 2, 1100, { px: 60, tipo: "titulo" });
    texto(ctx, P.aproximado ? "Local do chute e lado do gol reais; caminho do passe aproximado" : "Local do chute e lado do gol reais", L / 2, 1150, { peso: 600, px: 24, cor: "rgba(255,255,255,0.6)" });
    return { canvas: cv, nome: `gol-${g.autor}-${g.min.replace(/\D/g, "")}` };
  }
  async function cardBolao() {
    const d = window.BOLAO?.ultimo?.();
    if (!d?.voce) throw new Error("entre no ranking para compartilhar a sua posição");
    const cv = novoCanvas(), ctx = cv.getContext("2d");
    fundo(ctx, "#1d4ed8", "#00a859");
    moldura(ctx, d.rodada ? `Bolão · ${d.nome}` : d.nome ? `Liga ${d.nome}` : "Bolão");
    texto(ctx, d.rodada && d.voce.pos === 1 && d.voce.pontos > 0 ? "Rei da rodada" : d.rodada ? `Bolão da ${d.nome}` : "Bolão", L / 2, 330, { peso: 700, px: 54, cor: "rgba(255,255,255,0.8)" });
    texto(ctx, d.voce.apelido, L / 2, 450, { px: 96, tipo: "titulo" });
    texto(ctx, `${d.voce.pos}º`, L / 2, 760, { px: 300, tipo: "titulo" });
    texto(ctx, `de ${d.total} ${d.total === 1 ? "torcedor" : "torcedores"}`, L / 2, 840, { peso: 700, px: 44, cor: "rgba(255,255,255,0.8)" });
    texto(ctx, `${d.voce.pontos} pontos · ${d.voce.exatos} placar${d.voce.exatos === 1 ? "" : "es"} exato${d.voce.exatos === 1 ? "" : "s"}`, L / 2, 1000, { px: 54 });
    texto(ctx, "Dá para me alcançar? Faça seus palpites no site.", L / 2, 1090, { peso: 600, px: 36, cor: "rgba(255,255,255,0.75)" });
    return { canvas: cv, nome: `bolao-${d.voce.apelido}` };
  }

  /* ---------- pré-visualização, compartilhar ou baixar ---------- */
  const arquivo = (nome) => `cazestats-${String(nome).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`;
  async function arquivoDe({ canvas, nome }) {
    const blob = await new Promise((ok) => canvas.toBlob(ok, "image/png"));
    if (!blob) throw new Error("não deu para gerar a imagem");
    return new File([blob], arquivo(nome), { type: "image/png" });
  }
  async function compartilhaArquivo(file) {
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "CazéStats.TV" }); return "Imagem enviada."; } catch (e) { if (e?.name === "AbortError") return ""; }
    }
    return baixaArquivo(file);
  }
  function baixaArquivo(file) {
    const url = URL.createObjectURL(file), link = Object.assign(document.createElement("a"), { href: url, download: file.name });
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return "Imagem baixada. É só postar.";
  }
  // compatível com quem já chamava a entrega direta (sem pré-visualização)
  const entrega = async (card) => compartilhaArquivo(await arquivoDe(card));

  // janela de pré-visualização (uma só, reaproveitada): a imagem pronta, Compartilhar (onde o aparelho deixa) e Baixar
  let dlg = null, atual = null, origem = null;
  function janela() {
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.className = "cp-dlg";
    dlg.setAttribute("aria-labelledby", "cp-dlg-t");
    dlg.innerHTML = `<div class="cp-dlg-box"><header class="cp-dlg-h"><h2 id="cp-dlg-t">Pré-visualização</h2>
        <button type="button" class="cp-dlg-x" data-cp-fechar aria-label="Fechar"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z"/></svg></button></header>
      <div class="cp-dlg-img"><img alt="" data-cp-img></div>
      <footer class="cp-dlg-f"><span class="cp-dlg-msg" role="status" aria-live="polite" data-cp-dmsg></span>
        <button type="button" class="cp-dlg-b sec" data-cp-baixar><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M11 3h2v9.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4L11 12.2zM4 18h16v2H4z"/></svg><span>Baixar imagem</span></button>
        <button type="button" class="cp-dlg-b" data-cp-enviar><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7l-6.7 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1Z"/></svg><span>Compartilhar</span></button></footer></div>`;
    document.body.appendChild(dlg);
    const msg = dlg.querySelector("[data-cp-dmsg]");
    dlg.addEventListener("click", async (e) => {
      if (e.target === dlg || e.target.closest("[data-cp-fechar]")) return dlg.close();
      const b = e.target.closest("[data-cp-baixar], [data-cp-enviar]");
      if (!b || !atual) return;
      msg.textContent = b.hasAttribute("data-cp-baixar") ? baixaArquivo(atual.file) : await compartilhaArquivo(atual.file);
    });
    dlg.addEventListener("close", () => {
      if (atual?.url) URL.revokeObjectURL(atual.url);
      atual = null;
      // a página pode ter redesenhado o card enquanto a janela estava aberta: volta ao botão equivalente
      const alvo = origem?.isConnected ? origem : origem && document.querySelector(`[data-cp="${CSS.escape(origem.dataset.cp)}"][data-cp-id="${CSS.escape(origem.dataset.cpId || "")}"]`);
      alvo?.focus?.();
    });
    return dlg;
  }
  // mudou de página (voltar, link): a pré-visualização fecha junto
  addEventListener("hashchange", () => { if (dlg?.open) dlg.close(); });
  async function preVisualiza(card, botao) {
    const file = await arquivoDe(card), d = janela(), url = URL.createObjectURL(file);
    if (atual?.url) URL.revokeObjectURL(atual.url);
    atual = { file, url };
    origem = botao;
    const img = d.querySelector("[data-cp-img]");
    img.src = url;
    img.width = card.canvas.width; img.height = card.canvas.height;
    img.alt = `Imagem para compartilhar: ${card.nome.replace(/-/g, " ")}`;
    d.querySelector("[data-cp-dmsg]").textContent = "";
    const pode = !!navigator.canShare?.({ files: [file] });
    d.querySelector("[data-cp-enviar]").hidden = !pode;
    d.querySelector("[data-cp-baixar]").classList.toggle("sec", pode);
    if (!d.open) d.showModal();
    (pode ? d.querySelector("[data-cp-enviar]") : d.querySelector("[data-cp-baixar]")).focus();
  }

  function botao(tipo, id = "") {
    return `<button type="button" class="cp-btn" data-cp="${esc(tipo)}" data-cp-id="${esc(id)}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7l-6.7 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1Z"/></svg><span>Compartilhar imagem</span></button><span class="cp-msg" role="status" aria-live="polite"></span>`;
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-cp]");
    if (!b || b.disabled) return;
    e.preventDefault();
    const msg = b.nextElementSibling?.classList.contains("cp-msg") ? b.nextElementSibling : null;
    b.disabled = true;
    b.setAttribute("aria-busy", "true");
    if (msg) msg.textContent = "Montando a imagem…";
    try {
      const card = await _monta(b.dataset.cp, b.dataset.cpId);
      if (msg) msg.textContent = "";
      await preVisualiza(card, b);
    } catch (err) {
      if (msg) msg.textContent = `Não deu para montar a imagem (${String(err?.message || err).slice(0, 60)}).`;
    } finally {
      b.disabled = false;
      b.removeAttribute("aria-busy");
    }
  });

  // _monta: só desenha (sem compartilhar nem baixar); usado pela pré-visualização e para conferir a imagem
  const _monta = async (tipo, id) => {
    pegaFontes(); await document.fonts?.ready;
    if (tipo === "partida") return cardPartida(origens.partida?.(id) || (() => { throw new Error("jogo não encontrado"); })());
    return tipo === "jogador" ? cardJogador(id) : tipo === "comparacao" ? cardComparacao(id) : tipo === "rodada" ? cardRodada(id) : tipo === "selecao" ? cardSelecao(id)
      : tipo === "replay" ? cardReplay(id) : tipo === "artilharia" ? window.ARTE_ARTILHARIA.monta(id) : cardBolao();
  };
  window.COMPARTILHAR = { botao, origem: (tipo, fn) => { origens[tipo] = fn; }, _arquivo: arquivo, _monta, _entrega: entrega };
})();
