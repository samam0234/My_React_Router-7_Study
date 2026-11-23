import { getConfig } from "~/config.server";
import { api } from "~/lib/api.server";
import { ok } from "~/lib/http.server";
import { signAccessToken } from "~/lib/token.server";
import { requireApiUser } from "~/middleware/auth.server";
import type { Route } from "./+types/auth-ws-ticket";

// POST /api/auth/ws-ticket → 60초짜리 토큰. WebSocket 연결 주소의 ?ticket= 으로 쓴다.
// 브라우저의 WebSocket은 요청 헤더(Authorization)를 붙일 수 없어서, 짧은 수명의 티켓을 주소에 실어 보낸다.
export const action = api(async ({ context }: Route.ActionArgs) => {
  const user = requireApiUser(context);
  return ok({ ticket: signAccessToken(user, getConfig().JWT_SECRET, 60) }, { status: 201 });
});
