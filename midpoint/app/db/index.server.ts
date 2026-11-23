import { getConfig } from "~/config.server";
import { createSqliteRepo, openSqlite } from "./sqlite.server";
import type { Repo } from "./types";

// 개발 중 HMR로 모듈이 다시 로드돼도 연결을 하나만 쓰도록 globalThis에 보관한다.
const globalForRepo = globalThis as unknown as { __rr7Repo?: Repo };

export function getRepo(): Repo {
  globalForRepo.__rr7Repo ??= createSqliteRepo(openSqlite(getConfig().DATABASE_PATH));
  return globalForRepo.__rr7Repo;
}

/** 테스트에서 가짜 또는 메모리 저장소를 끼워 넣는다. */
export function setRepoForTest(repo: Repo | undefined) {
  globalForRepo.__rr7Repo = repo;
}
