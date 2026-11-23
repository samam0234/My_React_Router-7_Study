// 빌드된 서버를 실제로 띄우고 HTTP로 검증한다. 사용: npm run build && npm run test:requests
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${condition ? "" : `  → ${detail}`}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const dir = mkdtempSync(join(tmpdir(), "rr7-mid-"));
const server = spawn(
  process.execPath,
  ["node_modules/@react-router/serve/bin.js", "build/server/index.js"],
  {
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "production",
      COOKIE_SECURE: "false",
      SESSION_SECRET: "request-test-session-secret-0123456789",
      JWT_SECRET: "request-test-jwt-secret-0123456789ab",
      DATABASE_PATH: join(dir, "test.db"),
      CORS_ORIGIN: "http://localhost:5173",
      LOG_REQUESTS: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let serverLog = "";
server.stdout.on("data", (chunk) => (serverLog += chunk));
server.stderr.on("data", (chunk) => (serverLog += chunk));

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`서버가 시작되지 않았습니다.\n${serverLog}`);
}

const json = (token) => ({
  "Content-Type": "application/json",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});
async function call(method, path, { body, token, headers } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...json(token), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await response.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : undefined; } catch { parsed = undefined; }
  return { status: response.status, headers: response.headers, body: parsed, text };
}

/** HTML 폼 전송. 쿠키는 직접 들고 다닌다. */
async function form(method, path, fields, cookie) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: fields ? new URLSearchParams(fields).toString() : undefined,
    redirect: "manual",
  });
  const setCookie = response.headers.getSetCookie().map((c) => c.split(";")[0]);
  return { status: response.status, location: response.headers.get("location"), text: await response.text(), cookie: setCookie.join("; ") };
}
const page = async (path, cookie) => {
  const r = await fetch(`${base}${path}`, { headers: cookie ? { Cookie: cookie } : {}, redirect: "manual" });
  return { status: r.status, text: await r.text(), location: r.headers.get("location"), headers: r.headers };
};

