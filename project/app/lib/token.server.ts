import { createHmac, timingSafeEqual } from "node:crypto";

export type TokenPayload = { sub: string; email: string; nickname: string; iat: number; exp: number };

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const sign = (data: string, secret: string) =>
  createHmac("sha256", secret).update(data).digest("base64url");

/** HS256 JWT를 만든다. 만료 시각(exp)은 초 단위다. */
export function signAccessToken(
  user: { id: number; email: string; nickname: string },
  secret: string,
  ttlSeconds: number,
  nowMs = Date.now(),
): string {
  const iat = Math.floor(nowMs / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    sub: String(user.id),
    email: user.email,
    nickname: user.nickname,
    iat,
    exp: iat + ttlSeconds,
  });
  return `${header}.${payload}.${sign(`${header}.${payload}`, secret)}`;
}

/** 서명·알고리즘·만료를 모두 확인한다. 하나라도 틀리면 null. */
export function verifyAccessToken(
  token: string,
  secret: string,
  nowMs = Date.now(),
): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = Buffer.from(sign(`${header}.${payload}`, secret));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const head = JSON.parse(Buffer.from(header, "base64url").toString());
    if (head.alg !== "HS256") return null; // alg를 토큰이 정하게 두지 않는다.
    const body = JSON.parse(Buffer.from(payload, "base64url").toString()) as TokenPayload;
    if (typeof body.exp !== "number" || body.exp * 1000 <= nowMs) return null;
    return body;
  } catch {
    return null;
  }
}
