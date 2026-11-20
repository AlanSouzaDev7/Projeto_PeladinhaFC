/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — widget para outros sites (blogs, rádios, sites de torcida colarem com <iframe>)
   Endereço: /widget/?tipo=tabela|clube|jogo&clube=<id>&jogo=<id>&tema=escuro|claro&linhas=<n>
     · tabela: classificação do Brasileirão (as N primeiras linhas, padrão 20)
     · clube: posição, último resultado e próximos jogos de um clube
     · jogo: placar de um jogo (ao vivo, com o minuto)
   Dados: banco do CazéStats.TV (Worker) e, se ele não responder, o arquivo do próprio site. Atualiza a cada minuto.
   Sem cookie e sem rastreio. A marca CazéStats.TV e o link de volta ficam sempre no rodapé.
   ========================================================================== */
(() => {
  "use strict";
  const API = ((window.PLACAR_CONFIG && window.PLACAR_CONFIG.api) || "").replace(/\/+$/, "");
  const SITE = "https://cazestats.pages.dev/";
  const q = new URLSearchParams(location.search);
  const tipo = ["tabela", "clube", "jogo"].includes(q.get("tipo")) ? q.get("tipo") : "tabela";
  const clube = /^[a-z-]{2,30}$/.test(q.get("clube") || "") ? q.get("clube") : "";
  const jogo = /^[a-z-]{2,30}-x-[a-z-]{2,30}-r\d{1,2}$/.test(q.get("jogo") || "") ? q.get("jogo") : "";
  const linhas = Math.min(20, Math.max(4, parseInt(q.get("linhas") || "20", 10) || 20));
  if (q.get("tema") === "claro") document.documentElement.dataset.tema = "claro";
  const el = document.getElementById("w");
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let CLUBES = {};

  async function json(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }
  async function dados() {
    if (API) { try { return await json(`${API}/dados/live-data`); } catch { /* cai no arquivo do site */ } }
    return json("../dados/live-data.json");
  }
  const sigla = (id) => {
    const c = CLUBES[id] || { s: id.slice(0, 3).toUpperCase(), c: ["#555", "#fff"] };
    const claro = (h) => { const n = parseInt(String(h).slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150; };
    const fundo = c.c[0] === "#ffffff" ? c.c[1] : c.c[0];
    return `<span class="w-sigla" style="background:${esc(fundo)};color:${claro(fundo) ? "#111" : "#fff"}">${esc(c.s)}</span>`;
  };
  const nome = (id) => CLUBES[id]?.a || id;
  const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const quando = (d, h) => (d ? `${DIAS[new Date(`${d}T12:00:00-03:00`).getUTCDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)}${h ? ` · ${h}` : ""}` : "data a definir");
  const marca = (link, txt) => `<footer class="w-marca"><span>${esc(txt)}</span><a href="${esc(link)}" target="_blank" rel="noopener">Caz<span>é</span>Stats.TV ↗</a></footer>`;

  function jogos(d) {
    const out = [];
    for (const [rodada, lista] of Object.entries(d.fixtures || {})) {
      for (const g of lista || []) {
        const [home, away, hs, as, date, time, , , info] = g;
        out.push({ id: `${home}-x-${away}-r${rodada}`, rodada: Number(rodada), home, away, hs, as, date, time, estado: info?.state || (hs != null ? "post" : "pre"), clock: info?.clock });
      }
    }
    return out.sort((a, b) => `${a.date || "9"}${a.time || ""}`.localeCompare(`${b.date || "9"}${b.time || ""}`));
  }
  const linhaJogo = (m, grande = false) => {
    const placar = m.estado === "pre" ? "x" : `${m.hs ?? 0} - ${m.as ?? 0}`;
    const sub = m.estado === "in" ? `<span class="vivo">● ao vivo${m.clock ? ` · ${esc(m.clock)}` : ""}</span>` : m.estado === "post" ? "encerrado" : esc(quando(m.date, m.time));
    return `<li class="w-jogo${grande ? " w-grande" : ""}"><span class="c">${sigla(m.home)} ${esc(nome(m.home))}</span><span class="p">${placar}</span><span class="c">${esc(nome(m.away))} ${sigla(m.away)}</span><small>${m.rodada}ª rodada · ${sub}</small></li>`;
  };

  function desenha(d) {
    const tab = (d.standings || []).map((r, i) => ({ id: r[0], pos: i + 1, p: r[1], j: r[2], sg: Number(r[6]) - Number(r[7]) })); // [id, P, J, V, E, D, GP, GC, ...]
    if (tipo === "tabela") {
      el.innerHTML = `<div class="w-h"><b>Brasileirão</b><small>${d.round ? `${esc(d.round)}ª rodada` : ""}</small></div>
        <table class="w-tab"><thead><tr><th>#</th><th>Clube</th><th>P</th><th>J</th><th>SG</th></tr></thead><tbody>
        ${tab.slice(0, linhas).map((r) => `<tr><td>${r.pos}</td><td>${sigla(r.id)}<span>${esc(nome(r.id))}</span></td><td class="pts">${esc(r.p)}</td><td>${esc(r.j)}</td><td>${r.sg > 0 ? "+" : ""}${esc(r.sg)}</td></tr>`).join("")}
        </tbody></table>${marca(`${SITE}#/tabela`, "Tabela completa")}`;
      return;
    }
    const todos = jogos(d);
    if (tipo === "jogo") {
      const m = todos.find((x) => x.id === jogo);
      el.innerHTML = m ? `<ul class="w-jogos">${linhaJogo(m, true)}</ul>${marca(`${SITE}jogo/${m.id}`, "Estatísticas do jogo")}` : `<p class="w-msg">Jogo não encontrado.</p>${marca(SITE, "")}`;
      return;
    }
    const t = tab.find((r) => r.id === clube);
    const dele = todos.filter((m) => m.home === clube || m.away === clube);
    const ultimo = dele.filter((m) => m.estado === "post").at(-1), vivo = dele.find((m) => m.estado === "in");
    const prox = dele.filter((m) => m.estado === "pre").slice(0, 3);
    el.innerHTML = `<div class="w-h"><b>${CLUBES[clube] ? `${sigla(clube)} ${esc(nome(clube))}` : "Clube"}</b><small>${t ? `${t.pos}º · ${esc(t.p)} pontos` : ""}</small></div>
      <ul class="w-jogos">${vivo ? linhaJogo(vivo) : ""}${ultimo ? linhaJogo(ultimo) : ""}${prox.map((m) => linhaJogo(m)).join("")}</ul>
      ${marca(`${SITE}clube/${clube}`, "Tudo sobre o clube")}`;
  }

  async function atualiza() {
    try { desenha(await dados()); } catch { if (!el.querySelector(".w-marca")) el.innerHTML = `<p class="w-msg">Não deu para carregar agora. Tentando de novo em 1 minuto.</p>${marca(SITE, "")}`; }
    // avisa a página de fora a altura certa (opcional: quem cola o widget pode ajustar o iframe)
    try { parent.postMessage({ cazestats: "altura", altura: document.documentElement.scrollHeight }, "*"); } catch { /* fora de iframe */ }
  }
  json("clubes.json").then((c) => { CLUBES = c; }).catch(() => {}).finally(() => { atualiza(); setInterval(atualiza, 60e3); });
})();
