import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { migrate, type SqlExecutor } from "../sql-repo.server";

// node:sqlite는 Date를 모르므로 ISO 문자열로 바꿔 넣는다.
const bind = (params: unknown[]): SQLInputValue[] =>
  params.map((p) => (p instanceof Date ? p.toISOString() : (p as SQLInputValue)));

export async function openSqlite(path: string): Promise<SqlExecutor> {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

  const executor: SqlExecutor = {
    dialect: "sqlite",
    async all(sql, params = []) {
      return db.prepare(sql).all(...bind(params)) as Record<string, unknown>[];
    },
    async run(sql, params = []) {
      const result = db.prepare(sql).run(...bind(params));
      return { changes: Number(result.changes), insertId: Number(result.lastInsertRowid) };
    },
    isUniqueViolation: (error) => error instanceof Error && /UNIQUE constraint failed/.test(error.message),
    async ping() {
      db.prepare("SELECT 1").get();
    },
    async close() {
      db.close();
    },
  };
  await migrate(executor);
  return executor;
}
