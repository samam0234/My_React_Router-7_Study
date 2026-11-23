import { redirect } from "react-router";
import { destroyUserSession } from "~/session.server";
import type { Route } from "./+types/logout";

// POST /logout → 세션을 지우고 홈으로. UI 컴포넌트가 없으므로 이 라우트는 주소 이동 없이 action만 가진다.
export async function action({ request }: Route.ActionArgs) {
  return destroyUserSession(request, "/");
}

// 주소창에 /logout을 직접 입력한 GET은 아무것도 바꾸지 않고 홈으로 보낸다.
export function loader() {
  return redirect("/");
}
