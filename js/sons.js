/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   PLACAR — sons do site (Web Audio, sem arquivos de áudio)
   - Gol: 5 s de festa do clube que marcou (torcida, surdo, caixa e uma fanfarra de metais).
     Cada clube tem a sua fanfarra, composta aqui (melodia, tom e andamento próprios, sorteados pelo nome do clube).
     Os hinos dos clubes têm autor e gravação protegidos (Lei 9.610/98): não estão no site. Quem tiver a licença
     do instrumental pode pôr o arquivo em media/hinos/<id do clube>.mp3 e o id em PLACAR_CONFIG.hinos (js/config.js):
     aí toca o instrumental, cortado em 5 s com o final suave, no lugar da fanfarra.
   - Apito: o árbitro apitando (curto + longo) ao entrar nas estatísticas e no "Bora pro jogo".
   - Botão de som no topo (liga/desliga, lembrado no aparelho). O navegador só deixa tocar som depois do primeiro
     toque ou clique na página: até lá, nada toca (e nada quebra).
   ========================================================================== */
(() => {
  const KEY = "placar-som";
  const ler = () => { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } };
  let ligado = ler();
  let ctx = null, saida = null;
  const historico = [];
  const AC = window.AudioContext || window.webkitAudioContext;

  function contexto() {
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      // compressor na saída: nada estoura, nem com gol e apito juntos
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
      saida = ctx.createGain(); saida.gain.value = 0.9;
      saida.connect(comp).connect(ctx.destination);
    }
    return ctx;
  }
  // primeiro toque/clique/tecla: cria e destrava o áudio (Safari só destrava dentro do próprio gesto)
  const destrava = () => {
    const c = contexto();
    if (!c) return;
    if (c.state !== "running") c.resume().catch(() => {});
    try { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch { /* ok */ }
  };
  ["pointerdown", "keydown", "touchend"].forEach((ev) => addEventListener(ev, destrava, { capture: true, passive: true }));

  /* ---------- peças ---------- */
  let ruidoBuf = null;
  function ruido(c) {
    if (ruidoBuf && ruidoBuf.sampleRate === c.sampleRate) return ruidoBuf;
    const n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    // ruído rosa (mais natural que o branco para torcida e respiração)
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    return (ruidoBuf = b);
  }
  const fonteRuido = (c) => { const s = c.createBufferSource(); s.buffer = ruido(c); s.loop = true; return s; };
  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  /* apito de árbitro (apito de bola: tom agudo com o "trinado" da bolinha, mais o sopro) */
  function apito(c, out, t0) {
    const g = c.createGain(); g.gain.value = 0; g.connect(out);
    const o = c.createOscillator(), o2 = c.createOscillator(), lfo = c.createOscillator(), lfoF = c.createGain(), lfoA = c.createGain();
    const f0 = 2950 + Math.random() * 120;
    o.type = "sine"; o.frequency.value = f0;
    o2.type = "sine"; o2.frequency.value = f0 * 2; const g2 = c.createGain(); g2.gain.value = 0.12;
    lfo.type = "sine"; lfo.frequency.value = 36; lfoF.gain.value = 170; lfoA.gain.value = 0.35;
    lfo.connect(lfoF).connect(o.frequency); lfo.connect(lfoF); lfoF.connect(o2.frequency);
    const am = c.createGain(); am.gain.value = 0.65; lfo.connect(lfoA).connect(am.gain);
    o.connect(am); o2.connect(g2).connect(am); am.connect(g);
    const sopro = fonteRuido(c), bp = c.createBiquadFilter(), gs = c.createGain();
    bp.type = "bandpass"; bp.frequency.value = f0; bp.Q.value = 6; gs.gain.value = 0.5;
    sopro.connect(bp).connect(gs).connect(g);
    // curto + longo: "pri-priiiiii"
    const sopra = (a, b, v) => {
      g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(v, a + 0.015);
      g.gain.setValueAtTime(v, b - 0.05); g.gain.linearRampToValueAtTime(0, b);
      o.frequency.setValueAtTime(f0 * 0.97, a); o.frequency.linearRampToValueAtTime(f0, a + 0.06);
    };
    sopra(t0, t0 + 0.2, 0.32); sopra(t0 + 0.3, t0 + 1.05, 0.36);
    [o, o2, lfo, sopro].forEach((n) => { n.start(t0); n.stop(t0 + 1.15); });
    return 1.15;
  }

  /* gol: torcida + bateria + fanfarra de metais do clube (5 s) */
  const semente = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
  function sorteio(seed) { let x = seed || 1; return () => ((x = Math.imul(x ^ (x >>> 15), 2246822519) ^ Math.imul(x ^ (x >>> 13), 3266489917)), (x >>> 0) / 4294967296); }
  const ESCALA = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];
  const RITMOS = [
    [[0, 0.5], [0.5, 0.5], [1, 1], [2, 0.5], [2.5, 0.5], [3, 1]],
    [[0, 0.75], [0.75, 0.25], [1, 1], [2, 0.75], [2.75, 0.25], [3, 1]],
    [[0, 1], [1, 0.5], [1.5, 0.5], [2, 1.5], [3.5, 0.5]],
    [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 2]],
    [[0, 0.333], [0.333, 0.333], [0.667, 0.333], [1, 1], [2, 1], [3, 1]],
    [[0, 1.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5], [3, 1]],
  ];
  // acordes de cada compasso (graus da escala maior): I, IV ou vi, V, I
  const ACORDES = [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]];
  function fanfarra(id) {
    const r = sorteio(semente(id));
    const bpm = 138 + Math.floor(r() * 26), raiz = 55 + Math.floor(r() * 8), bat = 60 / bpm;
    const ritmo = [RITMOS[Math.floor(r() * RITMOS.length)], RITMOS[Math.floor(r() * RITMOS.length)]];
    const notas = [];
    for (let bar = 0; bar < 2; bar++) {
      const ac = ACORDES[bar === 0 ? 0 : 1 + Math.floor(r() * 2)];
      ritmo[bar].forEach(([b, d], i) => {
        const forte = b % 1 === 0;
        const grau = forte ? ac[Math.floor(r() * 3)] : ESCALA[Math.floor(r() * 7)];
        notas.push({ t: (bar * 4 + b) * bat, d: d * bat, m: raiz + 12 + grau + (i === 0 && bar === 0 ? 0 : 0) });
      });
    }
    // fim: subida curta até a tônica aguda, segurada
    notas.push({ t: 8 * bat, d: 0.5 * bat, m: raiz + 12 + 7 }, { t: 8.5 * bat, d: 0.5 * bat, m: raiz + 12 + 11 }, { t: 9 * bat, d: 5 * bat, m: raiz + 24 });
    return { bpm, bat, raiz, notas, acordes: [ACORDES[0], ACORDES[1 + Math.floor(r() * 2)], ACORDES[2], ACORDES[3]] };
  }
  function metal(c, out, t, d, midi, vol) {
    const f = hz(midi), g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(600, t); lp.frequency.exponentialRampToValueAtTime(Math.min(9000, f * 7), t + 0.05); lp.frequency.exponentialRampToValueAtTime(Math.min(6000, f * 4), t + 0.25);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03); g.gain.setTargetAtTime(vol * 0.7, t + 0.05, 0.15);
    g.gain.setValueAtTime(vol * 0.7, t + Math.max(0.06, d - 0.06)); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.08);
    lp.connect(g).connect(out);
    const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 5.5; vg.gain.value = d > 0.6 ? f * 0.006 : 0;
    vib.connect(vg);
    [-6, 6, 0].forEach((cents, i) => {
      const o = c.createOscillator(); o.type = i === 2 ? "square" : "sawtooth";
      o.frequency.value = i === 2 ? f / 2 : f; o.detune.value = cents; vg.connect(o.frequency);
      const og = c.createGain(); og.gain.value = i === 2 ? 0.18 : 0.5;
      o.connect(og).connect(lp); o.start(t); o.stop(t + d + 0.1);
    });
    vib.start(t); vib.stop(t + d + 0.1);
  }
  function surdo(c, out, t, vol) {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.25);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.5);
  }
  function caixa(c, out, t, vol) {
    const s = fonteRuido(c), bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = "bandpass"; bp.frequency.value = 2200; bp.Q.value = 0.8;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    s.connect(bp).connect(g).connect(out); s.start(t, Math.random()); s.stop(t + 0.14);
  }
  const DUR_GOL = 5;
  function gol(c, out, t0, id) {
    const F = fanfarra(id || "placar"), fim = t0 + DUR_GOL;
    const mix = c.createGain(); mix.connect(out);
    mix.gain.setValueAtTime(1, t0); mix.gain.setValueAtTime(1, fim - 0.6); mix.gain.linearRampToValueAtTime(0, fim);
    // torcida: o grito sobe junto com a bola na rede e fica de fundo
    const tor = fonteRuido(c), bp = c.createBiquadFilter(), bp2 = c.createBiquadFilter(), gt = c.createGain();
    bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 0.7; bp2.type = "lowshelf"; bp2.frequency.value = 300; bp2.gain.value = 6;
    gt.gain.setValueAtTime(0.0001, t0); gt.gain.exponentialRampToValueAtTime(0.55, t0 + 0.5); gt.gain.setTargetAtTime(0.28, t0 + 1.2, 0.8);
    tor.connect(bp).connect(bp2).connect(gt).connect(mix); tor.start(t0); tor.stop(fim);
    const banda = c.createGain(); banda.gain.value = 0.85; banda.connect(mix);
    const ini = t0 + 0.35;
    // bateria: surdo no 1 e no 3, caixa em colcheias com acento
    for (let b = 0; b < 12 && ini + b * F.bat < fim - 0.3; b++) {
      const t = ini + b * F.bat;
      if (b % 2 === 0) surdo(c, banda, t, 0.9);
      caixa(c, banda, t, b % 2 ? 0.35 : 0.22); caixa(c, banda, t + F.bat / 2, 0.16);
    }
    // acordes dos metais graves em cada compasso
    F.acordes.forEach((ac, i) => {
      const t = ini + i * 4 * F.bat;
      if (t > fim - 0.4) return;
      ac.forEach((g) => metal(c, banda, t, Math.min(4 * F.bat, fim - t) * 0.92, F.raiz + g, 0.07));
    });
    F.notas.forEach((n) => { const t = ini + n.t; if (t < fim - 0.2) metal(c, banda, t, Math.min(n.d * 0.95, fim - t), n.m, 0.16); });
    return DUR_GOL;
  }

  /* instrumental licenciado (opcional): media/hinos/<id>.mp3, 5 s com final suave */
  const HINOS = new Set(((window.PLACAR_CONFIG || {}).hinos || []).filter((x) => /^[a-z-]{2,20}$/.test(x)));
  const bufHino = {};
  async function hino(c, out, t0, id) {
    bufHino[id] = bufHino[id] || fetch(`media/hinos/${id}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((a) => c.decodeAudioData(a));
    const b = await bufHino[id];
    const s = c.createBufferSource(), g = c.createGain(); s.buffer = b;
    g.gain.setValueAtTime(1, t0); g.gain.setValueAtTime(1, t0 + DUR_GOL - 0.8); g.gain.linearRampToValueAtTime(0, t0 + DUR_GOL);
    s.connect(g).connect(out); s.start(t0); s.stop(t0 + DUR_GOL);
    return DUR_GOL;
  }

  /* ---------- fila: um som por vez (dois gols juntos tocam um depois do outro) ---------- */
  let livreEm = 0;
  function tocar(tipo, clube) {
    const reg = { tipo, clube: clube || null, em: Date.now(), tocou: false, motivo: "" };
    historico.push(reg); if (historico.length > 50) historico.shift();
    if (!ligado) { reg.motivo = "som desligado"; return reg; }
    const c = contexto();
    if (!c) { reg.motivo = "sem Web Audio"; return reg; }
    if (c.state !== "running") { c.resume().catch(() => {}); if (c.state !== "running") { reg.motivo = "aguardando o primeiro toque na página"; return reg; } }
    const t0 = Math.max(c.currentTime + 0.03, livreEm);
    let dur;
    if (tipo === "gol") {
      if (HINOS.has(clube)) { dur = DUR_GOL; hino(c, saida, t0, clube).catch(() => gol(c, saida, t0, clube)); }
      else dur = gol(c, saida, t0, clube);
    } else dur = apito(c, saida, t0);
    livreEm = t0 + dur + (tipo === "gol" ? 0.15 : 0);
    reg.tocou = true; reg.inicio = t0; reg.dur = dur;
    return reg;
  }

  /* ---------- gravação (para o vídeo de demonstração): o mesmo som num arquivo WAV ---------- */
  async function wav(tipo, clube) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const sr = 44100, dur = tipo === "gol" ? DUR_GOL + 0.2 : 1.3, c = new OAC(2, Math.ceil(sr * dur), sr);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    const o = c.createGain(); o.gain.value = 0.9; o.connect(comp).connect(c.destination);
    if (tipo === "gol") gol(c, o, 0.02, clube); else apito(c, o, 0.02);
    const buf = await c.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
    const ab = new ArrayBuffer(44 + n * 4), v = new DataView(ab), str = (o2, s) => [...s].forEach((ch, i) => v.setUint8(o2 + i, ch.charCodeAt(0)));
    str(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); str(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
    let s = ""; const u = new Uint8Array(ab); for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
    return btoa(s);
  }

  /* ---------- botão de som no topo ---------- */
  function botao() {
    const b = document.getElementById("som");
    if (!b) return;
    const pinta = () => { b.setAttribute("aria-pressed", String(ligado)); b.setAttribute("aria-label", ligado ? "Som ligado (gol e apito). Clique para desligar" : "Som desligado. Clique para ligar"); b.title = ligado ? "Som ligado" : "Som desligado"; b.classList.toggle("mudo", !ligado); };
    pinta();
    b.addEventListener("click", () => {
      ligado = !ligado;
      try { localStorage.setItem(KEY, ligado ? "on" : "off"); } catch { /* ok */ }
      pinta();
      if (ligado) { destrava(); setTimeout(() => tocar("apito"), 60); }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", botao); else botao();

  window.SONS = {
    gol: (clube) => tocar("gol", clube),
    apito: () => tocar("apito"),
    ligado: () => ligado,
    pronto: () => !!ctx && ctx.state === "running",
    fanfarra, wav, historico, DUR_GOL,
  };
})();
