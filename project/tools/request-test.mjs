// 빌드된 server.ts를 실제로 띄우고, 외부 서비스는 로컬 모의 서버로 대신해서 HTTP로 검증한다.
// 사용: npm run build && npm run test:requests
import { createHmac } from "node:crypto";
import WebSocket from "ws";
import { check, client, mockServer, sleep, startApp, stopApp, summary, waitFor } from "./lib/harness.mjs";

// ── 모의 외부 서비스 ─────────────────────────────────────────────
let resendFailsLeft = 1; // 첫 요청은 일부러 500 → 작업 큐의 재시도를 확인한다
const resend = await mockServer((req, res) => {
  if (resendFailsLeft-- > 0) return res.writeHead(500).end("boom");
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ id: "mail_1" }));
});
const stripe = await mockServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ id: "cs_test_1", url: "https://checkout.stripe.test/c/pay/cs_test_1" }));
});
const github = await mockServer((req, res, call) => {
  const send = (status, body) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
  if (req.url === "/login/oauth/access_token") return send(200, JSON.parse(call.body).code === "good" ? { access_token: "gho_test" } : { error: "bad_verification_code" });
  if (req.url === "/user") return send(200, { login: "octocat" });
  if (req.url === "/user/emails") return send(200, [{ email: "octocat@example.com", primary: true, verified: true }]);
  return send(404, {});
});
// Ollama를 흉내 낸다: 요약 프롬프트면 요약 문장을, 질문 프롬프트면 인용이 있는 답을 NDJSON으로 조금씩 흘린다.
const ollama = await mockServer(async (req, res, call) => {
  const { messages } = JSON.parse(call.body);
  const isSummary = messages[0].content.includes("요약가");
  const long = messages.at(-1).content.includes("긴답변"); // 중단 시험용: 길게 흘린다
  const words = long
    ? Array.from({ length: 40 }, (_, i) => `토큰${i} `)
    : isSummary
    ? ["이 문서는 ", "React Router 7의 ", "loader와 action을 ", "설명합니다."]
    : ["loader는 ", "서버에서 ", "데이터를 읽습니다 ", "(발췌 1)."];
  res.writeHead(200, { "Content-Type": "application/x-ndjson" });
  for (const word of words) {
    if (res.destroyed) return;
    res.write(JSON.stringify({ message: { role: "assistant", content: word }, done: false }) + "\n");
    await sleep(60);
  }
  res.end(JSON.stringify({ message: { role: "assistant", content: "" }, done: true }) + "\n");
});

const WEBHOOK_SECRET = "whsec_test";
const app = await startApp({
  CORS_ORIGIN: "http://localhost:5173",
  METRICS_TOKEN: "metrics-test-token",
  MAIL_DRIVER: "resend",
  RESEND_API_KEY: "re_test_key",
  RESEND_BASE_URL: resend.url,
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_PRICE_ID: "price_test",
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  STRIPE_BASE_URL: stripe.url,
  GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret",
  GITHUB_AUTHORIZE_URL: `${github.url}/login/oauth/authorize`,
  GITHUB_TOKEN_URL: `${github.url}/login/oauth/access_token`,
  GITHUB_API_URL: github.url,
  OLLAMA_BASE_URL: ollama.url,
  MAX_UPLOAD_BYTES: "50000",
});
const { call, form, page, signup } = client(app.base);

