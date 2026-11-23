// SQLite 백업·검증·복구.
//   node tools/backup.mjs                    백업 만들기 (BACKUP_DIR에, 오래된 것은 --keep 개수만 남기고 삭제)
//   node tools/backup.mjs verify <파일>       무결성 검사와 행 수 출력
//   node tools/backup.mjs restore <파일> <새경로>  새 경로로 복구(이미 있으면 거절)
// PostgreSQL·MariaDB·MongoDB는 각각 pg_dump · mariadb-dump · mongodump를 쓴다(docs/operations 참고).
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

// 첫 인자가 --옵션이면 명령을 생략한 것(= backup)이다.
const argv = process.argv.slice(2);
const [command, ...args] = argv[0] && !argv[0].startsWith("--") ? argv : ["backup", ...argv];
const dbPath = process.env.DATABASE_PATH ?? "./data/board.db";
const backupDir = process.env.BACKUP_DIR ?? "./data/backups";

function verify(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = db.prepare("PRAGMA integrity_check").get().integrity_check;
    const count = (table) => Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
    const rows = { users: count("users"), posts: count("posts"), comments: count("comments") };
    return { ok: integrity === "ok", integrity, rows };
  } finally {
    db.close();
  }
}

if (command === "backup") {
  if (!existsSync(dbPath)) throw new Error(`DB 파일이 없습니다: ${dbPath}`);
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = join(backupDir, `board-${stamp}.db`);
  // VACUUM INTO: 서비스가 쓰는 중에도 일관된 스냅샷 한 장을 새 파일로 만든다(파일 복사는 WAL 때문에 위험하다).
  const db = new DatabaseSync(dbPath);
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  db.close();
  const result = verify(target);
  if (!result.ok) throw new Error(`백업 검증 실패: ${result.integrity}`);
  console.log(JSON.stringify({ msg: "backup ok", file: target, bytes: statSync(target).size, ...result.rows }));

  const keep = Number(args[args.indexOf("--keep") + 1]) || 7;
  const old = readdirSync(backupDir).filter((f) => /^board-.*\.db$/.test(f)).sort().slice(0, -keep);
  for (const file of old) unlinkSync(join(backupDir, file));
  if (old.length) console.log(JSON.stringify({ msg: "pruned", removed: old.length, keep }));
} else if (command === "verify") {
  const result = verify(args[0]);
  console.log(JSON.stringify({ file: basename(args[0]), ...result }));
  process.exit(result.ok ? 0 : 1);
} else if (command === "restore") {
  const [file, to] = args;
  if (!file || !to) throw new Error("사용법: restore <백업파일> <새경로>");
  if (existsSync(to)) throw new Error(`이미 존재합니다: ${to} (덮어쓰지 않습니다. 먼저 옮기거나 지우세요)`);
  if (!verify(file).ok) throw new Error("백업 파일의 무결성 검사가 실패했습니다.");
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(file, to);
  console.log(JSON.stringify({ msg: "restored", to, ...verify(to).rows }));
} else {
  throw new Error(`알 수 없는 명령: ${command}`);
}
