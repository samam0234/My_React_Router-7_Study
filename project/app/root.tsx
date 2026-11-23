import {
  data,
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";
import type { Route } from "./+types/root";
import "./app.css";
import { Header } from "./components/header";
import { NotificationsListener, Toasts } from "./components/notifications";
import { THEME_INIT_SCRIPT } from "./stores/ui";
import { userContext } from "./context";
import { authMiddleware } from "./middleware/auth.server";
import { requestMiddleware } from "./middleware/request.server";
import { commitSession, getSession } from "./session.server";

// 배열 순서대로 실행된다: 요청 번호·CORS·로그 → 사용자 확인 → (각 라우트) → 응답이 거꾸로 돌아온다.
export const middleware: Route.MiddlewareFunction[] = [requestMiddleware, authMiddleware];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = context.get(userContext);
  // flash 메시지는 한 번 읽으면 사라진다. 읽었다면 쿠키를 다시 써서 지운 상태를 저장해야 한다.
  const session = await getSession(request.headers.get("Cookie"));
  const flash = session.get("message") ?? null;
  return data(
    { user, flash },
    flash ? { headers: { "Set-Cookie": await commitSession(session) } } : undefined,
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  // 오류 화면에서도 이 Layout이 감싸므로 loader 데이터가 없을 수 있다.
  const root = useRouteLoaderData<typeof loader>("root");
  return (
    // suppressHydrationWarning: 아래 스크립트가 브라우저에서 class="dark"를 붙이므로 서버 HTML과 달라도 정상이다.
    <html lang="ko" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <Meta />
        <Links />
      </head>
      <body>
        <Header user={root?.user ?? null} />
        <NotificationsListener enabled={Boolean(root?.user)} />
        <Toasts />
        {root?.flash ? (
          <p role="status" className="mx-auto mt-3 max-w-3xl rounded bg-green-50 p-2 text-sm text-green-800">
            {root.flash}
          </p>
        ) : null}
        <main className="mx-auto max-w-3xl p-4">{children}</main>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "문제가 생겼습니다";
  let detail = "잠시 후 다시 시도해 주세요.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "페이지를 찾을 수 없습니다" : `오류 ${error.status}`;
    detail = typeof error.data === "string" && error.data ? error.data : error.statusText || detail;
  } else if (import.meta.env.DEV && error instanceof Error) {
    // 스택은 개발 중에만 보여 준다. 운영 화면에는 내부 정보를 내보내지 않는다.
    detail = error.message;
    stack = error.stack;
  }

  return (
    <section>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">{detail}</p>
      {stack ? <pre className="mt-4 overflow-x-auto rounded bg-gray-100 p-3 text-xs dark:bg-gray-900"><code>{stack}</code></pre> : null}
      <p className="mt-4"><Link to="/" className="text-blue-600 underline">홈으로</Link></p>
    </section>
  );
}
