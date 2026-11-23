import { beforeEach, describe, expect, it } from "vitest";
import { openSqlite } from "~/db/drivers/sqlite.server";
import { createSqlRepo } from "~/db/sql-repo.server";
import type { PublicUser, Repo } from "~/db/types";
import { AppError } from "~/lib/errors";
import { login, signup } from "~/services/auth.server";
import { createComment, deleteComment, listComments } from "~/services/comments.server";
import {
  createPost,
  deletePost,
  getPost,
  listPosts,
  parseListQuery,
  updatePost,
} from "~/services/posts.server";

let repo: Repo;
let mina: PublicUser;
let joon: PublicUser;

async function expectAppError(promise: Promise<unknown>, status: number, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect({ status: (error as AppError).status, code: (error as AppError).code }).toEqual({ status, code });
}

beforeEach(async () => {
  // 테스트마다 새 메모리 DB. 파일 DB를 건드리지 않는다.
  repo = createSqlRepo(await openSqlite(":memory:"));
  mina = await signup({ email: "mina@example.com", password: "password123", nickname: "mina" }, repo);
  joon = await signup({ email: "joon@example.com", password: "password123", nickname: "joon" }, repo);
});

describe("auth service", () => {
  it("중복 이메일은 409", async () => {
    await expectAppError(
      signup({ email: "MINA@example.com", password: "password123", nickname: "x1" }, repo),
      409,
      "EMAIL_TAKEN",
    );
  });

  it("로그인 성공·실패", async () => {
    expect((await login({ email: "mina@example.com", password: "password123" }, repo)).id).toBe(mina.id);
    await expectAppError(login({ email: "mina@example.com", password: "nope" }, repo), 401, "INVALID_CREDENTIALS");
    await expectAppError(login({ email: "none@example.com", password: "password123" }, repo), 401, "INVALID_CREDENTIALS");
  });
});

describe("posts service", () => {
  it("작성·조회·부분 수정", async () => {
    const post = await createPost(mina, { title: "첫 글", body: "본문", tags: ["a"] }, repo);
    expect((await getPost(post.id, repo)).author.nickname).toBe("mina");
    const updated = await updatePost(mina, post.id, { title: "수정" }, repo);
    expect(updated.title).toBe("수정");
    expect(updated.tags).toEqual(["a"]);
    expect(updated.body).toBe("본문");
  });

  it("남의 글은 403, 없는 글은 404", async () => {
    const post = await createPost(mina, { title: "t", body: "b" }, repo);
    await expectAppError(updatePost(joon, post.id, { title: "x" }, repo), 403, "FORBIDDEN");
    await expectAppError(deletePost(joon, post.id, repo), 403, "FORBIDDEN");
    await expectAppError(getPost(9999, repo), 404, "NOT_FOUND");
  });

  it("목록: 검색·정렬·페이지·totalPages", async () => {
    for (let i = 1; i <= 25; i++) {
      await createPost(mina, { title: i === 7 ? "특별한 글" : `글 ${i}`, body: "본문" }, repo);
    }
    const first = await listPosts(parseListQuery(new URLSearchParams("")), repo);
    expect(first.meta).toMatchObject({ page: 1, limit: 10, total: 25, totalPages: 3 });
    expect(first.data[0].title).toBe("글 25");
    const found = await listPosts(parseListQuery(new URLSearchParams("q=특별")), repo);
    expect(found.data.map((p) => p.title)).toEqual(["특별한 글"]);
    const last = await listPosts(parseListQuery(new URLSearchParams("page=3")), repo);
    expect(last.data).toHaveLength(5);
  });

  it("parseListQuery는 범위를 보정한다", () => {
    expect(parseListQuery(new URLSearchParams("page=-3&limit=999&sort=hack"))).toEqual({
      q: "",
      page: 1,
      limit: 50,
      sort: "-createdAt",
    });
    expect(parseListQuery(new URLSearchParams("limit=0")).limit).toBe(10);
  });

  it("삭제하면 댓글도 함께 지워진다(CASCADE)", async () => {
    const post = await createPost(mina, { title: "t", body: "b" }, repo);
    await createComment(joon, post.id, { body: "댓글" }, repo);
    await deletePost(mina, post.id, repo);
    await expectAppError(listComments(post.id, repo), 404, "NOT_FOUND");
  });
});

describe("comments service", () => {
  it("내 댓글만 삭제할 수 있다", async () => {
    const post = await createPost(mina, { title: "t", body: "b" }, repo);
    const comment = await createComment(joon, post.id, { body: "안녕" }, repo);
    await expectAppError(deleteComment(mina, comment.id, repo), 403, "FORBIDDEN");
    await deleteComment(joon, comment.id, repo);
    expect(await listComments(post.id, repo)).toHaveLength(0);
  });
});
