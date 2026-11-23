// 백업이 "만들어졌다"가 아니라 "복구해서 읽힌다"까지 확인한다. 복구 연습을 하지 않은 백업은 백업이 아니다.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { check, sleep, summary } from "./lib/harness.mjs";

const dir = mkdtempSync(join(tmpdir(), "rr7-backup-"));
let db;
const dbPath = join(dir, "board.db");
const backups = join(dir, "backups");
const env = { ...process.env, DATABASE_PATH: dbPath, BACKUP_DIR: backups };
const run = (...args) => execFileSync(process.execPath, ["--disable-warning=ExperimentalWarning", "tools/backup.mjs", ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

try {
  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT); CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT); CREATE TABLE comments (id INTEGER PRIMARY KEY);`);
  db.exec(`INSERT INTO users (email) VALUES ('a@example.com'), ('b@example.com'); INSERT INTO posts (title) VALUES ('가'), ('나'), ('다');`);

  const out = JSON.parse(run());
  check("백업 생성 + 행 수 기록", out.msg === "backup ok" && out.users === 2 && out.posts === 3 && existsSync(out.file));

  db.exec("INSERT INTO posts (title) VALUES ('백업 이후 글')"); // 서비스는 계속 쓰는 중
  const file = out.file;
  check("백업 이후의 변경은 백업에 없다(스냅샷)", JSON.parse(run("verify", file)).rows.posts === 3);

  const restored = join(dir, "restored", "board.db");
  const res = JSON.parse(run("restore", file, restored));
  check("복구한 DB에서 데이터가 읽힌다", res.msg === "restored" && res.users === 2 && res.posts === 3);
  check("복구는 기존 파일을 덮어쓰지 않는다", (() => { try { run("restore", file, restored); return false; } catch { return true; } })());

  for (let i = 0; i < 4; i++) { await sleep(5); run("--keep", "3"); }
  check("보관 개수(--keep 3)만 남기고 정리", readdirSync(backups).filter((f) => f.endsWith(".db")).length === 3);
} catch (error) {
  check("백업 시험 중 예외 없음", false, String(error?.stack ?? error));
} finally {
  db?.close(); // 열린 채로 지우면 Windows가 파일 잠금(EPERM)으로 거절한다
  rmSync(dir, { recursive: true, force: true });
}
process.exit(summary() ? 1 : 0);
