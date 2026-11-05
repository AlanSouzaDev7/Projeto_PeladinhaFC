/* Testes de invasão da API em Python (server/placar_api.py). Sobe o servidor numa porta de teste e tenta:
   ler arquivos que não são do site (.git, código, chaves locais), atravessar pastas, listar diretórios,
   métodos de escrita, parâmetros forjados, endereço gigante, outro site lendo a API, conexão lenta e
   excesso de requisições. Também confere a limpeza do que vem das fontes de notícias.
   Uso: node tests/seguranca/api.mjs */
import { spawn, execFileSync } from "node:child_process";
import net from "node:net";
const PORT = 8799, HOST = "127.0.0.1";
const erros = [], ok = (c, m) => (c ? console.log("ok ·", m) : erros.push(m));

// requisição crua (sem o cliente "consertar" o endereço), devolve status, cabeçalhos e corpo
function raw(line, headers = {}, { wait = 8000 } = {}) {
  return new Promise((res) => {
    const s = net.connect(PORT, HOST);
    let buf = "";
    const t = setTimeout(() => { s.destroy(); res({ status: 0, headers: {}, body: buf, timeout: true }); }, wait);
    s.on("data", (d) => (buf += d.toString("latin1")));
    s.on("close", () => {
      clearTimeout(t);
      const [head, ...rest] = buf.split("\r\n\r\n");
      const [st, ...hs] = head.split("\r\n");
      const h = {}; for (const x of hs) { const i = x.indexOf(":"); if (i > 0) h[x.slice(0, i).toLowerCase()] = x.slice(i + 1).trim(); }
      res({ status: +(st.split(" ")[1] || 0), headers: h, body: rest.join("\r\n\r\n") });
    });
    s.on("error", () => res({ status: 0, headers: {}, body: "" }));
    s.write(`${line}\r\nHost: ${HOST}:${PORT}\r\n${Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join("")}Connection: close\r\n\r\n`);
  });
}
const get = (path, h) => raw(`GET ${path} HTTP/1.1`, h);

const srv = spawn("python", ["-X", "utf8", "server/placar_api.py", String(PORT)], { stdio: ["ignore", "pipe", "pipe"] });
let saida = ""; srv.stdout.on("data", (d) => (saida += d)); srv.stderr.on("data", (d) => (saida += d));
for (let i = 0; i < 60; i++) { if ((await get("/index.html")).status) break; await new Promise((r) => setTimeout(r, 500)); }

