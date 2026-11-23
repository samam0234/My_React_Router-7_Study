import SwaggerParser from "@apidevtools/swagger-parser";
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getConfig, resetConfigForTest } from "~/config.server";
import { openSqlite } from "~/db/drivers/sqlite.server";
import { createSqlRepo } from "~/db/sql-repo.server";
import type { PublicUser, Repo } from "~/db/types";
import { csvCell, toCsvRow } from "~/lib/csv";
import { TtlCache } from "~/lib/cache.server";
import { enqueue, jobStats, whenIdle } from "~/lib/jobs.server";
import { hit, resetRateLimits } from "~/lib/rate-limit.server";
import { openapi } from "~/openapi";
import { signup } from "~/services/auth.server";
import { createPost, listPosts, postCacheStats } from "~/services/posts.server";
import { verifyStripeSignature } from "~/services/payments.server";

describe("OpenAPI 문서", () => {
  it("OpenAPI 3.1 검증기를 통과한다", async () => {
    // validate는 문서를 수정할 수 있어 복사본을 넘긴다.
    const api = await SwaggerParser.validate(structuredClone(openapi) as never);
    expect(Object.keys(api.paths ?? {}).length).toBeGreaterThanOrEqual(18);
  });

  it("모든 operationId가 유일하다", () => {
    const ids = Object.values(openapi.paths).flatMap((item) =>
      Object.values(item as Record<string, { operationId?: string }>).map((op) => op.operationId).filter(Boolean),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("TtlCache", () => {
  it("만료되면 사라지고 적중·실패를 센다", () => {
    const cache = new TtlCache<number>(1000);
    cache.set("a", 1, 0);
    expect(cache.get("a", 500)).toBe(1);
    expect(cache.get("a", 1500)).toBeUndefined();
    expect([cache.hits, cache.misses]).toEqual([1, 1]);
  });

  it("가득 차면 가장 오래된 항목을 버리고, 접두어로 한꺼번에 지운다", () => {
    const cache = new TtlCache<number>(1000, 2);
    cache.set("posts:1", 1, 0);
    cache.set("posts:2", 2, 0);
    cache.set("other", 3, 0);
    expect(cache.get("posts:1", 1)).toBeUndefined();
    cache.invalidate("posts:");
    expect(cache.get("posts:2", 1)).toBeUndefined();
    expect(cache.get("other", 1)).toBe(3);
  });
});

describe("목록 캐시(서비스)", () => {
  let repo: Repo;
  let user: PublicUser;
  beforeEach(async () => {
    repo = createSqlRepo(await openSqlite(":memory:"));
    user = await signup({ email: "c@example.com", password: "password123", nickname: "cc" }, repo);
  });

  it("같은 조건의 두 번째 조회는 DB를 부르지 않고, 글을 쓰면 무효화된다", async () => {
    const spy = vi.spyOn(repo.posts, "list");
    const params = { q: "", page: 1, limit: 10, sort: "-createdAt" as const };
    await listPosts(params, repo);
    await listPosts(params, repo);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(postCacheStats(repo).hits).toBe(1);

    await createPost(user, { title: "새 글", body: "본문" }, repo);
    const after = await listPosts(params, repo);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(after.meta.total).toBe(1);
  });

  it("조건이 다르면 별도 항목", async () => {
    const spy = vi.spyOn(repo.posts, "list");
    await listPosts({ q: "", page: 1, limit: 10, sort: "-createdAt" }, repo);
    await listPosts({ q: "", page: 2, limit: 10, sort: "-createdAt" }, repo);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("Stripe 서명 검증", () => {
  const secret = "whsec_unit";
  const body = '{"id":"evt_1"}';
  const header = (t: number, payload = body) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;
  const now = 1_700_000_000_000;

  it("올바른 서명은 통과", () => expect(verifyStripeSignature(body, header(now / 1000), secret, now)).toBe(true));
  it("본문이 바뀌면 거절", () => expect(verifyStripeSignature(body.replace("1", "2"), header(now / 1000), secret, now)).toBe(false));
  it("5분 넘은 타임스탬프(재전송)는 거절", () => expect(verifyStripeSignature(body, header(now / 1000 - 301), secret, now)).toBe(false));
  it("헤더·비밀키가 없으면 거절", () => {
    expect(verifyStripeSignature(body, null, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, header(now / 1000), "", now)).toBe(false);
  });
});

describe("레이트 리밋", () => {
  beforeEach(resetRateLimits);

  it("한 창에서 limit번까지 허용하고 그 뒤는 거절 + Retry-After", () => {
    const results = [0, 1, 2, 3].map((i) => hit("ip|auth", 3, 60_000, 1000 + i));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3].retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(results[0].remaining).toBe(2);
  });

  it("창이 지나면 다시 허용, 키가 다르면 서로 영향 없음", () => {
    for (let i = 0; i < 4; i++) hit("a", 3, 1000, 0);
    expect(hit("a", 3, 1000, 1001).allowed).toBe(true);
    expect(hit("b", 3, 1000, 0).allowed).toBe(true);
  });
});

describe("CSV", () => {
  it("쉼표·따옴표·줄바꿈은 따옴표로 감싼다", () => {
    expect(csvCell('He said "hi", ok')).toBe('"He said ""hi"", ok"');
    expect(csvCell("줄\n바꿈")).toBe('"줄\n바꿈"');
  });

  it("수식으로 읽히는 시작 문자(=,+,-,@)는 글자로 만든다", () => {
    for (const evil of ["=1+1", "+1", "-1", "@SUM(A1)"]) expect(csvCell(evil)).toBe(`'${evil}`);
    expect(csvCell("정상")).toBe("정상");
  });

  it("한 행은 CRLF로 끝난다", () => expect(toCsvRow([1, "a", null])).toBe("1,a,\r\n"));
});

describe("작업 큐", () => {
  it("실패하면 재시도해서 성공한다", async () => {
    let calls = 0;
    const before = { ...jobStats };
    enqueue("flaky", async () => {
      if (++calls < 3) throw new Error("일시 오류");
    }, { retries: 2, backoffMs: 5 });
    await whenIdle();
    await new Promise((r) => setTimeout(r, 60)); // 재시도 타이머가 큐에 다시 넣을 시간
    await whenIdle();
    expect(calls).toBe(3);
    expect(jobStats.retried - before.retried).toBe(2);
    expect(jobStats.succeeded - before.succeeded).toBe(1);
  });

  it("재시도를 다 쓰면 failed로 센다", async () => {
    const before = jobStats.failed;
    enqueue("always-fails", async () => { throw new Error("항상 실패"); }, { retries: 1, backoffMs: 5 });
    await whenIdle();
    await new Promise((r) => setTimeout(r, 40));
    await whenIdle();
    expect(jobStats.failed - before).toBe(1);
  });
});

describe("설정", () => {
  it("빈 값은 설정 안 함으로 보고 기본값을 쓴다", () => {
    const keep = { ...process.env };
    process.env.OLLAMA_BASE_URL = "";
    process.env.AI_MODEL = "";
    resetConfigForTest();
    expect(getConfig().OLLAMA_BASE_URL).toBe("http://127.0.0.1:11434");
    expect(getConfig().AI_MODEL).toBe("gemma4:12b");
    Object.assign(process.env, keep);
    resetConfigForTest();
  });

  it("postgres·mariadb·mongo는 DATABASE_URL이 없으면 시작 단계에서 실패한다", () => {
    process.env.DB_DRIVER = "postgres";
    process.env.DATABASE_URL = "";
    resetConfigForTest();
    expect(() => getConfig()).toThrow(/DATABASE_URL/);
    delete process.env.DB_DRIVER;
    resetConfigForTest();
  });

  it("짧은 비밀키는 거절한다", () => {
    const original = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "short";
    resetConfigForTest();
    expect(() => getConfig()).toThrow(/SESSION_SECRET/);
    process.env.SESSION_SECRET = original;
    resetConfigForTest();
  });
});
