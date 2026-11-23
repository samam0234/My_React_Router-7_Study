import { getRepo } from "~/db/index.server";
import type { PublicUser, Repo, UserRecord } from "~/db/types";
import { emailTaken, invalidCredentials } from "~/lib/errors";
import { hashPassword, verifyPassword } from "~/lib/password.server";
import { loginSchema, signupSchema } from "~/lib/schemas";
import { parseOrThrow } from "~/lib/validate";

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
  const user = await repo.users.create({
    email: data.email,
    nickname: data.nickname,
    passwordHash: await hashPassword(data.password),
  });
  return toPublicUser(user);
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
