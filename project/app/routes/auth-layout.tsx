import { Outlet } from "react-router";

// 경로 없는 레이아웃. 로그인과 가입 화면을 같은 카드 안에 넣는다.
export default function AuthLayout() {
  return (
    <div className="mx-auto mt-8 max-w-sm rounded-lg border p-6 shadow-sm">
      <Outlet />
    </div>
  );
}
