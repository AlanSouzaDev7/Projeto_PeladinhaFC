/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — voz da torcida (página da partida; servidor: worker/torcida.mjs)
     · quem vence, segundo a torcida: o palpite 1 x 2 do cartão "Quem vai vencer?" também conta aqui
     · Craque do jogo: abre quando a bola rola e fecha 8 horas depois; os candidatos são quem entrou em campo
   Sem conta: cada aparelho vota uma vez (código aleatório guardado no navegador) e pode trocar o voto.
   ========================================================================== */
(() => {
  "use strict";
  const API = ((window.PLACAR_CONFIG && window.PLACAR_CONFIG.api) || "").replace(/\/+$/, "");
  const esc = (t) => SEG.esc(t);
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const MEU = "cazestats:torcida-votos"; // fora do prefixo "placar:": é deste aparelho, não sincroniza

  function dispositivo() {
    try {
      let d = localStorage.getItem("cazestats:dispositivo");
      if (!/^[\w-]{16,64}$/.test(d || "")) {
        d = [...crypto.getRandomValues(new Uint8Array(18))].map((b) => b.toString(16).padStart(2, "0")).join("");
        localStorage.setItem("cazestats:dispositivo", d);
      }
      return d;
    } catch { return null; }
  }
  const meus = () => { try { return JSON.parse(localStorage.getItem(MEU) || "{}") || {}; } catch { return {}; } };
  const guardaMeu = (k, v) => { try { const m = meus(); m[k] = v; localStorage.setItem(MEU, JSON.stringify(m)); } catch { /* ok */ } };

  async function api(caminho, corpo) {
    const r = await fetch(`${API}${caminho}`, corpo ? { method: "POST", body: JSON.stringify(corpo) } : {});
    let d = {};
    try { d = await SEG.json(r); } catch { /* sem JSON */ }
    if (!r.ok) throw new Error(d.erro || `servidor respondeu ${r.status}`);
    return d;
  }

  /* chamado pelo cartão "Quem vai vencer?" (js/app.js) */
  async function votaVencedor(espn, pick) {
    const disp = dispositivo();
    if (!API || !espn || !disp) return;
    try {
      const r = await api("/torcida/voto", { jogo: String(espn), tipo: "vencedor", escolha: pick, dispositivo: disp });
      document.querySelectorAll(`[data-torcida="${CSS.escape(String(espn))}"]`).forEach((el) => pinta(el, r));
    } catch { /* o palpite continua salvo no aparelho */ }
  }

  function card(m) {
    if (!API || !m.espn || m.status === "pending") return "";
    return `<div class="card torcida" data-torcida="${esc(String(m.espn))}" data-h="${esc(m.home)}" data-a="${esc(m.away)}" data-st="${esc(m.status)}" data-kick="${esc(String(m.kick || ""))}" data-hs="${esc(String(m.hs ?? ""))}" data-as="${esc(String(m.as ?? ""))}">
      <div class="card-h">Voz da torcida <small>votos de quem usa o CazéStats.TV</small></div><div class="card-b"><p class="tc-txt">Carregando…</p></div></div>`;
  }
  const sigla = (id) => (typeof byId !== "undefined" && byId[id]?.abbr) || id;
  const cor = (id) => (typeof byId !== "undefined" && byId[id] ? window.GFX.display(byId[id]) : "var(--accent)");
  const pct = (a, t) => (t ? Math.round((a / t) * 100) : 0);

  function vencedorHTML(el, r) {
    const v = r.vencedor || {}, t = n(r.totalVencedor), h = el.dataset.h, a = el.dataset.a;
    if (!t) return `<p class="tc-txt">${el.dataset.st === "ns" ? "Ninguém votou ainda em quem vence. Dê o seu palpite no cartão acima." : "Sem votos de quem vence neste jogo."}</p>`;
    const [p1, px, p2] = [pct(n(v[1]), t), pct(n(v.X), t), pct(n(v[2]), t)];
    return `<div class="tc-bloco"><b class="tc-h">Quem vence, segundo a torcida</b>
      <div class="ch-barra" role="img" aria-label="${esc(sigla(h))} ${p1}%, empate ${px}%, ${esc(sigla(a))} ${p2}%"><i style="width:${p1}%;background:${cor(h)}"></i><i style="width:${px}%;background:var(--text-3)"></i><i style="width:${p2}%;background:${cor(a)}"></i></div>
      <div class="tc-leg"><span>${esc(sigla(h))} ${p1}%</span><span>Empate ${px}%</span><span>${esc(sigla(a))} ${p2}%</span></div>
      <small class="tc-txt">${t} voto${t === 1 ? "" : "s"}</small></div>${modeloHTML(el, [p1, px, p2])}`;
  }
  /* torcida x modelo: a chance que o CazéStats.TV calcula antes do jogo (js/chance.js) ao lado do voto da torcida;
     com o jogo encerrado, quem acertou o favorito. Devolve [porcentagens do modelo, frases] ou null sem os dados */
  function comparaTorcida(tor, mod, nomes, final) {
    const fav = (ps) => { const i = ps.indexOf(Math.max(...ps)); return ps.filter((x) => x === ps[i]).length > 1 ? -1 : i; };
    const ft = fav(tor), fm = fav(mod), nome = (i) => (i === 1 ? "o empate" : nomes[i === 0 ? 0 : 1]);
    const frases = [];
    if (ft >= 0 && fm >= 0 && ft === fm) frases.push(`Torcida e modelo concordam: favorito ${ft === 1 ? "é o empate" : `é ${nomes[ft === 0 ? 0 : 1]}`}.`);
    else if (ft >= 0 && fm >= 0) frases.push(`A torcida aposta ${ft === 1 ? "no empate" : `em ${nome(ft)}`} (${tor[ft]}%); o modelo vê ${nome(fm)} como mais provável (${mod[fm]}%).`);
    const dif = [0, 1, 2].map((i) => tor[i] - mod[i]), k = dif.map(Math.abs).indexOf(Math.max(...dif.map(Math.abs)));
    if (Math.abs(dif[k]) >= 15) frases.push(`A maior diferença: a torcida dá ${tor[k]}% para ${nome(k)}, o modelo ${mod[k]}%.`);
    if (final) {
      const real = final.casa > final.fora ? 0 : final.casa === final.fora ? 1 : 2;
      const quem = [ft === real && "a torcida", fm === real && "o modelo"].filter(Boolean);
      frases.push(quem.length === 2 ? "Deu o favorito: torcida e modelo acertaram." : quem.length ? `Acertou ${quem[0]}.` : "Zebra: torcida e modelo erraram o favorito.");
    }
    return frases;
  }
  function modeloHTML(el, tor) {
    if (!window.CHANCE || !window.CLUB_FORM || typeof byId === "undefined" || !byId[el.dataset.h] || !byId[el.dataset.a]) return "";
    const c = window.CHANCE.calcula({ home: el.dataset.h, away: el.dataset.a, status: "ns" });
    const mod = window.CHANCE._cem([c.casa, c.empate, c.fora]), h = el.dataset.h, a = el.dataset.a;
    const final = el.dataset.st === "ft" && /^\d+$/.test(el.dataset.hs || "") && /^\d+$/.test(el.dataset.as || "") ? { casa: Number(el.dataset.hs), fora: Number(el.dataset.as) } : null;
    const frases = comparaTorcida(tor, mod, [sigla(h), sigla(a)], final);
    return `<div class="tc-bloco tc-modelo"><b class="tc-h">E o modelo do CazéStats.TV <small>antes do jogo</small></b>
      <div class="ch-barra" role="img" aria-label="Modelo: ${esc(sigla(h))} ${mod[0]}%, empate ${mod[1]}%, ${esc(sigla(a))} ${mod[2]}%"><i style="width:${mod[0]}%;background:${cor(h)}"></i><i style="width:${mod[1]}%;background:var(--text-3)"></i><i style="width:${mod[2]}%;background:${cor(a)}"></i></div>
      <div class="tc-leg"><span>${esc(sigla(h))} ${mod[0]}%</span><span>Empate ${mod[1]}%</span><span>${esc(sigla(a))} ${mod[2]}%</span></div>
      ${frases.length ? `<p class="tc-compara">${frases.map(esc).join(" ")}</p>` : ""}</div>`;
  }
  function craqueHTML(el, r, elenco) {
    const st = el.dataset.st, kick = Number(el.dataset.kick) || 0;
    const aberto = st === "progress" || (st === "ft" && (!kick || Date.now() - kick < 8 * 3600e3));
    const meu = meus()[`craque:${el.dataset.torcida}`];
    const t = n(r.totalCraque);
    const top = (r.craque || []).slice(0, 3).map((x, i) => `<li class="${i === 0 ? "lider" : ""}"><span>${esc(x.nome)} <small>${esc(sigla(x.clube))}</small></span><i style="--p:${pct(n(x.votos), t)}%"></i><b>${pct(n(x.votos), t)}%</b></li>`).join("");
    let corpo = top ? `<ol class="tc-top">${top}</ol><small class="tc-txt">${t} voto${t === 1 ? "" : "s"}</small>` : "";
    if (!aberto) corpo = corpo || `<p class="tc-txt">${st === "ns" ? "O Craque do jogo abre quando a bola rolar." : "Votação encerrada."}</p>`;
    else if (elenco?.length) {
      const porTime = [el.dataset.h, el.dataset.a].map((c) => [c, elenco.filter((x) => x.clube === c)]);
      corpo += `<details class="tc-votar"${meu ? "" : " open"}><summary>${meu ? "Trocar meu voto" : "Escolha o craque"}</summary>
        ${porTime.map(([c, js]) => js.length ? `<div class="tc-time"><b>${esc(sigla(c))}</b><div>${js.map((x) => `<button type="button" data-craque="${esc(x.id)}" aria-pressed="${meu === x.id}">${esc(x.nome)}</button>`).join("")}</div></div>` : "").join("")}</details>
        <p class="tc-txt tc-msg" role="status" aria-live="polite"></p>`;
    } else corpo += `<p class="tc-txt">Os candidatos aparecem quando a escalação sair.</p>`;
    return `<div class="tc-bloco"><b class="tc-h">Craque do jogo</b>${corpo}</div>`;
  }
  // elenco da partida (titulares e quem entrou) direto do resumo da ESPN; o servidor confere de novo
  const elencos = {};
  function elencoDe(espn) {
    elencos[espn] = elencos[espn] || fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/summary?event=${encodeURIComponent(espn)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d?.rosters || []).flatMap((t) => (t.roster || []).filter((x) => x.starter || x.subbedIn).map((x) => ({
        id: String(x.athlete?.id || ""), nome: String(x.athlete?.shortName || x.athlete?.displayName || ""), lado: t.homeAway,
      }))).filter((x) => /^\d+$/.test(x.id)))
      .catch(() => []);
    return elencos[espn];
  }
  async function pinta(el, r) {
    const st = el.dataset.st;
    let elenco = null;
    if (st === "progress" || st === "ft") {
      // clube de cada jogador pelo lado do jogo (mandante ou visitante)
      elenco = (await elencoDe(el.dataset.torcida)).map((x) => ({ ...x, clube: x.lado === "home" ? el.dataset.h : el.dataset.a }));
    }
    // a chance do modelo (torcida x modelo) usa a forma dos clubes; em jogo encerrado ela pode não estar carregada
    if (!window.CLUB_FORM && window.DADOS && n(r.totalVencedor)) await window.DADOS.carrega("club-form").catch(() => null);
    if (!el.isConnected) return;
    el.querySelector(".card-b").innerHTML = vencedorHTML(el, r) + craqueHTML(el, r, elenco);
  }
  async function preenche(el) {
    try { pinta(el, await api(`/torcida/${encodeURIComponent(el.dataset.torcida)}`)); } catch (e) { el.querySelector(".card-b").innerHTML = `<p class="tc-txt">Não deu para carregar os votos (${esc(e.message)}).</p>`; }
  }
  function mount(view) {
    (view || document).querySelectorAll("[data-torcida]:not([data-tc-ok])").forEach((el) => { el.dataset.tcOk = "1"; preenche(el); });
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-craque]");
    if (!b) return;
    const el = b.closest("[data-torcida]"), disp = dispositivo(), msg = el.querySelector(".tc-msg");
    if (!disp) return;
    el.querySelectorAll("[data-craque]").forEach((x) => { x.disabled = true; });
    try {
      const r = await api("/torcida/voto", { jogo: el.dataset.torcida, tipo: "craque", escolha: b.dataset.craque, dispositivo: disp });
      guardaMeu(`craque:${el.dataset.torcida}`, b.dataset.craque);
      await pinta(el, r);
      const m = el.querySelector(".tc-msg");
      if (m) m.textContent = `Voto em ${b.textContent} registrado.`;
    } catch (err) {
      if (msg) msg.textContent = err.message;
      el.querySelectorAll("[data-craque]").forEach((x) => { x.disabled = false; });
    }
  });

  window.TORCIDA = { card, mount, votaVencedor, _compara: comparaTorcida };
})();
