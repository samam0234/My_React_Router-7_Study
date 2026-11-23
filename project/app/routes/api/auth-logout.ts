import { api } from "~/lib/api.server";
import { requireApiUser } from "~/middleware/auth.server";
import { destroySession, getSession } from "~/session.server";
import type { Route } from "./+types/auth-logout";

// POST /api/auth/logout → 204. 쿠키 방식이면 쿠키를 지운다. Bearer 토큰은 서버에 저장하지 않으므로 클라이언트가 버린다.
export const action = api(async ({ request, context }: Route.ActionArgs) => {
  requireApiUser(context);
  const session = await getSession(request.headers.get("Cookie"));
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": await destroySession(session) },
  });
});
