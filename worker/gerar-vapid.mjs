/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* Cria o par de chaves VAPID do alerta de gol e grava como segredos do Worker, sem mostrar a chave privada na tela.
   Uso (na pasta do projeto, uma vez):  node worker/gerar-vapid.mjs
   Rodar de novo troca as chaves: quem já tinha ligado o alerta precisa ligar de novo. */
import { spawnSync } from "node:child_process";

const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const privada = JSON.stringify(await crypto.subtle.exportKey("jwk", par.privateKey));
const publica = Buffer.from(await crypto.subtle.exportKey("raw", par.publicKey)).toString("base64url");
for (const [nome, valor] of [["VAPID_PRIVADA", privada], ["VAPID_PUBLICA", publica]]) {
  const r = spawnSync("npx", ["--yes", "wrangler@4.48.0", "secret", "put", nome, "--config", "worker/wrangler.toml"], { input: valor, stdio: ["pipe", "inherit", "inherit"], shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`não deu para gravar ${nome} (wrangler saiu com ${r.status})`);
    process.exit(1);
  }
}
console.log("Chaves do alerta de gol gravadas no Worker. Chave pública (pode ser mostrada):", publica);
