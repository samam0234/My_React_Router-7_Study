// Prometheus 텍스트 형식의 아주 작은 측정기. 요청 수와 응답 시간 분포를 센다.
const BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500];

type Series = { count: number; sumMs: number; buckets: number[] };

const globalForMetrics = globalThis as unknown as { __rr7Metrics?: Map<string, Series>; __rr7Started?: number };
const series = (globalForMetrics.__rr7Metrics ??= new Map<string, Series>());
const startedAt = (globalForMetrics.__rr7Started ??= Date.now());

export function observeRequest(method: string, status: number, ms: number) {
  const key = `${method}|${Math.floor(status / 100)}xx`;
  let s = series.get(key);
  if (!s) series.set(key, (s = { count: 0, sumMs: 0, buckets: BUCKETS_MS.map(() => 0) }));
  s.count += 1;
  s.sumMs += ms;
  BUCKETS_MS.forEach((limit, i) => {
    if (ms <= limit) s!.buckets[i] += 1;
  });
}

export function renderMetrics(): string {
  const lines = [
    "# HELP http_requests_total 처리한 HTTP 요청 수",
    "# TYPE http_requests_total counter",
  ];
  for (const [key, s] of series) {
    const [method, cls] = key.split("|");
    lines.push(`http_requests_total{method="${method}",status="${cls}"} ${s.count}`);
  }
  lines.push("# HELP http_request_duration_ms 응답 시간(ms) 분포", "# TYPE http_request_duration_ms histogram");
  for (const [key, s] of series) {
    const [method, cls] = key.split("|");
    const labels = `method="${method}",status="${cls}"`;
    BUCKETS_MS.forEach((limit, i) => lines.push(`http_request_duration_ms_bucket{${labels},le="${limit}"} ${s.buckets[i]}`));
    lines.push(`http_request_duration_ms_bucket{${labels},le="+Inf"} ${s.count}`);
    lines.push(`http_request_duration_ms_sum{${labels}} ${s.sumMs.toFixed(1)}`);
    lines.push(`http_request_duration_ms_count{${labels}} ${s.count}`);
  }
  lines.push(
    "# TYPE process_uptime_seconds gauge",
    `process_uptime_seconds ${Math.round((Date.now() - startedAt) / 1000)}`,
    "# TYPE process_resident_memory_bytes gauge",
    `process_resident_memory_bytes ${process.memoryUsage.rss()}`,
  );
  return lines.join("\n") + "\n";
}
