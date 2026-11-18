/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* Banco D1 simulado para os testes: SQLite em memória do próprio Node (node:sqlite), com a mesma interface do D1
   (prepare().bind().run/first/all e batch). As consultas do Worker rodam como SQL de verdade, com o schema real. */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

export function d1Simulado(schema = new URL("../../worker/schema.sql", import.meta.url)) {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(schema, "utf8"));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => ({ success: true, meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return { prepare: (sql) => stmt(sql), batch: async (lista) => Promise.all(lista.map((s) => s.run())), _db: db };
}
