/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — card para compartilhar (imagem 1080 x 1350, retrato do Instagram)
     · partida: escudos, placar (ou data e hora) e a chance de vitória antes do jogo
     · jogador: nome, clube e os números da temporada
     · bolão: apelido, pontos e posição no ranking
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
  async function cardSelecao(rd) {
    const S = window.RODADA?.selecaoDa?.(Number(rd));
    if (!S) throw new Error("abra o resumo da rodada para montar a seleção");
    const cv = novoCanvas(), ctx = cv.getContext("2d");
    fundo(ctx, "#0f5132", "#14532d");
    moldura(ctx, `Brasileirão · ${rd}ª rodada`);
    texto(ctx, `Seleção da ${rd}ª rodada`, L / 2, 230, { px: 60, tipo: "titulo" });
    // campo: linhas do ataque ao goleiro
    ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 4;
    ctx.strokeRect(90, 280, L - 180, 820); ctx.beginPath(); ctx.moveTo(90, 690); ctx.lineTo(L - 90, 690); ctx.stroke();
    const linhas = [["F", 380], ["M", 590], ["D", 800], ["G", 1000]];
    for (const [pos, y] of linhas) {
      const js = S.time[pos], passo = (L - 180) / (js.length + 1);
      js.forEach((j, i) => {
        const x = 90 + passo * (i + 1), craque = j === S.craque;
        ctx.fillStyle = craque ? "#f5b800" : "rgba(255,255,255,0.92)";
        ctx.beginPath(); ctx.arc(x, y - 40, 34, 0, Math.PI * 2); ctx.fill();
        texto(ctx, j.nota.toFixed(1).replace(".", ","), x, y - 28, { px: 30, tipo: "titulo", cor: craque ? "#2b2100" : "#0f3d2e" });
        texto(ctx, j.nome.split(" ").slice(-1)[0], x, y + 30, { peso: 700, px: 30, max: passo - 10 });
        texto(ctx, byId[j.clube]?.abbr || j.clube, x, y + 66, { peso: 600, px: 24, cor: "rgba(255,255,255,0.7)" });
      });
    }
    texto(ctx, `Craque da rodada: ${S.craque.nome} (${byId[S.craque.clube]?.abbr || S.craque.clube}), nota ${S.craque.nota.toFixed(1).replace(".", ",")}`, L / 2, A - 190, { peso: 700, px: 34, max: L - 140 });
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

  /* ---------- compartilhar ou baixar ---------- */
  const arquivo = (nome) => `cazestats-${String(nome).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`;
  async function entrega({ canvas, nome }) {
    const blob = await new Promise((ok) => canvas.toBlob(ok, "image/png"));
    if (!blob) throw new Error("não deu para gerar a imagem");
    const file = new File([blob], arquivo(nome), { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "CazéStats.TV" }); return "Imagem pronta para compartilhar."; } catch (e) { if (e?.name === "AbortError") return ""; }
    }
    const url = URL.createObjectURL(blob), link = Object.assign(document.createElement("a"), { href: url, download: file.name });
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return "Imagem baixada. É só postar.";
  }

  function botao(tipo, id = "") {
    return `<button type="button" class="cp-btn" data-cp="${esc(tipo)}" data-cp-id="${esc(id)}"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="currentColor" d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7l-6.7 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1Z"/></svg><span>Compartilhar imagem</span></button><span class="cp-msg" role="status" aria-live="polite"></span>`;
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-cp]");
    if (!b) return;
    e.preventDefault();
    const msg = b.nextElementSibling?.classList.contains("cp-msg") ? b.nextElementSibling : null;
    b.disabled = true;
    if (msg) msg.textContent = "Montando a imagem…";
    try {
      pegaFontes();
      await document.fonts?.ready;
      const tipo = b.dataset.cp, id = b.dataset.cpId;
      const card = tipo === "partida" ? await cardPartida(origens.partida?.(id) || (() => { throw new Error("jogo não encontrado"); })())
        : tipo === "jogador" ? await cardJogador(id) : tipo === "comparacao" ? await cardComparacao(id) : tipo === "rodada" ? await cardRodada(id) : tipo === "selecao" ? await cardSelecao(id) : tipo === "replay" ? await cardReplay(id) : await cardBolao();
      const r = await entrega(card);
      if (msg) msg.textContent = r;
    } catch (err) {
      if (msg) msg.textContent = `Não deu para montar a imagem (${String(err?.message || err).slice(0, 60)}).`;
    } finally {
      b.disabled = false;
    }
  });

  // _monta: só desenha (sem compartilhar nem baixar); usado para conferir a imagem
  const _monta = async (tipo, id) => { pegaFontes(); await document.fonts?.ready; return tipo === "partida" ? cardPartida(origens.partida(id)) : tipo === "jogador" ? cardJogador(id) : tipo === "comparacao" ? cardComparacao(id) : tipo === "rodada" ? cardRodada(id) : tipo === "selecao" ? cardSelecao(id) : tipo === "replay" ? cardReplay(id) : cardBolao(); };
  window.COMPARTILHAR = { botao, origem: (tipo, fn) => { origens[tipo] = fn; }, _arquivo: arquivo, _monta };
})();
