/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — QA com limite de tempo (um teste travado não segura a bateria por horas)
   Roda cada teste em processo próprio, com tempo máximo por teste e um orçamento total. Quem passa do tempo é
   encerrado e conta como "tempo esgotado". No fim, um resumo e o código de saída (0 = tudo passou).
   Uso: BASE=http://127.0.0.1:5173 node tests/qa-final.mjs [--rapido]
        QA_MINUTOS=30 (orçamento total, padrão 35) · QA_TESTE_SEG=240 (máximo por teste, padrão 240)
   ========================================================================== */
import { spawn } from "node:child_process";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const POR_TESTE = (+process.env.QA_TESTE_SEG || 240) * 1000;
const ORCAMENTO = (+process.env.QA_MINUTOS || 35) * 60e3;
const rapido = process.argv.includes("--rapido");

// [nome, comando, argumentos, tempo máximo próprio em s (opcional)]
const TESTES = [
  ["regras do departamento médico", "python", ["-X", "utf8", "tests/dm_casos.py"], 60],
  ["API do mercado, fotos e escalações", "python", ["-X", "utf8", "tests/mercado_api.py"], 240],
  ["API dos jogadores", "python", ["-X", "utf8", "tests/jogadores_api.py"], 240],
  ["API das competições", "python", ["-X", "utf8", "tests/competicoes_api.py"], 180],
  ["Worker (cache, ESPN, banco)", "node", ["tests/worker.mjs"], 60],
  ["robô enviando os dados ao banco D1", "node", ["tests/enviar-d1.mjs"], 120],
  ["alerta de gol do favorito", "node", ["tests/alertas.mjs"], 60],
  ["conta com Google e sincronização", "node", ["tests/conta.mjs"], 60],
  ["invasão da API", "node", ["tests/seguranca/api.mjs"], 200],
  ["invasão do site (PC, iPhone, Android)", "node", ["tests/seguranca/site.mjs"], 240],
  ["jogadores, busca e comparativos", "node", ["tests/mobile/jogadores.mjs"], 300],
  ["janela de transferências", "node", ["tests/mobile/janela.mjs"], 300],
  ["ficha do artilheiro", "node", ["tests/mobile/ficha-clique.mjs"], 180],
  ["site sem servidor (GitHub Pages)", "node", ["tests/mobile/sem-servidor.mjs"], 180],
  ["menu em PC, tablet e celular", "node", ["tests/mobile/menu.mjs"], 180],
  ["busca", "node", ["tests/mobile/busca.mjs"], 180],
  ["simulador", "node", ["tests/mobile/simulador.mjs"], 180],
  ["carregamento e peso", "node", ["tests/mobile/desempenho.mjs"], 240],
  ["campinho tático e escalações", "node", ["tests/mobile/taticas.mjs"], 180],
];
const lista = rapido ? TESTES.filter((t) => t[1] === "python" || /invasão|Worker|tático/.test(t[0])) : TESTES;

const inicio = Date.now(), resultado = [];
for (const [nome, cmd, args, seg] of lista) {
  const resta = ORCAMENTO - (Date.now() - inicio);
  if (resta < 20e3) { resultado.push([nome, "não rodou (orçamento esgotado)", 0]); continue; }
  const limite = Math.min(seg ? seg * 1000 : POR_TESTE, resta);
  const t0 = Date.now();
  const r = await new Promise((res) => {
    let saida = "";
    const p = spawn(cmd, args, { env: { ...process.env, BASE }, shell: process.platform === "win32" });
    p.stdout.on("data", (d) => (saida += d));
    p.stderr.on("data", (d) => (saida += d));
    const relogio = setTimeout(() => { p.kill("SIGKILL"); res({ estado: "tempo esgotado", saida }); }, limite);
    p.on("close", (code) => { clearTimeout(relogio); res({ estado: code === 0 ? "passou" : `falhou (código ${code})`, saida }); });
  });
  const dur = Math.round((Date.now() - t0) / 1000);
  resultado.push([nome, r.estado, dur]);
  console.log(`${r.estado === "passou" ? "✓" : "✗"} ${nome} — ${r.estado} em ${dur}s`);
  if (r.estado !== "passou") console.log("   " + r.saida.trim().split("\n").slice(-6).join("\n   "));
}
const ok = resultado.filter((x) => x[1] === "passou").length;
console.log(`\nQA: ${ok} de ${resultado.length} passaram em ${Math.round((Date.now() - inicio) / 60e3)} min (limite ${ORCAMENTO / 60e3} min)`);
process.exit(ok === resultado.length ? 0 : 1);
