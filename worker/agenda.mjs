/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — agenda do favorito: calendário de jogos de cada clube (iCalendar, RFC 5545)

   GET /agenda/<clube>.ics  -> todos os jogos do clube que estão na tabela jogos do D1 (de 30 dias atrás em diante)
   O torcedor ASSINA o endereço (Google Agenda, iPhone, Outlook): o aplicativo de calendário busca de novo sozinho a cada
   poucas horas, então mudança de data ou horário da CBF aparece no celular sem fazer nada. Cada jogo tem um UID fixo
   (id do jogo), por isso a mudança atualiza o evento em vez de duplicar. Jogo encerrado mostra o placar no título.
   A hora gravada no banco é a de Brasília (sem horário de verão desde 2019: UTC-3), convertida aqui para UTC.
   ========================================================================== */
import { CLUBE_POR_ESPN } from "./alertas.mjs";

const CLUBES = new Set(Object.values(CLUBE_POR_ESPN));
const SITE = "https://cazestats.pages.dev";
const DURACAO = "PT2H";

// texto do iCalendar: barra, ponto e vírgula, vírgula e quebra de linha escapados
const txt = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// linhas com mais de 75 bytes são dobradas (continuação começa com espaço), sem partir caracteres acentuados
function dobra(linha) {
  const enc = new TextEncoder();
  if (enc.encode(linha).length <= 75) return linha;
  const partes = [];
  let atual = "", tam = 0;
  for (const ch of linha) {
    const n = enc.encode(ch).length;
    if (tam + n > (partes.length ? 74 : 75)) { partes.push(atual); atual = ""; tam = 0; }
    atual += ch; tam += n;
  }
  partes.push(atual);
  return partes.join("\r\n ");
}
const utc = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/* um evento por jogo */
export function evento(j, clube, agora = new Date()) {
  const encerrado = j.estado === "post" && j.gols_casa != null && j.gols_fora != null;
  const pen = encerrado && j.pen_casa != null && j.pen_fora != null ? ` (pên. ${j.pen_casa} x ${j.pen_fora})` : "";
  const titulo = encerrado ? `${j.casa} ${j.gols_casa} x ${j.gols_fora} ${j.fora}${pen}` : `${j.casa} x ${j.fora}`;
  const comp = [j.competicao, j.fase].filter(Boolean).join(" · ");
  const linhas = ["BEGIN:VEVENT", `UID:${j.id}@cazestats.pages.dev`, `DTSTAMP:${utc(agora)}`];
  const h = /^(\d{2}):(\d{2})$/.exec(j.hora || "");
  if (h) {
    const ini = new Date(`${j.data}T${h[1]}:${h[2]}:00-03:00`);
    linhas.push(`DTSTART:${utc(ini)}`, `DURATION:${DURACAO}`);
  } else {
    // sem horário definido ainda: evento do dia inteiro (vira horário quando a CBF divulgar)
    const fim = new Date(`${j.data}T00:00:00Z`);
    fim.setUTCDate(fim.getUTCDate() + 1);
    linhas.push(`DTSTART;VALUE=DATE:${j.data.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${fim.toISOString().slice(0, 10).replace(/-/g, "")}`);
  }
  linhas.push(`SUMMARY:${txt(`${titulo}${comp ? ` (${comp})` : ""}`)}`);
  if (j.local) linhas.push(`LOCATION:${txt(j.local)}`);
  const desc = [comp, h ? `${j.hora} (horário de Brasília)` : "Horário a definir", `Estatísticas no CazéStats.TV: ${SITE}/#/clube/${clube}`].filter(Boolean).join("\n");
  linhas.push(`DESCRIPTION:${txt(desc)}`, `URL:${SITE}/#/clube/${clube}`, "STATUS:CONFIRMED", "TRANSP:TRANSPARENT", "END:VEVENT");
  return linhas;
}

export function calendario(clube, nome, jogos, agora = new Date()) {
  const linhas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CazeStats.TV//Agenda do favorito//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${txt(`${nome} · CazéStats.TV`)}`, `X-WR-CALDESC:${txt(`Jogos do ${nome}, atualizados sozinhos pelo CazéStats.TV`)}`,
    "X-WR-TIMEZONE:America/Sao_Paulo", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"];
  for (const j of jogos) linhas.push(...evento(j, clube, agora));
  linhas.push("END:VCALENDAR");
  return linhas.map(dobra).join("\r\n") + "\r\n";
}

export async function agenda(env, clube, cors = {}) {
  if (!CLUBES.has(clube)) return new Response("clube desconhecido", { status: 404, headers: cors });
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = `https://cache.cazestats.interno/agenda/${clube}`;
  const hit = cache && (await cache.match(chave));
  const cab = { ...cors, "content-type": "text/calendar; charset=utf-8", "cache-control": "public, max-age=1800", "content-disposition": `inline; filename="${clube}.ics"` };
  if (hit) return new Response(hit.body, { headers: { ...cab, "x-cache": "HIT" } });
  const desde = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare("SELECT id, competicao, data, hora, fase, casa_id, casa, fora_id, fora, gols_casa, gols_fora, pen_casa, pen_fora, estado, local FROM jogos WHERE (casa_id = ?1 OR fora_id = ?1) AND data >= ?2 ORDER BY data, hora LIMIT 120")
    .bind(clube, desde).all();
  const jogos = results || [];
  const um = jogos.find((j) => j.casa_id === clube || j.fora_id === clube);
  const nome = um ? (um.casa_id === clube ? um.casa : um.fora) : clube;
  const corpo = calendario(clube, nome, jogos);
  if (cache) await cache.put(chave, new Response(corpo, { headers: { "cache-control": "public, max-age=1800", "content-type": "text/calendar; charset=utf-8" } }));
  return new Response(corpo, { headers: { ...cab, "x-cache": "MISS" } });
}
