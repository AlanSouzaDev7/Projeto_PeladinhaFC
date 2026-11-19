/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — conta opcional com "Entrar com Google" e sincronização do que o torcedor salva

   POST   /conta/entrar   { credential }  -> confere o comprovante do Google e devolve uma sessão do CazéStats.TV
   GET    /conta/dados                     -> tudo que a conta salvou (favoritos, escalações, janela, palpites...)
   PUT    /conta/dados    { itens: [{ chave, dados, atualizado }] }  -> grava; em cada item vale o mais recente
   POST   /conta/sair                      -> encerra a sessão deste aparelho
   DELETE /conta                           -> apaga a conta e tudo que ela salvou (LGPD)
   Sessão: Authorization: Bearer <token>; no banco fica só o hash do token (sessoes) e um código da conta, que é o hash
   do id do Google: nada de e-mail, nome ou foto no servidor (o site mostra nome e foto a partir do próprio comprovante).
   O comprovante (JWT do Google) é conferido com as chaves públicas do Google: assinatura RS256, emissor, público
   (o ID do cliente, GOOGLE_CLIENT_ID) e validade.
   ========================================================================== */

import { apagaDoBolao } from "./bolao.mjs";

const CHAVES_GOOGLE = "https://www.googleapis.com/oauth2/v3/certs";
const EMISSORES = new Set(["accounts.google.com", "https://accounts.google.com"]);
// o que pode ser salvo: o mesmo que o site guarda no aparelho como conteúdo do torcedor (js/conta.js)
export const CHAVE_OK = /^placar:(favs|simulador|votes|theme|bora|tema-bora|janela-[a-z-]{2,30}|xi2:[\w:.-]{1,80}|xi-jogo:[\w:.-]{1,80}|copa-sim-[\w-]{1,40})$/;
const ITEM_MAX = 16_384, ITENS_MAX = 300, SESSAO_DIAS = 90;

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const sha256 = async (txt) => b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt)));

let jwksMemoria = null;
async function chavesGoogle(buscar) {
  if (jwksMemoria && jwksMemoria.ate > Date.now()) return jwksMemoria.keys;
  const r = await buscar(CHAVES_GOOGLE, { cf: { cacheTtl: 3600 } });
  if (!r.ok) throw new Error(`chaves do Google: HTTP ${r.status}`);
  const d = await r.json();
  jwksMemoria = { keys: d.keys || [], ate: Date.now() + 3600e3 };
  return jwksMemoria.keys;
}
export const _limpaChaves = () => { jwksMemoria = null; }; // testes

/* confere o comprovante do Google; devolve { sub, nome, foto } ou lança erro com o motivo */
export async function confereGoogle(credential, clienteId, buscar = fetch, agora = Date.now()) {
  const partes = String(credential || "").split(".");
  if (partes.length !== 3 || credential.length > 4096) throw new Error("comprovante malformado");
  const cab = JSON.parse(new TextDecoder().decode(deB64url(partes[0])));
  const dados = JSON.parse(new TextDecoder().decode(deB64url(partes[1])));
  if (cab.alg !== "RS256") throw new Error("algoritmo não aceito");
  const jwk = (await chavesGoogle(buscar)).find((k) => k.kid === cab.kid);
  if (!jwk) throw new Error("chave do Google desconhecida");
  const chave = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", chave, deB64url(partes[2]), new TextEncoder().encode(`${partes[0]}.${partes[1]}`));
  if (!ok) throw new Error("assinatura inválida");
  if (!EMISSORES.has(dados.iss)) throw new Error("emissor inválido");
  if (!clienteId || dados.aud !== clienteId) throw new Error("comprovante de outro site");
  if (!(dados.exp * 1000 > agora)) throw new Error("comprovante vencido");
  if (!dados.sub) throw new Error("comprovante sem conta");
  return { sub: String(dados.sub), nome: String(dados.given_name || dados.name || "").slice(0, 60), foto: String(dados.picture || "") };
}

