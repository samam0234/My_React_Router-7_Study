import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openMariadb } from "~/db/drivers/mariadb.server";
import { openPostgres } from "~/db/drivers/postgres.server";
import { openSqlite } from "~/db/drivers/sqlite.server";
import { createMongoRepo } from "~/db/mongo.server";
import { createSqlRepo } from "~/db/sql-repo.server";
import type { Repo } from "~/db/types";
import { AppError } from "~/lib/errors";

/**
 * "계약 테스트": DB 종류와 상관없이 저장소가 지켜야 하는 동작을 한 벌로 적고 모든 드라이버에 돌린다.
 * SQLite는 항상 실행하고, 나머지는 접속 주소(TEST_*_URL)가 있을 때만 실행한다.
 *   docker compose --profile databases up -d  →  TEST_POSTGRES_URL=... npm test
 */
const targets: { name: string; url: string | undefined; open: (url: string) => Promise<Repo> }[] = [
  { name: "sqlite", url: ":memory:", open: async (url) => createSqlRepo(await openSqlite(url)) },
  { name: "postgres", url: process.env.TEST_POSTGRES_URL, open: async (url) => createSqlRepo(await openPostgres(url)) },
  { name: "mariadb", url: process.env.TEST_MARIADB_URL, open: async (url) => createSqlRepo(await openMariadb(url)) },
  { name: "mongo", url: process.env.TEST_MONGO_URL, open: createMongoRepo },
];

for (const target of targets) {
  describe.skipIf(!target.url)(`저장소 계약: ${target.name}`, () => {
    let repo: Repo;
    const unique = Date.now().toString(36); // 같은 DB를 다시 써도 이메일이 겹치지 않게 한다.
    let userId = 0;
    let otherId = 0;

    beforeAll(async () => {
      repo = await target.open(target.url!);
      userId = (await repo.users.create({ email: `a-${unique}@example.com`, nickname: "에이", passwordHash: "h" })).id;
      otherId = (await repo.users.create({ email: `b-${unique}@example.com`, nickname: "비", passwordHash: "h" })).id;
    });
    afterAll(async () => {
      await repo?.close();
    });

    it("연결 확인(ping)", async () => {
      await expect(repo.ping()).resolves.toBeUndefined();
    });

    it("사용자: 숫자 id, 이메일 조회, 중복은 EMAIL_TAKEN", async () => {
      const found = await repo.users.findByEmail(`a-${unique}@example.com`);
      expect(found).toMatchObject({ id: userId, nickname: "에이" });
      expect(typeof found!.id).toBe("number");
      expect(new Date(found!.createdAt).toISOString()).toBe(found!.createdAt);
      await expect(repo.users.create({ email: `a-${unique}@example.com`, nickname: "x", passwordHash: "h" })).rejects.toSatisfy(
        (error) => error instanceof AppError && error.code === "EMAIL_TAKEN",
      );
    });

    it("글: 한글·태그 왕복, 부분 수정, 검색(대소문자·와일드카드), 정렬", async () => {
      const a = await repo.posts.create({ authorId: userId, title: `계약 ${unique} 첫째`, body: "Hello 한글 본문", tags: ["가", "b"] });
      expect(a.tags).toEqual(["가", "b"]);
      expect(a.commentCount).toBe(0);
      const b = await repo.posts.create({ authorId: otherId, title: `계약 ${unique} 둘째`, body: "100% 완성", tags: [] });

      const hit = await repo.posts.list({ q: `HELLO`, page: 1, limit: 50, sort: "-createdAt" });
      expect(hit.items.some((p) => p.id === a.id)).toBe(true);
      const percent = await repo.posts.list({ q: `100%`, page: 1, limit: 50, sort: "-createdAt" });
      expect(percent.items.map((p) => p.id)).toContain(b.id);
      const wildcard = await repo.posts.list({ q: `%`, page: 1, limit: 50, sort: "-createdAt" });
      expect(wildcard.items.map((p) => p.id)).toEqual([b.id]); // %는 "100%"에만 문자로 들어 있다
      const latest = await repo.posts.list({ q: unique, page: 1, limit: 1, sort: "-createdAt" });
      expect(latest.total).toBe(2);
      expect(latest.items[0].id).toBe(b.id);
      const oldest = await repo.posts.list({ q: unique, page: 1, limit: 1, sort: "createdAt" });
      expect(oldest.items[0].id).toBe(a.id);

      const patched = await repo.posts.update(a.id, { title: `계약 ${unique} 수정` });
      expect(patched).toMatchObject({ title: `계약 ${unique} 수정`, body: "Hello 한글 본문", tags: ["가", "b"] });
      expect(await repo.posts.update(999_999_999, { title: "x" })).toBeNull();
    });

    it("댓글: 개수 반영, 정렬 키 -commentCount, 삭제 시 개수 감소, 글 삭제 시 연쇄 삭제", async () => {
      const post = await repo.posts.create({ authorId: userId, title: `댓글 ${unique}`, body: "b", tags: [] });
      const c1 = await repo.comments.create({ postId: post.id, authorId: otherId, body: "하나" });
      await repo.comments.create({ postId: post.id, authorId: userId, body: "둘" });
      expect((await repo.posts.find(post.id))!.commentCount).toBe(2);
      expect((await repo.comments.listByPost(post.id)).map((c) => c.body)).toEqual(["하나", "둘"]);
      const top = await repo.posts.list({ q: "", page: 1, limit: 1, sort: "-commentCount" });
      expect(top.items[0].commentCount).toBeGreaterThanOrEqual(2);

      expect(await repo.comments.remove(c1.id)).toBe(true);
      expect((await repo.posts.find(post.id))!.commentCount).toBe(1);
      expect(await repo.comments.remove(c1.id)).toBe(false);

      expect(await repo.posts.remove(post.id)).toBe(true);
      expect(await repo.posts.find(post.id)).toBeNull();
      expect(await repo.comments.listByPost(post.id)).toEqual([]);
    });

    it("문서: 생성·목록(본문 제외)·요약 저장·삭제", async () => {
      const doc = await repo.documents.create({ ownerId: userId, title: "문서", content: "내용 본문" });
      expect(doc).toMatchObject({ summaryStatus: "pending", summary: null, byteSize: Buffer.byteLength("내용 본문") });
      await repo.documents.setSummary(doc.id, { summary: "요약", status: "ready" });
      expect(await repo.documents.find(doc.id)).toMatchObject({ summary: "요약", summaryStatus: "ready", content: "내용 본문" });
      const list = await repo.documents.listByOwner(userId);
      expect(list.find((d) => d.id === doc.id)).toBeTruthy();
      expect("content" in list[0]).toBe(false);
      expect(await repo.documents.remove(doc.id)).toBe(true);
    });
  });
}
