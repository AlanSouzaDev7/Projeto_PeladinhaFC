/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   PLACAR — som do gol (Web Audio, sem arquivos de áudio)
   O único som do site: quando um clube marca, 5 s de estádio explodindo, sem melodia:
     - a torcida gritando "GOOOL" (dezenas de vozes com o timbre da vogal "ô") por cima do ronco da arquibancada;
     - a buzina do estádio;
     - a batucada da torcida organizada (surdo, caixa e repique).
   Cada clube muda um pouco o andamento da batucada e o tom da buzina (sorteados pelo nome do clube).
   Os hinos dos clubes têm autor e gravação protegidos (Lei 9.610/98) e não estão no site. Quem tiver a licença do
   instrumental pode pôr o arquivo em media/hinos/<id do clube>.mp3 e o id em PLACAR_CONFIG.hinos (js/config.js).
   O navegador só deixa tocar som depois do primeiro toque ou clique na página: até lá, nada toca (e nada quebra).
   ========================================================================== */
(() => {
  let ctx = null, saida = null;
  const historico = [];
  const AC = window.AudioContext || window.webkitAudioContext;

  function contexto() {
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
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
  const ruidos = new WeakMap();
  function ruido(c) {
    if (ruidos.has(c)) return ruidos.get(c);
    const n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0; // ruído rosa: soa como multidão, não como chiado
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    ruidos.set(c, b);
    return b;
  }
  const fonteRuido = (c) => { const s = c.createBufferSource(); s.buffer = ruido(c); s.loop = true; return s; };
  const semente = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
  function sorteio(seed) { let x = seed || 1; return () => ((x = Math.imul(x ^ (x >>> 15), 2246822519) ^ Math.imul(x ^ (x >>> 13), 3266489917)), (x >>> 0) / 4294967296); }

  // estilo de cada clube: andamento da batucada e tom da buzina
  function estilo(id) {
    const r = sorteio(semente(id || "placar"));
    return { bpm: 120 + Math.floor(r() * 30), buzina: 196 + Math.floor(r() * 5) * 11, desenho: Math.floor(r() * 3) };
  }

  /* arquibancada: ronco grave + chiado agudo, sobe com a bola na rede e vai baixando */
  function ronco(c, out, t0, fim) {
    const s = fonteRuido(c), lp = c.createBiquadFilter(), bp = c.createBiquadFilter(), g = c.createGain(), g2 = c.createGain();
    lp.type = "lowpass"; lp.frequency.value = 700; bp.type = "bandpass"; bp.frequency.value = 2200; bp.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.35); g.gain.setTargetAtTime(0.5, t0 + 1.4, 1.2);
    g2.gain.setValueAtTime(0.0001, t0); g2.gain.exponentialRampToValueAtTime(0.22, t0 + 0.3); g2.gain.setTargetAtTime(0.1, t0 + 1.2, 1);
    s.connect(lp).connect(g).connect(out); s.connect(bp).connect(g2).connect(out);
    s.start(t0, Math.random()); s.stop(fim);
  }
  /* "GOOOOL": muitas vozes (dente de serra em alturas diferentes) passando pelos formantes da vogal "ô" */
  function grito(c, out, t0, dur) {
    const voz = c.createGain(); voz.gain.value = 0;
    const formantes = [[480, 7, 1], [820, 8, 0.6], [2600, 10, 0.18]].map(([f, q, v]) => {
      const bp = c.createBiquadFilter(), g = c.createGain(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = q; g.gain.value = v;
      voz.connect(bp).connect(g).connect(out); return bp;
    });
    void formantes;
    // "G" (ataque abafado) e o "ô" segurado, que cai no fim como a torcida perdendo o fôlego
    voz.gain.setValueAtTime(0.0001, t0); voz.gain.exponentialRampToValueAtTime(1.1, t0 + 0.18);
    voz.gain.setValueAtTime(1.1, t0 + dur * 0.7); voz.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    for (let i = 0; i < 28; i++) {
      const o = c.createOscillator(), g = c.createGain(), f = 150 + Math.random() * 170; // vozes graves e agudas
      o.type = "sawtooth"; o.frequency.setValueAtTime(f * 0.9, t0); o.frequency.exponentialRampToValueAtTime(f, t0 + 0.25);
      o.frequency.setValueAtTime(f, t0 + dur * 0.75); o.frequency.exponentialRampToValueAtTime(f * 0.85, t0 + dur);
      const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 4 + Math.random() * 3; vg.gain.value = f * 0.02; vib.connect(vg).connect(o.frequency);
      g.gain.value = 0.045; o.connect(g).connect(voz);
      const ini = t0 + Math.random() * 0.12; // nem todo mundo grita junto
      o.start(ini); vib.start(ini); o.stop(t0 + dur + 0.05); vib.stop(t0 + dur + 0.05);
    }
  }
  /* buzina do estádio: acorde grave de metal, áspero, com o "sopro" no começo */
  function buzina(c, out, t0, dur, f) {
    const g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.setValueAtTime(500, t0); lp.frequency.linearRampToValueAtTime(2600, t0 + 0.08); lp.Q.value = 2;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.05); g.gain.setValueAtTime(0.16, t0 + dur - 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    lp.connect(g).connect(out);
    [1, 1.26, 1.5].forEach((k, i) => [-5, 5].forEach((cents) => {
      const o = c.createOscillator(); o.type = i === 0 ? "sawtooth" : "square"; o.frequency.value = f * k; o.detune.value = cents;
      const og = c.createGain(); og.gain.value = i === 0 ? 0.5 : 0.22; o.connect(og).connect(lp); o.start(t0); o.stop(t0 + dur + 0.02);
    }));
  }
  function surdo(c, out, t, vol) {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.28);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.55);
  }
  function pele(c, out, t, vol, f, dur) {
    const s = fonteRuido(c), bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 0.9;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp).connect(g).connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  // batucada: surdo de marcação, caixa em semicolcheias e repique; três desenhos diferentes
  const DESENHOS = [[1, 0, 0, 1, 0, 0, 1, 0], [1, 0, 1, 0, 0, 1, 0, 0], [1, 0, 0, 0, 1, 0, 1, 1]];
  function batucada(c, out, t0, fim, E) {
    const sc = 60 / E.bpm / 4, d = DESENHOS[E.desenho];
    for (let i = 0; t0 + i * sc < fim - 0.25; i++) {
      const t = t0 + i * sc;
      if (i % 8 === 0 || i % 8 === 4) surdo(c, out, t, i % 8 === 0 ? 0.95 : 0.7);
      pele(c, out, t, i % 4 === 0 ? 0.32 : 0.14, 2600, 0.07);          // caixa
      if (d[i % 8]) pele(c, out, t, 0.3, 1100, 0.11);                   // repique
    }
  }

  const DUR_GOL = 5;
  function gol(c, out, t0, id) {
    const E = estilo(id), fim = t0 + DUR_GOL;
    const mix = c.createGain(); mix.connect(out);
    mix.gain.setValueAtTime(0.5, t0); mix.gain.setValueAtTime(0.5, fim - 0.8); mix.gain.linearRampToValueAtTime(0, fim);
    ronco(c, mix, t0, fim);
    grito(c, mix, t0 + 0.05, 2.6);
    buzina(c, mix, t0 + 0.1, 1.1, E.buzina);
    buzina(c, mix, t0 + 1.45, 0.45, E.buzina);
    const banda = c.createGain(); banda.gain.value = 0.8; banda.connect(mix);
    batucada(c, banda, t0 + 0.6, fim, E);
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
  }

  /* fila: dois gols juntos tocam um depois do outro */
  let livreEm = 0;
  function tocarGol(clube) {
    const reg = { tipo: "gol", clube: clube || null, em: Date.now(), tocou: false, motivo: "" };
    historico.push(reg); if (historico.length > 50) historico.shift();
    const c = contexto();
    if (!c) { reg.motivo = "sem Web Audio"; return reg; }
    if (c.state !== "running") { c.resume().catch(() => {}); if (c.state !== "running") { reg.motivo = "aguardando o primeiro toque na página"; return reg; } }
    const t0 = Math.max(c.currentTime + 0.03, livreEm);
    if (HINOS.has(clube)) hino(c, saida, t0, clube).catch(() => gol(c, saida, t0, clube)); else gol(c, saida, t0, clube);
    livreEm = t0 + DUR_GOL + 0.15;
    reg.tocou = true; reg.inicio = t0; reg.dur = DUR_GOL;
    return reg;
  }

  /* gravação (vídeo de demonstração e testes): o mesmo som num arquivo WAV */
  async function wav(clube) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const sr = 44100, c = new OAC(2, Math.ceil(sr * (DUR_GOL + 0.2)), sr);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    const o = c.createGain(); o.gain.value = 0.9; o.connect(comp).connect(c.destination);
    gol(c, o, 0.02, clube);
    const buf = await c.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
    const ab = new ArrayBuffer(44 + n * 4), v = new DataView(ab), str = (o2, s) => [...s].forEach((ch, i) => v.setUint8(o2 + i, ch.charCodeAt(0)));
    str(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); str(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
    let s = ""; const u = new Uint8Array(ab); for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
    return btoa(s);
  }

  window.SONS = { gol: tocarGol, pronto: () => !!ctx && ctx.state === "running", estilo, wav, historico, DUR_GOL };
})();
