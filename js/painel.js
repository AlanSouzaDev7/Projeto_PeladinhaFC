/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — painel do dono (#/painel; servidor: worker/painel.mjs) e contagem anônima de visitas
     · visita: a cada página aberta, manda só o tipo da página (inicio, jogo, clube:cruzeiro...). Sem cookie, sem IP.
     · painel: números somados (contas, alertas, bolão, torcida, visitas), só para a conta Google do dono
   ========================================================================== */
(() => {
  "use strict";
  const API = ((window.PLACAR_CONFIG && window.PLACAR_CONFIG.api) || "").replace(/\/+$/, "");
  const esc = (t) => SEG.esc(t);
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const fmt = (v) => n(v).toLocaleString("pt-BR");

  /* ---------- visita ---------- */
  const ROTAS = { "": "inicio", clubes: "clubes", tabela: "tabela", simulador: "simulador", "bora-pro-jogo": "bora", bolao: "bolao", partida: "jogo", jogador: "jogador",
    copa: "copa", sobre: "sobre", status: "status", creditos: "creditos", widgets: "widgets", privacidade: "privacidade" };
  let ultima = "";
  function visita(r) {
    if (!API || !navigator.sendBeacon) return;
    const rota = r.page === "clube" && /^[a-z-]{2,30}$/.test(r.id || "") ? `clube:${r.id}` : ROTAS[r.page];
    const chave = `${rota}|${r.id || ""}`;
    if (!rota || chave === ultima) return;
    ultima = chave;
    try { navigator.sendBeacon(`${API}/visita`, JSON.stringify({ rota })); } catch { /* sem contagem: tudo bem */ }
  }

  /* ---------- painel ---------- */
  function page() {
    return `<div class="page-head"><div><h1>Painel do dono</h1><p>Números somados do CazéStats.TV. Nada aqui identifica uma pessoa.</p></div></div><div data-painel><p class="st-txt">Carregando…</p></div>`;
  }
  async function pede(caminho) {
    const s = window.CONTA?.sessao();
    const r = await fetch(`${API}${caminho}`, { headers: s ? { authorization: `Bearer ${s.sessao}` } : {}, cache: "no-store" });
    let d = {};
    try { d = await SEG.json(r); } catch { /* sem JSON */ }
    return { status: r.status, d };
  }
  const kpi = (v, rotulo, sub = "") => `<div class="kpi"><small>${esc(rotulo)}</small><b>${fmt(v)}</b>${sub ? `<em>${esc(sub)}</em>` : ""}</div>`;
  const barras = (itens, rotulo) => {
    const max = Math.max(1, ...itens.map((x) => n(x.n)));
    return `<ul class="pn-barras">${itens.map((x) => `<li><span>${esc(rotulo(x))}</span><i style="--p:${(n(x.n) / max) * 100}%"></i><b>${fmt(x.n)}</b></li>`).join("")}</ul>`;
  };
  const NOME_ROTA = { inicio: "Página inicial", jogo: "Jogos", jogador: "Jogadores", clubes: "Lista de clubes", tabela: "Tabela", simulador: "Simulador", bora: "Bora pro jogo", bolao: "Bolão",
    copa: "Copas", sobre: "Sobre", status: "Status", creditos: "Créditos", widgets: "Widgets", privacidade: "Privacidade" };
  const nomeClube = (id) => (typeof byId !== "undefined" && byId[id]?.name) || id;
  const nomeRota = (r) => (r.startsWith("clube:") ? `Clube: ${nomeClube(r.slice(6))}` : NOME_ROTA[r] || r);

  async function preenche(el) {
    if (!window.CONTA?.ligado) { el.innerHTML = `<p class="st-txt">A conta está desligada neste site.</p>`; return; }
    if (!window.CONTA.sessao()) {
      el.innerHTML = `<section class="card"><div class="card-b"><p class="st-txt">Entre com a conta Google do dono para ver o painel.</p><button type="button" class="bl-btn" data-pn="entrar">Entrar com Google</button></div></section>`;
      return;
    }
    const { status, d } = await pede("/painel");
    if (status === 403) {
      const eu = await pede("/painel/eu");
      el.innerHTML = `<section class="card"><div class="card-b"><p class="st-txt">Esta conta ainda não está liberada como dona do painel. O código desta conta é:</p>
        <p class="pn-codigo"><code>${esc(eu.d.codigo || "")}</code></p>
        <p class="st-txt">Ele não é senha nem e-mail: é o código que o servidor já usa para a conta. Para liberar, ele vai em <code>DONOS</code> no <code>worker/wrangler.toml</code> e o Worker é publicado de novo.</p></div></section>`;
      return;
    }
    if (status !== 200) { el.innerHTML = `<p class="st-txt">Não deu para carregar o painel (${esc(d.erro || `servidor respondeu ${status}`)}).</p>`; return; }
    const v = d.visitas, dias = v.porDia || [];
    const maxDia = Math.max(1, ...dias.map((x) => n(x.n)));
    el.innerHTML = `
      <section class="card pn-sec"><div class="card-h">Visitas <small>tipo de página e dia, sem identificar ninguém</small></div><div class="card-b">
        <div class="kpis">${kpi(v.hoje, "Hoje")}${kpi(v.dias7, "Últimos 7 dias")}${kpi(v.dias30, "Últimos 30 dias")}</div>
        ${dias.length ? `<div class="pn-dias" role="img" aria-label="Visitas por dia nos últimos 30 dias">${dias.map((x) => `<i style="--h:${(n(x.n) / maxDia) * 100}%" title="${esc(x.dia)}: ${fmt(x.n)}"></i>`).join("")}</div>` : `<p class="st-txt">As visitas aparecem aqui a partir de hoje.</p>`}
        ${v.porRota?.length ? `<h3 class="pn-h">Páginas mais vistas (30 dias)</h3>${barras(v.porRota, (x) => nomeRota(x.rota))}` : ""}
      </div></section>
      <section class="card pn-sec"><div class="card-h">Torcedores</div><div class="card-b"><div class="kpis">
        ${kpi(d.contas.total, "Contas", `${fmt(d.contas.ativos7)} ativas em 7 dias`)}${kpi(d.contas.ativos30, "Ativas em 30 dias")}
        ${kpi(d.alertas.aparelhos, "Aparelhos com alertas", `${fmt(d.alertas.avisosBolao)} com avisos do bolão`)}${kpi(d.torcida.votos, "Votos da torcida", `${fmt(d.torcida.votos7)} nos últimos 7 dias · ${fmt(d.torcida.jogos)} jogos`)}
      </div></div></section>
      <section class="card pn-sec"><div class="card-h">Bolão</div><div class="card-b"><div class="kpis">
        ${kpi(d.bolao.palpites, "Palpites", `${fmt(d.bolao.pessoas)} torcedores`)}${kpi(d.bolao.apelidos, "No ranking")}${kpi(d.bolao.ligas, "Ligas entre amigos")}
      </div></div></section>
      ${d.alertas.porClube?.length ? `<section class="card pn-sec"><div class="card-h">Alertas por clube</div><div class="card-b">${barras(d.alertas.porClube, (x) => nomeClube(x.clube))}</div></section>` : ""}
      <p class="st-txt">Gerado ${new Date(n(d.gerado)).toLocaleString("pt-BR")}. Saúde do sistema: <a href="#/status">página de status</a>.</p>`;
  }
  function mount(view) {
    const el = (view || document).querySelector("[data-painel]:not([data-pn-ok])");
    if (!el) return;
    el.dataset.pnOk = "1";
    preenche(el);
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-pn='entrar']")) { e.stopPropagation(); window.CONTA?.abre?.(); }
  });
  window.addEventListener("conta:mudou", () => document.querySelectorAll("[data-painel]").forEach((el) => preenche(el)));

  window.PAINEL = { page, mount, visita };
})();
