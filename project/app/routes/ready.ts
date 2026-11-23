import { jsonResponse } from "~/lib/http.server";
import { getRepo } from "~/db/index.server";

// /health: "프로세스가 떠 있다"(liveness). /ready: "손님을 받을 준비가 됐다"(readiness) → DB까지 확인한다.
// 로드밸런서·쿠버네티스는 ready가 503이면 이 인스턴스로 트래픽을 보내지 않는다.
export async function loader() {
  const repo = getRepo();
  try {
    await repo.ping();
    return jsonResponse({ status: "ready", db: repo.driver });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: "readiness failed", error: String(error) }));
    return jsonResponse({ status: "unavailable", db: repo.driver }, { status: 503 });
  }
}
