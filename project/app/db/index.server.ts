import { getConfig } from "~/config.server";
import { openMariadb } from "./drivers/mariadb.server";
import { openPostgres } from "./drivers/postgres.server";
import { openSqlite } from "./drivers/sqlite.server";
import { createMongoRepo } from "./mongo.server";
import { createSqlRepo } from "./sql-repo.server";
import type { Repo } from "./types";

/** DB_DRIVER 한 줄로 저장소 구현이 바뀐다. 서비스 코드는 이 파일 아래를 모른다. */
async function connect(): Promise<Repo> {
  const config = getConfig();
  switch (config.DB_DRIVER) {
    case "sqlite":
      return createSqlRepo(await openSqlite(config.DATABASE_PATH));
    case "postgres":
      return createSqlRepo(await openPostgres(config.DATABASE_URL));
    case "mariadb":
      return createSqlRepo(await openMariadb(config.DATABASE_URL));
    case "mongo":
      return createMongoRepo(config.DATABASE_URL);
  }
}

/**
 * 연결은 비동기인데 서비스는 getRepo()를 동기로 부르고 싶다.
 * 그래서 첫 호출 때 연결을 시작하고, 각 메서드가 연결이 끝나길 기다렸다 위임하는 껍데기를 돌려준다.
 */
function lazyRepo(factory: () => Promise<Repo>, driver: string): Repo {
  let ready: Promise<Repo> | undefined;
  const connected = () => (ready ??= factory());
  const delegate = <T extends object>(pick: (repo: Repo) => T): T =>
    new Proxy({} as T, {
      get:
        (_target, method) =>
        (...args: unknown[]) =>
          connected().then((repo) => (pick(repo) as Record<string | symbol, (...a: unknown[]) => unknown>)[method](...args)),
    });
  return {
    driver,
    users: delegate((repo) => repo.users),
    posts: delegate((repo) => repo.posts),
    comments: delegate((repo) => repo.comments),
    documents: delegate((repo) => repo.documents),
    ping: () => connected().then((repo) => repo.ping()),
    close: async () => {
      if (ready) await (await ready).close();
      ready = undefined;
    },
  };
}

// 개발 중 HMR로 모듈이 다시 로드돼도 연결을 하나만 쓰도록 globalThis에 보관한다.
const globalForRepo = globalThis as unknown as { __rr7Repo?: Repo };

export function getRepo(): Repo {
  globalForRepo.__rr7Repo ??= lazyRepo(connect, getConfig().DB_DRIVER);
  return globalForRepo.__rr7Repo;
}

/** 테스트에서 가짜 또는 메모리 저장소를 끼워 넣는다. */
export function setRepoForTest(repo: Repo | undefined) {
  globalForRepo.__rr7Repo = repo;
}
