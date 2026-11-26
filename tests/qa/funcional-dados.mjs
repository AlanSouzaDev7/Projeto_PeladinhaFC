/* QA funcional — coerência dos arquivos de dados (sem navegador).
   Tabela: P = 3V+E, J = V+E+D, ordem (P, V, SG, GP), soma GP = soma GC; CA/CV do clube x soma dos jogadores (Brasileirão);
   jogadores: gols ≤ chutes, no alvo ≤ chutes, titular ≤ jogos, minutos ≥ jogos, idade 15–45; artilharia x jogadores.
   Uso: node tests/qa/funcional-dados.mjs */
import { readFileSync, readdirSync } from "node:fs";
const R = new URL("../../dados/", import.meta.url);
const ler = (f) => JSON.parse(readFileSync(new URL(f, R), "utf8"));
const L = ler("live-data.json"), PS = ler("player-stats.json");
const prob = [], aviso = [];
const st = L.standings.map(([id, p, j, w, d, l, gf, ga, ca, cv, prox]) => ({ id, p, j, w, d, l, gf, ga, ca, cv, prox }));
for (const r of st) {
  if (r.p !== 3 * r.w + r.d) prob.push(`tabela ${r.id}: P ${r.p} != 3V+E ${3 * r.w + r.d}`);
  if (r.j !== r.w + r.d + r.l) prob.push(`tabela ${r.id}: J ${r.j} != V+E+D ${r.w + r.d + r.l}`);
}
for (let i = 1; i < st.length; i++) {
  const a = st[i - 1], b = st[i];
  const k = (x) => [x.p, x.w, x.gf - x.ga, x.gf];
  const ka = k(a), kb = k(b);
  const cmp = ka.findIndex((v, n) => v !== kb[n]);
  if (cmp >= 0 && ka[cmp] < kb[cmp]) prob.push(`tabela ordem: ${a.id} (${ka}) antes de ${b.id} (${kb})`);
}
const sgf = st.reduce((s, r) => s + r.gf, 0), sga = st.reduce((s, r) => s + r.ga, 0), sj = st.reduce((s, r) => s + r.j, 0);
if (sgf !== sga) prob.push(`tabela: soma GP ${sgf} != soma GC ${sga}`);
if (sj % 2) prob.push(`tabela: soma J ${sj} ímpar`);
const sw = st.reduce((s, r) => s + r.w, 0), sl = st.reduce((s, r) => s + r.l, 0), sd = st.reduce((s, r) => s + r.d, 0);
if (sw !== sl) prob.push(`tabela: soma V ${sw} != soma D ${sl}`);
if (sd % 2) prob.push(`tabela: soma E ${sd} ímpar`);
console.log(`tabela: ${st.length} clubes, ${sj / 2} jogos, ${sgf} gols`);

