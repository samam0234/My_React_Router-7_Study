import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "~/lib/password.server";

describe("password", () => {
  it("같은 비밀번호도 매번 다른 해시를 만든다(솔트)", async () => {
    const [a, b] = await Promise.all([hashPassword("password123"), hashPassword("password123")]);
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
  });

  it("맞는 비밀번호만 통과한다", async () => {
    const stored = await hashPassword("password123");
    expect(await verifyPassword("password123", stored)).toBe(true);
    expect(await verifyPassword("password124", stored)).toBe(false);
  });

  it("형식이 깨진 저장값은 거절한다", async () => {
    expect(await verifyPassword("x", "plain-text")).toBe(false);
    expect(await verifyPassword("x", "scrypt$only-salt")).toBe(false);
  });
});
