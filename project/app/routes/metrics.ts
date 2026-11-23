import { timingSafeEqual } from "node:crypto";
import { getConfig } from "~/config.server";
import { jobStats } from "~/lib/jobs.server";
import { renderMetrics } from "~/lib/metrics.server";
import { subscriberCount } from "~/realtime/hub.server";
import type { Route } from "./+types/metrics";

// Prometheus가 주기적으로 긁어 가는 주소. 내부 수치가 드러나므로 토큰이 설정된 때만 열고, 토큰이 없으면 아예 없는 척한다.
export function loader({ request }: Route.LoaderArgs) {
  const token = getConfig().METRICS_TOKEN;
  if (!token) return new Response("Not Found", { status: 404 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  }
  const extra = [
    "# TYPE jobs_total counter",
    ...Object.entries(jobStats).map(([state, n]) => `jobs_total{state="${state}"} ${n}`),
    "# TYPE realtime_subscribers gauge",
    `realtime_subscribers ${subscriberCount()}`,
  ].join("\n");
  return new Response(`${renderMetrics()}${extra}\n`, { headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" } });
}
