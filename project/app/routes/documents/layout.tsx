import { isRouteErrorResponse, Link, Outlet } from "react-router";
import { requireUserMiddleware } from "~/middleware/auth.server";
import type { Route } from "./+types/layout";

// 이 아래 모든 화면은 로그인이 필요하다. 레이아웃의 middleware 한 줄이 자식 라우트 전체를 보호한다.
export const middleware: Route.MiddlewareFunction[] = [requireUserMiddleware];

export default function DocumentsLayout() {
  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold">문서 AI</h1>
      <Outlet />
    </section>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const message = isRouteErrorResponse(error) && typeof error.data === "string" ? error.data : "문서를 불러오지 못했습니다.";
  return (
    <section>
      <h1 className="mb-2 text-2xl font-bold">문서 AI</h1>
      <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-red-800">{message}</p>
      <p className="mt-4"><Link to="/documents" className="text-blue-600 underline">문서 목록으로</Link></p>
    </section>
  );
}
