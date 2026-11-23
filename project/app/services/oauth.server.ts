import { randomBytes } from "node:crypto";
import { getConfig } from "~/config.server";
import { AppError } from "~/lib/errors";

export const githubEnabled = () => Boolean(getConfig().GITHUB_CLIENT_ID && getConfig().GITHUB_CLIENT_SECRET);

export const newState = () => randomBytes(16).toString("hex");

const callbackUrl = () => `${getConfig().APP_ORIGIN}/auth/github/callback`;

/** 1단계: 사용자를 GitHub 승인 화면으로 보낼 주소. state는 우리가 만든 일회용 값이다. */
export function buildAuthorizeUrl(state: string): string {
  const config = getConfig();
  const url = new URL(config.GITHUB_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", callbackUrl());
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);
  return url.toString();
}

async function githubJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new AppError(502, "OAUTH_PROVIDER_ERROR", `GitHub 응답 오류(${response.status})`);
  return (await response.json()) as T;
}

/** 2단계: 돌아온 code를 액세스 토큰으로 바꾸고, 검증된 대표 이메일과 로그인 이름을 읽는다. */
export async function fetchGithubProfile(code: string): Promise<{ email: string; nickname: string }> {
  const config = getConfig();
  const token = await githubJson<{ access_token?: string; error?: string }>(config.GITHUB_TOKEN_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.GITHUB_CLIENT_ID,
      client_secret: config.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl(),
    }),
  });
  if (!token.access_token) throw new AppError(401, "OAUTH_DENIED", "GitHub 인증에 실패했습니다.");

  const headers = { Authorization: `Bearer ${token.access_token}`, Accept: "application/json", "User-Agent": "rr7-board" };
  const [user, emails] = await Promise.all([
    githubJson<{ login: string }>(`${config.GITHUB_API_URL}/user`, { headers }),
    githubJson<{ email: string; primary: boolean; verified: boolean }[]>(`${config.GITHUB_API_URL}/user/emails`, { headers }),
  ]);
  // 확인되지 않은 이메일로 기존 계정에 연결하면 계정 탈취 통로가 된다 → verified만 쓴다.
  const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
  if (!primary) throw new AppError(401, "OAUTH_NO_VERIFIED_EMAIL", "GitHub에 인증된 이메일이 없습니다.");
  return { email: primary.email, nickname: user.login };
}
