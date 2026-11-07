/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   PLACAR — faixa de notícias embaixo do menu (como a tarja dos telejornais)
   Em cima, a manchete principal (troca a cada 8 s); embaixo, a fita com as outras passando.
   Dados: a API (GET /api/manchetes) ou, sem ela, js/live-data.js gravado pelo GitHub Actions a cada 30 min.
   A faixa se atualiza sozinha a cada 30 min, sem recarregar a página. Só título, fonte, hora e link.
   A fita anda em qualquer aparelho: pela Web Animations API (a regra de "reduzir movimento" do CSS não a desliga;
   com as animações do aparelho desligadas ela só anda mais devagar). Para com o mouse em cima, com o foco do teclado
   ou no botão de pausa; não fica presa parada depois de um toque no celular ou de abrir a matéria em outra aba.
   ========================================================================== */
(() => {
  const el = document.getElementById("ticker");
  if (!el) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const congela = new URLSearchParams(location.search).has("estatico");   // prints dos testes: faixa parada
  const WAAPI = typeof Element !== "undefined" && typeof Element.prototype.animate === "function";
  const VEL = reduced ? 40 : 70;   // px por segundo
  const guarda = { get: () => { try { return localStorage.getItem("tk-pausa") === "1"; } catch { return false; } },
    set: (v) => { try { localStorage.setItem("tk-pausa", v ? "1" : "0"); } catch {} } };
  let anim = null, mouse = false, foco = false, pausaUser = guarda.get();
  const esc = (x) => String(x || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const hora = (ts) => new Date(ts * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const ha = (ts) => { const m = Math.max(1, Math.round((Date.now() / 1000 - ts) / 60)); return m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`; };
  const escudos = (x) => (x.clubes || []).slice(0, 2).map((c) => (window.PD?.byId && Object.prototype.hasOwnProperty.call(window.PD.byId, c) && window.GFX ? window.GFX.crest(window.PD.byId[c], 16) : "")).join("");
  let items = [], cur = 0, timer = null;

  function paint() {
    if (!items.length) { el.hidden = true; return; }
    el.hidden = false;
    const top = items.slice(0, 5);
    const fita = items.map((x) => `<a class="tk-item" href="${esc(window.SEG ? SEG.url(x.link) : "#")}" target="_blank" rel="noopener noreferrer">${escudos(x)}<b>${esc(x.title)}</b><small>${esc(x.source)} · ${hora(x.ts)}</small></a>`).join('<i class="tk-sep" aria-hidden="true"></i>');
    el.innerHTML = `
      <div class="tk-tag" aria-hidden="true"><b>PLACAR<i></i></b><span>Futebol agora</span><time class="tk-clock"></time></div>
      <div class="tk-body">
        <div class="tk-head" aria-live="polite">${top.map((x, i) => `<a class="tk-h${i === cur % top.length ? " on" : ""}" href="${esc(window.SEG ? SEG.url(x.link) : "#")}" target="_blank" rel="noopener noreferrer" ${i === cur % top.length ? "" : 'tabindex="-1" aria-hidden="true"'}>
            <b>${esc(x.title)}</b><small>${esc(x.source)} · ${ha(x.ts)}</small></a>`).join("")}${top.length > 1 ? '<i class="tk-prog" aria-hidden="true"></i>' : ""}</div>
        <div class="tk-run"><div class="tk-track${WAAPI ? "" : " css"}">
          <div class="tk-copy">${fita}<i class="tk-sep" aria-hidden="true"></i></div>
          <div class="tk-copy" aria-hidden="true">${fita.replace(/<a /g, '<a tabindex="-1" ')}<i class="tk-sep" aria-hidden="true"></i></div>
        </div></div>
        <button class="tk-pause" type="button"></button>
      </div>`;
    el.querySelector(".tk-pause").addEventListener("click", () => { pausaUser = !pausaUser; guarda.set(pausaUser); estado(); });
    clock();
    speed();
    prog();
    estado();
  }
  // parado: botão de pausa, mouse em cima ou foco do teclado dentro da faixa
  const segura = () => congela || pausaUser || mouse || foco;
  function estado() {
    el.classList.toggle("pausado", pausaUser);
    el.classList.toggle("segura", segura());
    const b = el.querySelector(".tk-pause");
    if (b) { b.setAttribute("aria-pressed", String(pausaUser)); b.setAttribute("aria-label", pausaUser ? "Continuar a faixa de notícias" : "Pausar a faixa de notícias"); b.title = b.getAttribute("aria-label"); }
    if (anim) segura() ? anim.pause() : anim.play();
  }
  // barrinha embaixo da manchete: o tempo até a próxima
  function prog() {
    const p = el.querySelector(".tk-prog");
    if (!p) return;
    p.classList.remove("run"); void p.offsetWidth; p.classList.add("run");
  }
  // a fita anda sempre na mesma velocidade, qualquer que seja o tamanho do texto
  function speed() {
    const copy = el.querySelector(".tk-copy"), track = el.querySelector(".tk-track");
    if (!copy || !track) return;
    const dur = Math.max(30, copy.scrollWidth / VEL);
    el.style.setProperty("--tk-dur", `${dur}s`);
    if (!WAAPI) return;
    // continua do mesmo ponto quando a largura muda (girar o celular, redimensionar)
    const f = anim && anim.effect && anim.currentTime != null ? (anim.currentTime / anim.effect.getTiming().duration) % 1 : 0;
    if (anim && anim.effect && anim.effect.target === track) { anim.effect.updateTiming({ duration: dur * 1000 }); anim.currentTime = f * dur * 1000; return; }
    anim?.cancel();
    anim = track.animate([{ transform: "translate3d(0, 0, 0)" }, { transform: "translate3d(-50%, 0, 0)" }], { duration: dur * 1000, iterations: Infinity, easing: "linear" });
    anim.currentTime = f * dur * 1000;
  }
  function clock() {
    const c = el.querySelector(".tk-clock");
    if (c) c.textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  }
  function next() {
    const hs = [...el.querySelectorAll(".tk-h")];
    if (hs.length < 2 || document.hidden || segura()) return;
    const a = hs[cur % hs.length];
    cur++;
    const b = hs[cur % hs.length];
    a.classList.remove("on"); a.classList.add("out"); a.setAttribute("aria-hidden", "true"); a.tabIndex = -1;
    b.classList.remove("out"); b.classList.add("on"); b.removeAttribute("aria-hidden"); b.removeAttribute("tabindex");
    setTimeout(() => a.classList.remove("out"), 700);
    clock();
    prog();
  }

  async function load() {
    let m = null;
    try {
      if (window.PD?.LIVE) m = await (await fetch("/api/manchetes", { cache: "no-store" })).json();
      else {
        // sem a API: o arquivo que o GitHub Actions grava a cada 30 min (a página não precisa ser recarregada)
        const src = await (await fetch(`js/live-data.js?t=${Date.now()}`, { cache: "no-store" })).text();
        m = JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1)).manchetes;
      }
    } catch { m = null; }
    const novos = (m && m.items) || [];
    if (novos.length && JSON.stringify(novos.map((x) => x.link)) !== JSON.stringify(items.map((x) => x.link))) { items = novos; cur = 0; paint(); }
  }

  items = (window.LIVE_DATA && window.LIVE_DATA.manchetes && window.LIVE_DATA.manchetes.items) || [];
  (window.PD_BOOT || Promise.resolve()).then(() => { paint(); if (window.PD?.LIVE) load(); });
  // troca a cada 8 s; com o mouse (ou o foco) em cima, espera
  let falta = 8000, t0 = Date.now();
  // só o mouse segura (no celular o toque não deixa a faixa presa parada)
  el.addEventListener("pointerenter", (e) => { if (e.pointerType !== "mouse") return; mouse = true; estado(); });
  el.addEventListener("pointerleave", (e) => { if (e.pointerType !== "mouse") return; mouse = false; t0 = Date.now(); estado(); });
  // só o foco do teclado segura (depois de clicar numa notícia o link fica com o foco, mas a faixa continua)
  const focoVisivel = (n) => { try { return n.matches(":focus-visible"); } catch { return false; } };
  el.addEventListener("focusin", (e) => { if (e.target.classList?.contains("tk-pause")) return; const v = focoVisivel(e.target); if (v !== foco) { foco = v; estado(); } });
  el.addEventListener("focusout", () => { if (foco) { foco = false; t0 = Date.now(); estado(); } });
  timer = setInterval(() => {
    if (segura() || document.hidden) { t0 = Date.now(); return; }
    falta -= Date.now() - t0; t0 = Date.now();
    if (falta <= 50) { next(); falta = 8000; }
  }, 250);
  setInterval(clock, 30000);
  setInterval(load, 30 * 60e3);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { clock(); if (Date.now() - (window.__tkLoad || 0) > 30 * 60e3) { window.__tkLoad = Date.now(); load(); } } });
  addEventListener("resize", () => speed());
  window.TICKER = { reload: load };
})();
