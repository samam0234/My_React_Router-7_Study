import { redirect, type MiddlewareFunction, type RouterContextProvider } from "react-router";
import { getConfig } from "~/config.server";
import { authSourceContext, requestIdContext, userContext } from "~/context";
import type { PublicUser } from "~/db/types";
import { forbidden, unauthorized } from "~/lib/errors";
import { errorResponse, isTrustedOrigin } from "~/lib/http.server";
import { verifyAccessToken } from "~/lib/token.server";
import { getSession } from "~/session.server";
import { findUser } from "~/services/auth.server";

/**
 * 모든 요청에서 "누구인가"를 한 번만 결정해 context에 넣는다.
 * Authorization: Bearer 토큰이 있으면 그것을, 없으면 세션 쿠키를 본다.
 */
export const authMiddleware: MiddlewareFunction<Response> = async ({ request, url, context }) => {
  // 다른 사이트의 폼이 쿠키를 달고 보내는 변경 요청(CSRF)을 출처로 한 번 더 막는다.
  if (!isTrustedOrigin(request, url)) {
    return errorResponse(forbidden("허용되지 않은 출처의 요청입니다."), context.get(requestIdContext));
  }

  let user: PublicUser | null = null;
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const payload = verifyAccessToken(authorization.slice(7), getConfig().JWT_SECRET);
    user = payload ? await findUser(Number(payload.sub)) : null;
    context.set(authSourceContext, user ? "bearer" : "none");
  } else {
    const session = await getSession(request.headers.get("Cookie"));
    const userId = session.get("userId");
    user = userId ? await findUser(userId) : null;
    context.set(authSourceContext, user ? "cookie" : "none");
  }
  context.set(userContext, user);
};

/** 보호된 화면 라우트용. 로그인하지 않았으면 /login으로 보내고, 돌아올 주소를 남긴다. */
export const requireUserMiddleware: MiddlewareFunction<Response> = ({ url, context }) => {
  if (!context.get(userContext)) {
    throw redirect(`/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
  }
};

/** 화면용 action·loader 안에서 사용자를 꺼낸다. 없으면 /login으로 보낸다. */
export function requireUser(context: Readonly<RouterContextProvider>, url: URL): PublicUser {
  const user = context.get(userContext);
  if (!user) throw redirect(`/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
  return user;
}

/** API용. 없으면 401 JSON 오류가 된다. */
export function requireApiUser(context: Readonly<RouterContextProvider>): PublicUser {
  const user = context.get(userContext);
  if (!user) throw unauthorized();
  return user;
}
