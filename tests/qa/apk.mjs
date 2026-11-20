/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* ==========================================================================
   CazéStats.TV — QA do APK instalado num emulador Android (adb + uiautomator, sem depender de nada do app)
   Liga o app do zero, mede o tempo até a primeira tela com dados, navega tocando nos textos da tela (como uma pessoa),
   usa o botão voltar, gira a tela, abre o login (que precisa ir para o navegador), testa sem internet e tira prints.
   No perfil TV, navega só com o controle remoto (setas e OK).
   É EMULADOR (Android 15 / Android TV 14 do Google, aceleração WHPX), não aparelho físico.
   Uso: node tests/qa/apk.mjs <nome-do-perfil> [tv]   (com um emulador ligado e o APK instalado)
   ========================================================================== */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

const ADB = `${process.env.LOCALAPPDATA}/Android/Sdk/platform-tools/adb.exe`;
const PKG = "io.github.alansouzadev7.futebol";
const PERFIL = process.argv[2] || "celular", TV = process.argv.includes("tv");
const OUT = new URL("./out/apk/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
mkdirSync(OUT, { recursive: true });
const adb = (...a) => execFileSync(ADB, a, { encoding: "utf8", maxBuffer: 64e6 }).trim();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const res = [];
const ok = (cond, nome, extra = "") => { res.push({ nome, ok: !!cond, extra }); console.log(`${cond ? "ok  " : "FALHOU"} · ${PERFIL} · ${nome}${extra ? ` (${extra})` : ""}`); };
const print = (nome) => { writeFileSync(`${OUT}${PERFIL}-${nome}.png`, execFileSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 64e6 })); };

/* a árvore de acessibilidade da tela (o WebView expõe os textos e links da página) */
function tela() {
  // a tela pode estar animando (o uiautomator não consegue ler): tenta de novo no próximo ciclo
  let xml = "";
  try { adb("shell", "uiautomator", "dump", "/data/local/tmp/ui.xml"); xml = adb("shell", "cat", "/data/local/tmp/ui.xml"); } catch { return []; }
  return [...xml.matchAll(/<node [^>]*?text="([^"]*)"[^>]*?content-desc="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)]
    .map((m) => ({ txt: `${m[1]} ${m[2]}`.trim(), x: (+m[3] + +m[5]) / 2, y: (+m[4] + +m[6]) / 2, w: +m[5] - +m[3], h: +m[6] - +m[4] }));
}
const acha = (re, nos = tela()) => nos.find((n) => re.test(n.txt) && n.w > 0 && n.h > 0);
async function aparece(re, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const n = acha(re); if (n) return { n, ms: Date.now() - t0 }; await espera(800); }
  return null;
}
async function toca(re) { const n = acha(re); if (!n) return false; adb("shell", "input", "tap", String(Math.round(n.x)), String(Math.round(n.y))); await espera(1500); return true; }
const atividade = () => (adb("shell", "dumpsys", "activity", "activities").match(/(?:topResumedActivity|mResumedActivity)[=:][^\n]*? ([\w.]+)\/([\w.$]+)/) || []).slice(1).join("/");
const tamanho = adb("shell", "wm", "size").replace("Physical size: ", ""), densidade = adb("shell", "wm", "density").replace("Physical density: ", "");
const android = adb("shell", "getprop", "ro.build.version.release");
console.log(`\n=== ${PERFIL}: Android ${android}, tela ${tamanho}, densidade ${densidade} ===`);

// 1) abrir do zero
adb("shell", "am", "force-stop", PKG);
adb("shell", "pm", "clear", PKG); // como app recém-instalado (sem cache)
adb("logcat", "-c");
const t0 = Date.now();
adb("shell", "am", "start", "-W", "-n", `${PKG}/.MainActivity`);
const primeira = await aparece(/Brasileirão|rodada/i, 60000);
const marca = (adb("logcat", "-d", "-s", "Capacitor/Console:I").match(/primeira tela em (\d+) ms/) || [])[1];
ok(primeira, "abre do zero e mostra a página inicial com dados", `${marca ? `primeira tela com dados em ${(marca / 1000).toFixed(1)} s (medido pelo app)` : `${((Date.now() - t0) / 1000).toFixed(1)} s até o leitor de tela ver`}`);
await espera(3000);
print("1-inicio");
ok(acha(/CazéStats/), "nome CazéStats.TV no topo");

