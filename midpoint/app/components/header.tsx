import { Form, Link, NavLink } from "react-router";
import type { PublicUser } from "~/db/types";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-2 py-1 rounded ${isActive ? "bg-blue-600 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`;

export function Header({ user }: { user: PublicUser | null }) {
  return (
    <header className="border-b border-gray-200 dark:border-gray-800">
      <nav className="mx-auto flex max-w-3xl items-center gap-2 p-3 text-sm">
        <Link to="/" className="mr-2 font-bold">
          RR7 게시판
        </Link>
        <NavLink to="/posts" end className={linkClass}>
          글 목록
        </NavLink>
        {user ? <NavLink to="/posts/new" className={linkClass}>글쓰기</NavLink> : null}
        <span className="flex-1" />
        {user ? (
          <>
            <span className="text-gray-600 dark:text-gray-400">{user.nickname}님</span>
            {/* 로그아웃은 상태를 바꾸므로 링크(GET)가 아니라 POST 폼으로 보낸다. */}
            <Form method="post" action="/logout">
              <button type="submit" className="rounded border px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800">
                로그아웃
              </button>
            </Form>
          </>
        ) : (
          <>
            <NavLink to="/login" className={linkClass}>로그인</NavLink>
            <NavLink to="/signup" className={linkClass}>회원가입</NavLink>
          </>
        )}
      </nav>
    </header>
  );
}
