import { redirect } from "react-router";
import { buildAuthorizeUrl, githubEnabled, newState } from "~/services/oauth.server";
import { oauthStateCookie, redirectWithFlash } from "~/session.server";
import type { Route } from "./+types/auth-github";

// GET /auth/github — 1단계. state를 만들어 쿠키에 넣고 GitHub 승인 화면으로 보낸다.
export async function loader({ request }: Route.LoaderArgs) {
  if (!githubEnabled()) return redirectWithFlash(request, "/login", "GitHub 로그인이 설정되지 않았습니다.");
  const state = newState();
  return redirect(buildAuthorizeUrl(state), {
    headers: { "Set-Cookie": await oauthStateCookie().serialize(state) },
  });
}
