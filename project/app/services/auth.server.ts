import { getRepo } from "~/db/index.server";
import type { PublicUser, Repo, UserRecord } from "~/db/types";
import { emailTaken, invalidCredentials } from "~/lib/errors";
import { enqueue } from "~/lib/jobs.server";
import { hashPassword, verifyPassword } from "~/lib/password.server";
import { loginSchema, signupSchema } from "~/lib/schemas";
import { parseOrThrow } from "~/lib/validate";
import { sendMail, welcomeMail } from "./mail.server";

export const toPublicUser = (user: UserRecord): PublicUser => ({
  id: user.id,
  email: user.email,
  nickname: user.nickname,
});

// 없는 이메일도 같은 시간 동안 해시 비교를 하게 해서, 응답 시간으로 가입 여부를 알아내지 못하게 한다.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("not-a-real-password"));

export async function signup(input: unknown, repo: Repo = getRepo()): Promise<PublicUser> {
  const data = parseOrThrow(signupSchema, input);
  if (await repo.users.findByEmail(data.email)) throw emailTaken();
  const user = toPublicUser(
    await repo.users.create({
      email: data.email,
      nickname: data.nickname,
      passwordHash: await hashPassword(data.password),
    }),
  );
  // 가입 응답을 메일 서버 속도에 묶어 두지 않는다. 실패하면 작업 큐가 다시 시도한다.
  enqueue("welcome-mail", () => sendMail(welcomeMail(user)));
  return user;
}

export async function login(input: unknown, repo: Repo = getRepo()): Promise<PublicUser> {
  const data = parseOrThrow(loginSchema, input);
  const user = await repo.users.findByEmail(data.email);
  const ok = await verifyPassword(data.password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok) throw invalidCredentials();
  return toPublicUser(user);
}

export async function findUser(id: number, repo: Repo = getRepo()): Promise<PublicUser | null> {
  const user = await repo.users.findById(id);
  return user ? toPublicUser(user) : null;
}

/** 소셜 로그인: 검증된 이메일로 기존 계정을 찾고, 없으면 비밀번호 없는 계정을 만든다. */
export async function findOrCreateOAuthUser(
  profile: { email: string; nickname: string },
  repo: Repo = getRepo(),
): Promise<PublicUser> {
  const existing = await repo.users.findByEmail(profile.email.toLowerCase());
  if (existing) return toPublicUser(existing);
  const nickname = profile.nickname.replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 20).padEnd(2, "_");
  const created = await repo.users.create({
    email: profile.email.toLowerCase(),
    nickname,
    // verifyPassword는 "scrypt$..." 형식만 통과시키므로 이 값으로는 비밀번호 로그인이 불가능하다.
    passwordHash: "oauth:github",
  });
  return toPublicUser(created);
}
