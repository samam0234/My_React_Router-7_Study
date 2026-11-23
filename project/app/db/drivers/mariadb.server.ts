import mariadb from "mariadb";
import { migrate, type SqlExecutor } from "../sql-repo.server";

export async function openMariadb(url: string): Promise<SqlExecutor> {
  const parsed = new URL(url);
  const pool = mariadb.createPool({
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.slice(1),
    connectionLimit: 10,
    charset: "utf8mb4",
    timezone: "Z", // DATETIME을 UTC로 읽고 쓴다.
    // 기본값은 BigInt다. JS 숫자로 받아야 서비스 코드가 DB를 의식하지 않는다.
    insertIdAsNumber: true,
    bigIntAsNumber: true,
  });

  const executor: SqlExecutor = {
    dialect: "mariadb",
    async all(sql, params = []) {
      return (await pool.query(sql, params)) as Record<string, unknown>[];
    },
    async run(sql, params = []) {
      const result = await pool.query(sql, params);
      return { changes: Number(result.affectedRows), insertId: Number(result.insertId) };
    },
    // 1062 = ER_DUP_ENTRY
    isUniqueViolation: (error) => (error as { errno?: number })?.errno === 1062,
    async ping() {
      await pool.query("SELECT 1");
    },
    close: () => pool.end(),
  };
  await migrate(executor);
  return executor;
}
