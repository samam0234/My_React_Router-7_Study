// 요청 테스트들이 같이 쓰는 도구: 검사 기록, 서버 실행, HTTP 헬퍼.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const results = [];
export function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${condition ? "" : `  → ${detail}`}`);
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

/** 조건이 참이 될 때까지 기다린다. 시간 안에 안 되면 마지막 값을 돌려준다. */
export async function waitFor(fn, { timeout = 5000, interval = 100 } = {}) {
  const end = Date.now() + timeout;
  let value;
  while (Date.now() < end) {
    value = await fn();
    if (value) return value;
    await sleep(interval);
  }
  return value;
}

/** 빌드된 서버(server.ts)를 임시 DB로 띄운다. */
export async function startApp(extraEnv = {}) {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "rr7-proj-"));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "production",
      COOKIE_SECURE: "false",
      APP_ORIGIN: base,
      SESSION_SECRET: "request-test-session-secret-0123456789",
      JWT_SECRET: "request-test-jwt-secret-0123456789ab",
      // DB 교체 시험(tools/db-e2e.mjs)이 TEST_DB_DRIVER·TEST_DATABASE_URL로 다른 DB를 지정한다.
      DB_DRIVER: process.env.TEST_DB_DRIVER ?? "sqlite",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      DATABASE_PATH: join(dir, "test.db"),
      UPLOAD_DIR: join(dir, "uploads"),
      CORS_ORIGIN: "http://localhost:5173",
      LOG_REQUESTS: "0",
      RATE_LIMIT_AUTH_PER_MIN: "100000",
      RATE_LIMIT_API_PER_MIN: "100000",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const app = { base, port, dir, child, log: "" };
  child.stdout.on("data", (c) => (app.log += c));
  child.stderr.on("data", (c) => (app.log += c));
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) return app;
    } catch {}
    await sleep(250);
  }
  throw new Error(`서버가 시작되지 않았습니다.\n${app.log}`);
}

export async function stopApp(app) {
  app.child.kill();
  await sleep(300);
  rmSync(app.dir, { recursive: true, force: true });
}

/** JSON API 호출. 토큰이 있으면 Bearer로 보낸다. */
export function client(base) {
  async function call(method, path, { body, token, headers, raw } = {}) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body !== undefined && !raw ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
      redirect: "manual",
    });
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {}
    return { status: response.status, headers: response.headers, body: json, text };
  }
  async function form(method, path, fields, cookie) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...(cookie ? { Cookie: cookie } : {}) },
      body: fields ? new URLSearchParams(fields).toString() : undefined,
      redirect: "manual",
    });
    const cookies = response.headers.getSetCookie().map((c) => c.split(";")[0]);
    return { status: response.status, location: response.headers.get("location"), text: await response.text(), cookie: cookies.join("; "), headers: response.headers };
  }
  async function page(path, cookie) {
    const response = await fetch(`${base}${path}`, { headers: cookie ? { Cookie: cookie } : {}, redirect: "manual" });
    return { status: response.status, text: await response.text(), location: response.headers.get("location"), headers: response.headers };
  }
  async function signup(email, nickname) {
    await call("POST", "/api/auth/signup", { body: { email, password: "password123", nickname } });
    const login = await call("POST", "/api/auth/login", { body: { email, password: "password123" } });
    return { token: login.body?.data?.accessToken, user: login.body?.data?.user };
  }
  return { call, form, page, signup };
}

/** 모의 서버를 만든다. handler(req, res, body)가 처리하고, 호출 기록은 calls에 쌓인다. */
import { createServer as createHttp } from "node:http";
export async function mockServer(handler) {
  const calls = [];
  const server = createHttp(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    const call = { method: req.method, url: req.url, headers: req.headers, body, closedEarly: false };
    calls.push(call);
    res.on("close", () => {
      if (!res.writableFinished) call.closedEarly = true; // 클라이언트가 중간에 끊음
    });
    await handler(req, res, call, calls);
  });
  const port = await freePort();
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${port}`, calls, close: () => server.close() };
}

export function summary() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 통과`);
  return failed.length;
}