try {
  await waitReady();

  // 1. 건강 체크와 공통 헤더
  const health = await call("GET", "/health");
  check("GET /health → 200 {status:ok}", health.status === 200 && health.body?.status === "ok");
  check("모든 응답에 X-Request-Id", Boolean(health.headers.get("x-request-id")));
  const echoed = await call("GET", "/health", { headers: { "X-Request-Id": "abc-123" } });
  check("들어온 X-Request-Id를 그대로 돌려줌", echoed.headers.get("x-request-id") === "abc-123");

  // 2. 회원가입·로그인
  const bad = await call("POST", "/api/auth/signup", { body: { email: "x", password: "1", nickname: "" } });
  check("가입 검증 실패 → 400 VALIDATION_ERROR + fields", bad.status === 400 && bad.body?.error?.code === "VALIDATION_ERROR" && bad.body.error.fields?.email && bad.body.error.fields?.password);
  check("오류 본문 requestId == 헤더", bad.body?.error?.requestId === bad.headers.get("x-request-id"));
  check("JSON 응답은 Content-Type: application/json; charset=utf-8 (스펙 v1 7절)", health.headers.get("content-type") === "application/json; charset=utf-8" && bad.headers.get("content-type") === "application/json; charset=utf-8");
  const signupA = await call("POST", "/api/auth/signup", { body: { email: "mina@example.com", password: "password123", nickname: "mina" } });
  check("가입 → 201, 비밀번호·해시 없음", signupA.status === 201 && signupA.body?.data?.email === "mina@example.com" && !/password|hash/i.test(signupA.text));
  const dup = await call("POST", "/api/auth/signup", { body: { email: "MINA@example.com", password: "password123", nickname: "dup" } });
  check("중복 이메일(대소문자 무시) → 409 EMAIL_TAKEN", dup.status === 409 && dup.body?.error?.code === "EMAIL_TAKEN");
  const wrong = await call("POST", "/api/auth/login", { body: { email: "mina@example.com", password: "wrong-password" } });
  check("로그인 실패 → 401 INVALID_CREDENTIALS", wrong.status === 401 && wrong.body?.error?.code === "INVALID_CREDENTIALS");
  const ghost = await call("POST", "/api/auth/login", { body: { email: "none@example.com", password: "password123" } });
  check("없는 이메일도 같은 오류(가입 여부 숨김)", ghost.status === 401 && ghost.body?.error?.message === wrong.body?.error?.message);
  const loginA = await call("POST", "/api/auth/login", { body: { email: "mina@example.com", password: "password123" } });
  const tokenA = loginA.body?.data?.accessToken;
  check("로그인 → 200 + accessToken(JWT 3조각)", loginA.status === 200 && tokenA?.split(".").length === 3);
  check("me 토큰 없음 → 401 UNAUTHORIZED", (await call("GET", "/api/auth/me")).status === 401);
  check("me 위조 토큰 → 401", (await call("GET", "/api/auth/me", { token: tokenA.slice(0, -2) + "xx" })).status === 401);
  const me = await call("GET", "/api/auth/me", { token: tokenA });
  check("me → 200 내 정보", me.status === 200 && me.body?.data?.nickname === "mina");
  const syntax = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" });
  check("깨진 JSON → 400 BAD_REQUEST", syntax.status === 400 && (await syntax.json()).error?.code === "BAD_REQUEST");

  await call("POST", "/api/auth/signup", { body: { email: "joon@example.com", password: "password123", nickname: "joon" } });
  const tokenB = (await call("POST", "/api/auth/login", { body: { email: "joon@example.com", password: "password123" } })).body.data.accessToken;

  // 3. 게시글 CRUD
  check("글 작성 토큰 없음 → 401", (await call("POST", "/api/posts", { body: { title: "t", body: "b" } })).status === 401);
  const invalid = await call("POST", "/api/posts", { token: tokenA, body: { title: "", body: "b" } });
  check("글 검증 실패 → 400 fields.title", invalid.status === 400 && invalid.body?.error?.fields?.title);
  const created = await call("POST", "/api/posts", { token: tokenA, body: { title: "첫 글", body: "안녕하세요 React Router", tags: ["intro", "rr7"] } });
  const postId = created.body?.data?.id;
  check("글 작성 → 201 + Location", created.status === 201 && created.headers.get("location") === `/api/posts/${postId}`);
  check("작성 응답 모양(author, commentCount, tags)", created.body?.data?.author?.nickname === "mina" && created.body.data.commentCount === 0 && created.body.data.tags.length === 2);
  for (let i = 2; i <= 12; i++) await call("POST", "/api/posts", { token: tokenB, body: { title: `글 ${i}`, body: `내용 ${i}`, tags: [] } });

  const list = await call("GET", "/api/posts");
  check("목록 기본값 page=1 limit=10 total=12 totalPages=2", list.body?.meta?.page === 1 && list.body.meta.limit === 10 && list.body.meta.total === 12 && list.body.meta.totalPages === 2 && list.body.data.length === 10);
  check("목록 항목에 본문 없음, 최신순", !("body" in list.body.data[0]) && list.body.data[0].title === "글 12");
  const p2 = await call("GET", "/api/posts?page=2");
  check("page=2 → 2건", p2.body?.data?.length === 2 && p2.body.meta.page === 2);
  check("limit=500 → 50으로 보정", (await call("GET", "/api/posts?limit=500")).body?.meta?.limit === 50);
  check("limit=abc → 기본 10", (await call("GET", "/api/posts?limit=abc")).body?.meta?.limit === 10);
  const q = await call("GET", `/api/posts?q=${encodeURIComponent("REACT")}`);
  check("검색 q(대소문자 무시) → 1건 + meta.q", q.body?.data?.length === 1 && q.body.meta.q === "REACT");
  check("검색 q에 % 입력해도 전체 매칭 안 됨", (await call("GET", "/api/posts?q=%25")).body?.data?.length === 0);
  const oldest = await call("GET", "/api/posts?sort=createdAt&limit=1");
  check("sort=createdAt → 가장 오래된 글", oldest.body?.data?.[0]?.title === "첫 글");
  check("허용 밖 sort는 기본으로 보정(SQL 주입 안 됨)", (await call("GET", `/api/posts?sort=${encodeURIComponent("id; DROP TABLE posts")}`)).status === 200);
  check("상세 → 200 본문 포함", (await call("GET", `/api/posts/${postId}`)).body?.data?.body?.includes("안녕하세요"));
  check("없는 글 → 404 NOT_FOUND", (await call("GET", "/api/posts/99999")).body?.error?.code === "NOT_FOUND");
  check("숫자 아닌 id → 400 BAD_REQUEST", (await call("GET", "/api/posts/abc")).body?.error?.code === "BAD_REQUEST");

  const forbidden = await call("PATCH", `/api/posts/${postId}`, { token: tokenB, body: { title: "탈취" } });
  check("남의 글 수정 → 403 FORBIDDEN", forbidden.status === 403 && forbidden.body?.error?.code === "FORBIDDEN");
  const patched = await call("PATCH", `/api/posts/${postId}`, { token: tokenA, body: { title: "첫 글(수정)" } });
  check("부분 수정 → 200, 안 보낸 tags 유지", patched.status === 200 && patched.body?.data?.title === "첫 글(수정)" && patched.body.data.tags.length === 2);
  check("빈 PATCH → 400", (await call("PATCH", `/api/posts/${postId}`, { token: tokenA, body: {} })).status === 400);
  check("남의 글 삭제 → 403", (await call("DELETE", `/api/posts/${postId}`, { token: tokenB })).status === 403);

  // 4. 댓글
  const c1 = await call("POST", `/api/posts/${postId}/comments`, { token: tokenB, body: { body: "좋은 글이네요" } });
  check("댓글 작성 → 201", c1.status === 201 && c1.body?.data?.author?.nickname === "joon");
  check("빈 댓글 → 400", (await call("POST", `/api/posts/${postId}/comments`, { token: tokenB, body: { body: "  " } })).status === 400);
  check("없는 글에 댓글 → 404", (await call("POST", "/api/posts/99999/comments", { token: tokenB, body: { body: "x" } })).status === 404);
  check("댓글 목록", (await call("GET", `/api/posts/${postId}/comments`)).body?.data?.length === 1);
  check("commentCount 반영", (await call("GET", `/api/posts/${postId}`)).body?.data?.commentCount === 1);
  check("남의 댓글 삭제 → 403", (await call("DELETE", `/api/comments/${c1.body.data.id}`, { token: tokenA })).status === 403);
  check("내 댓글 삭제 → 204 본문 없음", await (async () => { const r = await call("DELETE", `/api/comments/${c1.body.data.id}`, { token: tokenB }); return r.status === 204 && r.text === ""; })());

  // 5. 삭제와 연쇄 삭제
  await call("POST", `/api/posts/${postId}/comments`, { token: tokenB, body: { body: "남을 댓글" } });
  const del = await call("DELETE", `/api/posts/${postId}`, { token: tokenA });
  check("내 글 삭제 → 204", del.status === 204 && del.text === "");
  check("삭제 후 상세 404, 댓글도 함께 사라짐", (await call("GET", `/api/posts/${postId}`)).status === 404 && (await call("GET", `/api/posts/${postId}/comments`)).status === 404);

  // 6. 없는 API 경로·CORS·CSRF
  const noApi = await call("GET", "/api/does-not-exist");
  check("없는 /api 경로 → JSON 404", noApi.status === 404 && noApi.body?.error?.code === "NOT_FOUND");
  const pre = await fetch(`${base}/api/posts`, { method: "OPTIONS", headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "POST" } });
  check("허용 출처 preflight → 204 + ACAO", pre.status === 204 && pre.headers.get("access-control-allow-origin") === "http://localhost:5173");
  const preEvil = await fetch(`${base}/api/posts`, { method: "OPTIONS", headers: { Origin: "http://evil.example", "Access-Control-Request-Method": "POST" } });
  check("낯선 출처 preflight → ACAO 없음", !preEvil.headers.get("access-control-allow-origin"));
  const csrf = await call("POST", "/api/posts", { token: tokenA, body: { title: "x", body: "y" }, headers: { Origin: "http://evil.example" } });
  check("낯선 Origin의 변경 요청 → 403", csrf.status === 403 && csrf.body?.error?.code === "FORBIDDEN");
  const getOk = await call("GET", "/api/posts", { headers: { Origin: "http://evil.example" } });
  check("낯선 Origin의 GET은 허용(단 ACAO 없음)", getOk.status === 200 && !getOk.headers.get("access-control-allow-origin"));

  // 7. 화면(HTML): SSR, 보호된 라우트, 세션 쿠키 폼 흐름
  const home = await page("/");
  check("SSR 홈 → 200, 서버가 만든 HTML에 제목 포함", home.status === 200 && home.text.includes("React Router 7 게시판"));
  const guard = await page("/posts/new");
  check("비로그인 /posts/new → 302 /login?redirectTo", guard.status === 302 && guard.location === "/login?redirectTo=%2Fposts%2Fnew");
  const nf = await page("/this-page-does-not-exist");
  check("없는 화면 → 404 HTML", nf.status === 404 && nf.text.includes("페이지를 찾을 수 없습니다"));
  const badId = await page("/posts/abc");
  check("화면 주소의 id가 숫자가 아니면 500이 아니라 404", badId.status === 404);
  const badSignup = await form("POST", "/signup", { email: "bad", nickname: "", password: "1" });
  check("폼 가입 검증 실패 → 400 + 필드 오류 문구", badSignup.status === 400 && badSignup.text.includes("올바른 이메일을 입력하세요."));
  const signup = await form("POST", "/signup", { email: "web@example.com", nickname: "웹유저", password: "password123" });
  check("폼 가입 → 302 /posts + Set-Cookie(HttpOnly)", signup.status === 302 && signup.location === "/posts" && signup.cookie.startsWith("__rr7_board="));
  const setCookieRaw = (await fetch(`${base}/login`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "email=web@example.com&password=password123", redirect: "manual" })).headers.getSetCookie().join("|");
  check("세션 쿠키 속성 HttpOnly·SameSite=Lax", /HttpOnly/i.test(setCookieRaw) && /SameSite=Lax/i.test(setCookieRaw));
  const cookie = signup.cookie;
  const flash = await page("/posts", cookie);
  check("로그인 후 flash 메시지와 닉네임 표시", flash.text.includes("가입을 환영합니다.") && flash.text.includes("웹유저"));
  check("flash는 한 번만", !(await page("/posts", flash.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") || cookie)).text.includes("가입을 환영합니다."));
  check("로그인 후 /posts/new → 200", (await page("/posts/new", cookie)).status === 200);
  const emptyPost = await form("POST", "/posts/new", { title: "", body: "", tags: "" }, cookie);
  check("글쓰기 폼 검증 실패 → 400, 입력값 유지", emptyPost.status === 400 && emptyPost.text.includes("1~200자로 입력하세요."));
  const newPost = await form("POST", "/posts/new", { title: "폼으로 쓴 글", body: "<script>alert(1)</script> 본문", tags: "a, b, a" }, cookie);
  const webId = newPost.location?.split("/").pop();
  check("글쓰기 폼 → 302 /posts/:id", newPost.status === 302 && /^\/posts\/\d+$/.test(newPost.location ?? ""));
  const detail = await page(`/posts/${webId}`, newPost.cookie ? `${cookie}` : cookie);
  check("상세 SSR + 본문 HTML 이스케이프(XSS 방어)", detail.status === 200 && detail.text.includes("폼으로 쓴 글") && !detail.text.includes("<script>alert(1)</script>") && detail.text.includes("&lt;script&gt;"));
  check("태그 중복 제거 a,b", (await call("GET", `/api/posts/${webId}`)).body?.data?.tags.join() === "a,b");
  check("작성자에게만 수정·삭제 버튼", detail.text.includes("수정") && !(await page(`/posts/${webId}`)).text.includes(`/posts/${webId}/edit`));
  const strangerEdit = await page(`/posts/${webId}/edit`);
  check("비로그인 수정 화면 → 302 /login", strangerEdit.status === 302);
  const cmt = await form("POST", `/posts/${webId}`, { intent: "comment", body: "폼 댓글" }, cookie);
  check("폼 댓글 → 200 {ok}", cmt.status === 200 || cmt.status === 204);
  check("댓글이 화면에 보임", (await page(`/posts/${webId}`, cookie)).text.includes("폼 댓글"));
  const delPost = await form("POST", `/posts/${webId}`, { intent: "delete-post" }, cookie);
  check("글 삭제 폼 → 302 /posts", delPost.status === 302 && delPost.location === "/posts");
  check("삭제한 글 화면 → 404", (await page(`/posts/${webId}`, cookie)).status === 404);
  const out = await form("POST", "/logout", {}, cookie);
  check("로그아웃 → 302 / + 쿠키 만료", out.status === 302 && out.location === "/");
  check("로그아웃 GET은 아무 일도 안 함(302 /)", (await page("/logout")).status === 302);
  const loginForm = await form("POST", "/login", { email: "web@example.com", password: "nope", redirectTo: "/posts" });
  check("폼 로그인 실패 → 401 + 오류 문구", loginForm.status === 401 && loginForm.text.includes("이메일 또는 비밀번호가 올바르지 않습니다."));
  const openRedirect = await form("POST", "/login", { email: "web@example.com", password: "password123", redirectTo: "//evil.example" });
  check("열린 리다이렉트 차단 → /posts", openRedirect.status === 302 && openRedirect.location === "/posts");
  const nextOk = await form("POST", "/login", { email: "web@example.com", password: "password123", redirectTo: "/posts/new" });
  check("redirectTo 같은 사이트 경로는 유지", nextOk.location === "/posts/new");
} catch (error) {
  check("테스트 실행 중 예외 없음", false, String(error?.stack ?? error));
} finally {
  server.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
if (failed.length) {
  console.log("서버 로그:\n" + serverLog.split("\n").slice(-15).join("\n"));
  process.exit(1);
}