try {
  // 1) site normal + cabeçalhos de segurança
  const home = await get("/");
  ok(home.status === 200 && /PLACAR/.test(home.body), "página inicial servida");
  const H = home.headers;
  ok(/frame-ancestors 'none'/.test(H["content-security-policy"] || "") && H["x-frame-options"] === "DENY" && H["x-content-type-options"] === "nosniff" && H["referrer-policy"] && H["permissions-policy"] && H["cross-origin-opener-policy"] === "same-origin",
    "cabeçalhos de segurança em toda resposta (CSP, moldura proibida, nosniff, referência, permissões, isolamento)");
  ok(H.server === "PLACAR", `servidor não revela versão (Server: ${H.server})`);
  for (const f of ["/js/app.js", "/css/styles.css", "/manifest.webmanifest", "/assets/logo-mark.svg"]) ok((await get(f)).status === 200, `arquivo do site liberado: ${f}`);

  // 2) arquivos que não são do site nunca saem
  for (const f of ["/.git/config", "/.git/HEAD", "/.gitignore", "/server/config.json", "/server/placar_api.py", "/server/cache/state.json", "/worker/.dev.vars", "/worker/wrangler.toml",
    "/tests/worker.mjs", "/package.json", "/README.md", "/.claude/settings.json", "/node_modules/playwright/package.json", "/js/.secreto", "/assets/.env"])
    ok((await get(f)).status === 404, `bloqueado: ${f}`);

  // 3) atravessar pastas (várias codificações)
  for (const f of ["/../../Windows/win.ini", "/js/../server/config.json", "/%2e%2e/%2e%2e/Windows/win.ini", "/js/%2e%2e/server/config.json", "/js/..%2fserver%2fconfig.json",
    "/js/..%5c..%5cserver%5cconfig.json", "/js/%252e%252e/server/config.json", "/index.html::$DATA", "/js/app.js%00.png", "/C:/Windows/win.ini", "//etc/passwd", "/js/./../.git/HEAD"]) {
    const r = await get(f);
    ok(r.status === 404 || r.status === 400, `travessia bloqueada (${r.status}): ${f}`);
  }
  // 4) sem listagem de pastas
  for (const f of ["/js/", "/assets/", "/css/"]) { const r = await get(f); ok(r.status === 404 && !/Directory listing/i.test(r.body), `sem listagem de pasta: ${f}`); }

  // 5) só leitura
  for (const m of ["POST", "PUT", "DELETE", "PATCH", "TRACE", "CONNECT"]) {
    const r = await raw(`${m} /api/state HTTP/1.1`, { "Content-Length": "0" });
    ok(r.status === 405, `${m} recusado (${r.status})`);
  }
  // 6) parâmetros forjados
  const casos = [
    ["/api/news?club=%3Cscript%3Ealert(1)%3C/script%3E", 400], ["/api/news?club=__proto__", 400], ["/api/jogadores?club=../../etc", 400], ["/api/retrospecto?club=constructor", 400],
    ["/api/artilharia-ao-vivo?jogador=1;DROP%20TABLE", 400], ["/api/artilharia-ao-vivo?jogador=%27%20OR%201=1--", 400], ["/api/minuto-a-minuto/abc", 400],
    ["/api/minuto-a-minuto/..%2f..%2fserver", 400], ["/api/minuto-a-minuto/123456789012345678", 400], ["/api/minuto-a-minuto/401234/xyz", 404],
    ["/api/rankings?tipo=%3Cimg%3E", 400], ["/api/inexistente", 404], [`/api/news?${Array.from({ length: 30 }, (_, i) => `a${i}=1`).join("&")}`, 400],
  ];
  for (const [u, st] of casos) {
    const r = await get(u);
    ok(r.status === st && !/<script|Traceback|File "/i.test(r.body) && /application\/json/.test(r.headers["content-type"] || ""), `parâmetro forjado → ${r.status}: ${decodeURIComponent(u).slice(0, 60)}`);
  }
  // 7) endereço gigante
  ok((await get("/api/state?x=" + "A".repeat(3000))).status === 414, "endereço gigante recusado (414)");
  // 8) outro site tentando ler a API pelo navegador da vítima
  const evil = await get("/api/health", { Origin: "https://site-malicioso.example" });
  ok(!evil.headers["access-control-allow-origin"], "outro site não recebe permissão de leitura (CORS)");
  const bom = await get("/api/health", { Origin: "https://alansouzadev7.github.io" });
  ok(bom.headers["access-control-allow-origin"] === "https://alansouzadev7.github.io", "o site oficial continua com permissão");
  const health = JSON.parse((await get("/api/health")).body || "{}");
  ok(!("errors" in health) && typeof health.erros === "number", "a rota de saúde não expõe mensagens internas de erro");
  // 9) conexão lenta (só metade do pedido) é derrubada
  const t0 = Date.now();
  const lenta = await new Promise((res) => {
    const s = net.connect(PORT, HOST, () => s.write("GET / HTTP/1.1\r\nHost: x\r\n"));
    s.on("close", () => res(Date.now() - t0)); s.on("error", () => res(Date.now() - t0));
    setTimeout(() => { s.destroy(); res(99999); }, 30000);
  });
  ok(lenta < 26000, `conexão lenta derrubada pelo servidor em ${Math.round(lenta / 1000)} s`);
  // 10) excesso de requisições (por último: o endereço do teste fica bloqueado por 1 min)
  const sts = [];
  for (let i = 0; i < 140; i++) sts.push((await get("/api/health")).status);
  const n429 = sts.filter((s) => s === 429).length;
  ok(n429 > 0 && sts.slice(0, 60).every((s) => s === 200 || s === 503), `excesso de requisições bloqueado (${n429} de 140 receberam 429; as primeiras passaram)`);
} finally {
  srv.kill();
}
ok(!/Traceback/.test(saida.replace(/erro em .*\n(?:.*\n){0,8}/g, "")), "servidor não quebrou durante os ataques");

// 11) limpeza do que vem das fontes de notícias (direto nas funções do servidor)
const py = `
import sys, json; sys.path.insert(0, "server"); import placar_api as a
print(json.dumps({
  "js": a.clean_link("javascript:alert(1)"), "data": a.clean_link("data:text/html,x"), "http": a.clean_link("http://ge.globo.com/"),
  "user": a.clean_link("https://u:p@ge.globo.com/"), "aspas": a.clean_link('https://ge.globo.com/"onmouseover="x'), "ok": a.clean_link("https://news.google.com/rss/articles/abc?oc=5"),
  "txt": a.clean_text("<img src=x onerror=alert(1)>Gol\\u202e"), "deep": a.clean_deep({"__proto__": {"x": 1}, "t": ["<b>"], "<k>": 1}),
}, ensure_ascii=False))
try:
  a.get("http://example.com/"); print("HTTP_ACEITO")
except ValueError: print("HTTP_RECUSADO")
`;
const r = execFileSync("python", ["-X", "utf8", "-c", py], { encoding: "utf8" }).trim().split("\n");
const c = JSON.parse(r[0]);
ok(c.js === null && c.data === null && c.http === null && c.user === null && c.aspas === null && c.ok?.startsWith("https://news.google.com/"), "servidor: só links https limpos entram nas notícias");
ok(!/[<>]/.test(c.txt) && !/\u202e/.test(c.txt), `servidor: título com marcação vira texto (${c.txt})`);
ok(!("__proto__" in c.deep && Object.keys(c.deep).includes("__proto__")) && c.deep.t[0] === "‹b›" && "‹k›" in c.deep, "servidor: arquivos de dados gravados sem marcação nem chaves perigosas");
ok(r[1] === "HTTP_RECUSADO", "servidor: só baixa dados por https");

if (erros.length) { console.log(`\n${erros.length} falha(s):\n- ` + erros.join("\n- ")); process.exit(1); }
console.log("\nTodos os testes de invasão da API passaram.");
