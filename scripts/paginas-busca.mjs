/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — páginas para buscadores e prévia de link (chamado por scripts/montar-site.mjs)
   Para cada jogo, clube e jogador, uma página estática com endereço próprio:
     /jogo/<id>   /clube/<id>   /jogador/<aid>-<clube>
   É o próprio index.html com título, descrição, prévia de link (Open Graph), endereço canônico, dados estruturados
   (schema.org) e um texto inicial dentro do <main>, que o Google lê e o app substitui ao carregar. O torcedor vê
   o site normal: o app converte o endereço na rota com # (js/app.js, primeiras linhas).
   Escala: são arquivos estáticos na borda da Cloudflare, sem servidor no meio. Atualizam a cada publicação do robô.
   ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const POS = { G: "Goleiro", D: "Defensor", M: "Meio-campista", F: "Atacante" };
const escA = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escH = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;
const lerJSON = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, "utf8")); } catch { return padrao; } };

export function clubesDoSite(raiz) {
  const ctx = { window: {}, console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(`${fs.readFileSync(path.join(raiz, "js/data.js"), "utf8")}\n;globalThis.__CLUBS = CLUBS;`, ctx);
  return ctx.__CLUBS;
}

/* troca o cabeçalho do index.html e põe o texto inicial no <main> */
function pagina(base, { titulo, descricao, url, imagem, tipoOg = "website", dados, corpo }) {
  let h = base
    .replace(/<title>[^<]*<\/title>/, `<title>${escH(titulo)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${escA(descricao)}" />`)
    .replace(/<meta property="og:type" content="[^"]*"\s*\/?>/, `<meta property="og:type" content="${tipoOg}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${escA(titulo)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${escA(descricao)}" />`)
    .replace(/<meta property="og:image" content="[^"]*"\s*\/?>/, `<meta property="og:image" content="${escA(imagem)}" />\n  <meta property="og:url" content="${escA(url)}" />\n  <meta property="og:locale" content="pt_BR" />`)
    .replace(/<meta charset="utf-8"\s*\/?>/, `<meta charset="utf-8" />\n  <base href="/" />`)
    .replace("</head>", `  <link rel="canonical" href="${escA(url)}" />\n  ${ld(dados)}\n</head>`)
    .replace(/<main id="view" class="view" tabindex="-1"><\/main>/, `<main id="view" class="view" tabindex="-1"><article class="wrap seo-inicial"><h1>${escH(titulo)}</h1>${corpo}</article></main>`);
  return h;
}

export function geraPaginas({ raiz, saida, site, html }) {
  const require = createRequire(import.meta.url);
  const RESUMO = require(path.join(raiz, "js/resumo.js"));
  const CLUBS = clubesDoSite(raiz), byId = Object.fromEntries(CLUBS.map((c) => [c.id, c]));
  const live = lerJSON(path.join(raiz, "dados/live-data.json"), {});
  const squads = lerJSON(path.join(raiz, "dados/squads.json"), {}).SQUADS || {};
  const forma = lerJSON(path.join(raiz, "dados/club-form.json"), {}).clubs || {};
  const tabela = new Map((live.standings || []).map((r, i) => [r[0], { pos: i + 1, p: r[1], j: r[2], v: r[3], e: r[4], d: r[5], gp: r[6], gc: r[7] }]));
  const ctx = {
    nome: (c) => byId[c]?.abbr || c,
    tabela: (c) => tabela.get(c),
    forma: (c) => (forma[c]?.last || []).filter((e) => e.res).slice(0, 5).map((e) => e.res).join(""),
  };
  const imagem = `${site}assets/marca/icone-1024.png`;
  const urls = [];
  const grava = (rel, conteudo) => {
    const arq = path.join(saida, `${rel}.html`);
    fs.mkdirSync(path.dirname(arq), { recursive: true });
    fs.writeFileSync(arq, conteudo);
    urls.push(`${site}${rel}`);
  };

  // jogos (a janela de rodadas que o robô mantém)
  const jogos = [];
  for (const [rodada, lista] of Object.entries(live.fixtures || {})) {
    for (const g of lista || []) {
      const [home, away, hs, as, date, time, venue, espn, info] = g;
      if (!byId[home] || !byId[away]) continue;
      const st = info?.state === "post" || (hs != null && !info) ? "ft" : info?.state === "in" ? "progress" : "ns";
      jogos.push({ id: `${home}-x-${away}-r${rodada}`, round: Number(rodada), home, away, hs, as, date, time, venue, espn, status: st, clock: info?.clock,
        gols: (info?.gols || []).map((x) => ({ nome: x[1], clube: x[2], pen: !!x[3], contra: !!x[4] })) });
    }
  }
  for (const m of jogos) {
    const H = byId[m.home], A = byId[m.away], r = RESUMO.partida(m, ctx);
    const url = `${site}jogo/${m.id}`;
    const placar = m.status === "ft" ? `${H.abbr} ${m.hs} x ${m.as} ${A.abbr}` : `${H.abbr} x ${A.abbr}`;
    const titulo = `${placar} — ${m.round}ª rodada do Brasileirão | CazéStats.TV`;
    const descricao = `${r.texto} Placar ao vivo, escalações, chance de vitória, onde assistir e voz da torcida.`.slice(0, 300);
    const inicio = /^\d{4}-\d{2}-\d{2}$/.test(m.date || "") ? `${m.date}T${/^\d{2}:\d{2}$/.test(m.time || "") ? m.time : "00:00"}:00-03:00` : undefined;
    grava(`jogo/${m.id}`, pagina(html, {
      titulo, descricao, url, imagem, tipoOg: "article",
      dados: { "@context": "https://schema.org", "@type": "SportsEvent", name: `${H.name} x ${A.name}`, sport: "Futebol", url, startDate: inicio,
        eventStatus: "https://schema.org/EventScheduled", location: m.venue ? { "@type": "Place", name: RESUMO.estadio(m.venue).replace(/^n[oa] /, "") } : undefined,
        homeTeam: { "@type": "SportsTeam", name: H.name }, awayTeam: { "@type": "SportsTeam", name: A.name }, description: r.texto,
        superEvent: { "@type": "SportsEvent", name: "Campeonato Brasileiro Série A" } },
      corpo: `<p>${escH(r.texto)}</p><p><a href="/clube/${m.home}">${escH(H.name)}</a> · <a href="/clube/${m.away}">${escH(A.name)}</a></p>`,
    }));
  }

  // clubes
  for (const c of CLUBS) {
    const t = tabela.get(c.id), url = `${site}clube/${c.id}`;
    const prox = jogos.filter((m) => m.status !== "ft" && (m.home === c.id || m.away === c.id)).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 3);
    const campanha = t ? `${c.name} é ${t.pos}${c.id === "chapecoense" ? "ª" : "º"} no Brasileirão, com ${t.p} pontos em ${t.j} jogos (${t.v} vitórias, ${t.e} empates e ${t.d} derrotas; ${t.gp} gols marcados e ${t.gc} sofridos).` : "";
    const descricao = `${campanha} Elenco, jogos, tabela, estatísticas, histórico desde 2023 e janela de transferências do ${c.name}.`.trim().slice(0, 300);
    grava(`clube/${c.id}`, pagina(html, {
      titulo: `${c.name}: elenco, jogos e estatísticas no Brasileirão | CazéStats.TV`, descricao, url, imagem,
      dados: { "@context": "https://schema.org", "@type": "SportsTeam", name: c.name, alternateName: c.nick, sport: "Futebol", url, foundingDate: String(c.founded),
        location: { "@type": "Place", name: `${c.city}, ${c.uf}` }, memberOf: { "@type": "SportsOrganization", name: "Campeonato Brasileiro Série A" } },
      corpo: `<p>${escH(campanha)}</p><p>${escH(`${c.nick} · ${c.city} (${c.uf}) · fundado em ${c.founded} · ${c.stadium}`)}</p>${prox.length ? `<h2>Próximos jogos</h2><ul>${prox.map((m) => `<li><a href="/jogo/${m.id}">${escH(`${byId[m.home].abbr} x ${byId[m.away].abbr}`)}</a> ${escH(RESUMO.quando(m.date, m.time))}</li>`).join("")}</ul>` : ""}`,
    }));
  }

  // jogadores
  for (const [cid, elenco] of Object.entries(squads)) {
    const c = byId[cid];
    if (!c) continue;
    const carreiras = lerJSON(path.join(raiz, `dados/carreiras/${cid}.json`), {});
    for (const [num, nome, pos, idade, aid] of elenco) {
      if (!aid || !nome) continue;
      const chave = `${aid}-${cid}`, url = `${site}jogador/${chave}`;
      const passagens = (carreiras[aid] || []).map((x) => x.c).filter(Boolean);
      const unicos = passagens.filter((x, i) => passagens.indexOf(x) === i);
      const sobre = `${nome} é ${(POS[pos] || "jogador").toLowerCase()} do ${c.name}${num != null ? `, camisa ${num}` : ""}${idade ? `, ${idade} anos` : ""}.`;
      const carreira = unicos.length > 1 ? ` Carreira: ${unicos.join(", ")}.` : "";
      grava(`jogador/${chave}`, pagina(html, {
        titulo: `${nome} (${c.abbr}): estatísticas, mapa de calor e carreira | CazéStats.TV`,
        descricao: `${sobre}${carreira} Jogos, gols, assistências, notas e mapa de calor na temporada.`.slice(0, 300), url, imagem, tipoOg: "profile",
        dados: { "@context": "https://schema.org", "@type": "Person", name: nome, jobTitle: POS[pos] || "Jogador de futebol", url, memberOf: { "@type": "SportsTeam", name: c.name } },
        corpo: `<p>${escH(sobre + carreira)}</p><p><a href="/clube/${cid}">${escH(c.name)}</a></p>`,
      }));
    }
  }
  return urls;
}
