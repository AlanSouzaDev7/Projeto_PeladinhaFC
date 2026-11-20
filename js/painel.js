/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — administração (servidor: worker/painel.mjs) e métricas anônimas de uso
     · métricas: tipo da página aberta, uso das funções e abas, origem na primeira página da visita.
       Sem cookie, sem IP guardado, sem identificador do aparelho.
     · administração: endereço próprio (fora de menus); o acesso de verdade é a conta Google do dono, conferida no
       servidor. Gráficos ao vivo, tráfego, público, funções mais usadas, segurança, torcedores e saúde.
   ========================================================================== */
(() => {
  "use strict";
  const API = ((window.PLACAR_CONFIG && window.PLACAR_CONFIG.api) || "").replace(/\/+$/, "");
  const ROTA_ADMIN = "adm-p5vqr61bd2rdvi7vaehgwl";
  const esc = (t) => SEG.esc(t);
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const fmt = (v) => n(v).toLocaleString("pt-BR");

  /* ---------- métricas anônimas ---------- */
  const envia = (corpo) => { if (API && navigator.sendBeacon) try { navigator.sendBeacon(`${API}/visita`, JSON.stringify(corpo)); } catch { /* sem métrica: tudo bem */ } };
  const ROTAS = { "": "inicio", clubes: "clubes", tabela: "tabela", simulador: "simulador", "bora-pro-jogo": "bora", bolao: "bolao", partida: "jogo", jogador: "jogador",
    copa: "copa", sobre: "sobre", status: "status", creditos: "creditos", widgets: "widgets", privacidade: "privacidade" };
  let ultima = "";
  function visita(r) {
    if (r.page === ROTA_ADMIN) return; // a administração não entra nas estatísticas
    const rota = r.page === "clube" && /^[a-z-]{2,30}$/.test(r.id || "") ? `clube:${r.id}` : ROTAS[r.page];
    const chave = `${r.page}|${r.id || ""}|${r.tab || ""}`;
    if (!rota || chave === ultima) return;
    const mesmaPagina = ultima.split("|").slice(0, 2).join("|") === `${r.page}|${r.id || ""}`;
    ultima = chave;
    if (r.tab && (r.page === "clube" || r.page === "jogador")) envia({ rota: `aba:${r.tab}` });
    if (mesmaPagina) return; // trocar de aba não é outra página
    let primeira = false;
    try { primeira = !sessionStorage.getItem("cazestats:visita"); sessionStorage.setItem("cazestats:visita", "1"); } catch { /* sem armazenamento */ }
    envia({ rota, primeira, ref: primeira ? document.referrer.slice(0, 200) : undefined, app: window.PLACAR_APP ? 1 : undefined });
  }
  // funções mais usadas: só o nome da função, quando o torcedor usa
  const USOS = [["[data-cp]", "compartilhar"], ["details.agenda > summary, [data-agenda-copiar]", "agenda"], ["[data-vote]", "palpite-1x2"], ["[data-craque]", "craque"],
    ["[data-alerta], [data-alerta-tipo]", "alerta"], ["[data-instalar]", "instalar"], ["[data-wg-copiar]", "widget-copiado"], ['[data-bl="salvar"]', "bolao-palpite"], ["[data-fav]", "favorito"]];
  document.addEventListener("click", (e) => {
    for (const [sel, uso] of USOS) if (e.target.closest(sel)) { envia({ rota: `uso:${uso}` }); break; }
  }, true);
  document.addEventListener("submit", (e) => { if (e.target.closest('[data-bl-form="criar"], [data-bl-form="codigo"]')) envia({ rota: "uso:bolao-liga" }); }, true);

  /* ---------- administração ---------- */
  function page() {
    return `<div class="page-head adm-topo"><div><h1>Administração</h1><p>Números do CazéStats.TV. Nada aqui identifica uma pessoa.</p></div>
      <span class="adm-vivo" data-adm-vivo><i></i>ao vivo</span></div><div data-admin><p class="st-txt">Carregando…</p></div>`;
  }
  async function pede(caminho) {
    const s = window.CONTA?.sessao();
    const r = await fetch(`${API}${caminho}`, { headers: s ? { authorization: `Bearer ${s.sessao}` } : {}, cache: "no-store" });
    let d = {};
    try { d = await SEG.json(r); } catch { /* sem JSON */ }
    return { status: r.status, d };
  }
  const kpi = (v, rotulo, sub = "", alerta = false) => `<div class="kpi${alerta ? " adm-alerta" : ""}"><small>${esc(rotulo)}</small><b>${typeof v === "string" ? esc(v) : fmt(v)}</b>${sub ? `<em>${esc(sub)}</em>` : ""}</div>`;
  const lista = (itens, rotulo, vazio = "Sem dados ainda.") => {
    if (!itens?.length) return `<p class="st-txt">${esc(vazio)}</p>`;
    const max = Math.max(1, ...itens.map((x) => n(x.n)));
    return `<ul class="pn-barras">${itens.map((x) => `<li><span>${esc(rotulo(x))}</span><i style="--p:${(n(x.n) / max) * 100}%"></i><b>${fmt(x.n)}</b></li>`).join("")}</ul>`;
  };
  // gráfico de barras em SVG (série única ou duas séries empilhadas), com rótulos nas pontas
  function grafico(pontos, { chaves, cores, nomes, rotuloX, alto = 140 }) {
    if (!pontos.length) return `<p class="st-txt">Sem dados neste período ainda.</p>`;
    const L = 600, A = alto, larg = L / pontos.length;
    const max = Math.max(1, ...pontos.map((p) => chaves.reduce((s, k) => s + n(p[k]), 0)));
    const barras = pontos.map((p, i) => {
      let y = A;
      return chaves.map((k, j) => {
        const h = (n(p[k]) / max) * (A - 18);
        y -= h;
        return `<rect x="${(i * larg + larg * 0.12).toFixed(1)}" y="${y.toFixed(1)}" width="${(larg * 0.76).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="1.5" fill="${cores[j]}"><title>${esc(rotuloX(p))}: ${chaves.map((kk, jj) => `${nomes[jj]} ${fmt(p[kk])}`).join(" · ")}</title></rect>`;
      }).join("");
    }).join("");
    const leg = chaves.length > 1 ? `<div class="adm-leg">${nomes.map((nm, j) => `<span><i style="background:${cores[j]}"></i>${esc(nm)}</span>`).join("")}</div>` : "";
    return `<figure class="adm-graf"><svg viewBox="0 0 ${L} ${A}" preserveAspectRatio="none" role="img" aria-label="${esc(nomes.join(" e "))}">${barras}</svg>
      <figcaption><span>${esc(rotuloX(pontos[0]))}</span><span>máx. ${fmt(max)}</span><span>${esc(rotuloX(pontos.at(-1)))}</span></figcaption>${leg}</figure>`;
  }
  // os últimos 60 minutos, com zero nos minutos sem movimento
  function ultimaHora(serie) {
    const mapa = new Map(serie.map((x) => [x.minuto, x])), out = [], agora = Date.now();
    for (let i = 59; i >= 0; i--) {
      const m = new Date(agora - i * 60e3).toISOString().slice(0, 16);
      out.push({ minuto: m, paginas: n(mapa.get(m)?.paginas), api: n(mapa.get(m)?.api) });
    }
    return out;
  }
  const horaLocal = (iso) => new Date(`${iso}${iso.length === 13 ? ":00" : ""}:00Z`).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const NOME_ROTA = { inicio: "Página inicial", jogo: "Jogos", jogador: "Jogadores", clubes: "Lista de clubes", tabela: "Tabela", simulador: "Simulador", bora: "Bora pro jogo", bolao: "Bolão",
    copa: "Copas", sobre: "Sobre", status: "Status", creditos: "Créditos", widgets: "Widgets", privacidade: "Privacidade" };
  const NOME_USO = { compartilhar: "Compartilhar imagem", agenda: "Agenda no celular", "palpite-1x2": "Quem vai vencer (1x2)", craque: "Craque do jogo", alerta: "Alertas", instalar: "Instalar o app",
    "widget-copiado": "Widget copiado", "bolao-palpite": "Palpite no bolão", "bolao-liga": "Ligas do bolão", favorito: "Favoritar clube", busca: "Busca", simulador: "Simulador", comparar: "Comparar" };
  const NOME_ABA = { geral: "Visão geral", partidas: "Partidas", escalacoes: "Escalações", historico: "Histórico", elenco: "Elenco", mercado: "Janela", estatisticas: "Estatísticas",
    comparar: "Comparar", tabela: "Tabela", ultimos: "Jogador: últimos 10", temporada: "Jogador: temporada", calor: "Jogador: mapa de calor" };
  const NOME_SEG = { varredura: "Varredura de endereços (robô procurando falhas)", "login-invalido": "Login com comprovante inválido", "admin-sem-login": "Administração sem login",
    "admin-negado": "Administração com conta sem acesso", "chave-robo-invalida": "Chave do robô errada", "excesso-de-pedidos": "Excesso de pedidos (limite atingido)",
    "pedido-grande": "Pedido grande demais", "pedido-invalido": "Pedido malformado", "rota-desconhecida": "Endereço inexistente" };
  const GRAVE = new Set(["varredura", "chave-robo-invalida", "admin-negado", "login-invalido", "excesso-de-pedidos"]);
  const nomeClube = (id) => (typeof byId !== "undefined" && byId[id]?.name) || id;
  const nomeRota = (r) => (r.startsWith("clube:") ? `Clube: ${nomeClube(r.slice(6))}` : NOME_ROTA[r] || r);
  const ha = (ms) => { const m = Math.max(0, Math.round((Date.now() - n(ms)) / 60e3)); return m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`; };
  const COR = { a: "var(--accent)", b: "var(--text-3)", r: "#ef4444" }; // páginas em destaque; pedidos ao servidor em cinza

  function desenha(el, d, saude, chk) {
    const t = d.trafego, seg = d.seguranca;
    const graves24 = (seg.tipos24h || []).filter((x) => GRAVE.has(x.tipo)).reduce((s, x) => s + n(x.n), 0);
    const cresc = t.crescimento == null ? "sem semana anterior" : `${t.crescimento > 0 ? "+" : ""}${t.crescimento}% contra a semana anterior`;
    const hora = ultimaHora(t.tempoReal || []), agoraMin = hora.slice(-5).reduce((s, x) => s + x.paginas, 0);
    el.innerHTML = `
      <div class="kpis adm-kpis">
        ${kpi(agoraMin, "Páginas nos últimos 5 min")}${kpi(t.hoje, "Páginas hoje")}${kpi(t.dias7, "Últimos 7 dias", cresc)}${kpi(t.dias30, "Últimos 30 dias")}
        ${kpi(d.contas.total, "Contas", `${fmt(d.contas.ativos7)} ativas em 7 dias`)}${kpi(d.alertas.aparelhos, "Aparelhos com alertas")}
        ${kpi(graves24, "Alertas de segurança (24 h)", graves24 ? "veja a seção Segurança" : "nada suspeito", graves24 > 0)}${chk ? kpi(n(chk.total), "Avisos nos dados", n(chk.total) ? "veja Qualidade dos dados" : "tudo coerente", n(chk.total) > 0) : ""}${kpi(d.erros24h, "Erros no navegador (24 h)", "", d.erros24h > 20)}
      </div>
      <section class="card adm-sec"><div class="card-h">Tempo real <small>última hora, minuto a minuto · atualiza a cada 15 s</small></div><div class="card-b">
        ${grafico(hora, { chaves: ["paginas", "api"], cores: [COR.a, COR.b], nomes: ["Páginas abertas", "Pedidos ao servidor"], rotuloX: (p) => horaLocal(p.minuto) })}</div></section>
      <div class="adm-duas">
        <section class="card adm-sec"><div class="card-h">Últimas 24 horas <small>por hora</small></div><div class="card-b">
          ${grafico(t.porHora || [], { chaves: ["paginas", "api"], cores: [COR.a, COR.b], nomes: ["Páginas", "Pedidos"], rotuloX: (p) => horaLocal(p.hora), alto: 120 })}</div></section>
        <section class="card adm-sec"><div class="card-h">Últimos 30 dias <small>páginas por dia</small></div><div class="card-b">
          ${grafico(t.porDia || [], { chaves: ["n"], cores: [COR.a], nomes: ["Páginas"], rotuloX: (p) => p.dia.slice(8, 10) + "/" + p.dia.slice(5, 7), alto: 120 })}</div></section>
      </div>
      <div class="adm-duas">
        <section class="card adm-sec"><div class="card-h">Funções mais usadas <small>30 dias</small></div><div class="card-b">
          ${lista(d.uso.funcoes, (x) => NOME_USO[x.chave] || x.chave, "As funções começam a ser contadas a partir de agora.")}
          <h3 class="pn-h">Abas mais abertas</h3>${lista(d.uso.abas, (x) => NOME_ABA[x.chave] || x.chave)}</div></section>
        <section class="card adm-sec"><div class="card-h">Páginas mais vistas <small>30 dias</small></div><div class="card-b">${lista(t.porRota, (x) => nomeRota(x.rota))}</div></section>
      </div>
      <div class="adm-tres">
        <section class="card adm-sec"><div class="card-h">De onde vêm <small>primeira página da visita</small></div><div class="card-b">${lista(d.publico.origens, (x) => ({ google: "Google", "outras-buscas": "Outras buscas", whatsapp: "WhatsApp", "redes-sociais": "Redes sociais", direto: "Direto (link ou digitado)", "outros-sites": "Outros sites" })[x.chave] || x.chave)}</div></section>
        <section class="card adm-sec"><div class="card-h">Aparelhos</div><div class="card-b">${lista(d.publico.aparelhos, (x) => ({ celular: "Celular", computador: "Computador", app: "App 433Fut" })[x.chave] || x.chave)}</div></section>
        <section class="card adm-sec"><div class="card-h">Países</div><div class="card-b">${lista(d.publico.paises, (x) => x.chave === "BR" ? "Brasil" : x.chave)}</div></section>
      </div>
      <section class="card adm-sec adm-seg"><div class="card-h">Segurança <small>o que o servidor recusou · origem = código anônimo que muda todo dia</small></div><div class="card-b">
        <div class="adm-duas sem-gap">
          <div><h3 class="pn-h">Últimas 24 horas</h3>${lista(seg.tipos24h, (x) => NOME_SEG[x.tipo] || x.tipo, "Nenhuma tentativa recusada.")}</div>
          <div><h3 class="pn-h">Últimos 7 dias</h3>${lista(seg.tipos7d, (x) => NOME_SEG[x.tipo] || x.tipo, "Nenhuma tentativa recusada.")}</div>
        </div>
        ${seg.origens?.length ? `<h3 class="pn-h">Origens mais insistentes (7 dias)</h3><div class="adm-tab-rola"><table class="adm-tab"><thead><tr><th>Origem</th><th>País</th><th>Tentativas</th><th>Tipos</th><th>Última</th></tr></thead><tbody>
          ${seg.origens.map((o) => `<tr class="${n(o.n) >= 20 ? "grave" : ""}"><td><code>${esc(o.origem)}</code></td><td>${esc(o.pais || "?")}</td><td>${fmt(o.n)}</td><td>${esc(String(o.tipos || "").split(",").map((x) => NOME_SEG[x]?.split(" (")[0] || x).join(", "))}</td><td>${esc(ha(o.ultimo))}</td></tr>`).join("")}
          </tbody></table></div>` : ""}
        ${seg.recentes?.length ? `<h3 class="pn-h">Últimos eventos</h3><div class="adm-tab-rola"><table class="adm-tab"><thead><tr><th>Quando</th><th>Tipo</th><th>Endereço</th><th>Origem</th><th>País</th></tr></thead><tbody>
          ${seg.recentes.map((e) => `<tr class="${GRAVE.has(e.tipo) ? "grave" : ""}"><td>${esc(ha(e.quando))}</td><td>${esc(NOME_SEG[e.tipo]?.split(" (")[0] || e.tipo)}</td><td><code>${esc(`${e.metodo} ${e.rota}`)}</code></td><td><code>${esc(e.origem)}</code></td><td>${esc(e.pais || "?")}</td></tr>`).join("")}
          </tbody></table></div>` : ""}
        <p class="st-txt">O site em si (páginas e arquivos) fica na rede da Cloudflare, que barra ataques de volume antes de chegarem aqui; esta seção mostra o que chegou ao servidor e foi recusado.</p>
      </div></section>
      ${checagemHTML(chk)}
      <div class="adm-duas">
        <section class="card adm-sec"><div class="card-h">Torcedores e engajamento</div><div class="card-b"><div class="kpis">
          ${kpi(d.contas.ativos30, "Contas ativas em 30 dias", d.contas.total ? `${Math.round((d.contas.ativos30 / d.contas.total) * 100)}% do total` : "")}${kpi(d.contas.sessoes, "Sessões abertas")}
          ${kpi(d.bolao.palpites, "Palpites no bolão", `${fmt(d.bolao.pessoas)} torcedores · ${fmt(d.bolao.ligas)} ligas`)}${kpi(d.torcida.votos, "Votos da torcida", `${fmt(d.torcida.votos7)} em 7 dias · ${fmt(d.torcida.jogos)} jogos`)}
          ${kpi(d.alertas.avisosBolao, "Avisos do bolão ligados")}${kpi(d.bolao.apelidos, "No ranking do bolão")}</div>
          <h3 class="pn-h">Contas novas por dia (30 dias)</h3>${grafico(d.contas.novasPorDia || [], { chaves: ["n"], cores: [COR.b], nomes: ["Contas novas"], rotuloX: (p) => p.dia.slice(8, 10) + "/" + p.dia.slice(5, 7), alto: 90 })}</div></section>
        <section class="card adm-sec"><div class="card-h">Alertas por clube</div><div class="card-b">${lista(d.alertas.porClube, (x) => nomeClube(x.clube), "Ninguém ligou alertas ainda.")}</div></section>
      </div>
      <div class="adm-duas">
        <section class="card adm-sec"><div class="card-h">Widgets em outros sites <small>30 dias</small></div><div class="card-b">
          ${lista(d.uso.widgets, (x) => ({ tabela: "Tabela", clube: "Jogos de um clube", jogo: "Placar de um jogo" })[x.chave] || x.chave, "Nenhum widget exibido ainda.")}
          <h3 class="pn-h">Sites que colaram o widget</h3>${lista(d.uso.sitesComWidget, (x) => x.chave, "Nenhum site ainda.")}</div></section>
        <section class="card adm-sec"><div class="card-h">Saúde do sistema</div><div class="card-b">
          ${saude?.itens ? `<ul class="st-lista">${saude.itens.map((i) => `<li class="${esc(i.estado)}"><i aria-hidden="true"></i><div><b>${esc(i.nome)}</b><small>${esc(i.explica || "")}</small></div><span>${({ ok: "Funcionando", atencao: "Atrasado", fora: "Parado" })[i.estado] || "Sem registro"}<small>${i.id === "banco" ? "agora" : i.quando ? ha(i.quando) : ""}</small></span></li>`).join("")}</ul>` : `<p class="st-txt">Status indisponível.</p>`}
        </div></section>
      </div>
      <p class="st-txt">Atualizado ${new Date(n(d.gerado)).toLocaleTimeString("pt-BR")}. Métricas anônimas: tipo de página, função usada, origem e aparelho, sem cookie e sem guardar IP.</p>`;
  }

  // qualidade dos dados: o que a checagem automática do robô apontou (server/checagem.py, dados/checagem.json)
  const NOME_CHK = { jogador: "Números de jogadores", tabela: "Classificação", carreira: "Carreiras" };
  function checagemHTML(chk) {
    if (!chk || !Number.isFinite(Number(chk.total))) return `<section class="card adm-sec"><div class="card-h">Qualidade dos dados</div><div class="card-b"><p class="st-txt">A checagem aparece depois da próxima rodada do robô.</p></div></section>`;
    const tipos = Object.entries(chk.porTipo || {}).map(([k, v]) => ({ chave: k, n: v }));
    const avisos = (chk.avisos || []).slice(0, 15);
    return `<section class="card adm-sec"><div class="card-h">Qualidade dos dados <small>checagem automática do robô · ${esc(chk.updated || "")}</small></div><div class="card-b">
      ${n(chk.total) ? `${lista(tipos, (x) => NOME_CHK[x.chave] || x.chave)}
        <div class="adm-tab-rola"><table class="adm-tab"><thead><tr><th>Onde</th><th>O que não faz sentido</th></tr></thead><tbody>
        ${avisos.map((a) => `<tr><td>${esc(nomeClube(a.clube))}${a.nome ? ` · ${esc(a.nome)}` : ""}</td><td>${esc(a.motivo)}</td></tr>`).join("")}</tbody></table></div>
        ${n(chk.total) > avisos.length ? `<p class="st-txt">Mostrando ${avisos.length} de ${fmt(chk.total)} avisos.</p>` : ""}` : `<p class="st-txt">Nenhum número estranho nos dados. ✔</p>`}
    </div></section>`;
  }

  let timer = null;
  async function preenche(el) {
    if (!window.CONTA?.ligado) { el.innerHTML = `<p class="st-txt">A conta está desligada neste site.</p>`; return; }
    if (!window.CONTA.sessao()) {
      el.innerHTML = `<section class="card"><div class="card-b"><p class="st-txt">Entre com a conta Google do dono.</p><button type="button" class="bl-btn" data-pn="entrar">Entrar com Google</button></div></section>`;
      return;
    }
    const [{ status, d }, saude, chk] = await Promise.all([pede("/painel"), fetch(`${API}/status`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch(`${API}/dados/checagem`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
    if (status === 403) {
      const eu = await pede("/painel/eu");
      el.innerHTML = `<section class="card"><div class="card-b"><p class="st-txt">Esta conta não tem acesso. Código da conta (não é senha nem e-mail):</p><p class="pn-codigo"><code>${esc(eu.d.codigo || "")}</code></p></div></section>`;
      return;
    }
    if (status !== 200) { el.innerHTML = `<p class="st-txt">Não deu para carregar (${esc(d.erro || `servidor respondeu ${status}`)}).</p>`; return; }
    const y = scrollY;
    desenha(el, d, saude, chk);
    scrollTo(0, y);
    document.querySelector("[data-adm-vivo]")?.classList.add("on");
  }
  function mount(view) {
    const el = (view || document).querySelector("[data-admin]:not([data-pn-ok])");
    clearInterval(timer);
    if (!el) return;
    el.dataset.pnOk = "1";
    preenche(el);
    timer = setInterval(() => { if (!el.isConnected) return clearInterval(timer); if (!document.hidden) preenche(el); }, 15e3);
  }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-pn='entrar']")) { e.stopPropagation(); window.CONTA?.abre?.(); } });
  window.addEventListener("conta:mudou", () => document.querySelectorAll("[data-admin]").forEach((el) => preenche(el)));

  window.PAINEL = { page, mount, visita, ROTA_ADMIN };
})();
