import pg from "pg";
import { migrate, type SqlExecutor } from "../sql-repo.server";

/** ? 자리표시자를 PostgreSQL 방식($1, $2 …)으로 바꾼다. 문자열 리터럴 안의 ?는 쓰지 않는 규칙이다. */
const toDollar = (sql: string) => {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
};

export async function openPostgres(url: string): Promise<SqlExecutor> {
  const pool = new pg.Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 });
  // 유휴 연결이 끊겨도 프로세스가 죽지 않게 한다.
  pool.on("error", (error) => console.error(JSON.stringify({ level: "error", msg: "pg pool", error: String(error) })));

  const executor: SqlExecutor = {
    dialect: "postgres",
    async all(sql, params = []) {
      return (await pool.query(toDollar(sql), params)).rows as Record<string, unknown>[];
    },
    async run(sql, params = []) {
      const result = await pool.query(toDollar(sql), params);
      return { changes: result.rowCount ?? 0 };
    },
    // 23505 = unique_violation
    isUniqueViolation: (error) => (error as { code?: string })?.code === "23505",
    async ping() {
      await pool.query("SELECT 1");
    },
    close: () => pool.end(),
  };
  await migrate(executor);
  return executor;
}
