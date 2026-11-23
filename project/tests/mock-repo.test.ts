import { describe, expect, it, vi } from "vitest";
import type { Repo } from "~/db/types";
import { hashPassword } from "~/lib/password.server";
import { login } from "~/services/auth.server";
import { getPost } from "~/services/posts.server";

// DB 없이 "저장소의 모양"만 흉내 낸다. 서비스가 저장소를 어떻게 부르는지, 오류를 어떻게 바꾸는지만 본다.
function fakeRepo(
  posts: Partial<Repo["posts"]> = {},
  users: Partial<Repo["users"]> = {},
): Repo {
  const notUsed = () => {
    throw new Error("이 테스트에서는 호출되면 안 됩니다.");
  };
  return {
    driver: "fake",
    users: { create: notUsed, findByEmail: vi.fn(async () => null), findById: notUsed, ...users },
    posts: { list: notUsed, find: vi.fn(async () => null), create: notUsed, update: notUsed, remove: notUsed, ...posts },
    comments: { listByPost: notUsed, find: notUsed, create: notUsed, remove: notUsed },
    documents: { listByOwner: notUsed, find: notUsed, create: notUsed, setSummary: notUsed, remove: notUsed },
    ping: async () => {},
    close: async () => {},
  };
}

describe("가짜 저장소로 서비스 테스트", () => {
  it("저장소가 null을 돌려주면 404 NOT_FOUND", async () => {
    const repo = fakeRepo();
    await expect(getPost(1, repo)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(repo.posts.find).toHaveBeenCalledWith(1);
  });

  it("없는 사용자도 비밀번호 비교를 거쳐 INVALID_CREDENTIALS", async () => {
    const repo = fakeRepo();
    await expect(login({ email: "a@b.co", password: "whatever1" }, repo)).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    expect(repo.users.findByEmail).toHaveBeenCalledWith("a@b.co");
  });

  it("저장소가 던진 예상 밖 오류는 그대로 전파(500 처리는 바깥 몫)", async () => {
    const repo = fakeRepo({
      find: vi.fn(async () => {
        throw new Error("DB 연결 끊김");
      }),
    });
    await expect(getPost(1, repo)).rejects.toThrow("DB 연결 끊김");
  });

  it("해시가 맞으면 사용자를 돌려준다", async () => {
    const passwordHash = await hashPassword("password123");
    const repo = fakeRepo(
      {},
      { findByEmail: vi.fn(async () => ({ id: 1, email: "a@b.co", nickname: "a", passwordHash, createdAt: "" })) },
    );
    await expect(login({ email: "a@b.co", password: "password123" }, repo)).resolves.toEqual({
      id: 1,
      email: "a@b.co",
      nickname: "a",
    });
  });
});
