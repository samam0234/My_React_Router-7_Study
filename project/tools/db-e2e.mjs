// DB를 바꿔 끼워도 같은 요청 테스트가 통과하는지 확인한다. 드라이버마다 "새 데이터베이스"를 만들어 쓰고 지운다.
//   docker compose --profile databases up -d    # 먼저 DB 컨테이너를 띄운다
//   npm run build && npm run test:db            # 또는: node tools/db-e2e.mjs postgres mariadb
import { spawn } from "node:child_process";
import mariadb from "mariadb";
import { MongoClient } from "mongodb";
import pg from "pg";

// 관리자 접속 주소(기본값은 compose.yaml의 포트). 다른 서버를 쓰려면 환경변수로 바꾼다.
const ADMIN = {
  postgres: process.env.E2E_POSTGRES_URL ?? "postgres://rr7:rr7pass@localhost:15432/board",
  mariadb: process.env.E2E_MARIADB_URL ?? "mariadb://root:rr7pass@localhost:13306/board",
  mongo: process.env.E2E_MONGO_URL ?? "mongodb://localhost:27018",
};
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const dbName = `e2e_${suffix}`;
const withDb = (url, name) => { const u = new URL(url); u.pathname = `/${name}`; return u.toString(); };

const drivers = {
  async postgres() {
    const admin = new pg.Client({ connectionString: ADMIN.postgres });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    return { url: withDb(ADMIN.postgres, dbName), drop: async () => { await admin.query(`DROP DATABASE ${dbName} WITH (FORCE)`); await admin.end(); } };
  },
  async mariadb() {
    const u = new URL(ADMIN.mariadb);
    const admin = await mariadb.createConnection({ host: u.hostname, port: Number(u.port), user: u.username, password: u.password });
    await admin.query(`CREATE DATABASE ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    return { url: withDb(ADMIN.mariadb, dbName), drop: async () => { await admin.query(`DROP DATABASE ${dbName}`); await admin.end(); } };
  },
  async mongo() {
    const url = withDb(ADMIN.mongo, dbName); // MongoDB는 쓰는 순간 데이터베이스가 생긴다
    return { url, drop: async () => { const c = new MongoClient(url); await c.connect(); await c.db().dropDatabase(); await c.close(); } };
  },
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(drivers);
let failed = 0;
for (const name of wanted) {
  console.log(`\n══ ${name}: 새 데이터베이스 ${dbName}로 요청 테스트 전체 실행 ══`);
  const target = await drivers[name]();
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["tools/request-test.mjs"], {
      env: { ...process.env, TEST_DB_DRIVER: name, TEST_DATABASE_URL: target.url },
      stdio: ["ignore", "pipe", "inherit"],
    });
    let passed = 0, total = 0;
    child.stdout.on("data", (chunk) => {
      for (const line of chunk.toString().split("\n")) {
        if (line.startsWith("PASS") || line.startsWith("FAIL")) total++;
        if (line.startsWith("PASS")) passed++;
        if (line.startsWith("FAIL") || /통과$/.test(line)) console.log(line);
      }
    });
    child.on("close", (c) => resolve(c));
  });
  await target.drop();
  if (code !== 0) failed++;
  console.log(code === 0 ? `✔ ${name}: 통과` : `✘ ${name}: 실패`);
}
process.exit(failed ? 1 : 0);
