import { createCookie, createCookieSessionStorage, redirect } from "react-router";
import { getConfig } from "~/config.server";

type SessionData = { userId: number };
type SessionFlash = { message: string };

const globalForSession = globalThis as unknown as {
  __rr7Session?: ReturnType<typeof createStorage>;
};

function createStorage() {
  const config = getConfig();
  return createCookieSessionStorage<SessionData, SessionFlash>({
    cookie: {
      name: "__rr7_board",
      httpOnly: true, // 브라우저 JS가 읽지 못한다 → XSS로 세션을 훔치기 어렵다.
      sameSite: "lax", // 다른 사이트에서 온 POST에는 쿠키를 붙이지 않는다 → CSRF 1차 방어.
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      secrets: [config.SESSION_SECRET], // 값을 서명한다. 배열 앞쪽이 새 키(키 교체 지원).
      secure: config.cookieSecure,
    },
  });
}

const storage = () => (globalForSession.__rr7Session ??= createStorage());

/** OAuth state를 10분만 들고 있는 서명된 쿠키. 콜백에서 돌아온 state와 같은지 비교한다(CSRF 방어). */
export const oauthStateCookie = () =>
  createCookie("__rr7_oauth_state", {
    httpOnly: true,
    sameSite: "lax", // GitHub에서 돌아오는 최상위 GET 이동에는 lax 쿠키가 붙는다
    path: "/",
    maxAge: 600,
    secrets: [getConfig().SESSION_SECRET],
    secure: getConfig().cookieSecure,
  });

export const getSession = (cookieHeader: string | null) => storage().getSession(cookieHeader);
export const commitSession = (session: Awaited<ReturnType<typeof getSession>>) =>
  storage().commitSession(session);
export const destroySession = (session: Awaited<ReturnType<typeof getSession>>) =>
  storage().destroySession(session);

/** 열린 리다이렉트를 막는다. "/"로 시작하는 같은 사이트 경로만 허용한다. */
export function safeRedirect(to: unknown, fallback = "/"): string {
  if (typeof to !== "string" || !to.startsWith("/") || to.startsWith("//") || to.includes("\\")) {
    return fallback;
  }
  return to;
}

export async function createUserSession(
  request: Request,
  userId: number,
  redirectTo: string,
  message?: string,
) {
  const session = await getSession(request.headers.get("Cookie"));
  session.set("userId", userId);
  if (message) session.flash("message", message);
  return redirect(redirectTo, { headers: { "Set-Cookie": await commitSession(session) } });
}

export async function redirectWithFlash(request: Request, to: string, message: string) {
  const session = await getSession(request.headers.get("Cookie"));
  session.flash("message", message);
  return redirect(to, { headers: { "Set-Cookie": await commitSession(session) } });
}

export async function destroyUserSession(request: Request, to = "/") {
  const session = await getSession(request.headers.get("Cookie"));
  return redirect(to, { headers: { "Set-Cookie": await destroySession(session) } });
}