// jogadores por clube
const arq = readdirSync(new URL("jogadores/", R)).filter((f) => f.endsWith(".json"));
const golsJog = {};
for (const f of arq) {
  const D = ler(`jogadores/${f}`), cid = f.replace(".json", "");
  let ca = 0, cv = 0, g = 0;
  for (const [pid, j] of Object.entries(D.jogadores || {})) {
    if (j.idade != null && (j.idade < 15 || j.idade > 45)) prob.push(`jogador ${cid}/${pid} ${j.n}: idade ${j.idade}`);
    for (const [comp, s] of Object.entries(j.comps || {})) {
      const tag = `${cid}/${pid} ${j.n} [${comp}]`;
      if (s.g > s.ch && s.ch > 0) prob.push(`${tag}: gols ${s.g} > chutes ${s.ch}`);
      if (s.alvo > s.ch) prob.push(`${tag}: no alvo ${s.alvo} > chutes ${s.ch}`);
      if (s.tit > s.j) prob.push(`${tag}: titular ${s.tit} > jogos ${s.j}`);
      if (s.j > 0 && s.min > 0 && s.min < s.j) prob.push(`${tag}: minutos ${s.min} < jogos ${s.j}`);
      if (s.min > s.j * 130) prob.push(`${tag}: minutos ${s.min} > 130 x jogos ${s.j}`);
      if (s.g > 0 && s.ch === 0 && comp === "Brasileirão") aviso.push(`${tag}: ${s.g} gols com 0 chutes`);
    }
    const b = j.comps?.["Brasileirão"];
    if (b) { ca += b.ca; cv += b.cv; g += b.g; golsJog[pid] = { g: b.g, n: j.n, cid }; }
  }
  const r = st.find((x) => x.id === cid);
  if (r) {
    if (r.ca !== ca) (Math.abs(r.ca - ca) > 3 ? prob : aviso).push(`cartões ${cid}: tabela CA ${r.ca} x soma jogadores ${ca}`);
    if (r.cv !== cv) (Math.abs(r.cv - cv) > 1 ? prob : aviso).push(`cartões ${cid}: tabela CV ${r.cv} x soma jogadores ${cv}`);
    if (g > r.gf) prob.push(`gols ${cid}: soma jogadores ${g} > GP da tabela ${r.gf}`);
    else if (r.gf - g > 4) aviso.push(`gols ${cid}: GP ${r.gf} x soma jogadores ${g} (diferença ${r.gf - g}: contra/sem autor?)`);
  }
}
// artilharia
const sc = L.scorers;
for (let i = 1; i < sc.length; i++) if (sc[i][2] > sc[i - 1][2]) prob.push(`artilharia fora de ordem: ${sc[i - 1]} antes de ${sc[i]}`);
for (const a of PS.artilheiros) {
  const pj = golsJog[a.id];
  if (pj && pj.g !== a.gols && a.noClube) aviso.push(`artilharia ${a.name}: ${a.gols} gols x página do jogador ${pj.g}`);
  if (a.gols > a.chutes) prob.push(`artilheiro ${a.name}: gols ${a.gols} > chutes ${a.chutes}`);
  if (a.min < a.jogos) prob.push(`artilheiro ${a.name}: min ${a.min} < jogos ${a.jogos}`);
}
if (sc[0][0] !== PS.artilheiros[0].name) prob.push(`artilheiro nº1 diferente: live-data ${sc[0][0]} x player-stats ${PS.artilheiros[0].name}`);
for (const [n, c, g] of sc) { const a = PS.artilheiros.find((x) => x.name === n); if (a && a.gols !== g) prob.push(`artilharia ${n}: live-data ${g} x player-stats ${a.gols}`); }
// competições (Libertadores, Copa do Brasil, Séries B/C/D, estaduais): tabelas dos grupos e artilharia
for (const f of readdirSync(new URL("competicoes/", R)).filter((x) => x.endsWith(".json"))) {
  const C = ler(`competicoes/${f}`), nome = f.replace(".json", "");
  for (const g of C.grupos || []) {
    const ls = g.linhas || [];
    for (const l of ls) {
      if (l.p !== 3 * l.v + l.e) prob.push(`${nome} ${g.nome} ${l.nome}: P ${l.p} != 3V+E ${3 * l.v + l.e}`);
      if (l.j !== l.v + l.e + l.d) prob.push(`${nome} ${g.nome} ${l.nome}: J ${l.j} != V+E+D ${l.v + l.e + l.d}`);
    }
    for (let i = 1; i < ls.length; i++) {
      const a = ls[i - 1], c = ls[i];
      if (a.p < c.p) prob.push(`${nome} ${g.nome}: ${a.nome} (${a.p} pts) acima de ${c.nome} (${c.p} pts)`);
      if (a.pos && c.pos && a.pos >= c.pos) prob.push(`${nome} ${g.nome}: posição ${a.pos} antes de ${c.pos}`);
    }
    const gp = ls.reduce((s, l) => s + l.gp, 0), gc = ls.reduce((s, l) => s + l.gc, 0);
    if (ls.length > 2 && gp !== gc && C.tipo === "liga") prob.push(`${nome} ${g.nome}: soma GP ${gp} != soma GC ${gc}`);
    // jogos encerrados x J da tabela (só ligas de grupo único)
    if (C.tipo === "liga" && (C.grupos || []).length === 1) {
      const ft = (C.jogos || []).filter((j) => j.estado === "post" && !j.mata);
      for (const l of ls) {
        const n = ft.filter((j) => j.casa?.id === l.id || j.fora?.id === l.id).length;
        if (n && n !== l.j) aviso.push(`${nome} ${l.nome}: J ${l.j} na tabela x ${n} jogos encerrados na lista`);
      }
    }
  }
  const art = C.artilharia || [];
  for (let i = 1; i < art.length; i++) if (art[i].gols > art[i - 1].gols) prob.push(`${nome} artilharia fora de ordem: ${art[i - 1].nome} ${art[i - 1].gols} antes de ${art[i].nome} ${art[i].gols}`);
  if (C.encerrado && !C.campeao) aviso.push(`${nome}: encerrado sem campeão`);
}
console.log(`\nPROBLEMAS (${prob.length}):\n` + prob.join("\n"));
console.log(`\nAVISOS (${aviso.length}):\n` + aviso.join("\n"));
process.exitCode = prob.length ? 1 : 0;
