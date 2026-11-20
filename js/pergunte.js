/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* ==========================================================================
   CazéStats.TV — "Pergunte ao CazéStats" (#/pergunte)
   Perguntas em português respondidas com os dados do próprio site, por regras (sem IA paga, sem custo por pergunta):
   artilharia, posição e pontos, líder, lanterna, G4/G6/Z4, próximo jogo, último resultado, quem ganha um jogo,
   chance de título e de rebaixamento, xG, melhor ataque e defesa, campanha em casa e fora, forma recente.
   Cada resposta traz o link da página que comprova o número.
   entende(pergunta, clubes) e responde(pergunta, D) são puras (Node e navegador); o navegador ganha page() e mount().
   ========================================================================== */
(function (raiz) {
  "use strict";
  const norm = (t) => ` ${String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  // apelidos de torcida, além do nome, sigla e apelido oficial de cada clube (js/data.js)
  const APELIDOS = {
    flamengo: ["mengao", "mengo", "fla", "urubu"], palmeiras: ["verdao", "porco", "palestra"], corinthians: ["timao", "corintia", "curintia"],
    "sao-paulo": ["spfc", "tricolor paulista", "soberano"], fluminense: ["flu", "fluzao", "tricolor carioca"], "atletico-mg": ["galo", "atletico mineiro", "cam"],
    cruzeiro: ["raposa", "cabuloso"], santos: ["peixe", "alvinegro praiano"], vasco: ["vascao", "gigante da colina", "vasco da gama"],
    internacional: ["inter", "colorado"], gremio: ["tricolor gaucho", "imortal"], botafogo: ["fogao", "glorioso"], "athletico-pr": ["furacao", "cap", "athletico paranaense"],
    bahia: ["bahea", "esquadrao", "tricolor baiano"], vitoria: ["leao da barra"], coritiba: ["coxa", "coxa branca"], chapecoense: ["chape", "verdao do oeste"],
    remo: ["leao azul"], bragantino: ["massa bruta", "red bull bragantino", "braga"], mirassol: ["leao caipira"],
  };
  function nomesDe(c) {
    // a sigla de 3 letras (COR, VIT, REM...) fica de fora: confunde com palavras comuns ("cor", "rem"); as usadas pela torcida estão nos apelidos
    return [c.name, c.abbr, c.nick, c.id.replace(/-/g, " "), ...(APELIDOS[c.id] || [])].filter(Boolean).map((x) => norm(x).trim()).filter((x) => x.length >= 3);
  }
  /* clubes citados, na ordem em que aparecem */
  function clubesNa(texto, clubes) {
    const t = norm(texto), achados = [];
    for (const c of clubes) {
      let melhor = -1;
      for (const n of nomesDe(c)) { const i = t.indexOf(` ${n} `); if (i >= 0 && (melhor < 0 || i < melhor)) melhor = i; }
      if (melhor >= 0) achados.push([melhor, c]);
    }
    return achados.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  }

  const INTENCOES = [
    ["chance-titulo", /chance.*(titulo|campeao|campea)|(ser|vai ser|sera) campeao|ganha o (brasileirao|titulo|campeonato)/],
    ["chance-queda", /chance.*(cair|rebaix|z ?4|segunda divisao|serie b)|vai cair|corre risco/],
    ["confronto", /( x | contra | vs | versus )|quem (ganha|vence)|favorito/],
    ["xg-jogador", /(acima|abaixo|alem|menos) do (esperado|xg)|(jogador|atacante).*xg|xg.*(jogador|atacante)|mais xg/],
    ["xg", /\bxg\b|gols esperados/],
    ["artilheiro", /artilheir|goleador|quem (fez|tem|marcou) mais gols|maior(es)? (goleador|artilheiro)/],
    ["proximo", /proximo jogo|joga quando|quando (o |a )?\w* ?joga|quando e o jogo|proxima partida|vai jogar/],
    ["ultimo", /ultimo (jogo|resultado)|como foi o jogo|quanto foi|resultado do (ultimo )?jogo/],
    ["casa-fora", /em casa|mandante|fora de casa|visitante|longe de casa/],
    ["forma", /forma|ultimos (5|cinco|jogos)|fase|sequencia/],
    ["lider", /lider|primeiro lugar|quem lidera|na frente|em primeiro/],
    ["lanterna", /lanterna|ultimo lugar|ultimo colocado|em ultimo/],
    ["z4", /rebaixa|z ?4|zona de|degola/],
    ["g6", /g ?6|libertadores|g ?4|vaga/],
    ["melhor-ataque", /melhor ataque|mais gols( marcados)?|ataque mais/],
    ["pior-defesa", /pior defesa|mais vazad|sofreu mais|mais gols sofridos/],
    ["melhor-defesa", /melhor defesa|menos vazad|sofreu menos|menos gols sofridos/],
    ["vitorias", /mais vitorias|venceu mais|ganhou mais/],
    ["empates", /mais empates|empatou mais/],
    ["derrotas", /mais derrotas|perdeu mais/],
    ["pontos", /quantos pontos|pontuacao|pontos tem/],
    ["posicao", /posicao|colocacao|lugar|onde (esta|ta)|em que lugar|como esta|classificacao/],
  ];
  function entende(pergunta, clubes) {
    const t = norm(pergunta), cs = clubesNa(pergunta, clubes);
    for (const [nome, re] of INTENCOES) {
      if (!re.test(t)) continue;
      if (nome === "confronto" && cs.length < 2) continue; // "x" sozinho não basta
      return { intencao: nome, clubes: cs };
    }
    if (cs.length >= 2) return { intencao: "confronto", clubes: cs };
    if (cs.length === 1) return { intencao: "posicao", clubes: cs, deduzido: true };
    return { intencao: null, clubes: cs };
  }

  /* ---------- respostas ---------- */
  const pct = (v) => (v >= 0.995 ? "mais de 99%" : v > 0 && v < 0.005 ? "menos de 1%" : `${Math.round(v * 100)}%`);
  const sg = (r) => r.gf - r.gc;
  const ordemTabela = (a, b) => b.p - a.p || b.v - a.v || sg(b) - sg(a) || b.gf - a.gf;
  const dm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
  const resposta = (texto, links = [], extra = {}) => ({ ok: true, texto, links, ...extra });
  const precisaClube = (cs) => (cs.length ? null : { ok: false, texto: "De qual clube? Escreva o nome ou o apelido (ex.: \"Cruzeiro\", \"Mengão\")." });

  /* jogos encerrados do clube no Brasileirão, do mais recente ao mais antigo: [{id, date, casa, adv, gf, gc, rodada}] */
  function encerrados(D, cid) {
    const t = D.temporada?.(cid);
    if (t?.length) return t.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return D.jogos.filter((j) => j.status === "ft" && (j.home === cid || j.away === cid)).map((j) => ({ id: j.espn || j.id, rota: j.id, date: j.date, casa: j.home === cid, adv: j.home === cid ? j.away : j.home, gf: j.home === cid ? j.hs : j.as, gc: j.home === cid ? j.as : j.hs, rodada: j.round }))
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.rodada - a.rodada);
  }
  const linkJogo = (D, j, c) => { const m = D.jogos.find((x) => x.id === j.rota || (j.id && String(x.espn) === String(j.id))); return m ? ["Ver o jogo", `#/partida/${m.id}`] : [`Partidas do ${c.abbr}`, `#/clube/${c.id}/partidas`]; };
  const R = {
    posicao(D, [c]) {
      const tab = D.tabela.slice().sort(ordemTabela), i = tab.findIndex((r) => r.id === c.id), r = tab[i];
      if (!r) return null;
      const lider = tab[0], dist = lider.p - r.p;
      return resposta(`${c.name} está em ${i + 1}º lugar, com ${r.p} pontos em ${r.j} jogos (${r.v} vitórias, ${r.e} empates e ${r.d} derrotas).${i === 0 ? " É o líder." : ` Está a ${dist} ponto${dist === 1 ? "" : "s"} do líder, ${D.nome(lider.id)}.`}`, [["Ver a tabela", "#/tabela"], [`Página do ${c.abbr}`, `#/clube/${c.id}`]]);
    },
    pontos(D, cs) { return R.posicao(D, cs); },
    lider(D) {
      const tab = D.tabela.slice().sort(ordemTabela), [a, b] = tab;
      return resposta(`${D.nome(a.id)} lidera com ${a.p} pontos, ${a.p - b.p} à frente do ${D.nome(b.id)} (${b.p}).`, [["Ver a tabela", "#/tabela"]]);
    },
    lanterna(D) {
      const tab = D.tabela.slice().sort(ordemTabela), u = tab[tab.length - 1];
      return resposta(`O lanterna é o ${D.nome(u.id)}, com ${u.p} pontos em ${u.j} jogos.`, [["Ver a tabela", "#/tabela"]]);
    },
    z4(D, cs) {
      const tab = D.tabela.slice().sort(ordemTabela), z = tab.slice(-4), n = tab.length;
      if (cs.length) { const i = tab.findIndex((r) => r.id === cs[0].id); const dentro = i >= n - 4; const corte = tab[n - 5]; return resposta(`${cs[0].name} está em ${i + 1}º, ${dentro ? `dentro do Z4, a ${corte.p - tab[i].p} ponto(s) de sair` : `fora do Z4, ${tab[i].p - tab[n - 4].p} ponto(s) acima da zona`}.`, [["Ver a tabela", "#/tabela"], ["Chances na previsão", "#/previsao"]]); }
      return resposta(`Hoje no Z4: ${z.map((r) => `${D.nome(r.id)} (${r.p})`).join(", ")}. O primeiro fora da zona é o ${D.nome(tab[n - 5].id)}, com ${tab[n - 5].p}.`, [["Ver a tabela", "#/tabela"], ["Chances na previsão", "#/previsao"]]);
    },
    g6(D) {
      const tab = D.tabela.slice().sort(ordemTabela), g = tab.slice(0, 6);
      return resposta(`Hoje no G6: ${g.map((r, i) => `${i + 1}º ${D.nome(r.id)} (${r.p})`).join(", ")}. O 7º é o ${D.nome(tab[6].id)}, com ${tab[6].p}.`, [["Ver a tabela", "#/tabela"], ["Chances na previsão", "#/previsao"]]);
    },
    artilheiro(D, cs) {
      const lista = cs.length ? D.artilheiros.filter((a) => a.clube === cs[0].id) : D.artilheiros;
      if (!lista.length) return cs.length ? resposta(`Nenhum jogador do ${cs[0].name} está entre os artilheiros do Brasileirão listados agora.`, [["Ver a artilharia", "#/tabela/gols"]]) : null;
      const [a, b] = lista;
      return resposta(cs.length ? `O artilheiro do ${cs[0].name} no Brasileirão é ${a.nome}, com ${a.gols} gols.${b ? ` Depois vem ${b.nome}, com ${b.gols}.` : ""}`
        : `O artilheiro do Brasileirão é ${a.nome} (${D.nome(a.clube)}), com ${a.gols} gols.${b ? ` Em seguida, ${b.nome} (${D.nome(b.clube)}), com ${b.gols}.` : ""}`, [["Ver a artilharia", "#/tabela/gols"]]);
    },
    proximo(D, cs) {
      const sem = precisaClube(cs); if (sem) return sem;
      const c = cs[0], m = D.jogos.filter((j) => (j.home === c.id || j.away === c.id) && j.status !== "ft").sort((a, b) => (a.date || "9").localeCompare(b.date || "9"))[0];
      if (!m) return resposta(`Não há próximo jogo do ${c.name} no Brasileirão na agenda.`, [[`Página do ${c.abbr}`, `#/clube/${c.id}`]]);
      const casa = m.home === c.id, adv = casa ? m.away : m.home;
      return resposta(`${c.name} ${casa ? "recebe" : "visita"} o ${D.nome(adv)}${m.date ? ` em ${dm(m.date)}` : ""}${m.time ? ` às ${m.time}` : ""} (${m.round}ª rodada)${m.venue ? `, no ${m.venue}` : ""}.`, [["Ver o jogo", `#/partida/${m.id}`]]);
    },
    ultimo(D, cs) {
      const sem = precisaClube(cs); if (sem) return sem;
      const c = cs[0], j = encerrados(D, c.id)[0];
      if (!j) return null;
      const placar = j.casa ? `${c.name} ${j.gf} x ${j.gc} ${D.nome(j.adv)}` : `${D.nome(j.adv)} ${j.gc} x ${j.gf} ${c.name}`;
      return resposta(`No último jogo, ${j.gf > j.gc ? "vitória" : j.gf < j.gc ? "derrota" : "empate"}: ${placar}${j.date ? ` (${dm(j.date)})` : ""}.`, [linkJogo(D, j, c)]);
    },
    "casa-fora"(D, cs, t) {
      const sem = precisaClube(cs); if (sem) return sem;
      const c = cs[0], fora = /fora|visitante|longe/.test(t);
      const js = encerrados(D, c.id).filter((j) => j.casa === !fora);
      if (!js.length) return null;
      let v = 0, e = 0, d = 0, gf = 0, gc = 0;
      for (const j of js) { gf += j.gf; gc += j.gc; if (j.gf > j.gc) v++; else if (j.gf < j.gc) d++; else e++; }
      const ap = Math.round(((3 * v + e) / (3 * js.length)) * 100);
      return resposta(`${fora ? "Fora de casa" : "Em casa"}, o ${c.name} tem ${v} vitórias, ${e} empates e ${d} derrotas em ${js.length} jogos (${ap}% de aproveitamento, ${gf} gols marcados e ${gc} sofridos).`, [[`Página do ${c.abbr}`, `#/clube/${c.id}`]]);
    },
    forma(D, cs) {
      const sem = precisaClube(cs); if (sem) return sem;
      const c = cs[0], js = encerrados(D, c.id).slice(0, 5);
      if (!js.length) return null;
      const letra = (j) => (j.gf > j.gc ? "V" : j.gf < j.gc ? "D" : "E");
      const seq = js.map(letra), pts = seq.reduce((t, x) => t + (x === "V" ? 3 : x === "E" ? 1 : 0), 0);
      return resposta(`Nos últimos ${js.length} jogos do Brasileirão, o ${c.name} fez ${pts} de ${js.length * 3} pontos: ${seq.join(" ")} (do mais recente ao mais antigo).`, [[`Página do ${c.abbr}`, `#/clube/${c.id}`]]);
    },
    confronto(D, cs) {
      if (cs.length < 2) return precisaClube([]);
      const [h, a] = cs, c = D.chance?.(h.id, a.id);
      if (!c) return null;
      const m = D.jogos.find((j) => j.status !== "ft" && ((j.home === h.id && j.away === a.id) || (j.home === a.id && j.away === h.id)));
      const [ca, cb] = m && m.home === a.id ? [a, h] : [h, a];
      const cc = m && m.home === a.id ? D.chance(a.id, h.id) : c;
      return resposta(`${m ? `No próximo ${ca.abbr} x ${cb.abbr}` : `Num ${ca.abbr} x ${cb.abbr} com mando do ${ca.abbr}`}, o modelo do CazéStats.TV dá ${pct(cc.casa)} para o ${ca.name}, ${pct(cc.empate)} de empate e ${pct(cc.fora)} para o ${cb.name}.${cc.provavel ? ` Placar mais provável: ${cc.provavel.casa} x ${cc.provavel.fora}.` : ""}`,
        m ? [["Ver o jogo", `#/partida/${m.id}`]] : [["Comparar no Bora pro jogo", `#/bora-pro-jogo/${ca.id}/${cb.id}`]]);
    },
    "chance-titulo"(D, cs) {
      if (!D.previsao) return null;
      if (cs.length) { const x = D.previsao.find((p) => p.id === cs[0].id); return x ? resposta(`Pelas simulações do resto do campeonato, o ${cs[0].name} tem ${pct(x.titulo)} de chance de título (e termina, mais provavelmente, em ${x.provavel}º).`, [["Ver a previsão", "#/previsao"]]) : null; }
      const top = D.previsao.slice().sort((a, b) => b.titulo - a.titulo).filter((x) => x.titulo > 0.005).slice(0, 3);
      return resposta(`Chance de título: ${top.map((x) => `${D.nome(x.id)} ${pct(x.titulo)}`).join(", ")}.`, [["Ver a previsão", "#/previsao"]]);
    },
    "chance-queda"(D, cs) {
      if (!D.previsao) return null;
      if (cs.length) { const x = D.previsao.find((p) => p.id === cs[0].id); return x ? resposta(`Pelas simulações, o ${cs[0].name} tem ${pct(x.z4)} de chance de terminar no Z4.`, [["Ver a previsão", "#/previsao"]]) : null; }
      const top = D.previsao.slice().sort((a, b) => b.z4 - a.z4).slice(0, 5);
      return resposta(`Maior risco de rebaixamento: ${top.map((x) => `${D.nome(x.id)} ${pct(x.z4)}`).join(", ")}.`, [["Ver a previsão", "#/previsao"]]);
    },
    xg(D, cs) {
      if (!D.xg?.clubes?.length) return null;
      if (cs.length) { const x = D.xg.clubes.find((c) => c.id === cs[0].id); if (!x) return null; return resposta(`${cs[0].name}: ${x.gols} gols para ${x.xg.toFixed(1).replace(".", ",")} de xG (${x.gols >= x.xg ? "acima" : "abaixo"} do esperado) e ${x.gc} sofridos para ${x.xgc.toFixed(1).replace(".", ",")} de xG contra.`, [["Ver o xG", "#/xg"]]); }
      const top = D.xg.clubes.slice().sort((a, b) => b.xg - a.xg).slice(0, 3);
      return resposta(`Quem mais cria chances (xG): ${top.map((x) => `${D.nome(x.id)} ${x.xg.toFixed(1).replace(".", ",")}`).join(", ")}.`, [["Ver o xG", "#/xg"]]);
    },
    "xg-jogador"(D, cs, t) {
      const js = (D.xg?.jogadores || []).filter((j) => !cs.length || j.clube === cs[0].id);
      if (!js.length) return null;
      const abaixo = /abaixo|menos/.test(t), lista = js.slice().sort((a, b) => (abaixo ? a.dif - b.dif : b.dif - a.dif)).slice(0, 3);
      return resposta(`${abaixo ? "Mais gols abaixo do esperado" : "Mais gols acima do esperado"}: ${lista.map((j) => `${j.n} (${j.g} gols para ${j.xg.toFixed(1).replace(".", ",")} de xG)`).join("; ")}.`, [["Ver o xG", "#/xg"]]);
    },
    "melhor-ataque"(D) { const r = D.tabela.slice().sort((a, b) => b.gf - a.gf)[0]; return resposta(`Melhor ataque: ${D.nome(r.id)}, com ${r.gf} gols em ${r.j} jogos.`, [["Ver a tabela", "#/tabela"]]); },
    "melhor-defesa"(D) { const r = D.tabela.slice().sort((a, b) => a.gc - b.gc)[0]; return resposta(`Melhor defesa: ${D.nome(r.id)}, com ${r.gc} gols sofridos em ${r.j} jogos.`, [["Ver a tabela", "#/tabela"]]); },
    "pior-defesa"(D) { const r = D.tabela.slice().sort((a, b) => b.gc - a.gc)[0]; return resposta(`Pior defesa: ${D.nome(r.id)}, com ${r.gc} gols sofridos em ${r.j} jogos.`, [["Ver a tabela", "#/tabela"]]); },
    vitorias(D) { const r = D.tabela.slice().sort((a, b) => b.v - a.v)[0]; return resposta(`Mais vitórias: ${D.nome(r.id)}, com ${r.v} em ${r.j} jogos.`, [["Ver a tabela", "#/tabela"]]); },
    empates(D) { const r = D.tabela.slice().sort((a, b) => b.e - a.e)[0]; return resposta(`Mais empates: ${D.nome(r.id)}, com ${r.e} em ${r.j} jogos.`, [["Ver a tabela", "#/tabela"]]); },
    derrotas(D) { const r = D.tabela.slice().sort((a, b) => b.d - a.d)[0]; return resposta(`Mais derrotas: ${D.nome(r.id)}, com ${r.d} em ${r.j} jogos.`, [["Ver a tabela", "#/tabela"]]); },
  };
  const SUGESTOES = ["Quem é o artilheiro do Brasileirão?", "Em que posição está o Cruzeiro?", "Quando o Mengão joga?", "Flamengo x Palmeiras, quem ganha?", "Qual a chance do Palmeiras ser campeão?", "Quem está no Z4?", "Como o Galo vai em casa?", "Quem fez mais gols acima do xG?"];

  function responde(pergunta, D) {
    const q = String(pergunta || "").trim().slice(0, 200);
    if (q.length < 3) return { ok: false, texto: "Escreva uma pergunta sobre o Brasileirão.", sugestoes: SUGESTOES };
    const e = entende(q, D.clubes);
    const fn = e.intencao && R[e.intencao];
    const r = fn ? fn(D, e.clubes, norm(q)) : null;
    if (r) return { ...r, intencao: e.intencao };
    return { ok: false, intencao: e.intencao, texto: e.clubes.length ? `Ainda não sei responder isso sobre o ${e.clubes[0].name}. Tente uma destas:` : "Ainda não sei responder essa. Tente uma destas:", sugestoes: SUGESTOES };
  }

  const api = { entende, responde, clubesNa, SUGESTOES, _norm: norm };
  if (typeof module === "object" && module.exports) module.exports = api;

  /* ---------- página (navegador) ---------- */
  if (typeof document === "undefined") { raiz.PERGUNTE = api; return; }
  const esc = (t) => (window.SEG ? SEG.esc(t) : String(t));
  let dadosP = null;
  function dados() {
    dadosP = dadosP || (async () => {
      const PD = window.PD;
      await Promise.all([window.CLUB_FORM ? null : DADOS.carrega("club-form").catch(() => null), window.XG_TEMPORADA ? null : DADOS.carrega("xg").catch(() => null)]);
      const tabela = (PD.REAL?.table || []).map(([id, p, j, v, e, d, gf, gc]) => ({ id, p, j, v, e, d, gf, gc }));
      const jogos = (PD.ROUNDS || []).flatMap((rd) => PD.realMatches(rd)).filter((m) => !m.adiado || m.status === "ft");
      const art = window.LIVE_DATA?.scorers || [];
      const previsao = window.PREVISAO?.chances ? await window.PREVISAO.chances().catch(() => null) : null;
      return {
        clubes: PD.CLUBS, nome: (id) => PD.byId[id]?.name || id, tabela, jogos,
        artilheiros: art.map(([nome, clube, gols]) => ({ nome, clube, gols })),
        xg: window.XG_TEMPORADA || null, previsao,
        temporada: (id) => ((window.CLUB_FORM?.clubs?.[id]?.all) || []).filter((j) => j.lg === "bra.1" && j.state === "post" && Number.isFinite(j.gf) && Number.isFinite(j.ga))
          .map((j) => ({ id: j.id, date: j.date, casa: !!j.home, adv: j.oppId || j.opp, gf: j.gf, gc: j.ga })),
        chance: (h, a) => (window.CHANCE && window.CLUB_FORM ? window.CHANCE.calcula({ home: h, away: a, status: "ns" }) : null),
      };
    })();
    return dadosP;
  }
  function page() {
    return `<div class="page-head"><div><h1>Pergunte ao CazéStats</h1><p>Pergunte em português sobre o Brasileirão. A resposta sai dos dados do site, com o link de onde ela vem.</p></div></div>
      <section class="pg-caixa" data-pergunte>
        <form class="pg-form" data-pg-form><label for="pg-q" class="sr-only">Sua pergunta</label>
          <input id="pg-q" name="q" type="text" maxlength="200" autocomplete="off" enterkeyhint="send" placeholder="Ex.: quando o Cruzeiro joga?" />
          <button class="pg-enviar" type="submit">Perguntar</button></form>
        <div class="pg-sug" aria-label="Sugestões">${SUGESTOES.map((s) => `<button type="button" data-pg-sug>${esc(s)}</button>`).join("")}</div>
        <ol class="pg-conversa" aria-live="polite"></ol>
        <p class="pg-nota">Respostas por regras do CazéStats.TV, sem inteligência artificial paga: o que ele não entende, ele diz que não sabe.</p>
      </section>`;
  }
  async function pergunta(box, q) {
    const lista = box.querySelector(".pg-conversa");
    const li = document.createElement("li");
    li.innerHTML = `<p class="pg-q">${esc(q)}</p><div class="pg-r"><p>Procurando…</p></div>`;
    lista.prepend(li);
    let r;
    try { r = responde(q, await dados()); } catch { r = { ok: false, texto: "Não deu para carregar os dados agora. Tente de novo." }; }
    li.querySelector(".pg-r").innerHTML = `<p>${esc(r.texto)}</p>${r.links?.length ? `<p class="pg-links">${r.links.map(([t, h]) => `<a href="${esc(h)}">${esc(t)} ›</a>`).join("")}</p>` : ""}
      ${r.sugestoes ? `<div class="pg-sug">${r.sugestoes.slice(0, 4).map((s) => `<button type="button" data-pg-sug>${esc(s)}</button>`).join("")}</div>` : ""}`;
    li.dataset.pgOk = r.ok ? "1" : "0";
    if (window.PAINEL?.uso) window.PAINEL.uso(r.ok ? "pergunte" : "pergunte-sem-resposta");
  }
  function mount(view) {
    const box = (view || document).querySelector("[data-pergunte]:not([data-pg-ok])");
    if (!box) return;
    box.dataset.pgOk = "1";
    dados(); // já começa a carregar
    box.addEventListener("submit", (e) => { e.preventDefault(); const inp = box.querySelector("#pg-q"); const q = inp.value.trim(); if (q) { pergunta(box, q); inp.value = ""; } });
    box.addEventListener("click", (e) => { const b = e.target.closest("[data-pg-sug]"); if (b) pergunta(box, b.textContent); });
    const q = new URLSearchParams(location.hash.split("?")[1] || "").get("q");
    if (q) pergunta(box, q);
  }
  /* atalho da página inicial: uma linha para perguntar, que abre #/pergunte com a resposta */
  function atalho() {
    return `<form class="pg-atalho" data-pg-atalho role="search" aria-label="Pergunte ao CazéStats"><span class="sr-pg-ic" aria-hidden="true">?</span>
      <input name="q" type="text" maxlength="200" autocomplete="off" enterkeyhint="send" aria-label="Pergunte ao CazéStats" placeholder="Pergunte: quem é o artilheiro? quando o seu time joga?" />
      <button type="submit">Perguntar</button></form>`;
  }
  document.addEventListener("submit", (e) => {
    const f = e.target.closest("[data-pg-atalho]");
    if (!f) return;
    e.preventDefault();
    const q = f.q.value.trim();
    location.hash = q ? `#/pergunte?q=${encodeURIComponent(q.slice(0, 200))}` : "#/pergunte";
  });
  raiz.PERGUNTE = { ...api, page, mount, atalho };
})(typeof window !== "undefined" ? window : globalThis);
