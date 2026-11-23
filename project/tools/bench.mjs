// 최적화는 "느낌"이 아니라 "측정"으로 한다. 목록 API를 캐시 미스 / 캐시 적중 / 304로 나눠 지연 시간을 잰다.
// 사용: npm run build && npm run bench   (글 5000개를 직접 넣고 측정한다)
import { DatabaseSync } from "node:sqlite";
import { client, startApp, stopApp } from "./lib/harness.mjs";

const app = await startApp();
const { call, signup } = client(app.base);
try {
  await signup("bench@example.com", "bench");
  // 글 5000개를 DB에 직접 넣는다(API로 5000번 호출하면 준비가 더 오래 걸린다).
  const db = new DatabaseSync(`${app.dir}/test.db`);
  db.exec("BEGIN");
  const insert = db.prepare("INSERT INTO posts (author_id, title, body, tags, created_at, updated_at) VALUES (1, ?, ?, '[]', ?, ?)");
  for (let i = 0; i < 5000; i++) {
    const at = new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString();
    insert.run(`벤치 글 ${i}`, `본문 ${i} `.repeat(30), at, at);
  }
  db.exec("COMMIT");
  db.close();

  const pct = (xs, p) => xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))];
  const stats = (xs) => `p50 ${pct(xs, 0.5).toFixed(2)}ms · p95 ${pct(xs, 0.95).toFixed(2)}ms · 평균 ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2)}ms`;
  const timed = async (path, headers) => {
    const t0 = performance.now();
    const res = await fetch(`${app.base}${path}`, { headers });
    const body = await res.arrayBuffer();
    return { ms: performance.now() - t0, status: res.status, bytes: body.byteLength, etag: res.headers.get("etag"), serverMs: Number(/dur=([\d.]+)/.exec(res.headers.get("server-timing") ?? "")?.[1]) };
  };

  const PAGES = 80; // limit=50 이면 5000건 = 100쪽. 앞 80쪽을 쓴다.
  const miss = [], hit = [], missServer = [], hitServer = [];
  for (let page = 1; page <= PAGES; page++) { const r = await timed(`/api/posts?limit=50&page=${page}`); miss.push(r.ms); missServer.push(r.serverMs); }
  for (let page = 1; page <= PAGES; page++) { const r = await timed(`/api/posts?limit=50&page=${page}`); hit.push(r.ms); hitServer.push(r.serverMs); }

  const first = await timed("/api/posts?limit=50&page=1");
  const revalidate = [];
  let bytes304 = 0;
  for (let i = 0; i < PAGES; i++) { const r = await timed("/api/posts?limit=50&page=1", { "If-None-Match": first.etag }); revalidate.push(r.ms); bytes304 = r.bytes; }

  console.log(`글 5000개, limit=50 (응답 ${first.bytes.toLocaleString()}바이트)\n`);
  console.log(`캐시 미스 (처음 조회)   클라이언트 ${stats(miss)}`);
  console.log(`                        서버 안   ${stats(missServer)}`);
  console.log(`캐시 적중 (10초 이내)   클라이언트 ${stats(hit)}`);
  console.log(`                        서버 안   ${stats(hitServer)}`);
  console.log(`304 (ETag 일치)         클라이언트 ${stats(revalidate)}  · 본문 ${bytes304}바이트(200이면 ${first.bytes.toLocaleString()}바이트)`);
  console.log("\n읽는 법: '서버 안'은 Server-Timing 헤더, '클라이언트'는 왕복 전체다. 304는 서버 계산을 줄이지 않고 전송량을 줄인다.");

  const search = [];
  for (let i = 0; i < 30; i++) search.push((await timed(`/api/posts?q=${encodeURIComponent("본문 " + (1000 + i))}`)).ms);
  console.log(`\n검색(LIKE '%…%', 인덱스 사용 불가) ${stats(search)} → 글이 훨씬 많아지면 전문 검색(FTS, pg_trgm)이 필요하다.`);
} finally {
  await stopApp(app);
}
