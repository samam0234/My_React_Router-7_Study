import { jsonResponse } from "~/lib/http.server";

// default export가 없으면 이 파일은 "리소스 라우트"다. HTML이 아니라 Response를 직접 돌려준다.
export function loader() {
  return jsonResponse({ status: "ok" });
}
