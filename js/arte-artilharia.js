/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — arte da artilharia (imagem 1080 x 1400 para compartilhar)
   Os 5 primeiros da artilharia (Brasileirão, Libertadores, Sul-Americana, Copa do Brasil), um por faixa:
   sobrenome na vertical, bandeira do país, foto, gols em letra grande, idade e o escudo do clube, na cor do clube.
   País, idade e foto recortada: perfil do atleta na ESPN (site.web.api.espn.com, aberto ao navegador); sem a foto da
   ESPN, a guardada pelo monitor de fotos (mesmo endereço do site); sem nenhuma, a que o robô guardou para a artilharia
   (server/fotos_artilharia.py, dados/fotos-artilharia.json). Tudo desenhado no aparelho, num <canvas>: só entram
   imagens que liberam o uso em canvas (ESPN, Wikimedia e as do próprio site).
   ========================================================================== */
(() => {
  "use strict";
  const L = 1080, A = 1400;
  const COMP = { brasileirao: "BRASILEIRÃO", libertadores: "LIBERTADORES", "sul-americana": "SUL-AMERICANA", "copa-do-brasil": "COPA DO BRASIL" };
  const fontes = {}, perfis = new Map(), fontesDeDados = {};
  const clubes = () => (typeof byId !== "undefined" ? byId : {}); // byId (js/data.js) é const global, não fica em window
  const fonte = (estilo, peso, px) => `${estilo} ${peso} ${px}px ${fontes.titulo || "system-ui, sans-serif"}`;

  /* ---------- dados ---------- */
  const carregaImg = (src, cors = true) => new Promise((ok) => {
    if (!src) return ok(null);
    const im = new Image();
    if (cors) im.crossOrigin = "anonymous";
    im.referrerPolicy = "no-referrer";
    im.onload = () => ok(im);
    im.onerror = () => ok(null);
    im.src = src;
  });
  function perfil(id) {
    if (!/^\d+$/.test(String(id || ""))) return Promise.resolve(null);
    if (!perfis.has(id)) {
      perfis.set(id, fetch(`https://site.web.api.espn.com/apis/common/v3/sports/soccer/athletes/${encodeURIComponent(id)}`)
        .then((r) => (r.ok ? window.SEG.json(r) : null)).then((d) => d?.athlete || null).catch(() => null));
    }
    return perfis.get(id);
  }
  // os 5 primeiros, no formato {nome, id, gols, cid (clube do site ou null), logo, idade}
  function lista(comp) {
    if (fontesDeDados[comp]) return fontesDeDados[comp]();
    const D = window.COMPETICOES?.[comp];
    return (D?.artilharia || []).slice(0, 5).map((a) => ({ nome: a.nome, id: a.atleta, gols: a.gols, jogos: a.jogos, cid: a.clube || null, clubeNome: a.timeNome, logo: a.logo }));
  }

  /* ---------- cores ---------- */
  const hex = (h) => { const s = String(h || "#000").replace("#", ""), f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s.padEnd(6, "0"); return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)); };
  const lum = (h) => { const [r, g, b] = hex(h).map((c) => c / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const mistura = (h, alvo, k) => { const a = hex(h), b = hex(alvo); return `#${a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, "0")).join("")}`; };
  const rgba = (h, al) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${al})`; };
  // cor da faixa: a primeira cor do clube que não é branco nem quase preto (clube preto e branco fica num grafite)
  function corDoClube(c) {
    const cs = c?.colors || [];
    return cs.find((x) => lum(x) > 0.035 && lum(x) < 0.82) || (cs.some((x) => lum(x) <= 0.035) ? "#2a2a2e" : "#1f3b70");
  }
  // clube de fora (Libertadores, Sul-Americana): a cor que mais aparece no escudo, das bem saturadas
  function corDoEscudo(im) {
    if (!im) return "#1f3b70";
    try {
      const c = document.createElement("canvas"); c.width = c.height = 48;
      const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(im, 0, 0, 48, 48);
      const d = x.getImageData(0, 0, 48, 48).data, baldes = {};
      for (let i = 0; i < d.length; i += 4) {
        const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
        if (a < 200) continue;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510, s = mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255));
        if (s < 0.35 || l < 0.12 || l > 0.85) continue;
        const k = `${r >> 5},${g >> 5},${b >> 5}`, bk = (baldes[k] = baldes[k] || [0, 0, 0, 0]);
        bk[0] += r; bk[1] += g; bk[2] += b; bk[3]++;
      }
      const top = Object.values(baldes).sort((p, q) => q[3] - p[3])[0];
      if (!top) return "#2a2a2e";
      return `#${top.slice(0, 3).map((v) => Math.round(v / top[3]).toString(16).padStart(2, "0")).join("")}`;
    } catch { return "#1f3b70"; }
  }

  /* ---------- imagens ---------- */
  async function escudoDe(e) {
    const c = e.cid && clubes()[e.cid];
    if (c && window.GFX) {
      const src = /src="([^"]+)"/.exec(window.GFX.crest(c, 300))?.[1];
      const im = src && /^https:\/\//.test(src) ? await carregaImg(src) : null;
      if (im) return im;
    }
    const im = await carregaImg(e.logo);
    if (im || !c) return im;
    const svg = window.GFX.svgCrest(c, 300), url = URL.createObjectURL(new Blob([svg.includes("xmlns") ? svg : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"')], { type: "image/svg+xml" }));
    try { return await carregaImg(url, false); } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
  }
  let globalP = null, artP = null;
  async function fotoTransfermarkt(id) {
    if (!window.DADOS || !/^\d+$/.test(String(id || ""))) return null;
    globalP = globalP || window.DADOS.carrega("mercado/global").then((G) => ({ base: G?.fotoBase || "https://img.a.transfermarkt.technology/portrait/header/", idx: new Map((G?.jogadores || []).map((r) => [String(r[0]), r[12]])) })).catch(() => null);
    const G = await globalP, f = G?.idx.get(String(id));
    return f && !/^(e$|s:|g:)/.test(f) ? G.base + f : null;
  }
  async function fotoDe(e, at) {
    let guardadas = window.FOTOS;
    if (!guardadas && e.cid && window.DADOS) guardadas = window.FOTOS = await window.DADOS.carrega("fotos").catch(() => null);
    const g = e.cid && guardadas?.[e.cid]?.[e.id];
    // a guardada vem do site do clube (camisa atual); a da ESPN às vezes é de um clube antigo
    const lista = [g?.u && g.f !== "Wikimedia" ? g.u : null, at?.headshot?.href, /^\d+$/.test(String(e.id)) ? `https://a.espncdn.com/i/headshots/soccer/players/full/${e.id}.png` : null];
    for (const u of [...new Set(lista.filter(Boolean))]) { const im = await carregaImg(u); if (im) return bustoDe(recorta(im)); }
    // depois, a guardada pelo robô para quem ficaria sem nenhuma (server/fotos_artilharia.py: Transfermarkt, TheSportsDB,
    // busca de imagem do Brave) e, por último, a do Transfermarkt pelo mercado global
    artP = artP || (window.DADOS ? window.DADOS.carrega("fotos-artilharia").catch(() => null) : Promise.resolve(null));
    const art = (await artP)?.jogadores?.[e.id]?.u;
    for (const u of [art, await fotoTransfermarkt(e.id)].filter(Boolean)) { const im = await carregaImg(u); if (im) return bustoDe(recorta(im)); }
    return null;
  }
  // foto já recortada (fundo transparente) passa direto; foto com fundo liso de estúdio perde o fundo (preenchimento a
  // partir das bordas); foto comum fica num quadro com as laterais esmaecidas
  function recorta(im) {
    const w = im.naturalWidth, h = im.naturalHeight, c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(im, 0, 0);
    let d;
    try { d = x.getImageData(0, 0, w, h); } catch { return { im, recorte: false }; }
    const px = d.data, alfa = (i) => px[i * 4 + 3];
    const cantos = [0, w - 1, (h - 1) * w, h * w - 1], topo = [0, w - 1, Math.floor(w / 2), Math.floor(h * 0.3) * w, Math.floor(h * 0.3) * w + w - 1];
    if (cantos.every((i) => alfa(i) < 30)) return { im: c, recorte: true };
    // fundo liso de estúdio (branco ou de uma cor só): os cantos de cima e o alto das laterais com a mesma cor
    const ref = [0, 1, 2].map((k) => topo.reduce((t, i) => t + px[i * 4 + k], 0) / topo.length);
    const dist = (i) => Math.abs(px[i * 4] - ref[0]) + Math.abs(px[i * 4 + 1] - ref[1]) + Math.abs(px[i * 4 + 2] - ref[2]);
    if (!topo.every((i) => dist(i) < 36 && alfa(i) > 200)) return { im: c, recorte: false };
    const claro = (i) => alfa(i) > 200 && dist(i) < 46;
    const visto = new Uint8Array(w * h), fila = [];
    for (let i = 0; i < w; i++) fila.push(i); // sementes: borda de cima e as laterais até 55% da altura (o corpo encosta embaixo)
    for (let j = 0; j < Math.floor(h * 0.55); j++) fila.push(j * w, j * w + w - 1);
    while (fila.length) {
      const i = fila.pop();
      if (visto[i] || !claro(i)) continue;
      visto[i] = 1; px[i * 4 + 3] = 0;
      const cx = i % w;
      if (cx > 0) fila.push(i - 1);
      if (cx < w - 1) fila.push(i + 1);
      if (i >= w) fila.push(i - w);
      if (i < w * (h - 1)) fila.push(i + w);
    }
    x.putImageData(d, 0, 0);
    return { im: c, recorte: true };
  }
  // recorte de corpo inteiro (foto bem mais alta que larga): fica só da cabeça ao peito, como nas fotos de perfil
  function bustoDe(f) {
    if (!f?.recorte) return f;
    const w = f.im.width, h = f.im.height;
    if (h < w * 1.45) return f;
    const x = f.im.getContext("2d", { willReadFrequently: true }), px = x.getImageData(0, 0, w, h).data;
    let topo = 0, esq = w, dir = 0;
    for (let j = 0; j < h && !topo; j++) for (let i = 0; i < w; i++) if (px[(j * w + i) * 4 + 3] > 40) { topo = j || 1; break; }
    const alt = Math.round(h * 0.36);
    for (let j = topo; j < Math.min(h, topo + alt); j++) for (let i = 0; i < w; i++) if (px[(j * w + i) * 4 + 3] > 40) { esq = Math.min(esq, i); dir = Math.max(dir, i); }
    const lar = Math.max(alt * 1.1, dir - esq + 20), cx = (esq + dir) / 2, c = document.createElement("canvas");
    c.width = Math.round(lar); c.height = alt;
    c.getContext("2d").drawImage(f.im, cx - lar / 2, Math.max(0, topo - 4), lar, alt, 0, 0, lar, alt);
    return { im: c, recorte: true };
  }

  /* ---------- desenho ---------- */
  function caixa(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function cabe(ctx, im, x, y, w, h) { // contém, sem achatar
    const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height, k = Math.min(w / iw, h / ih);
    ctx.drawImage(im, x + (w - iw * k) / 2, y + (h - ih * k) / 2, iw * k, ih * k);
  }
  function texto(ctx, t, x, y, { estilo = "normal", peso = 900, px = 40, max = 9999, cor = "#fff", alinha = "center", base = "alphabetic", espaco = 0, largura = "condensed" } = {}) {
    let tam = px;
    const aplica = () => { ctx.font = fonte(estilo, peso, tam); ctx.fontStretch = largura; ctx.letterSpacing = `${(espaco * tam).toFixed(1)}px`; };
    aplica();
    while (ctx.measureText(t).width > max && tam > 12) { tam -= 2; aplica(); }
    ctx.fillStyle = cor; ctx.textAlign = alinha; ctx.textBaseline = base;
    ctx.fillText(t, x, y);
    ctx.letterSpacing = "0px";
    return tam;
  }
  function fundo(ctx) {
    const g = ctx.createLinearGradient(0, 0, L, A);
    g.addColorStop(0, "#f2f2f0"); g.addColorStop(1, "#d6d6d3");
    ctx.fillStyle = g; ctx.fillRect(0, 0, L, A);
    // diagonal dourada escura à esquerda, com riscos de luz
    ctx.save();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L * 0.66, 0); ctx.lineTo(L * 0.4, A); ctx.lineTo(0, A); ctx.closePath(); ctx.clip();
    const d = ctx.createLinearGradient(0, 0, L * 0.5, A);
    d.addColorStop(0, "#7a6626"); d.addColorStop(0.45, "#4a3d15"); d.addColorStop(1, "#211b09");
    ctx.fillStyle = d; ctx.fillRect(0, 0, L, A);
    ctx.globalAlpha = 0.09; ctx.fillStyle = "#ffe9a0";
    for (let i = -6; i < 14; i++) { ctx.beginPath(); ctx.moveTo(i * 90, 0); ctx.lineTo(i * 90 + 34, 0); ctx.lineTo(i * 90 - 300, A); ctx.lineTo(i * 90 - 334, A); ctx.fill(); }
    ctx.restore();
    // borda clara da diagonal
    const b = ctx.createLinearGradient(L * 0.66, 0, L * 0.4, A);
    b.addColorStop(0, "rgba(255,255,255,0.9)"); b.addColorStop(1, "rgba(255,255,255,0.2)");
    ctx.strokeStyle = b; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(L * 0.66, 0); ctx.lineTo(L * 0.4, A); ctx.stroke();
  }
  function titulo(ctx, comp, ano) {
    const t1 = "ARTILHARIA", t2 = ` - ${COMP[comp] || comp.toUpperCase()} ${ano}`, px = 46;
    ctx.font = fonte("normal", 900, px); ctx.fontStretch = "condensed"; const w1 = ctx.measureText(t1).width;
    ctx.font = fonte("normal", 500, px); const w2 = ctx.measureText(t2).width;
    const x = 26, y = 30, w = Math.min(L - 52, w1 + w2 + 64), h = 82;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
    caixa(ctx, x, y, w, h, 16); ctx.fillStyle = "#8a6d12"; ctx.fill();
    ctx.restore();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#fbe57a"); g.addColorStop(0.5, "#d9b335"); g.addColorStop(1, "#a9851b");
    caixa(ctx, x + 4, y + 4, w - 8, h - 8, 13); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = "rgba(255,247,200,0.9)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.save(); ctx.shadowColor = "rgba(60,40,0,0.55)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
    texto(ctx, t1, x + 32, y + h / 2 + 2, { px, alinha: "left", base: "middle" });
    texto(ctx, t2, x + 32 + w1, y + h / 2 + 2, { px, peso: 500, alinha: "left", base: "middle", cor: "rgba(255,255,255,0.94)" });
    ctx.restore();
  }
  // bandeira com o tecido ondulando: fatias verticais deslocadas e sombreadas
  function bandeira(ctx, im, x, y, w, h) {
    if (!im) { const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, "#9aa0a6"); g.addColorStop(1, "#5f6368"); ctx.fillStyle = g; ctx.fillRect(x, y, w, h); return; }
    // a imagem da ESPN tem a bandeira (460 x 320) no meio de um quadro de 500 x 500
    const sx = 20, sy = 90, sw = 460, sh = 320, k = Math.max(w / sw, (h + 24) / sh), dw = sw * k, dh = sh * k, ox = x + (w - dw) / 2, oy = y + (h - dh) / 2;
    const fatia = 6;
    for (let i = 0; i < w; i += fatia) {
      const fase = (i / w) * Math.PI * 2.2, dy = Math.sin(fase) * 7;
      const srcX = sx + ((i + x - ox) / dw) * sw;
      ctx.drawImage(im, srcX, sy, (fatia / dw) * sw + 0.6, sh, x + i, oy + dy, fatia + 0.6, dh);
      const luz = Math.cos(fase);
      ctx.fillStyle = luz > 0 ? `rgba(255,255,255,${0.16 * luz})` : `rgba(0,0,0,${-0.22 * luz})`;
      ctx.fillRect(x + i, y, fatia + 0.6, h);
    }
  }
  function faixaDoClube(w, h, cor, inicio) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, mistura(cor, "#ffffff", 0.28)); g.addColorStop(0.5, cor); g.addColorStop(1, mistura(cor, "#000000", 0.38));
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // riscos diagonais de luz (o "brilho" da faixa)
    x.globalAlpha = 0.07; x.fillStyle = "#fff";
    for (let i = 0; i < w + h; i += 70) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 26, 0); x.lineTo(i + 26 - h, h); x.lineTo(i - h, h); x.fill(); }
    x.globalAlpha = 1;
    const brilho = x.createLinearGradient(0, 0, 0, h * 0.5);
    brilho.addColorStop(0, "rgba(255,255,255,0.28)"); brilho.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = brilho; x.fillRect(0, 0, w, h * 0.5);
    // entra por cima da bandeira esmaecendo
    x.globalCompositeOperation = "destination-in";
    const m = x.createLinearGradient(0, 0, inicio, 0); // depois de "inicio" o degradê continua opaco
    m.addColorStop(0, "rgba(0,0,0,0)"); m.addColorStop(1, "rgba(0,0,0,1)");
    x.fillStyle = m; x.fillRect(0, 0, w, h);
    return c;
  }
  const NOMES = /^(henrique|jorge|vinicius|carlos|eduardo|felipe|gabriel|lucas|matheus|mateus|rodrigo|pedro|paulo|andre|alexandre|fernando|marcos|rafael|daniel|diego|luiz|luis|cesar|augusto|silva|souza|santos|oliveira|lima|costa|pereira|alves|gomes|rodrigues|ferreira)$/i;
  const sobrenome = (n) => {
    const p = String(n || "").trim().split(/\s+/), ult = p[p.length - 1] || "";
    if (p.length === 1) return ult.toUpperCase();
    if (/^(j[uú]nior|jr\.?|filho|neto|sobrinho)$/i.test(ult) || ult.length <= 3) return p.slice(-2).join(" ").toUpperCase();
    // sobrenome que também é nome ("Bruno Henrique", "Kaio Jorge"): leva a inicial, como "J. ALVAREZ"
    if (NOMES.test(ult.normalize("NFD").replace(/[̀-ͯ]/g, ""))) return `${p[0][0]}. ${ult}`.toUpperCase();
    return ult.toUpperCase();
  };
  async function linha(ctx, e, x, y, w, h, extras) {
    const r = 16, aba = 56, bw = 330, cor = extras.cor;
    // sombra e corpo
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 20; ctx.shadowOffsetY = 7;
    caixa(ctx, x, y, w, h, r); ctx.fillStyle = "#fff"; ctx.fill(); ctx.restore();
    ctx.save(); caixa(ctx, x, y, w, h, r); ctx.clip();
    const ga = ctx.createLinearGradient(x, 0, x + aba, 0); ga.addColorStop(0, "#ffffff"); ga.addColorStop(1, "#d9d9d6");
    ctx.fillStyle = ga; ctx.fillRect(x, y, aba, h);
    bandeira(ctx, extras.bandeira, x + aba, y, bw, h);
    const ini = x + aba + bw * 0.55, entra = 120;
    ctx.drawImage(faixaDoClube(Math.ceil(x + w - (ini - entra)), h, cor, entra), ini - entra, y);
    ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.fillRect(x + aba - 2, y, 2, h);
    ctx.restore();
    // borda clara por cima
    ctx.save(); caixa(ctx, x + 1, y + 1, w - 2, h - 2, r); ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    // sobrenome na vertical
    ctx.save(); ctx.translate(x + aba / 2, y + h / 2); ctx.rotate(-Math.PI / 2);
    texto(ctx, sobrenome(e.nome), 0, 2, { px: 30, peso: 800, max: h - 26, cor: "#3a3a3a", base: "middle", espaco: 0.04 });
    ctx.restore();
    // foto: recortada sai um pouco por cima da faixa (como na arte); com fundo, fica num quadro esmaecido
    const cx = x + aba + bw * 0.74, f = extras.foto;
    if (f) {
      const iw = f.im.width, ih = f.im.height;
      ctx.save();
      ctx.beginPath(); ctx.rect(x + aba, y - 70, w - aba, h + 70); ctx.clip();
      if (f.recorte) {
        const s0 = h * 1.16 / ih, s = Math.min(s0, 420 / iw), lar = iw * s, alt = ih * s; // foto larga: limita a largura
        ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 14; ctx.shadowOffsetX = 4;
        ctx.drawImage(f.im, cx - lar / 2, y + h - alt, lar, alt);
      } else {
        const alt = h, lar = Math.min(h * 1.05, (iw / ih) * h), q = document.createElement("canvas");
        q.width = Math.round(lar); q.height = Math.round(alt);
        const qx = q.getContext("2d"), k = Math.max(lar / iw, alt / ih);
        qx.drawImage(f.im, (lar - iw * k) / 2, (alt - ih * k) * 0.2, iw * k, ih * k);
        qx.globalCompositeOperation = "destination-in";
        const m = qx.createLinearGradient(0, 0, lar, 0);
        m.addColorStop(0, "rgba(0,0,0,0)"); m.addColorStop(0.18, "#000"); m.addColorStop(0.82, "#000"); m.addColorStop(1, "rgba(0,0,0,0)");
        qx.fillStyle = m; qx.fillRect(0, 0, lar, alt);
        caixa(ctx, x, y, w, h, r); ctx.clip();
        ctx.drawImage(q, cx - lar / 2, y);
      }
      ctx.restore();
    }
    // gols e idade
    const nx = x + w * 0.585;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 5;
    const num = String(e.gols), un = e.gols === 1 ? " GOL" : " GOLS", px = Math.round(h * 0.56), max = w * 0.4;
    ctx.font = fonte("italic", 900, px); ctx.fontStretch = "condensed"; ctx.letterSpacing = "0px";
    let wn = ctx.measureText(num).width; ctx.font = fonte("italic", 900, px * 0.56); let wu = ctx.measureText(un).width;
    const k = Math.min(1, max / (wn + wu)); wn *= k; wu *= k;
    const x0 = nx - (wn + wu) / 2, base = y + h * 0.6;
    texto(ctx, num, x0, base, { estilo: "italic", px: px * k, alinha: "left" });
    texto(ctx, un, x0 + wn, base, { estilo: "italic", px: px * 0.56 * k, alinha: "left" });
    ctx.restore();
    const sub = [extras.idade ? `${extras.idade} ANOS` : "", e.jogos ? `${e.jogos} JOGOS` : ""].filter(Boolean)[0] || "";
    if (sub) { ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2; texto(ctx, sub, nx, y + h * 0.84, { estilo: "italic", peso: 700, px: Math.round(h * 0.155), espaco: 0.07, max, cor: "rgba(255,255,255,0.95)" }); ctx.restore(); }
    // escudo
    if (extras.escudo) {
      const t = h * 1.0;
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
      cabe(ctx, extras.escudo, x + w - t - 22, y + (h - t) / 2, t, t);
      ctx.restore();
    }
  }
  function rodape(ctx) {
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    const t = "CazéStats", px = 50;
    texto(ctx, t, 30, A - 30, { px, alinha: "left", largura: "normal", espaco: 0.01 });
    ctx.font = fonte("normal", 900, px); ctx.fontStretch = "normal"; ctx.letterSpacing = `${0.5}px`;
    const w = ctx.measureText(t).width;
    texto(ctx, ".TV", 30 + w + 2, A - 30, { px, alinha: "left", largura: "normal", cor: "#f5c84b" });
    ctx.restore();
    texto(ctx, "cazestats.pages.dev", L - 30, A - 34, { px: 26, peso: 700, alinha: "right", cor: "rgba(40,40,40,0.75)", largura: "normal" });
  }

  async function monta(comp) {
    const cs = getComputedStyle(document.documentElement);
    fontes.titulo = cs.getPropertyValue("--font-display").trim() || cs.getPropertyValue("--font").trim() || "system-ui, sans-serif";
    await document.fonts?.ready;
    const L5 = lista(comp);
    if (!L5.length) throw new Error("ainda sem artilheiros");
    const cv = document.createElement("canvas"); cv.width = L; cv.height = A;
    const ctx = cv.getContext("2d");
    fundo(ctx);
    titulo(ctx, comp, new Date().getFullYear());
    // perfis, escudos e fotos em paralelo
    const extras = await Promise.all(L5.map(async (e) => {
      const at = await perfil(e.id);
      const [bandeiraIm, escudo, foto] = await Promise.all([carregaImg(at?.flag?.href), escudoDe(e), fotoDe(e, at)]);
      const c = e.cid && clubes()[e.cid];
      return { bandeira: bandeiraIm, escudo, foto, idade: e.idade || at?.age || null, cor: c ? corDoClube(c) : corDoEscudo(escudo) };
    }));
    const topo = 146, h = 222, passo = 236, x = 26, w = L - 52;
    for (let i = 0; i < L5.length; i++) await linha(ctx, L5[i], x, topo + i * passo, w, h, extras[i]);
    rodape(ctx);
    return { canvas: cv, nome: `artilharia-${comp}`, semFoto: L5.filter((e, i) => !extras[i].foto).map((e) => e.nome) };
  }

  window.ARTE_ARTILHARIA = { monta, fonte: (comp, fn) => { fontesDeDados[comp] = fn; }, _sobrenome: sobrenome };
})();
