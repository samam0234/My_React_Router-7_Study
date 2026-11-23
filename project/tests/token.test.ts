import { describe, expect, it } from "vitest";
import { signAccessToken, verifyAccessToken } from "~/lib/token.server";

const secret = "unit-test-secret-0123456789abcdefghij";
const user = { id: 7, email: "mina@example.com", nickname: "mina" };

describe("access token", () => {
  it("서명한 토큰을 검증하면 payload가 돌아온다", () => {
    const token = signAccessToken(user, secret, 60, 1_000_000);
    const payload = verifyAccessToken(token, secret, 1_000_000 + 59_000);
    expect(payload).toMatchObject({ sub: "7", email: "mina@example.com", nickname: "mina" });
  });

  it("만료되면 null", () => {
    const token = signAccessToken(user, secret, 60, 1_000_000);
    expect(verifyAccessToken(token, secret, 1_000_000 + 61_000)).toBeNull();
  });

  it("다른 키·변조·alg 변경은 null", () => {
    const token = signAccessToken(user, secret, 60);
    expect(verifyAccessToken(token, "another-secret-0123456789abcdefghij")).toBeNull();
    const [h, p, s] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "1", email: "a", iat: 0, exp: 9e9 })).toString("base64url");
    expect(verifyAccessToken(`${h}.${forgedPayload}.${s}`, secret)).toBeNull();
    const noneHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    expect(verifyAccessToken(`${noneHeader}.${p}.`, secret)).toBeNull();
    expect(verifyAccessToken("garbage", secret)).toBeNull();
  });
});