if (!TV) {
  // 2) navegar tocando
  const tab = (await toca(/^Tabela$/)) && (await aparece(/Classificação|Pts|Pontos/i, 15000));
  ok(tab, "tocar em Tabela abre a classificação");
  print("2-tabela");
  const bol = (await toca(/^Bolão$/)) && (await aparece(/Dê palpite|Ranking geral|Bolão/i, 15000));
  ok(bol, "tocar em Bolão abre o bolão");
  // 3) botão voltar do Android
  adb("shell", "input", "keyevent", "4"); await espera(2000);
  ok(acha(/Classificação|Pts/i), "voltar do Android volta para a tela anterior (Tabela)");
  // 4) conta: no app o login vai para o navegador do sistema
  await toca(/Entrar com Google/);
  const botao = await aparece(/Entrar com Google/, 6000);
  if (botao) {
    const antes = atividade();
    const nosConta = tela().filter((n) => /Entrar com Google/.test(n.txt));
    const alvo = nosConta[nosConta.length - 1];
    adb("shell", "input", "tap", String(Math.round(alvo.x)), String(Math.round(alvo.y)));
    await espera(6000);
    const depois = atividade();
    print("3-login-navegador");
    // o navegador recebeu a página de login com o desafio (Chrome num emulador novo mostra antes a tela de boas-vindas)
    const pedido = adb("shell", "dumpsys", "activity", "activities").match(/dat=(https:\/\/cazestats\.pages\.dev\/entrar-app\?desafio=[\w-]{43})/);
    ok(/chrome|browser/i.test(depois) && pedido, "Entrar com Google abre o navegador do sistema na página de login com o desafio", `${depois} ${pedido ? "→ entrar-app?desafio=…" : "sem a página certa"}`);
    void antes;
    adb("shell", "am", "start", "-n", `${PKG}/.MainActivity`); await espera(2500);
    ok(/futebol/.test(atividade()), "ao voltar, o app continua de onde estava", atividade());
  } else ok(false, "painel da conta com o botão Entrar com Google");
  // 5) girar a tela
  adb("shell", "settings", "put", "system", "accelerometer_rotation", "0");
  adb("shell", "settings", "put", "system", "user_rotation", "1"); await espera(3500);
  print("4-paisagem");
  ok(acha(/CazéStats|Classificação|Brasileirão/i), "girar para paisagem mantém o app de pé");
  adb("shell", "settings", "put", "system", "user_rotation", "0"); await espera(2500);
} else {
  // TV: só controle remoto (setas e OK)
  for (let i = 0; i < 6; i++) { adb("shell", "input", "keyevent", "KEYCODE_DPAD_RIGHT"); await espera(400); }
  adb("shell", "input", "keyevent", "KEYCODE_DPAD_CENTER"); await espera(3000);
  print("2-controle");
  ok(acha(/CazéStats|Brasileirão|Classificação|Clubes/i), "setas e OK do controle navegam sem travar");
  adb("shell", "input", "keyevent", "4"); await espera(2000);
}

// 6) sem internet: fecha, desliga a rede e abre de novo
adb("shell", "svc", "wifi", "disable"); adb("shell", "svc", "data", "disable"); await espera(2500);
adb("shell", "am", "force-stop", PKG);
adb("shell", "am", "start", "-W", "-n", `${PKG}/.MainActivity`);
const off = await aparece(/Brasileirão|rodada|Não deu para abrir/i, 30000);
await espera(2500);
print("5-sem-internet");
const offTxt = off ? off.n.txt : "";
ok(off && !/Não deu para abrir/.test(offTxt), "sem internet abre com os últimos dados guardados", off ? (/Não deu/.test(offTxt) ? "mostrou a página de sem conexão" : "abriu com dados guardados") : "nada apareceu");
adb("shell", "svc", "wifi", "enable"); adb("shell", "svc", "data", "enable"); await espera(4000);

// 7) erros de JavaScript no console do WebView
const log = adb("logcat", "-d", "-s", "Capacitor/Console:E", "chromium:E").split("\n").filter((l) => /Console/.test(l) && !/Third-party cookie|net::ERR|Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(l));
ok(!log.length, "nenhum erro de JavaScript no console do app", log.slice(0, 2).join(" | ").slice(0, 200));
const crash = adb("logcat", "-d", "-b", "crash");
ok(!crash.includes(PKG), "o app não fechou sozinho (sem crash)");
writeFileSync(`${OUT}${PERFIL}.json`, JSON.stringify({ perfil: PERFIL, android, tamanho, densidade, res }, null, 2));
console.log(`${res.filter((r) => r.ok).length} de ${res.length} verificações passaram`);
void readFileSync;
