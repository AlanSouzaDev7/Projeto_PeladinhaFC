/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — conta opcional ("Entrar com Google") e sincronização entre aparelhos
   · Botão "Entrar" no cabeçalho: abre o botão oficial do Google (script carregado só quando a pessoa abre o menu).
     O comprovante do Google vai para o Worker (POST <api>/conta/entrar), que devolve uma sessão do CazéStats.TV.
   · Sincronização: o que o torcedor cria no aparelho (favoritos, simulador, votos, tema, janela, escalações, simulações
     de copa — as mesmas chaves que o Worker aceita) sobe para a conta e desce nos outros aparelhos. A hora de cada
     mudança é anotada quando o site grava (Storage.setItem); em cada item vale a versão mais recente.
   · Sem conta, nada muda: tudo continua só no aparelho. Sair mantém os dados no aparelho; "Apagar conta" apaga no servidor.
   · Desligado enquanto PLACAR_CONFIG.googleClientId estiver vazio, e no app 433Fut (o Google não permite login em WebView).
   ========================================================================== */
(() => {
  "use strict";
  const API = ((window.PLACAR_CONFIG && window.PLACAR_CONFIG.api) || "").replace(/\/+$/, "");
  const CLIENTE = (window.PLACAR_CONFIG && window.PLACAR_CONFIG.googleClientId) || "";
  const LIGADO = !!(API && CLIENTE && !window.PLACAR_APP);
  const SESSAO = "cazestats:conta", META = "cazestats:sync"; // fora do prefixo "placar:": não sincronizam
  const CHAVE_OK = /^placar:(favs|simulador|votes|theme|bora|tema-bora|janela-[a-z-]{2,30}|xi2:[\w:.-]{1,80}|xi-jogo:[\w:.-]{1,80}|copa-sim-[\w-]{1,40})$/;
  const esc = (t) => SEG.esc(t);
  const set0 = Storage.prototype.setItem, rm0 = Storage.prototype.removeItem;
  let aplicando = false, pendentes = new Set(), timer = null;

  const lerJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? d; } catch { return d; } };
  const gravaJSON = (k, v) => { try { set0.call(localStorage, k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };
  const sessao = () => lerJSON(SESSAO, null);
  const meta = () => lerJSON(META, {});

  /* anota a hora de cada mudança nas chaves sincronizadas (sem mexer nos módulos que gravam) */
  function anota(k) {
    if (aplicando || !CHAVE_OK.test(k)) return;
    const m = meta();
    m[k] = Date.now();
    gravaJSON(META, m);
    if (sessao()) { pendentes.add(k); clearTimeout(timer); timer = setTimeout(envia, 3000); }
  }
  if (LIGADO) {
    Storage.prototype.setItem = function (k, v) { set0.call(this, k, v); if (this === localStorage) anota(String(k)); };
    Storage.prototype.removeItem = function (k) { rm0.call(this, k); if (this === localStorage) anota(String(k)); };
  }

  async function pede(caminho, { metodo = "GET", corpo, bruto = false } = {}) {
    const s = sessao();
    const r = await fetch(`${API}${caminho}`, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo), headers: s ? { authorization: `Bearer ${s.sessao}` } : {} });
    if (r.status === 401 && s) { rm0.call(localStorage, SESSAO); desenha(); throw new Error("a sessão venceu: entre de novo"); }
    if (!r.ok) throw new Error(`servidor respondeu ${r.status}`);
    // bruto: os dados salvos são o próprio JSON do aparelho; SEG.json trocaria " por ” e estragaria o conteúdo.
    // A limpeza continua valendo onde eles são usados (o site lê o armazenamento com SEG.le).
    return bruto ? r.json() : SEG.json(r);
  }

  async function envia() {
    if (!sessao() || !pendentes.size) return;
    const m = meta(), lista = [...pendentes];
    pendentes = new Set();
    const itens = lista.map((k) => ({ chave: k, dados: localStorage.getItem(k), atualizado: m[k] || Date.now() }));
    try {
      await pede("/conta/dados", { metodo: "PUT", corpo: { itens } });
      gravaJSON("cazestats:sync-quando", Date.now());
    } catch {
      lista.forEach((k) => pendentes.add(k)); // tenta de novo na próxima mudança ou quando a aba voltar
    }
  }

  /* traz a conta para o aparelho e manda o que o aparelho tem de mais novo; devolve true se algo mudou aqui */
  async function sincroniza() {
    if (!sessao()) return false;
    const { itens } = await pede("/conta/dados", { bruto: true });
    const validos = (Array.isArray(itens) ? itens : []).filter((x) => x && CHAVE_OK.test(String(x.chave)) && Number.isFinite(x.atualizado) && (x.dados === null || typeof x.dados === "string"));
    const m = meta(), servidor = new Map(validos.map((x) => [x.chave, x]));
    let mudou = false;
    aplicando = true;
    try {
      for (const x of servidor.values()) {
        if (!CHAVE_OK.test(x.chave) || !(x.atualizado > (m[x.chave] || 0))) continue;
        if (x.dados == null) rm0.call(localStorage, x.chave);
        else set0.call(localStorage, x.chave, String(x.dados));
        m[x.chave] = x.atualizado;
        mudou = true;
      }
    } finally {
      aplicando = false;
    }
    // o que só o aparelho tem (ou tem mais novo) sobe para a conta
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!CHAVE_OK.test(k)) continue;
      const s = servidor.get(k);
      if (!m[k]) m[k] = Date.now();
      if (!s || m[k] > s.atualizado) pendentes.add(k);
    }
    gravaJSON(META, m);
    await envia();
    return mudou;
  }

  /* ---------- tela ---------- */
  const ICONE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`;
  let botao, painel;
  function desenha() {
    if (!botao) return;
    const s = sessao();
    botao.innerHTML = s ? (s.foto ? `<img src="${esc(s.foto)}" alt="" width="26" height="26" referrerpolicy="no-referrer"/>` : `<b>${esc((s.nome || "?").slice(0, 1).toUpperCase())}</b>`) : ICONE;
    botao.setAttribute("aria-label", s ? `Conta de ${s.nome || "torcedor"}` : "Entrar com Google");
    botao.classList.toggle("logado", !!s);
  }
  function mostraPainel() {
    const s = sessao(), q = lerJSON("cazestats:sync-quando", 0);
    painel.innerHTML = s
      ? `<p class="conta-ola">Olá, <b>${esc(s.nome || "torcedor")}</b></p>
         <p class="conta-txt">Favoritos, escalações, janela e palpites ficam salvos na sua conta e aparecem nos outros aparelhos em que você entrar.${q ? ` Última sincronização: ${new Date(q).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.` : ""}</p>
         <a class="conta-bolao" href="#/bolao">Bolão: palpites e ranking</a>
         <div class="conta-acoes"><button type="button" data-conta="sincronizar">Sincronizar agora</button><button type="button" data-conta="sair">Sair</button></div>
         <button type="button" class="conta-apagar" data-conta="apagar">Apagar minha conta e os dados salvos</button>
         <p class="conta-msg" role="status" aria-live="polite"></p>`
      : `<p class="conta-ola"><b>Entre para salvar na nuvem</b></p>
         <p class="conta-txt">Seus favoritos, escalações, janela de transferências e palpites passam a aparecer em todos os seus aparelhos. Não guardamos seu e-mail.</p>
         <div class="conta-google" data-conta-google><span class="conta-msg">Carregando o Google…</span></div>
         <p class="conta-msg" role="status" aria-live="polite"></p>`;
    painel.hidden = false;
    botao.setAttribute("aria-expanded", "true");
    if (!s) botaoGoogle(painel.querySelector("[data-conta-google]"));
  }
  const fecha = () => { if (painel) { painel.hidden = true; botao.setAttribute("aria-expanded", "false"); } };
  const msg = (t) => { const el = painel?.querySelector(".conta-msg[role=status]"); if (el) el.textContent = t; };

  let gis = null;
  function carregaGoogle() {
    gis = gis || new Promise((ok, falha) => {
      const sc = document.createElement("script");
      sc.src = "https://accounts.google.com/gsi/client";
      sc.async = true;
      sc.onload = () => ok(window.google);
      sc.onerror = () => falha(new Error("não deu para carregar o Google"));
      document.head.appendChild(sc);
    });
    return gis;
  }
  async function botaoGoogle(alvo) {
    try {
      const google = await carregaGoogle();
      google.accounts.id.initialize({ client_id: CLIENTE, callback: (r) => entrou(r.credential), ux_mode: "popup", auto_select: false, cancel_on_tap_outside: true });
      alvo.innerHTML = "";
      google.accounts.id.renderButton(alvo, { theme: "filled_black", size: "large", shape: "pill", text: "signin_with", locale: "pt-BR", width: 240 });
    } catch (e) {
      alvo.innerHTML = `<span class="conta-msg">${esc(e.message)}</span>`;
    }
  }
  async function entrou(credential) {
    try {
      const r = await fetch(`${API}/conta/entrar`, { method: "POST", body: JSON.stringify({ credential }) });
      const d = await SEG.json(r);
      if (!r.ok) throw new Error(d.erro || `servidor respondeu ${r.status}`);
      gravaJSON(SESSAO, { sessao: d.sessao, nome: d.nome, foto: d.foto });
      desenha();
      window.dispatchEvent(new Event("conta:mudou")); // o bolão e outras partes que dependem da conta se redesenham
      msg("Entrou! Sincronizando…");
      const mudou = await sincroniza();
      if (mudou) location.reload(); // trouxe dados de outro aparelho: a página redesenha com eles
      else { mostraPainel(); msg("Tudo sincronizado."); }
    } catch (e) {
      msg(String(e.message || e));
    }
  }

  function aviso() {
    if (document.getElementById("conta-aviso")) return;
    const el = document.createElement("div");
    el.id = "conta-aviso";
    el.className = "conta-aviso";
    el.setAttribute("role", "status");
    el.innerHTML = `Seus dados mudaram em outro aparelho. <button type="button">Atualizar</button>`;
    el.querySelector("button").addEventListener("click", () => location.reload());
    document.body.appendChild(el);
  }

  function liga() {
    if (!LIGADO) return;
    const tema = document.getElementById("theme");
    if (!tema) return;
    botao = document.createElement("button");
    botao.type = "button";
    botao.className = "icon-btn conta-btn";
    botao.setAttribute("aria-haspopup", "dialog");
    botao.setAttribute("aria-expanded", "false");
    painel = document.createElement("div");
    painel.className = "conta-painel";
    painel.setAttribute("role", "dialog");
    painel.setAttribute("aria-label", "Conta");
    painel.hidden = true;
    tema.before(botao);
    botao.after(painel);
    desenha();
    botao.addEventListener("click", (e) => { e.stopPropagation(); painel.hidden ? mostraPainel() : fecha(); });
    document.addEventListener("click", (e) => { if (!painel.hidden && !painel.contains(e.target) && e.target !== botao) fecha(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecha(); });
    painel.addEventListener("click", async (e) => {
      const a = e.target.closest("[data-conta]")?.dataset.conta;
      if (!a) return;
      try {
        if (a === "sincronizar") { msg("Sincronizando…"); (await sincroniza()) ? location.reload() : msg("Tudo sincronizado."); }
        if (a === "sair") { await pede("/conta/sair", { metodo: "POST" }).catch(() => {}); rm0.call(localStorage, SESSAO); desenha(); mostraPainel(); window.dispatchEvent(new Event("conta:mudou")); }
        if (a === "apagar" && confirm("Apagar a conta e tudo que ela salvou no servidor? Os dados deste aparelho continuam aqui.")) {
          await pede("/conta", { metodo: "DELETE" });
          rm0.call(localStorage, SESSAO); desenha(); mostraPainel(); msg("Conta apagada."); window.dispatchEvent(new Event("conta:mudou"));
        }
      } catch (err) {
        msg(String(err.message || err));
      }
    });
    // ao abrir e ao voltar para a aba: traz o que mudou em outro aparelho
    const puxa = () => sincroniza().then((mudou) => mudou && aviso()).catch(() => {});
    if (sessao()) puxa();
    document.addEventListener("visibilitychange", () => { if (!document.hidden && sessao()) puxa(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", liga);
  else liga();

  // abre o painel de entrar (usado pelo bolão); fora do clique que o pediu, para o clique não fechar o painel na hora
  const abre = () => { if (painel) setTimeout(mostraPainel, 0); };
  window.CONTA = { sessao, sincroniza, abre, ligado: LIGADO, _chaveOk: (k) => CHAVE_OK.test(k) };
})();
