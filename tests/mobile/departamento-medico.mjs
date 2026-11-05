/* Departamento médico na página do clube: quem está fora (situação, desde quando, parte do corpo, quantos veículos
   confirmam e a manchete com link), e na aba Estatísticas também quem voltou ao time na temporada.
   Usa dados fixos (não depende das notícias do dia). Também confere que nada vaza para os lados no celular.
   Uso: python -m http.server 5174 --bind 127.0.0.1  e depois  node tests/mobile/departamento-medico.mjs */
import { chromium, webkit, devices } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:5174";
const erros = [], ok = (c, m) => (c ? console.log("ok ·", m) : erros.push(m));
const n = (data, manchete, fonte, nomeado = true) => ({ data, tipo: "lesao", nomeado, manchete, fonte, link: "https://ge.globo.com/teste", oficial: false, confiavel: true });
const DM = { updated: "05/11 12:00", temporada: 2026, clubs: { cruzeiro: {
  ativos: [
    { id: "286558", name: "João Marcelo", status: "fora da temporada", parte: "joelho", desde: "2026-10-29", ultimoJogo: "2026-10-29", atualizado: "2026-11-04",
      fontes: ["ge", "O TEMPO", "Rádio Itatiaia"], confirmado: true, oficial: true, noticias: [n("2026-11-04", "João Marcelo passa por cirurgia no joelho", "Rádio Itatiaia"), n("2026-10-30", "João Marcelo sofre lesão no joelho direito", "ge")] },
    { id: "404202", name: "Felipe Morais", status: "lesionado", parte: "coxa", desde: "2026-10-21", ultimoJogo: "2026-10-13", atualizado: "2026-10-24",
      fontes: ["Rede 98", "Central da Toca"], confirmado: true, oficial: false, noticias: [{ ...n("2026-10-23", "FELIPE MORAIS FORA? O QUE APUREI SOBRE A LESÃO", "Samuca TV (YouTube)"), setorista: "Samuel Venâncio" }, n("2026-10-22", "Felipe Morais sente desconforto e vira dúvida no Cruzeiro contra o Remo", "Rede 98")] },
    { id: "base-jogador-teste", base: true, name: "Jogador Teste", status: "dúvida", parte: null, desde: "2026-11-03", ultimoJogo: null, atualizado: "2026-11-03",
      fontes: ["Blog"], confirmado: false, oficial: false, noticias: [n("2026-11-03", "Jogador Teste é dúvida", "Blog")] },
  ],
  historico: [{ id: "111", name: "Gabriel Pec", status: "em transição", parte: "perna", desde: "2026-08-10", ate: "2026-10-29", motivo: "relacionado para o jogo de 29/10", fontes: ["ge"] }],
  monitorados: 7, ultimoJogo: "2026-10-29", setoristas: [{ nome: "Samuel Venâncio", veiculo: "Samuca TV e Central da Toca" }, { nome: "Emerson Pancieri", veiculo: "Rádio Itatiaia" }] } } };

for (const [dev, L, opts] of [["pc", chromium, { viewport: { width: 1440, height: 900 } }], ["iphone", webkit, devices["iPhone 15"]], ["pixel", chromium, devices["Pixel 7"]]]) {
  const b = await L.launch(L === chromium ? { channel: "chrome" } : {});
  const p = await (await b.newContext({ ...opts, locale: "pt-BR" })).newPage();
  p.on("pageerror", (e) => erros.push(`${dev}: ${e.message}`));
  await p.route(/js\/departamento-medico\.js/, (r) => r.fulfill({ contentType: "application/javascript", body: `window.DM = ${JSON.stringify(DM)};` }));
  for (const [rota, cheio] of [["#/clube/cruzeiro", false], ["#/clube/cruzeiro/estatisticas", true]]) {
    await p.goto(`${BASE}/?d=${Date.now()}${rota}`, { waitUntil: "load" });
    await p.waitForTimeout(1600);
    const r = await p.evaluate(() => {
      const box = document.querySelector(".ps-dm");
      const lis = [...(box?.querySelectorAll("li.dm-li") || [])];
      return {
        titulo: box?.querySelector("h4 small")?.textContent || "",
        nomes: lis.map((l) => l.querySelector("b").firstChild.textContent.trim()),
        base: lis.map((l) => !!l.querySelector(".dm-base")),
        setor: lis.map((l) => l.querySelector(".dm-set")?.textContent || ""),
        reps: document.querySelector(".ps-dm .dm-reps")?.textContent.replace(/\s+/g, " ") || "",
        st: lis.map((l) => l.querySelector(".dm-st")?.textContent),
        sub: lis.map((l) => l.querySelector(".ps-sub")?.textContent),
        tag: lis.map((l) => l.querySelector(".ps-tag")?.textContent),
        links: lis.map((l) => [...l.querySelectorAll("a.ps-src")].map((a) => a.href)),
        hist: [...document.querySelectorAll(".ps-dmh li")].map((l) => l.textContent.replace(/\s+/g, " ").trim()),
        lado: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });
    ok(r.nomes.join(",") === "João Marcelo,Felipe Morais,Jogador Teste", `${dev} ${rota}: lista do DM (${r.nomes.join(", ")})`);
    ok(r.st[0] === "fora da temporada" && r.st[1] === "lesionado" && r.st[2] === "dúvida", `${dev} ${rota}: situação de cada jogador (${r.st.join(" / ")})`);
    ok(/Joelho · desde 29\/10/.test(r.sub[0]) && /último jogo em 13\/10/.test(r.sub[1]) && /sem jogos/.test(r.sub[2]), `${dev} ${rota}: parte do corpo, desde quando e último jogo`);
    ok(/site oficial · confirmado · 3 veículos/.test(r.tag[0]) && /sem confirmação/.test(r.tag[2]), `${dev} ${rota}: confirmação por veículos (${r.tag[0]} | ${r.tag[2]})`);
    ok(r.base.join() === "false,false,true", `${dev} ${rota}: selo "base" só no jogador da base`);
    ok(/setorista · Samuel Venâncio/.test(r.setor[1]), `${dev} ${rota}: notícia do setorista identificada (${r.setor[1]})`);
    if (cheio) ok(/Samuel Venâncio \(Samuca TV e Central da Toca\)/.test(r.reps), `${dev}: lista dos setoristas monitorados (${r.reps.slice(0, 80)})`);
    ok(r.links.every((x) => x.length >= 1 && x.every((h) => h.startsWith("https://"))), `${dev} ${rota}: cada jogador tem a manchete com link`);
    ok(/3 fora · 1 saída do DM na temporada/.test(r.titulo), `${dev} ${rota}: resumo da temporada (${r.titulo})`);
    if (cheio) ok(r.hist.length === 1 && /Gabriel Pec/.test(r.hist[0]) && /10\/08–29\/10/.test(r.hist[0]) && /relacionado/.test(r.hist[0]), `${dev}: "Voltaram ao time" mostra quem saiu do DM (${r.hist[0]})`);
    ok(!r.lado, `${dev} ${rota}: sem rolagem para os lados`);
  }
  await b.close();
}
if (erros.length) { console.log(`\n${erros.length} falha(s):\n- ` + erros.join("\n- ")); process.exit(1); }
console.log("\nDepartamento médico: tudo certo.");
