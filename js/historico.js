/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — aba "Histórico" do clube
   Todos os jogos guardados no banco desde 2023 (GET <Worker>/jogos?clube=&temporada=, tabela jogos do D1), com:
     · resumo do período filtrado (jogos, V/E/D, gols, aproveitamento);
     · filtros por temporada e por competição;
     · a lista dos jogos, do mais recente ao mais antigo;
     · o retrospecto contra cada adversário.
   Sem o banco, mostra a temporada atual pelo calendário do clube (club-form), como o confronto direto da partida.
   ========================================================================== */
(() => {
  "use strict";
  const esc = (t) => SEG.esc(t);
  const { byId } = window.PD;
  const { crest, crestOutro } = window.GFX;
  const API = ((window.PLACAR_CONFIG && window.PLACAR_CONFIG.api) || "").replace(/\/+$/, "");
  const PRIMEIRA = 2023;
  const ANO = new Date().getFullYear();
  const TEMPORADAS = Array.from({ length: ANO - PRIMEIRA + 1 }, (_, i) => String(ANO - i));
  const cache = new Map(); // clube -> promessa { jogos, fonte }
  const filtro = {}; // clube -> { t: "todas" | "2026"..., c: "todas" | competição }
  const MOSTRA = 40; // jogos visíveis antes de "ver mais"

  const inteiro = (v) => (Number.isInteger(+v) && v !== null && v !== "" ? +v : null);
  const normaliza = (x) => ({
    id: String(x.id ?? ""), data: String(x.data ?? ""), temporada: String(x.temporada ?? String(x.data ?? "").slice(0, 4)),
    competicao: String(x.competicao ?? ""), estado: String(x.estado ?? ""), fase: x.fase ? String(x.fase) : "",
    casa_id: x.casa_id ? String(x.casa_id) : "", casa: String(x.casa ?? ""), fora_id: x.fora_id ? String(x.fora_id) : "", fora: String(x.fora ?? ""),
    gols_casa: inteiro(x.gols_casa), gols_fora: inteiro(x.gols_fora), pen_casa: inteiro(x.pen_casa), pen_fora: inteiro(x.pen_fora),
  });

  async function doBanco(cid) {
    if (!API) throw new Error("sem banco");
    const busca = async (t) => {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
      try {
        const r = await fetch(`${API}/jogos?clube=${encodeURIComponent(cid)}&temporada=${t}&limite=200`, { signal: ctl.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await SEG.json(r);
        return Array.isArray(d.jogos) ? d.jogos : [];
      } finally {
        clearTimeout(timer);
      }
    };
    const listas = await Promise.all(TEMPORADAS.map(busca));
    const jogos = listas.flat();
    if (!jogos.length) throw new Error("clube ainda sem jogos no histórico");
    return jogos;
  }
  async function daTemporada(cid) {
    const cf = await DADOS.carrega("club-form");
    return (cf?.clubs?.[cid]?.all || []).map((e) => ({
      id: e.id, data: e.date, temporada: String(e.date || "").slice(0, 4), competicao: e.comp, estado: e.state,
      casa_id: e.home ? cid : e.oppId, casa: e.home ? byId[cid]?.name : e.opp, fora_id: e.home ? e.oppId : cid, fora: e.home ? e.opp : byId[cid]?.name,
      gols_casa: e.home ? e.gf : e.ga, gols_fora: e.home ? e.ga : e.gf,
    }));
  }
  const carrega = (cid) => {
    if (!cache.has(cid)) {
      cache.set(cid, doBanco(cid).then((j) => ({ jogos: j, fonte: "banco" }), () => daTemporada(cid).then((j) => ({ jogos: j, fonte: "temporada" })))
        .then(({ jogos, fonte }) => {
          const vistos = new Set();
          const lista = jogos.map(normaliza).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.data) && !vistos.has(x.id) && vistos.add(x.id));
          lista.sort((a, b) => (a.data < b.data ? 1 : -1));
          return { jogos: lista, fonte };
        }));
    }
    return cache.get(cid);
  };

  // o jogo do ponto de vista do clube: adversário, mando, gols e resultado
  function visto(x, cid) {
    const casa = x.casa_id === cid;
    const gp = casa ? x.gols_casa : x.gols_fora, gc = casa ? x.gols_fora : x.gols_casa;
    const encerrado = x.estado === "post" && gp != null && gc != null;
    return { casa, adv_id: casa ? x.fora_id : x.casa_id, adv: casa ? x.fora : x.casa, gp, gc, encerrado, res: encerrado ? (gp > gc ? "V" : gp < gc ? "D" : "E") : "" };
  }
  function escudoAdv(id, nome, n) {
    if (id && byId[id]) return crest(byId[id], n);
    const espn = /^espn:(\d+)$/.exec(id || "");
    return crestOutro(nome || "Adversário", espn ? `https://a.espncdn.com/i/teamlogos/soccer/500/${espn[1]}.png` : null, n);
  }
  function resumo(lista, cid) {
    const r = { j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0 };
    for (const x of lista) {
      const v = visto(x, cid);
      if (!v.encerrado) continue;
      r.j++; r.gp += v.gp; r.gc += v.gc;
      r[v.res === "V" ? "v" : v.res === "D" ? "d" : "e"]++;
    }
    r.aprov = r.j ? Math.round(((r.v * 3 + r.e) / (r.j * 3)) * 100) : 0;
    return r;
  }
  function retrospecto(lista, cid) {
    const por = new Map();
    for (const x of lista) {
      const v = visto(x, cid);
      if (!v.encerrado) continue;
      const k = v.adv_id || v.adv;
      const a = por.get(k) || { id: v.adv_id, nome: v.adv, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0 };
      a.j++; a.gp += v.gp; a.gc += v.gc; a[v.res === "V" ? "v" : v.res === "D" ? "d" : "e"]++;
      a.nome = (byId[a.id]?.name) || a.nome;
      por.set(k, a);
    }
    return [...por.values()].sort((a, b) => b.j - a.j || b.v - a.v || a.nome.localeCompare(b.nome));
  }

  function chips(nome, opcoes, atual) {
    return `<div class="hs-chips" role="group" aria-label="${esc(nome)}">${opcoes.map(([v, rot]) =>
      `<button type="button" class="hs-chip${v === atual ? " on" : ""}" data-hs-${nome === "Temporada" ? "t" : "c"}="${esc(v)}" aria-pressed="${v === atual}">${esc(rot)}</button>`).join("")}</div>`;
  }
  function render(el, dados, todos) {
    const cid = el.dataset.hsClube, f = (filtro[cid] = filtro[cid] || { t: "todas", c: "todas" });
    const daT = dados.jogos.filter((x) => f.t === "todas" || x.temporada === f.t);
    const comps = [...new Set(daT.map((x) => x.competicao).filter(Boolean))].sort();
    if (f.c !== "todas" && !comps.includes(f.c)) f.c = "todas";
    const lista = daT.filter((x) => f.c === "todas" || x.competicao === f.c);
    const r = resumo(lista, cid), ret = retrospecto(lista, cid);
    const anos = [...new Set(dados.jogos.map((x) => x.temporada))].sort().reverse();
    const visiveis = todos ? lista : lista.slice(0, MOSTRA);
    const linha = (x, i) => {
      const v = visto(x, cid);
      const placar = v.encerrado ? `${x.gols_casa}–${x.gols_fora}${x.pen_casa != null && x.pen_fora != null ? ` <small>(${x.pen_casa}–${x.pen_fora} pên.)</small>` : ""}` : esc(x.estado === "in" ? "ao vivo" : "a jogar");
      return `<li class="hs-jogo" style="--i:${Math.min(i, 20)}"><span class="hs-data"><b>${x.data.slice(8, 10)}/${x.data.slice(5, 7)}/${x.data.slice(2, 4)}</b><small>${esc(x.competicao)}${x.fase ? ` · ${esc(x.fase)}` : ""}</small></span>`
        + `<span class="hs-adv">${escudoAdv(v.adv_id, v.adv, 24)}<b>${esc(byId[v.adv_id]?.name || v.adv)}</b><small>${v.casa ? "casa" : "fora"}</small></span>`
        + `<span class="hs-placar">${placar}</span>${v.res ? `<span class="fm-res ${v.res}">${v.res}</span>` : "<span></span>"}</li>`;
    };
    const nota = dados.fonte === "banco" ? `Histórico do CazéStats.TV desde ${anos.at(-1) || PRIMEIRA}: cresce a cada rodada` : "Só a temporada atual: o histórico completo não respondeu agora";
    el.innerHTML = `
      <div class="card hs-topo">
        <div class="card-h">Histórico <small>${esc(f.t === "todas" ? "todas as temporadas" : `temporada ${f.t}`)}${f.c !== "todas" ? ` · ${esc(f.c)}` : ""}</small></div>
        <div class="card-b">
          ${chips("Temporada", [["todas", "Todas"], ...anos.map((a) => [a, a])], f.t)}
          ${comps.length > 1 ? chips("Competição", [["todas", "Todas"], ...comps.map((c) => [c, c])], f.c) : ""}
          <div class="hs-resumo">
            <div><b>${r.j}</b><small>jogos</small></div><div class="v"><b>${r.v}</b><small>vitórias</small></div>
            <div><b>${r.e}</b><small>empates</small></div><div class="d"><b>${r.d}</b><small>derrotas</small></div>
            <div><b>${r.gp}<i>:</i>${r.gc}</b><small>gols</small></div><div><b>${r.aprov}%</b><small>aproveitamento</small></div>
          </div>
        </div>
      </div>
      <div class="grid-2 hs-grid">
        <div class="card"><div class="card-h">Jogos <small>${lista.length} no período</small></div>
          <ul class="hs-lista">${visiveis.map(linha).join("") || `<li class="empty" style="padding:18px">Nenhum jogo neste filtro.</li>`}</ul>
          ${!todos && lista.length > MOSTRA ? `<button type="button" class="hs-mais" data-hs-mais>Ver os ${lista.length - MOSTRA} jogos restantes</button>` : ""}
          <div class="source">${esc(nota)}</div></div>
        <div class="card"><div class="card-h">Retrospecto por adversário <small>${ret.length} adversários</small></div>
          <div class="hs-ret-wrap"><table class="hs-ret"><thead><tr><th>Adversário</th><th title="jogos">J</th><th title="vitórias">V</th><th title="empates">E</th><th title="derrotas">D</th><th title="gols pró e contra">Gols</th></tr></thead>
          <tbody>${ret.map((a) => `<tr><td><span class="hs-adv">${escudoAdv(a.id, a.nome, 20)}<b>${esc(a.nome)}</b></span></td><td>${a.j}</td><td class="v">${a.v}</td><td>${a.e}</td><td class="d">${a.d}</td><td>${a.gp}:${a.gc}</td></tr>`).join("")
            || `<tr><td colspan="6" class="empty">Sem jogos encerrados neste filtro.</td></tr>`}</tbody></table></div></div>
      </div>`;
    el.querySelectorAll("[data-hs-t]").forEach((b) => b.addEventListener("click", () => { f.t = b.dataset.hsT; render(el, dados, false); }));
    el.querySelectorAll("[data-hs-c]").forEach((b) => b.addEventListener("click", () => { f.c = b.dataset.hsC; render(el, dados, false); }));
    el.querySelector("[data-hs-mais]")?.addEventListener("click", () => render(el, dados, true));
  }

  function abaClube(cid) {
    return `<div class="hs-aba" data-hs-clube="${esc(cid)}"><div class="card"><div class="empty" style="padding:24px">Carregando o histórico do clube…</div></div></div>`;
  }
  function mount(view) {
    (view || document).querySelectorAll("[data-hs-clube]:not([data-hs-ok])").forEach((el) => {
      el.dataset.hsOk = "1";
      carrega(el.dataset.hsClube)
        .then((d) => el.isConnected && render(el, d, false))
        .catch(() => { el.innerHTML = `<div class="card"><div class="empty" style="padding:24px">Não deu para carregar o histórico agora.</div></div>`; });
    });
  }
  window.HISTORICO = { abaClube, mount, _resumo: resumo, _retrospecto: retrospecto };
})();
