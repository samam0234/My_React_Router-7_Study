import { AppError } from "~/lib/errors";
import { findOrCreateOAuthUser } from "~/services/auth.server";
import { fetchGithubProfile } from "~/services/oauth.server";
import { createUserSession, oauthStateCookie, redirectWithFlash } from "~/session.server";
import type { Route } from "./+types/auth-github-callback";

// GET /auth/github/callback — 2단계. state를 확인하고, code를 프로필로 바꾸고, 우리 세션을 만든다.
export async function loader({ request, url }: Route.LoaderArgs) {
  const cookie = oauthStateCookie();
  const expected = await cookie.parse(request.headers.get("Cookie"));
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  // state가 쿠키와 다르면 남이 만든 로그인 요청일 수 있다(로그인 CSRF).
  if (!code || !state || !expected || state !== expected) {
    return redirectWithFlash(request, "/login", "로그인 요청이 만료되었거나 올바르지 않습니다.");
  }
  try {
    const profile = await fetchGithubProfile(code);
    const user = await findOrCreateOAuthUser(profile);
    const response = await createUserSession(request, user.id, "/posts", `${user.nickname}님 환영합니다.`);
    response.headers.append("Set-Cookie", await cookie.serialize("", { maxAge: 0 })); // 일회용 state 폐기
    return response;
  } catch (error) {
    if (error instanceof AppError) return redirectWithFlash(request, "/login", error.message);
    throw error;
  }
}
