import { jsonResponse } from "~/lib/http.server";
import { openapi } from "~/openapi";

// GET /api/openapi.json — 기계가 읽는 API 설명서. 클라이언트 코드 생성·검증 도구가 이것을 쓴다.
export function loader() {
  return jsonResponse(openapi, { headers: { "Cache-Control": "public, max-age=300" } });
}
