/* ==========================================================================
   PLACAR — escalações: campinho interativo e "Bora pro jogo"
   Elencos reais e a escalação do último jogo de cada clube (js/squads.js).
   O que o usuário muda fica salvo no navegador dele.
   ========================================================================== */
(() => {
  const { byId, buildStandings } = window.PD;
  const { crest, display, onColor } = window.GFX;
  const SQ = new Proxy({}, { get: (_, k) => window.SQUADS[k] });
  const LAST = new Proxy({}, { get: (_, k) => (window.SQUADS_LAST || {})[k] });
  const rowOf = (id) => buildStandings().find((r) => r.id === id);

  /* ---------- formações ----------
     posição: [função, grupo, lateral 0–100 (esq→dir), profundidade sem bola, com bola, nº Opta da posição]
     profundidade: 0 = próprio gol, 100 = gol adversário. O nº Opta liga a súmula real à posição no campo. */
  const GK = ["GOL", "G", 50, 4, 8, 1];
  const BACK4 = [["LE", "D", 14, 22, 54, 3], ["ZAG", "D", 37, 17, 30, 6], ["ZAG", "D", 63, 17, 30, 5], ["LD", "D", 86, 22, 54, 2]];
  const BACK3 = [["ZAG", "D", 28, 18, 32, 6], ["ZAG", "D", 50, 15, 28, 5], ["ZAG", "D", 72, 18, 32, 4]];
  const F = {
    "4-2-3-1": [GK, ...BACK4, ["VOL", "M", 35, 28, 44, 8], ["VOL", "M", 65, 28, 44, 4], ["PE", "F", 14, 40, 76, 11], ["MEI", "M", 50, 40, 72, 10], ["PD", "F", 86, 40, 76, 7], ["CA", "F", 50, 46, 88, 9]],
    "4-3-3": [GK, ...BACK4, ["MC", "M", 31, 36, 60, 8], ["VOL", "M", 50, 30, 46, 4], ["MC", "M", 69, 36, 60, 7], ["PE", "F", 14, 44, 82, 11], ["CA", "F", 50, 46, 88, 9], ["PD", "F", 86, 44, 82, 10]],
    "4-4-2": [GK, ...BACK4, ["ME", "M", 14, 34, 66, 11], ["VOL", "M", 37, 30, 50, 8], ["VOL", "M", 63, 30, 50, 4], ["MD", "M", 86, 34, 66, 7], ["CA", "F", 35, 44, 84, 10], ["CA", "F", 65, 44, 84, 9]],
    "4-1-4-1": [GK, ...BACK4, ["VOL", "M", 50, 28, 44, 4], ["ME", "M", 14, 36, 70, 11], ["MC", "M", 38, 36, 62, 10], ["MC", "M", 62, 36, 62, 8], ["MD", "M", 86, 36, 70, 7], ["CA", "F", 50, 46, 88, 9]],
    "3-4-2-1": [GK, ...BACK3, ["ALE", "D", 8, 30, 70, 3], ["MC", "M", 36, 32, 52, 8], ["MC", "M", 64, 32, 52, 7], ["ALD", "D", 92, 30, 70, 2], ["MEI", "M", 30, 42, 78, 11], ["MEI", "M", 70, 42, 78, 10], ["CA", "F", 50, 46, 88, 9]],
    "3-5-2": [GK, ...BACK3, ["ALE", "D", 8, 30, 70, 3], ["MC", "M", 33, 36, 60, 11], ["VOL", "M", 50, 30, 46, 8], ["MC", "M", 67, 36, 60, 7], ["ALD", "D", 92, 30, 70, 2], ["CA", "F", 35, 44, 84, 10], ["CA", "F", 65, 44, 84, 9]],
    "5-3-2": [GK, ["ALE", "D", 8, 22, 60, 3], ["ZAG", "D", 30, 15, 28, 6], ["ZAG", "D", 50, 13, 26, 5], ["ZAG", "D", 70, 15, 28, 4], ["ALD", "D", 92, 22, 60, 2],
      ["MC", "M", 32, 32, 54, 11], ["VOL", "M", 50, 28, 46, 8], ["MC", "M", 68, 32, 54, 7], ["CA", "F", 35, 42, 80, 10], ["CA", "F", 65, 42, 80, 9]],
    "3-4-3": [GK, ...BACK3, ["ME", "M", 10, 32, 66, 3], ["MC", "M", 36, 30, 52, 8], ["MC", "M", 64, 30, 52, 7], ["MD", "M", 90, 32, 66, 2], ["PE", "F", 18, 44, 80, 11], ["CA", "F", 50, 46, 88, 9], ["PD", "F", 82, 44, 80, 10]],
  };
  const FORMS = Object.keys(F);
  const GROUP = { G: "Goleiro", D: "Defensor", M: "Meio-campo", F: "Atacante" };
  const GROUPS = { G: "Goleiros", D: "Defensores", M: "Meias", F: "Atacantes" };
  const PREF = { GOL: [1], LD: [2, 13], ZAG: [3, 4, 14, 15], LE: [6, 16], ALD: [2, 13], ALE: [6, 16], VOL: [5, 15], MC: [8, 10, 18], MEI: [10, 20], ME: [11, 7], MD: [7, 11], PE: [11, 17], PD: [7, 17], CA: [9, 19, 99] };

  const players = (cid) => (SQ[cid] || []).map(([n, name, pos, age, id]) => ({ n, name, pos, age, id: String(id) }));
  /* nome numa linha só no campinho: até 12 letras inteiro; mais que isso, inicial + último sobrenome ("L. Rodriguez") */
  const shortName = (name, max = 12) => { if (name.length <= max) return name; const p = name.split(" "); return p.length > 1 ? `${p[0][0]}. ${p.at(-1)}` : name; };

  /* ---------- escalação inicial ---------- */
  function fromLastMatch(cid) {
    const L = LAST[cid];
    if (!L || !F[L.formation]) return null;
    const byPlace = Object.fromEntries(L.xi.map(([place, id]) => [place, String(id)]));
    const xi = F[L.formation].map((s) => byPlace[s[5]] || null);
    if (xi.filter(Boolean).length < 11) return null;
    const bench = L.bench.map(String).slice(0, 12);
    while (bench.length < 12) bench.push(null);
    return { f: L.formation, xi, bench };
  }
  function suggest(cid, form) {
    const ps = players(cid), used = new Set();
    const xi = F[form].map(([role, g]) => {
      const pool = ps.filter((p) => p.pos === g && !used.has(p.id));
      const pick = pool.find((p) => PREF[role].includes(p.n)) || pool.filter((p) => p.n != null).sort((a, b) => a.n - b.n)[0] || pool[0];
      if (pick) used.add(pick.id);
      return pick ? pick.id : null;
    });
    const rest = ps.filter((p) => !used.has(p.id) && p.n != null).sort((a, b) => a.n - b.n);
    const bench = [...rest.filter((p) => p.pos === "G").slice(0, 1), ...rest.filter((p) => p.pos !== "G").slice(0, 11)].map((p) => p.id);
    return { f: form, xi, bench };
  }
  const initial = (cid) => fromLastMatch(cid) || suggest(cid, "4-2-3-1");

  /* ---------- persistência ---------- */
  const KEY = (cid) => `placar:xi2:${cid}`;
  function load(cid) {
    try {
      const s = JSON.parse(localStorage.getItem(KEY(cid)));
      if (s && F[s.f] && s.xi.length === 11) return s;
    } catch { /* sem armazenamento */ }
    return initial(cid);
  }
  function save(cid, s) { try { localStorage.setItem(KEY(cid), JSON.stringify(s)); } catch { /* sem armazenamento */ } }
  function reset(cid) { try { localStorage.removeItem(KEY(cid)); } catch { /* sem armazenamento */ } }

  /* trocar de formação mantendo os mesmos 11, encaixados pelo setor */
  function reform(cid, s, f) {
    const map = Object.fromEntries(players(cid).map((p) => [p.id, p]));
    const old = F[s.f], pool = s.xi.map((id, i) => ({ id, p: map[id], place: old[i][5] })).filter((x) => x.p);
    const used = new Set();
    const xi = F[f].map(([, g, , , , place]) => {
      const hit = pool.find((x) => x.place === place && x.p.pos === g && !used.has(x.id)) || pool.find((x) => x.p.pos === g && !used.has(x.id));
      if (hit) used.add(hit.id);
      return hit ? hit.id : null;
    });
    pool.filter((x) => !used.has(x.id)).forEach((x) => { const k = xi.indexOf(null); if (k >= 0) xi[k] = x.id; });
    return { f, xi, bench: s.bench }; // formação nova: posições livres voltam ao padrão
  }

  /* ==========================================================================
     Campinho interativo (aba Elenco do clube)
     ========================================================================== */
  const ui = { filter: "all", last: null };

  const tok = (p, c) => p
    ? `<span class="tk" style="--tc:${c.colors[0]};--tb:${c.colors[1]};--to:${onColor(c.colors[0])}">${p.n ?? "–"}</span>`
    : `<span class="tk empty">+</span>`;

  function builder(cid, first = true) {
    const c = byId[cid], s = load(cid), ps = players(cid), map = Object.fromEntries(ps.map((p) => [p.id, p]));
    const inXI = new Set(s.xi), inBench = new Set(s.bench);
    const base = (d) => 96 - d * 1.14; // usa mais o comprimento do campo: linhas mais separadas
    const just = (a, i) => (ui.last && ui.last.some((x) => x.area === a && x.i === i) ? "just" : "");
    const list = ps.filter((p) => ui.filter === "all" || p.pos === ui.filter);
    const L = LAST[cid];
    const fromMatch = L && JSON.stringify(s) === JSON.stringify(fromLastMatch(cid));
    const html = `<div class="lineup ${first ? "first" : ""}" data-lineup="${cid}">
      <div class="lu-bar">
        <div class="chips">${FORMS.map((f) => `<button class="chip ${f === s.f ? "on" : ""}" data-lu-form="${f}">${f}</button>`).join("")}</div>
        <div class="lu-actions">
          ${s.pos ? `<button class="chip" data-lu-unpos title="Volta cada jogador para o lugar da formação">⌖ Alinhar na formação</button>` : ""}
          ${L ? `<button class="chip" data-lu-reset title="Volta para a escalação do último jogo">↺ Último jogo</button>` : ""}
          <a class="chip" href="#/bora-pro-jogo/${cid}/${cid === "palmeiras" ? "flamengo" : "palmeiras"}">Bora pro jogo ›</a>
        </div>
      </div>
      ${L ? `<div class="lu-source">${fromMatch ? "Escalação titular do último jogo" : "Sua escalação · baseada no último jogo"}: ${L.comp}, ${L.home ? `${c.abbr} ${L.score.replace("-", " x ")} ${L.vs}` : `${L.vs} ${L.score.split("-").reverse().join(" x ")} ${c.abbr}`} · ${L.date.split("-").reverse().join("/")} · ${L.formation}</div>` : ""}
      <div class="lu-grid">
        <div>
          <div class="pitch lu-pitch">
            <svg class="lines" viewBox="0 0 68 100" preserveAspectRatio="none" fill="none" stroke="rgba(255,255,255,.45)" stroke-width=".4">
              <rect x="2" y="2" width="64" height="96"/><line x1="2" y1="50" x2="66" y2="50"/><circle cx="34" cy="50" r="9"/>
              <rect x="14" y="2" width="40" height="16"/><rect x="24" y="2" width="20" height="6"/><rect x="14" y="82" width="40" height="16"/><rect x="24" y="92" width="20" height="6"/>
            </svg>
            ${(() => {
              const pts = F[s.f].map(([, , l, dd, da], i) => (s.pos && s.pos[i]) || [l, base((dd + da) / 2)]);
              // largura da etiqueta: até o vizinho mais perto na mesma linha (os nomes nunca se encostam)
              const room = pts.map(([x, y], i) => Math.min(26, ...pts.filter(([, y2], j) => j !== i && Math.abs(y2 - y) < 9).map(([x2]) => Math.abs(x2 - x) - 1.5)));
              return F[s.f].map(([role], i) => {
                const p = map[s.xi[i]], [x, y] = pts[i], mw = Math.max(15, room[i]);
                const nm = p ? (mw < 23 ? shortName(p.name, 9) : shortName(p.name)) : "vaga";
                return `<div class="slot ${just("xi", i)}" data-slot="xi" data-i="${i}" style="left:${x}%;top:${y}%;--i:${i};--mw:${mw.toFixed(1)}cqw" title="${p ? `${p.name} · ${role}` : role}">
                  <span class="tkw">${tok(p, c)}<i class="rl">${role}</i></span><span class="nm">${nm}</span></div>`;
              }).join("");
            })()}
          </div>
          <div class="lu-bench">
            <div class="lu-h"><span>Reservas</span><small>arraste para o campo para trocar</small></div>
            <div class="bench-row">${Array.from({ length: 12 }, (_, i) => {
              const p = map[s.bench[i]];
              return `<div class="slot b ${just("bench", i)}" data-slot="bench" data-i="${i}" title="${p ? p.name : "vaga"}">${tok(p, c)}<span class="bn"><b>${p ? p.name : "Vaga"}</b><small>${p ? GROUP[p.pos] || "" : "arraste alguém"}</small></span></div>`;
            }).join("")}</div>
          </div>
        </div>
        <div class="lu-list card">
          <div class="card-h">Elenco completo <small>${ps.length} jogadores · ESPN</small></div>
          <div class="tabs lu-tabs">${[["all", "Todos"], ...Object.entries(GROUPS)].map(([k, l]) => `<button class="tab ${ui.filter === k ? "on" : ""}" data-lu-filter="${k}">${l}</button>`).join("")}</div>
          <ul>${list.map((p) => `<li data-player="${p.id}" class="${inXI.has(p.id) ? "is-xi" : inBench.has(p.id) ? "is-bench" : ""}">
              <span class="grip" aria-hidden="true">⠿</span>${tok(p, c)}<div><b>${p.name}</b><small>${GROUP[p.pos]}${p.age ? ` · ${p.age} anos` : ""}</small></div>
              <em>${inXI.has(p.id) ? "Titular" : inBench.has(p.id) ? "Reserva" : ""}</em></li>`).join("")}</ul>
        </div>
      </div>
      <p class="lu-hint"><b>Como montar:</b> arraste um jogador da lista ou do banco <b>em cima</b> de quem está no campo para trocar. Arraste um jogador do campo para <b>qualquer ponto da grama</b> para posicioná-lo onde quiser.</p>
    </div>`;
    ui.last = null;
    return html;
  }

  /* coloca o jogador no lugar; quem estava ali vai para onde ele estava (ou sai do time) */
  function place(cid, area, i, pid) {
    const s = load(cid);
    const at = s.xi.indexOf(pid) >= 0 ? ["xi", s.xi.indexOf(pid)] : s.bench.indexOf(pid) >= 0 ? ["bench", s.bench.indexOf(pid)] : null;
    const cur = s[area][i] ?? null;
    if (at) s[at[0]][at[1]] = cur;
    s[area][i] = pid;
    save(cid, s);
    ui.last = [{ area, i }, ...(at ? [{ area: at[0], i: at[1] }] : [])];
  }

  /* ==========================================================================
     Arrastar e soltar com ponteiro (mouse, caneta e dedo)
     ========================================================================== */
  let drag = null;
  document.addEventListener("pointerdown", (e) => {
    const lu = e.target.closest("[data-lineup]");
    if (!lu || e.button > 0) return;
    const row = e.target.closest("[data-player]");
    const slot = e.target.closest("[data-slot]");
    const s = load(lu.dataset.lineup);
    const pid = row ? row.dataset.player : slot ? s[slot.dataset.slot][+slot.dataset.i] : null;
    if (!pid) return;
    drag = { lu, pid, from: row || slot, x: e.clientX, y: e.clientY, on: false, touch: e.pointerType === "touch", t: Date.now(), id: e.pointerId };
    if (slot) e.preventDefault(); // o campo não rola; a lista rola normalmente até o dedo segurar
  });
  document.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dist = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (!drag.on) {
      const fromList = !!drag.from.closest("[data-player]");
      // no celular, na lista: segurar um instante antes de arrastar (para não brigar com a rolagem)
      if (drag.touch && fromList && Date.now() - drag.t < 160) { if (dist > 10) drag = null; return; }
      if (dist < 5) return;
      start();
    }
    e.preventDefault();
    move(e.clientX, e.clientY);
  }, { passive: false });
  document.addEventListener("pointerup", (e) => { if (drag && e.pointerId === drag.id) finish(e.clientX, e.clientY); });
  document.addEventListener("pointercancel", () => cleanup());

  function start() {
    const cid = drag.lu.dataset.lineup, p = players(cid).find((x) => x.id === drag.pid), c = byId[cid];
    drag.on = true;
    drag.ghost = document.createElement("div");
    drag.ghost.className = "lu-ghost";
    drag.ghost.innerHTML = `${tok(p, c)}<b>${p.name}</b>`;
    document.body.append(drag.ghost);
    drag.from.classList.add("dragging");
    drag.lu.classList.add("is-dragging");
    document.body.classList.add("no-select");
  }
  function target(x, y) {
    const el = document.elementFromPoint(x, y);
    const slot = el && el.closest("[data-slot]");
    if (slot && drag.lu.contains(slot) && slot !== drag.from) return slot;
    // jogador do campo solto na grama: vira posição livre
    const pitch = el && el.closest(".lu-pitch");
    return pitch && drag.from.dataset.slot === "xi" ? pitch : null;
  }
  function move(x, y) {
    drag.ghost.style.transform = `translate(${x}px, ${y}px)`;
    const t = target(x, y);
    if (t !== drag.over) { drag.over && drag.over.classList.remove("over"); t && t.classList.add("over"); drag.over = t; }
  }
  function finish(x, y) {
    if (!drag.on) return cleanup();
    const t = target(x, y), lu = drag.lu, cid = lu.dataset.lineup;
    if (t && t.classList.contains("lu-pitch")) {
      const r = t.getBoundingClientRect(), s = load(cid), i = +drag.from.dataset.i;
      const clamp = (v) => Math.round(Math.max(4, Math.min(96, v)) * 10) / 10;
      s.pos = s.pos || F[s.f].map(([, , l, dd, da]) => [l, 94 - ((dd + da) / 2) * 1.08]);
      s.pos[i] = [clamp(((x - r.left) / r.width) * 100), clamp(((y - r.top) / r.height) * 100)];
      save(cid, s);
      ui.last = [{ area: "xi", i }];
    } else if (t) place(cid, t.dataset.slot, +t.dataset.i, drag.pid);
    cleanup();
    if (t) rerender(lu);
  }
  function cleanup() {
    if (!drag) return;
    drag.ghost && drag.ghost.remove();
    drag.from && drag.from.classList.remove("dragging");
    drag.over && drag.over.classList.remove("over");
    drag.lu && drag.lu.classList.remove("is-dragging");
    document.body.classList.remove("no-select");
    drag = null;
  }
  function rerender(el) {
    const y = scrollY, list = el.querySelector(".lu-list ul"), ly = list ? list.scrollTop : 0;
    el.outerHTML = builder(el.dataset.lineup, false);
    scrollTo(0, y);
    const nl = document.querySelector(`[data-lineup] .lu-list ul`);
    if (nl) nl.scrollTop = ly;
  }

  /* ==========================================================================
     Bora pro jogo — prancheta tática comparando duas escalações
     ========================================================================== */
  const bp = { phase: "def", timer: null };
  // posições que o usuário arrastou: { "a|b": { def: { "a3": [x, y] }, a: {...}, b: {...} } } (x, y em % do campo)
  const BKEY = "placar:bora";
  const custom = (() => { try { return JSON.parse(localStorage.getItem(BKEY)) || {}; } catch { return {}; } })();
  const saveCustom = () => { try { localStorage.setItem(BKEY, JSON.stringify(custom)); } catch { /* sem armazenamento */ } };
  const pairOf = (root) => root.dataset.board;
  const moved = (root, phase) => custom[pairOf(root)]?.[phase] || {};

  function shape(cid) {
    const s = load(cid), map = Object.fromEntries(players(cid).map((p) => [p.id, p]));
    return F[s.f].map(([role, g, l, dd, da], i) => ({ role, g, l, dd, da, p: map[s.xi[i]] }));
  }

  function analyse(a, b) {
    const A = rowOf(a), B = rowOf(b), fa = load(a).f, fb = load(b).f;
    const cnt = (f, g) => F[f].filter((x) => x[1] === g).length;
    const wide = (f) => F[f].filter((x) => (x[2] <= 16 || x[2] >= 84) && x[4] >= 60).length;
    const backs = (f) => F[f].filter((x) => x[0] === "ZAG").length;
    const mA = cnt(fa, "M"), mB = cnt(fb, "M"), fwA = cnt(fa, "F"), fwB = cnt(fb, "F");
    let xA = (A.gf / A.j + B.ga / B.j) / 2 + (fwA - 2.5) * 0.08 - (backs(fb) - 2) * 0.06 + 0.15;
    let xB = (B.gf / B.j + A.ga / A.j) / 2 + (fwB - 2.5) * 0.08 - (backs(fa) - 2) * 0.06;
    xA = Math.max(0.2, xA); xB = Math.max(0.2, xB);
    const pois = (l, k) => Math.exp(-l) * l ** k / [1, 1, 2, 6, 24, 120, 720][k];
    let win = 0, draw = 0, loss = 0;
    for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) { const pr = pois(xA, i) * pois(xB, j); i > j ? (win += pr) : i === j ? (draw += pr) : (loss += pr); }
    const tot = win + draw + loss;
    const poss = Math.round(Math.max(30, Math.min(70, 50 + (mA - mB) * 4 + (A.pct - B.pct) / 5)));
    const ca = byId[a].abbr, cb = byId[b].abbr;
    const notes = [];
    notes.push(mA === mB ? ["Meio-campo equilibrado", `${mA} x ${mB} no setor central: a posse vai depender de quem pressiona melhor.`]
      : [`${mA > mB ? ca : cb} manda no meio`, `${Math.max(mA, mB)} x ${Math.min(mA, mB)} homens no meio-campo dão superioridade para circular a bola por dentro.`]);
    const wa = wide(fa), wb = wide(fb);
    notes.push([wa === wb ? "Amplitude parecida" : `${wa > wb ? ca : cb} joga mais aberto`, `${ca} ataca com ${wa} jogador${wa === 1 ? "" : "es"} pelas pontas; ${cb} com ${wb}. ${wa > wb && backs(fb) >= 3 ? `Contra 3 zagueiros, os corredores do ${ca} são a chave.` : wb > wa && backs(fa) >= 3 ? `Contra 3 zagueiros, os corredores do ${cb} são a chave.` : "Quem vencer o duelo pelos lados cria mais cruzamentos."}`]);
    notes.push([`Ataque x defesa`, `${ca} marca ${(A.gf / A.j).toFixed(2)} gols por jogo e encara uma defesa que sofre ${(B.ga / B.j).toFixed(2)}; ${cb} marca ${(B.gf / B.j).toFixed(2)} contra ${(A.ga / A.j).toFixed(2)} sofridos.`]);
    if (fwA !== fwB) notes.push([`${fwA > fwB ? ca : cb} mais agressivo`, `${Math.max(fwA, fwB)} atacantes contra ${Math.min(fwA, fwB)}: mais presença na área, mas mais espaço para o contra-ataque adversário.`]);
    return { xA, xB, win: win / tot, draw: draw / tot, loss: loss / tot, poss, notes };
  }

  function boardTokens(cid, side) {
    const c = byId[cid];
    return shape(cid).map((s, i) => `<div class="bt ${side}" data-side="${side}" data-i="${i}" title="${s.p ? `${s.p.n ?? "–"} · ${s.p.name}` : s.role}" style="--tc:${display(c)};--to:${onColor(display(c))};--tb:${c.colors[1]}">
        <span>${s.p ? s.p.n ?? "–" : ""}</span><em>${s.p ? s.p.name : s.role}</em></div>`).join("");
  }

  function layoutBoard(root, a, b) {
    const phase = bp.phase;
    const arrows = [];
    const mine = moved(root, phase), base = moved(root, "def");
    const put = (cid, side) => {
      const sh = shape(cid), attacking = phase === side;
      root.querySelectorAll(`.bt[data-side="${side}"]`).forEach((el) => {
        const s = sh[+el.dataset.i], k = side + el.dataset.i;
        const d = attacking ? s.da : phase === "def" ? s.dd : Math.max(4, s.dd - (s.g === "G" ? 0 : 6));
        // quem defende fecha o bloco para o meio
        const lat = phase !== "def" && !attacking ? 50 + (s.l - 50) * 0.78 : s.l;
        let x = side === "a" ? d : 100 - d, y = side === "a" ? lat : 100 - lat;
        if (mine[k]) [x, y] = mine[k];
        el.style.left = `${x}%`; el.style.top = `${y}%`;
        el.classList.toggle("moved", !!mine[k]);
        // seta: da posição sem a bola até a posição com a bola (as duas podem ter sido arrastadas)
        if (attacking) {
          const [x0, y0] = base[k] || [side === "a" ? s.dd : 100 - s.dd, side === "a" ? s.l : 100 - s.l];
          if (Math.hypot(x - x0, (y - y0) * 0.65) >= 12) arrows.push(`<line x1="${x0}" y1="${y0}" x2="${x}" y2="${y}" class="arw ${side}" marker-end="url(#ah-${side})"/>`);
        }
      });
    };
    put(a, "a"); put(b, "b");
    const svg = root.querySelector(".board-arrows g");
    if (svg) svg.innerHTML = arrows.join("");
    root.querySelectorAll("[data-phase]").forEach((x) => x.classList.toggle("on", x.dataset.phase === phase));
    const reset = root.querySelector("[data-board-reset]");
    if (reset) reset.hidden = !Object.keys(mine).length;
    const cap = root.querySelector(".board-cap");
    if (cap) cap.textContent = phase === "def" ? "Os dois times organizados sem a bola: linhas, blocos e encaixes." : `${byId[phase === "a" ? a : b].abbr} com a bola: as setas mostram quem avança e por onde o time ataca; o rival recua e fecha o bloco.`;
  }

  function pageBora(a = "flamengo", b = "palmeiras") {
    if (!byId[a]) a = "flamengo";
    if (!byId[b] || b === a) b = a === "palmeiras" ? "flamengo" : "palmeiras";
    const A = byId[a], B = byId[b], an = analyse(a, b);
    const ca = display(A), cb = display(B);
    const pick = (side, cur, other) => `<label class="bp-pick" style="--pc:${display(byId[cur])}">
      ${crest(byId[cur], 34)}<select data-bp-pick="${side}" aria-label="Escolher clube">${Object.values(byId).map((c) => `<option value="${c.id}" ${c.id === cur ? "selected" : ""} ${c.id === other ? "disabled" : ""}>${c.name}</option>`).join("")}</select></label>`;
    const formChips = (cid) => `<div class="chips">${FORMS.map((f) => `<button class="chip ${f === load(cid).f ? "on" : ""}" data-bp-form="${cid}|${f}">${f}</button>`).join("")}</div>`;
    const xiList = (cid) => {
      const c = byId[cid];
      return `<div class="card"><div class="card-h"><span style="display:flex;gap:8px;align-items:center">${crest(c, 20)}${c.abbr}</span><small>${load(cid).f} · <a href="#/clube/${cid}/elenco" style="color:var(--accent)">editar</a></small></div>
        <ul class="squad-list">${shape(cid).map((s) => `<li><span class="n">${s.p ? s.p.n ?? "–" : ""}</span><b>${s.p ? s.p.name : "—"}</b><span class="p">${s.role}</span></li>`).join("")}</ul></div>`;
    };
    const pct = (v) => `${Math.round(v * 100)}%`;
    return `<div class="page-head"><div><div class="eyebrow">Prancheta tática</div><h1>Bora pro jogo</h1>
        <p>Escolha dois clubes e veja como cada time se comporta com e sem a bola. Os times começam com a escalação do último jogo de cada um; mude no campinho do clube ou troque a formação aqui.</p></div></div>
      <div class="bp-head card">
        <div class="bp-side">${pick("a", a, b)}${formChips(a)}</div>
        <button class="icon-btn" data-bp-swap aria-label="Inverter mando">⇄</button>
        <div class="bp-side r">${pick("b", b, a)}${formChips(b)}</div>
      </div>
      <div class="card board-card" data-board="${a}|${b}" style="--ca:${ca};--cb:${cb}">
        <div class="board-bar">
          <button class="chip" data-phase="def">Sem a bola</button>
          <button class="chip" data-phase="a">${A.abbr} ataca</button>
          <button class="chip" data-phase="b">${B.abbr} ataca</button>
          <button class="chip" data-phase-play>▶ Simular</button>
          <button class="chip" data-board-reset hidden>↺ Restaurar posições</button>
          <span class="board-tip">Arraste os jogadores para mudar a posição</span>
        </div>
        <div class="board">
          <svg class="board-lines" viewBox="0 0 105 68" preserveAspectRatio="none" fill="none" stroke="rgba(255,255,255,.5)" stroke-width=".35">
            <rect x="1" y="1" width="103" height="66"/><line x1="52.5" y1="1" x2="52.5" y2="67"/><circle cx="52.5" cy="34" r="9.15"/>
            <rect x="1" y="13.85" width="16.5" height="40.3"/><rect x="1" y="24.85" width="5.5" height="18.3"/><rect x="87.5" y="13.85" width="16.5" height="40.3"/><rect x="98.5" y="24.85" width="5.5" height="18.3"/>
          </svg>
          <svg class="board-arrows" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>${["a", "b"].map((s) => `<marker id="ah-${s}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--c${s})"/></marker>`).join("")}</defs><g></g>
          </svg>
          ${boardTokens(a, "a")}${boardTokens(b, "b")}
        </div>
        <p class="board-cap"></p>
      </div>
      <div class="grid-2" style="margin-top:16px">
        <div>
          <div class="card"><div class="card-h">Leitura tática <small>estimativa a partir das formações e dos números reais</small></div>
            <div class="card-b bp-notes">${an.notes.map(([t, d]) => `<div><b>${t}</b><p>${d}</p></div>`).join("")}</div></div>
          <div class="card"><div class="card-h">Tendência do jogo <small>modelo simples, não é previsão oficial</small></div>
            <div class="card-b">
              <div class="bp-prob"><div style="flex:${an.win};background:${ca}"><b>${pct(an.win)}</b>${A.abbr}</div><div style="flex:${an.draw};background:var(--surface-3)"><b>${pct(an.draw)}</b>Empate</div><div style="flex:${an.loss};background:${cb}"><b>${pct(an.loss)}</b>${B.abbr}</div></div>
              <div class="bp-kpis"><div><small>Gols esperados</small><b>${an.xA.toFixed(1)} x ${an.xB.toFixed(1)}</b></div><div><small>Posse estimada</small><b>${an.poss}% x ${100 - an.poss}%</b></div></div>
            </div></div>
        </div>
        <div class="grid-2 even" style="gap:16px">${xiList(a)}${xiList(b)}</div>
      </div>`;
  }

  /* ---------- cliques ---------- */
  document.addEventListener("click", (e) => {
    const lu = e.target.closest("[data-lineup]");
    if (lu) {
      const cid = lu.dataset.lineup;
      const fb = e.target.closest("[data-lu-form]");
      if (fb) { save(cid, reform(cid, load(cid), fb.dataset.luForm)); return rerender(lu); }
      if (e.target.closest("[data-lu-reset]")) { reset(cid); return rerender(lu); }
      if (e.target.closest("[data-lu-unpos]")) { const s = load(cid); delete s.pos; save(cid, s); return rerender(lu); }
      const ft = e.target.closest("[data-lu-filter]");
      if (ft) { ui.filter = ft.dataset.luFilter; return rerender(lu); }
    }
    const board = e.target.closest(".board-card");
    if (board) {
      const [a, b] = board.dataset.board.split("|");
      const ph = e.target.closest("[data-phase]");
      if (ph) { stopSim(); bp.phase = ph.dataset.phase; layoutBoard(board, a, b); }
      if (e.target.closest("[data-board-reset]")) { stopSim(); if (custom[pairOf(board)]) delete custom[pairOf(board)][bp.phase]; saveCustom(); layoutBoard(board, a, b); }
      if (e.target.closest("[data-phase-play]")) {
        if (bp.timer) return stopSim();
        const seq = ["def", "a", "def", "b"]; let k = 0;
        bp.timer = setInterval(() => { bp.phase = seq[k++ % seq.length]; layoutBoard(board, a, b); }, 2200);
        e.target.closest("[data-phase-play]").textContent = "❚❚ Pausar";
      }
    }
    const bf = e.target.closest("[data-bp-form]");
    if (bf) { const [cid, f] = bf.dataset.bpForm.split("|"); const s = load(cid); if (s.f !== f) save(cid, reform(cid, s, f)); window.dispatchEvent(new Event("hashchange")); }
    if (e.target.closest("[data-bp-swap]")) { const [, , a, b] = location.hash.split("/"); location.hash = `#/bora-pro-jogo/${b || "palmeiras"}/${a || "flamengo"}`; }
  });
  function stopSim() {
    clearInterval(bp.timer); bp.timer = null;
    document.querySelectorAll("[data-phase-play]").forEach((x) => (x.textContent = "▶ Simular"));
  }
  document.addEventListener("change", (e) => {
    const pk = e.target.closest("[data-bp-pick]");
    if (!pk) return;
    const [, , a = "flamengo", b = "palmeiras"] = location.hash.split("/");
    location.hash = pk.dataset.bpPick === "a" ? `#/bora-pro-jogo/${pk.value}/${b}` : `#/bora-pro-jogo/${a}/${pk.value}`;
  });

  /* ---------- prancheta: arrastar jogadores em tempo real ---------- */
  let grab = null;
  document.addEventListener("pointerdown", (e) => {
    const bt = e.target.closest(".board .bt");
    if (!bt || e.button > 0) return;
    const root = bt.closest(".board-card"), field = bt.closest(".board");
    stopSim();
    e.preventDefault();
    bt.setPointerCapture?.(e.pointerId);
    const r = field.getBoundingClientRect();
    // guarda a distância entre o dedo e o ponto do jogador no campo (o jogador não "pula" para baixo do dedo)
    const ax = r.left + (parseFloat(bt.style.left) / 100) * r.width, ay = r.top + (parseFloat(bt.style.top) / 100) * r.height;
    grab = { bt, root, field, r, id: e.pointerId, dx: e.clientX - ax, dy: e.clientY - ay, moved: false };
    bt.classList.add("grab");
    root.classList.add("dragging");
  });
  document.addEventListener("pointermove", (e) => {
    if (!grab || e.pointerId !== grab.id) return;
    const { r, bt, root } = grab;
    const x = Math.max(1.5, Math.min(98.5, ((e.clientX - grab.dx - r.left) / r.width) * 100));
    const y = Math.max(3, Math.min(97, ((e.clientY - grab.dy - r.top) / r.height) * 100));
    bt.style.left = `${x}%`; bt.style.top = `${y}%`;
    grab.moved = true;
    const pair = pairOf(root), k = bt.dataset.side + bt.dataset.i;
    ((custom[pair] ||= {})[bp.phase] ||= {})[k] = [+x.toFixed(1), +y.toFixed(1)];
    // setas e marcações acompanham em tempo real
    if (!grab.raf) grab.raf = requestAnimationFrame(() => { if (!grab) return; grab.raf = 0; const [a, b] = root.dataset.board.split("|"); layoutBoard(root, a, b); });
  });
  const drop = (e) => {
    if (!grab || (e && e.pointerId !== grab.id)) return;
    grab.bt.classList.remove("grab");
    grab.root.classList.remove("dragging");
    if (grab.moved) { saveCustom(); const [a, b] = grab.root.dataset.board.split("|"); layoutBoard(grab.root, a, b); }
    grab = null;
  };
  document.addEventListener("pointerup", drop);
  document.addEventListener("pointercancel", drop);

  /* chamado depois de renderizar a página */
  function mount(root) {
    const lu = root.querySelector("[data-lineup]");
    if (lu) requestAnimationFrame(() => {
      const tabs = document.querySelector(".club-tabs");
      const off = (document.querySelector(".header")?.offsetHeight || 64) + (tabs?.offsetHeight || 0) + 8;
      scrollTo({ top: lu.getBoundingClientRect().top + scrollY - off, behavior: "smooth" });
    });
    const board = root.querySelector(".board-card");
    if (board) {
      stopSim();
      // "?fase=a" ou "?fase=b" na URL abre a prancheta já com esse time atacando
      const f = new URLSearchParams(location.search).get("fase");
      bp.phase = ["a", "b"].includes(f) ? f : "def";
      const [a, b] = board.dataset.board.split("|");
      layoutBoard(board, a, b);
    }
  }

  window.LINEUP = { builder, pageBora, mount, load, players, FORMS, last: (cid) => LAST[cid] };
})();
