/* ==========================================================================
   PLACAR — faixa de notícias embaixo do menu (como a tarja dos telejornais)
   Em cima, a manchete principal (troca a cada 8 s); embaixo, a fita com as outras passando.
   Dados: a API (GET /api/manchetes) ou, sem ela, js/live-data.js gravado pelo GitHub Actions a cada 30 min.
   A faixa se atualiza sozinha a cada 30 min, sem recarregar a página. Só título, fonte, hora e link.
   ========================================================================== */
(() => {
  const el = document.getElementById("ticker");
  if (!el) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(location.search).has("estatico");
  const esc = (x) => String(x || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const hora = (ts) => new Date(ts * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const ha = (ts) => { const m = Math.max(1, Math.round((Date.now() / 1000 - ts) / 60)); return m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`; };
  const escudos = (x) => (x.clubes || []).slice(0, 2).map((c) => (window.PD?.byId?.[c] && window.GFX ? window.GFX.crest(window.PD.byId[c], 16) : "")).join("");
  let items = [], cur = 0, timer = null;

  function paint() {
    if (!items.length) { el.hidden = true; return; }
    el.hidden = false;
    const top = items.slice(0, 5);
    const fita = items.map((x) => `<a class="tk-item" href="${esc(x.link)}" target="_blank" rel="noopener">${escudos(x)}<b>${esc(x.title)}</b><small>${esc(x.source)} · ${hora(x.ts)}</small></a>`).join('<i class="tk-sep" aria-hidden="true"></i>');
    el.innerHTML = `
      <div class="tk-tag" aria-hidden="true"><b>PLACAR<i></i></b><span>Futebol agora</span><time class="tk-clock"></time></div>
      <div class="tk-body">
        <div class="tk-head" aria-live="polite">${top.map((x, i) => `<a class="tk-h${i === cur % top.length ? " on" : ""}" href="${esc(x.link)}" target="_blank" rel="noopener" ${i === cur % top.length ? "" : 'tabindex="-1" aria-hidden="true"'}>
            <b>${esc(x.title)}</b><small>${esc(x.source)} · ${ha(x.ts)}</small></a>`).join("")}</div>
        <div class="tk-run"><div class="tk-track">
          <div class="tk-copy">${fita}<i class="tk-sep" aria-hidden="true"></i></div>
          ${reduced ? "" : `<div class="tk-copy" aria-hidden="true">${fita.replace(/<a /g, '<a tabindex="-1" ')}<i class="tk-sep" aria-hidden="true"></i></div>`}
        </div></div>
      </div>`;
    clock();
    speed();
  }
  // a fita anda sempre na mesma velocidade, qualquer que seja o tamanho do texto
  function speed() {
    const copy = el.querySelector(".tk-copy");
    if (!copy || reduced) return;
    el.style.setProperty("--tk-dur", `${Math.max(30, copy.scrollWidth / 70)}s`);
  }
  function clock() {
    const c = el.querySelector(".tk-clock");
    if (c) c.textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  }
  function next() {
    const hs = [...el.querySelectorAll(".tk-h")];
    if (hs.length < 2 || document.hidden) return;
    const a = hs[cur % hs.length];
    cur++;
    const b = hs[cur % hs.length];
    a.classList.remove("on"); a.classList.add("out"); a.setAttribute("aria-hidden", "true"); a.tabIndex = -1;
    b.classList.remove("out"); b.classList.add("on"); b.removeAttribute("aria-hidden"); b.removeAttribute("tabindex");
    setTimeout(() => a.classList.remove("out"), 700);
    clock();
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
  if (!reduced) timer = setInterval(next, 8000);
  setInterval(clock, 30000);
  setInterval(load, 30 * 60e3);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { clock(); if (Date.now() - (window.__tkLoad || 0) > 30 * 60e3) { window.__tkLoad = Date.now(); load(); } } });
  addEventListener("resize", () => speed());
  window.TICKER = { reload: load };
})();