try {
  // 1. 운영 엔드포인트와 공통 헤더
  const home = await page("/");
  check("SSR 홈 200", home.status === 200 && home.text.includes("React Router 7 게시판"));
  check("보안 헤더(nosniff, DENY, Referrer-Policy)", home.headers.get("x-content-type-options") === "nosniff" && home.headers.get("x-frame-options") === "DENY" && home.headers.get("referrer-policy"));
  check("HTTP에서는 HSTS 없음", !home.headers.get("strict-transport-security"));
  check("Server-Timing 헤더", /^total;dur=\d/.test(home.headers.get("server-timing") ?? ""));
  const ready = await call("GET", "/ready");
  check("/ready → DB 확인 후 200", ready.status === 200 && ready.body?.db === (process.env.TEST_DB_DRIVER ?? "sqlite"));
  check("/metrics 토큰 없으면 401", (await call("GET", "/metrics")).status === 401);
  const metrics = await call("GET", "/metrics", { headers: { Authorization: "Bearer metrics-test-token" } });
  check("/metrics 토큰 있으면 Prometheus 텍스트", metrics.status === 200 && metrics.text.includes("http_requests_total") && metrics.text.includes("process_uptime_seconds"));
  check("화면 주소의 id가 숫자가 아니면 500이 아니라 404", (await page("/posts/abc")).status === 404 && (await page("/posts/99999")).status === 404);
  const docs = await page("/api-docs");
  check("/api-docs Swagger UI 페이지", docs.status === 200 && docs.text.includes("openapi.json"));
  const spec = await call("GET", "/api/openapi.json");
  check("/api/openapi.json 3.1 문서", spec.status === 200 && spec.body?.openapi === "3.1.0" && Object.keys(spec.body.paths).length >= 18);
  check("JSON 응답은 Content-Type: application/json; charset=utf-8 (스펙 v1 7절)", ready.headers.get("content-type") === "application/json; charset=utf-8" && spec.headers.get("content-type") === "application/json; charset=utf-8");

  // 2. 가입 → 환영 메일(재시도) → 로그인
  const mina = await signup("mina@example.com", "mina");
  check("가입·로그인 성공", Boolean(mina.token));
  const welcome = await waitFor(() => resend.calls.filter((c) => c.body.includes("가입을 환영합니다")).length >= 2, { timeout: 6000 });
  check("환영 메일: 첫 시도 500 → 큐가 재시도해 성공", welcome);
  const mailCall = resend.calls.at(-1);
  check("메일 API 호출 형식(Bearer 키, JSON)", mailCall.headers.authorization === "Bearer re_test_key" && JSON.parse(mailCall.body).to[0] === "mina@example.com");
  const joon = await signup("joon@example.com", "joon");

  // 3. 버전 별칭, ETag·Link, 보정
  const created = await call("POST", "/api/v1/posts", { token: mina.token, body: { title: "첫 글", body: "본문", tags: ["a"] } });
  check("/api/v1 별칭으로 글 작성 201", created.status === 201 && created.headers.get("location") === `/api/posts/${created.body.data.id}`);
  check("모든 /api 응답에 X-API-Version", created.headers.get("x-api-version") === "1");
  for (let i = 2; i <= 12; i++) await call("POST", "/api/posts", { token: mina.token, body: { title: `글 ${i}`, body: "내용" } });
  const list = await call("GET", "/api/posts");
  check("목록 meta + X-Total-Count + Link(next)", list.body?.meta?.total === 12 && list.headers.get("x-total-count") === "12" && /rel="next"/.test(list.headers.get("link") ?? ""));
  const etag = list.headers.get("etag");
  const cached = await call("GET", "/api/posts", { headers: { "If-None-Match": etag } });
  check("ETag가 같으면 304, 본문 없음", cached.status === 304 && cached.text === "");
  await call("POST", "/api/posts", { token: mina.token, body: { title: "새 글", body: "내용" } });
  const changed = await call("GET", "/api/posts", { headers: { "If-None-Match": etag } });
  check("글이 바뀌면(캐시 무효화) ETag가 달라져 200", changed.status === 200 && changed.headers.get("etag") !== etag);
  check("v1 목록도 같은 데이터", (await call("GET", "/api/v1/posts")).body?.meta?.total === 13);
  check("없는 /api/v1 경로 → JSON 404", (await call("GET", "/api/v1/nope")).body?.error?.code === "NOT_FOUND");

  // 4. 업로드
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);
  const upload = async (bytes, name, token = mina.token) => {
    const body = new FormData();
    body.set("file", new File([bytes], name));
    return fetch(`${app.base}/api/uploads`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body });
  };
  const okUp = await upload(png, "../../evil name.png");
  const okJson = await okUp.json();
  check("PNG 업로드 201, 서버가 만든 UUID 이름", okUp.status === 201 && /^[0-9a-f-]{36}\.png$/.test(okJson.data.name) && !okJson.data.name.includes("evil"));
  const served = await fetch(`${app.base}${okJson.data.url}`);
  check("업로드 파일 제공: Content-Type·nosniff·sandbox CSP", served.status === 200 && served.headers.get("content-type") === "image/png" && served.headers.get("x-content-type-options") === "nosniff" && /sandbox/.test(served.headers.get("content-security-policy") ?? ""));
  const fake = await upload(Buffer.from("<script>alert(1)</script>"), "evil.png");
  check("확장자만 png인 가짜 파일 → 400(매직 넘버 검사)", fake.status === 400 && (await fake.json()).error.code === "VALIDATION_ERROR");
  const big = await upload(Buffer.concat([png, Buffer.alloc(60_000)]), "big.png");
  check("한도 초과 → 413 PAYLOAD_TOO_LARGE", big.status === 413 && (await big.json()).error.code === "PAYLOAD_TOO_LARGE");
  check("로그인 없이 업로드 → 401", (await upload(png, "a.png", null)).status === 401);
  check("경로 조작(../) 파일 요청 → 404", (await fetch(`${app.base}/uploads/..%2f..%2fpackage.json`)).status === 404);

  // 5. CSV 내보내기
  await call("POST", "/api/posts", { token: mina.token, body: { title: "=cmd|' /C calc'!A0", body: "x" } });
  await call("POST", "/api/posts", { token: mina.token, body: { title: 'He said "hi", ok', body: "x" } });
  const csv = await call("GET", "/api/export/posts.csv");
  // Response.text()는 UTF-8 BOM을 자동으로 떼어 버리므로, BOM은 원시 바이트로 확인한다.
  const csvBytes = Buffer.from(await (await fetch(`${app.base}/api/export/posts.csv`)).arrayBuffer());
  check("CSV: BOM(EF BB BF)·헤더·attachment", csvBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) && csv.text.startsWith("id,title,author") && /attachment/.test(csv.headers.get("content-disposition") ?? ""));
  check("CSV 인젝션 방어(= 앞에 ' 추가)", csv.text.includes("'=cmd"));
  check("CSV 따옴표·쉼표 이스케이프", csv.text.includes('"He said ""hi"", ok"'));
  check("CSV 100건 단위 페이지를 넘어 전부 포함", csv.text.trim().split("\r\n").length === 1 + 15);

  // 6. 문의(폼 → 메일 큐)
  const contactBad = await call("POST", "/api/contact", { body: { name: "", email: "x", message: "짧음" } });
  check("문의 검증 실패 → 400 fields", contactBad.status === 400 && contactBad.body.error.fields.email && contactBad.body.error.fields.message);
  const before = resend.calls.length;
  const contactOk = await call("POST", "/api/contact", { body: { name: "방문자", email: "v@example.com", message: "안녕하세요 문의드립니다" } });
  check("문의 → 202 즉시 응답", contactOk.status === 202 && contactOk.body.data.received === true);
  check("문의 메일이 큐를 통해 발송됨", await waitFor(() => resend.calls.length > before && resend.calls.at(-1).body.includes("문의")));

  // 7. 결제(Stripe 모의)
  check("결제 세션 로그인 필요 → 401", (await call("POST", "/api/payments/checkout")).status === 401);
  const checkout = await call("POST", "/api/payments/checkout", { token: mina.token });
  const stripeCall = stripe.calls[0];
  check("결제 세션 201 + Stripe 결제 주소", checkout.status === 201 && checkout.body.data.url.startsWith("https://checkout.stripe.test/"));
  check("Stripe 호출: Bearer 비밀키·form 본문", stripeCall.headers.authorization === "Bearer sk_test_123" && stripeCall.body.includes("line_items%5B0%5D%5Bprice%5D=price_test") && stripeCall.body.includes("mode=payment"));
  const event = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { customer_email: "mina@example.com" } } });
  const sign = (body, ts) => `t=${ts},v1=${createHmac("sha256", WEBHOOK_SECRET).update(`${ts}.${body}`).digest("hex")}`;
  const now = Math.floor(Date.now() / 1000);
  const hook = (body, signature) => call("POST", "/api/payments/webhook", { raw: body, headers: { "Content-Type": "application/json", "Stripe-Signature": signature } });
  check("웹훅 올바른 서명 → 200", (await hook(event, sign(event, now))).status === 200);
  check("웹훅 서명 없음 → 400 BAD_SIGNATURE", (await call("POST", "/api/payments/webhook", { raw: event })).body?.error?.code === "BAD_SIGNATURE");
  check("웹훅 본문 변조 → 400", (await hook(event.replace("evt_1", "evt_2"), sign(event, now))).status === 400);
  check("웹훅 오래된 타임스탬프(재전송) → 400", (await hook(event, sign(event, now - 3600))).status === 400);

  // 8. GitHub OAuth(모의)
  const start = await page("/auth/github");
  const authorize = new URL(start.location);
  const stateCookie = start.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  check("OAuth 시작: GitHub로 302 + client_id·state·scope", start.status === 302 && authorize.searchParams.get("client_id") === "client-id" && authorize.searchParams.get("state") && authorize.searchParams.get("scope").includes("user:email"));
  check("state 쿠키는 HttpOnly", /HttpOnly/i.test(start.headers.getSetCookie().join(";")));
  const state = authorize.searchParams.get("state");
  const badState = await page(`/auth/github/callback?code=good&state=forged`, stateCookie);
  check("state가 다르면 로그인 거부 → /login", badState.status === 302 && badState.location === "/login");
  const noCookie = await page(`/auth/github/callback?code=good&state=${state}`);
  check("state 쿠키가 없어도 거부", noCookie.location === "/login");
  const badCode = await page(`/auth/github/callback?code=bad&state=${state}`, stateCookie);
  check("잘못된 code → /login", badCode.location === "/login");
  const good = await fetch(`${app.base}/auth/github/callback?code=good&state=${state}`, { headers: { Cookie: stateCookie }, redirect: "manual" });
  const goodCookies = good.headers.getSetCookie().map((c) => c.split(";")[0]);
  check("OAuth 성공 → /posts 302 + 세션 쿠키", good.status === 302 && good.headers.get("location") === "/posts" && goodCookies.some((c) => c.startsWith("__rr7_board=")));
  const sessionCookie = goodCookies.filter((c) => c.startsWith("__rr7_board=")).join("; ");
  check("OAuth 사용자 자동 생성·로그인 표시", (await page("/posts", sessionCookie)).text.includes("octocat"));
  check("OAuth 계정은 비밀번호 로그인 불가", (await call("POST", "/api/auth/login", { body: { email: "octocat@example.com", password: "oauth:github" } })).status === 401);

  // 9. 문서 AI (모의 Ollama)
  check("문서 API 로그인 필요 → 401", (await call("GET", "/api/documents")).status === 401);
  check("문서 화면 비로그인 → 302 /login", (await page("/documents")).status === 302);
  const docText = "React Router 7의 loader는 서버에서 데이터를 읽어 컴포넌트에 전달합니다.\n\naction은 폼 제출을 처리하고 데이터를 바꿉니다.\n\n쿠키 세션으로 로그인 상태를 유지합니다.";
  const docBad = await call("POST", "/api/documents", { token: mina.token, body: { title: "", content: "" } });
  check("문서 검증 실패 → 400", docBad.status === 400 && docBad.body.error.fields.title);
  const doc = await call("POST", "/api/documents", { token: mina.token, body: { title: "RR7 노트", content: docText } });
  check("문서 생성 201, 요약은 pending(뒤에서 진행)", doc.status === 201 && doc.body.data.summaryStatus === "pending" && !("content" in doc.body.data));
  const ready2 = await waitFor(async () => (await call("GET", `/api/documents/${doc.body.data.id}`, { token: mina.token })).body.data.summaryStatus === "ready", { timeout: 6000 });
  const docNow = await call("GET", `/api/documents/${doc.body.data.id}`, { token: mina.token });
  check("작업 큐가 요약을 만들어 ready", ready2 && docNow.body.data.summary === "이 문서는 React Router 7의 loader와 action을 설명합니다.");
  check("남의 문서 → 403, 없는 문서 → 404", (await call("GET", `/api/documents/${doc.body.data.id}`, { token: joon.token })).status === 403 && (await call("GET", "/api/documents/99999", { token: mina.token })).status === 404);

  const callsBefore = ollama.calls.length;
  const askRes = await fetch(`${app.base}/api/documents/${doc.body.data.id}/ask`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${mina.token}` }, body: JSON.stringify({ question: "loader는 무엇을 하나요?" }) });
  const events = [];
  const reader = askRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) events.push({ at: Date.now(), ...JSON.parse(line) });
    }
  }
  const tokens = events.filter((e) => e.type === "token");
  check("질문 스트림 200 + x-ndjson", askRes.status === 200 && /x-ndjson/.test(askRes.headers.get("content-type")));
  check("첫 이벤트는 검색된 발췌(sources)", events[0]?.type === "sources" && events[0].sources.length >= 1 && events[0].sources[0].text.includes("loader"));
  check("토큰이 시간차를 두고 여러 번 도착(스트리밍)", tokens.length >= 4 && tokens.at(-1).at - tokens[0].at >= 100);
  check("답변 조립 + 인용 번호 검증", tokens.map((t) => t.text).join("").includes("(발췌 1)") && events.at(-1).type === "done" && events.at(-1).citations.join() === "1");
  check("모델에는 발췌만 전달(전체 문서 아님)", ollama.calls.at(-1).body.includes("[발췌 1]") && ollama.calls.at(-1).body.includes("<문서>"));

  const callsMid = ollama.calls.length;
  const none = await fetch(`${app.base}/api/documents/${doc.body.data.id}/ask`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${mina.token}` }, body: JSON.stringify({ question: "zzzzqqq 전혀무관" }) });
  const noneEvents = (await none.text()).trim().split("\n").map((l) => JSON.parse(l));
  check("근거 없으면 모델 호출 없이 '찾을 수 없습니다'", ollama.calls.length === callsMid && noneEvents.some((e) => e.type === "token" && e.text.includes("찾을 수 없습니다")) && callsMid > callsBefore);
  check("빈 질문 → 스트림 전에 400", (await call("POST", `/api/documents/${doc.body.data.id}/ask`, { token: mina.token, body: { question: " " } })).status === 400);
  check("남의 문서에 질문 → 스트림 전에 403", (await call("POST", `/api/documents/${doc.body.data.id}/ask`, { token: joon.token, body: { question: "loader" } })).status === 403);

  const abortCtl = new AbortController();
  const slow = await fetch(`${app.base}/api/documents/${doc.body.data.id}/ask`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${mina.token}` }, body: JSON.stringify({ question: "loader는 긴답변으로 설명해줘" }), signal: abortCtl.signal });
  // 모델 호출이 실제로 시작된 뒤(= 첫 token 이벤트가 온 뒤)에 끊어야 의미가 있다.
  const slowReader = slow.body.getReader();
  let seen = "";
  while (!seen.includes('"type":"token"')) seen += new TextDecoder().decode((await slowReader.read()).value);
  abortCtl.abort();
  check("브라우저가 끊으면 모델 호출도 중단", await waitFor(() => ollama.calls.at(-1).closedEarly, { timeout: 3000 }));

  const mdForm = new FormData();
  mdForm.set("file", new File(["# 제목\n\nmarkdown 문서입니다."], "notes.md", { type: "text/markdown" }));
  const mdUp = await fetch(`${app.base}/api/documents`, { method: "POST", headers: { Authorization: `Bearer ${mina.token}` }, body: mdForm });
  check("MD 파일 업로드 → 제목은 파일명", mdUp.status === 201 && (await mdUp.json()).data.title === "notes");
  const badForm = new FormData();
  badForm.set("file", new File([Buffer.from([0xff, 0xfe, 0xfa])], "bin.txt"));
  check("UTF-8이 아닌 텍스트 → 400", (await fetch(`${app.base}/api/documents`, { method: "POST", headers: { Authorization: `Bearer ${mina.token}` }, body: badForm })).status === 400);
  const exeForm = new FormData();
  exeForm.set("file", new File(["x"], "run.exe"));
  check("txt/md 외 확장자 → 400", (await fetch(`${app.base}/api/documents`, { method: "POST", headers: { Authorization: `Bearer ${mina.token}` }, body: exeForm })).status === 400);
  check("문서 삭제 204", (await call("DELETE", `/api/documents/${doc.body.data.id}`, { token: mina.token })).status === 204);

  // 10. 실시간: SSE 알림
  const listen = async (token) => {
    const response = await fetch(`${app.base}/api/events`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const received = [];
    const ctl = new AbortController();
    (async () => {
      const r = response.body.getReader();
      const d = new TextDecoder();
      try {
        for (;;) {
          const { value, done } = await r.read();
          if (done) break;
          received.push(d.decode(value, { stream: true }));
        }
      } catch {}
    })();
    return { response, received, text: () => received.join(""), close: () => response.body.cancel().catch(() => ctl.abort()) };
  };
  const minaSse = await listen(mina.token);
  const anonSse = await listen(null);
  check("SSE 헤더: text/event-stream·no-transform", /text\/event-stream/.test(minaSse.response.headers.get("content-type")) && /no-transform/.test(minaSse.response.headers.get("cache-control")));
  const target = created.body.data.id;
  await call("POST", `/api/posts/${target}/comments`, { token: joon.token, body: { body: "알림 확인" } });
  check("내 글에 달린 댓글 → 글쓴이에게 comment.created", await waitFor(() => minaSse.text().includes("event: comment.created") && minaSse.text().includes("joon"), { timeout: 3000 }));
  check("댓글 알림은 다른 구독자(비로그인)에게 안 감", !anonSse.text().includes("comment.created"));
  await call("POST", "/api/posts", { token: joon.token, body: { title: "방송되는 글", body: "x" } });
  check("새 글 → 모든 구독자에게 post.created", await waitFor(() => anonSse.text().includes("event: post.created") && anonSse.text().includes("방송되는 글"), { timeout: 3000 }));
  check("내 댓글은 나에게 알리지 않음", (await call("POST", `/api/posts/${target}/comments`, { token: mina.token, body: { body: "내 글에 내가" } })) && !minaSse.text().includes("내 글에 내가"));
  await minaSse.close();
  await anonSse.close();

  // 11. 실시간: WebSocket
  const ticket = async (token) => (await call("POST", "/api/auth/ws-ticket", { token })).body.data.ticket;
  const open = (t, headers = {}) =>
    new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws?ticket=${t}`, { headers });
      const messages = [];
      ws.on("message", (m) => messages.push(JSON.parse(m.toString())));
      ws.on("open", () => resolve({ ws, messages, status: 101 }));
      ws.on("unexpected-response", (_req, res) => resolve({ ws, messages, status: res.statusCode }));
      ws.on("error", () => {});
    });
  check("티켓 없는 WebSocket → 401", (await open("garbage")).status === 401);
  check("낯선 Origin의 WebSocket → 403", (await open(await ticket(mina.token), { Origin: "http://evil.example" })).status === 403);
  const a = await open(await ticket(mina.token), { Origin: app.base });
  const b = await open(await ticket(joon.token), { Origin: app.base });
  check("WebSocket 연결 101 + 접속자 수 방송", a.status === 101 && (await waitFor(() => a.messages.some((m) => m.type === "presence" && m.count === 2))));
  b.ws.send(JSON.stringify({ type: "chat", text: "안녕, 채팅" }));
  check("채팅이 모든 연결에 방송(보낸 사람 닉네임은 토큰에서)", await waitFor(() => a.messages.some((m) => m.type === "chat" && m.from === "joon" && m.text === "안녕, 채팅")));
  a.ws.send("not json");
  check("JSON이 아닌 메시지는 error 응답(연결 유지)", await waitFor(() => a.messages.some((m) => m.type === "error")));
  const closed = new Promise((resolve) => b.ws.on("close", (code) => resolve(code)));
  b.ws.send("x".repeat(3000));
  check("2KB 초과 메시지 → 연결 종료(1009)", (await closed) === 1009);
  a.ws.close();

  // 12. 스트리밍 SSR
  const t0 = Date.now();
  // Node의 기본 User-Agent("node")는 isbot이 검색 봇으로 분류해 완성된 HTML을 한 번에 준다. 브라우저 UA를 쓴다.
  const lab = await fetch(`${app.base}/lab`, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" } });
  const labReader = lab.body.getReader();
  const labDecoder = new TextDecoder();
  const first = await labReader.read();
  const firstAt = Date.now() - t0;
  let labText = labDecoder.decode(first.value, { stream: true });
  for (;;) {
    const { value, done } = await labReader.read();
    if (done) break;
    labText += labDecoder.decode(value, { stream: true });
  }
  const totalAt = Date.now() - t0;
  check("스트리밍 SSR: 첫 조각이 느린 데이터(0.8초)보다 먼저 도착", firstAt < 600 && totalAt >= 700, `first=${firstAt}ms total=${totalAt}ms`);
  check("느린 데이터는 같은 응답 스트림 끝에 도착", labText.includes("느린 데이터(0.8초)가 도착했습니다"));

  // 13. 레이트 리밋은 별도 인스턴스(낮은 한도)로 확인
  const strict = await startApp({ RATE_LIMIT_AUTH_PER_MIN: "3", RATE_LIMIT_API_PER_MIN: "100000" });
  const sc = client(strict.base);
  const statuses = [];
  for (let i = 0; i < 5; i++) statuses.push((await sc.call("POST", "/api/auth/login", { body: { email: "x@example.com", password: "wrong-password" } })).status);
  check("로그인 4번째부터 429", statuses.join() === "401,401,401,429,429", statuses.join());
  const limited = await sc.call("POST", "/api/auth/login", { body: { email: "x@example.com", password: "wrong-password" } });
  check("429 본문 RATE_LIMITED + Retry-After", limited.body?.error?.code === "RATE_LIMITED" && Number(limited.headers.get("retry-after")) >= 1);
  check("화면 로그인 폼도 같은 한도(429)", (await sc.form("POST", "/login", { email: "x@example.com", password: "wrong-password" })).status === 429);
  check("다른 API는 영향 없음", (await sc.call("GET", "/api/posts")).status === 200);
  check("METRICS_TOKEN 없으면 /metrics는 404", (await sc.call("GET", "/metrics")).status === 404);
  await stopApp(strict);
} catch (error) {
  check("테스트 실행 중 예외 없음", false, String(error?.stack ?? error));
} finally {
  await stopApp(app);
  for (const m of [resend, stripe, github, ollama]) m.close();
}

const failed = summary();
if (failed) {
  console.log("서버 로그:\n" + app.log.split("\n").slice(-12).join("\n"));
  process.exit(1);
}
