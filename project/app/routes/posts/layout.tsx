import { isRouteErrorResponse, Link, Outlet } from "react-router";
import type { Route } from "./+types/layout";

// /posts 아래 모든 화면의 공통 틀. 자식에서 던진 오류는 root까지 올라가기 전에 아래 ErrorBoundary가 받는다.
export default function PostsLayout() {
  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold">게시판</h1>
      <Outlet />
    </section>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const known = isRouteErrorResponse(error);
  const status = known ? error.status : 500;
  const message =
    known && typeof error.data === "string" && error.data
      ? error.data
      : status === 404
        ? "글을 찾을 수 없습니다."
        : "게시판을 불러오지 못했습니다.";
  return (
    <section>
      <h1 className="mb-2 text-2xl font-bold">게시판</h1>
      <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-red-800">
        {status} · {message}
      </p>
      <p className="mt-4"><Link to="/posts" className="text-blue-600 underline">글 목록으로</Link></p>
    </section>
  );
}