export async function entrar(env, txt, buscar = fetch) {
  let d;
  try { d = JSON.parse(txt || ""); } catch { return { status: 400, erro: "pedido inválido" }; }
  let g;
  try {
    g = await confereGoogle(d?.credential, env.GOOGLE_CLIENT_ID, buscar);
  } catch (e) {
    return { status: 401, erro: `não deu para entrar: ${String(e?.message || e).slice(0, 80)}` };
  }
  const usuario = await sha256(`google:${g.sub}`);
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const agora = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO usuarios (id, criado, visto) VALUES (?1, ?2, ?2) ON CONFLICT(id) DO UPDATE SET visto = ?2").bind(usuario, agora),
    env.DB.prepare("INSERT INTO sessoes (token, usuario, criado, expira) VALUES (?1, ?2, ?3, ?4)").bind(await sha256(token), usuario, agora, agora + SESSAO_DIAS * 864e5),
  ]);
  return { status: 200, sessao: token, nome: g.nome, foto: /^https:\/\/lh\d\.googleusercontent\.com\//.test(g.foto) ? g.foto : "" };
}

/* usuário da sessão (Authorization: Bearer ...) ou null */
export async function usuarioDa(env, req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!/^[\w-]{30,60}$/.test(token)) return null;
  const r = await env.DB.prepare("SELECT usuario FROM sessoes WHERE token = ?1 AND expira > ?2").bind(await sha256(token), Date.now()).first();
  return r ? { id: r.usuario, tokenHash: await sha256(token) } : null;
}

export async function lerDados(env, usuario) {
  const { results } = await env.DB.prepare("SELECT chave, dados, atualizado FROM salvos WHERE usuario = ?1").bind(usuario).all();
  return (results || []).map((r) => ({ chave: r.chave, dados: r.dados, atualizado: r.atualizado }));
}

export async function gravarDados(env, usuario, txt) {
  if (!txt || txt.length > 600_000) return { status: 413, erro: "dados grandes demais" };
  let d;
  try { d = JSON.parse(txt); } catch { return { status: 400, erro: "pedido inválido" }; }
  const itens = Array.isArray(d?.itens) ? d.itens : null;
  if (!itens || itens.length > ITENS_MAX) return { status: 400, erro: "lista de itens inválida" };
  const agora = Date.now(), ops = [];
  for (const it of itens) {
    const chave = String(it?.chave || ""), dados = it?.dados == null ? null : String(it.dados), atualizado = Number(it?.atualizado);
    if (!CHAVE_OK.test(chave) || !Number.isFinite(atualizado) || atualizado > agora + 60e3) return { status: 400, erro: `item inválido: ${chave.slice(0, 40)}` };
    if (dados != null && dados.length > ITEM_MAX) return { status: 413, erro: `item grande demais: ${chave}` };
    // dados null = o item foi apagado no aparelho; em cada item vale o mais recente
    ops.push(env.DB.prepare("INSERT INTO salvos (usuario, chave, dados, atualizado) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(usuario, chave) DO UPDATE SET dados = ?3, atualizado = ?4 WHERE ?4 > salvos.atualizado")
      .bind(usuario, chave, dados, atualizado));
  }
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM salvos WHERE usuario = ?1").bind(usuario).first();
  if (n + ops.length > ITENS_MAX * 2) return { status: 413, erro: "a conta chegou ao limite de itens salvos" };
  if (ops.length) await env.DB.batch(ops);
  return { status: 200, gravados: ops.length };
}

export async function sair(env, sessao) {
  await env.DB.prepare("DELETE FROM sessoes WHERE token = ?1").bind(sessao.tokenHash).run();
}
export async function apagarConta(env, usuario) {
  await env.DB.batch([
    ...apagaDoBolao(env, usuario),
    env.DB.prepare("DELETE FROM salvos WHERE usuario = ?1").bind(usuario),
    env.DB.prepare("DELETE FROM sessoes WHERE usuario = ?1").bind(usuario),
    env.DB.prepare("DELETE FROM usuarios WHERE id = ?1").bind(usuario),
  ]);
}
export async function limpaSessoes(env) {
  await env.DB.prepare("DELETE FROM sessoes WHERE expira < ?1").bind(Date.now()).run();
}
