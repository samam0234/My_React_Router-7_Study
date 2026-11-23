// 운영용 서버: React Router 빌드 결과 + 정적 파일 + WebSocket(/ws)을 한 프로세스에서 제공한다.
// react-router-serve는 HTTP만 다루므로, WebSocket이 필요하면 이렇게 직접 서버를 만든다.
// 실행: npm run build && npm start   (Node 24는 .ts를 타입 제거 방식으로 바로 실행한다)
import { createRequestHandler } from "@react-router/express";
import compression from "compression";
import express from "express";
import { RouterContextProvider, type ServerBuild } from "react-router";
import { WebSocketServer, type WebSocket } from "ws";
import { clientIpContext } from "./app/context.ts";
import { verifyAccessToken } from "./app/lib/token.server.ts";

const port = Number(process.env.PORT ?? 3000);
const jwtSecret = process.env.JWT_SECRET ?? "";
if (jwtSecret.length < 32) throw new Error("JWT_SECRET은 32자 이상이어야 합니다. (.env를 확인하세요)");

// @ts-ignore: 빌드 산출물에는 타입 선언이 없다.
const build = (await import("./build/server/index.js")) as unknown as ServerBuild;

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "1" ? 1 : false); // 프록시 뒤라면 req.ip가 실제 접속자 주소가 된다
app.use(compression());
// 파일 이름에 내용 해시가 들어 있으므로 /assets는 1년간 캐시해도 안전하다.
app.use("/assets", express.static("build/client/assets", { immutable: true, maxAge: "1y" }));
app.use(express.static("build/client", { maxAge: "1h" }));
app.use(
  createRequestHandler({
    build,
    mode: process.env.NODE_ENV,
    getLoadContext(req) {
      const context = new RouterContextProvider();
      context.set(clientIpContext, req.ip ?? "unknown");
      return context;
    },
  }),
);

const server = app.listen(port, () => {
  console.log(JSON.stringify({ level: "info", msg: "listening", port, pid: process.pid }));
});

// ── WebSocket 채팅 ────────────────────────────────────────────────
type Member = { id: number; nickname: string; recent: number[] };
const members = new Map<WebSocket, Member>();
const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 }); // 2KB 넘는 메시지는 연결을 끊는다

const broadcast = (message: object) => {
  const text = JSON.stringify(message);
  for (const socket of members.keys()) if (socket.readyState === socket.OPEN) socket.send(text);
};

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname !== "/ws") return socket.destroy();

  // 다른 사이트의 페이지가 사용자의 브라우저로 몰래 연결하는 것(CSWSH)을 막는다.
  const origin = request.headers.origin;
  if (origin && new URL(origin).host !== request.headers.host) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    return socket.destroy();
  }
  const payload = verifyAccessToken(url.searchParams.get("ticket") ?? "", jwtSecret);
  if (!payload) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    return socket.destroy();
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    members.set(ws, { id: Number(payload.sub), nickname: payload.nickname, recent: [] });
    wss.emit("connection", ws);
  });
});

wss.on("connection", (ws: WebSocket & { alive?: boolean }) => {
  ws.alive = true;
  ws.on("pong", () => (ws.alive = true));
  // 반드시 필요하다: 'error' 리스너가 없으면 비정상 프레임(너무 큰 메시지 등) 하나로 서버 프로세스 전체가 죽는다.
  // ws 라이브러리가 알아서 올바른 코드(예: 1009)로 연결을 닫으므로 여기서는 기록만 한다.
  ws.on("error", (error) => console.error(JSON.stringify({ level: "warn", msg: "ws error", error: String(error) })));
  broadcast({ type: "presence", count: members.size });

  ws.on("message", (raw) => {
    const member = members.get(ws)!;
    // 연결마다 10초에 10개까지만 받는다. 도배를 막는다.
    const now = Date.now();
    member.recent = member.recent.filter((t) => now - t < 10_000);
    if (member.recent.length >= 10) return ws.send(JSON.stringify({ type: "error", message: "너무 빨리 보내고 있습니다." }));
    member.recent.push(now);

    let message: { type?: string; text?: unknown };
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return ws.send(JSON.stringify({ type: "error", message: "JSON 형식이 아닙니다." }));
    }
    if (message.type === "ping") return ws.send(JSON.stringify({ type: "pong" }));
    if (message.type === "chat" && typeof message.text === "string" && message.text.trim()) {
      broadcast({ type: "chat", from: member.nickname, text: message.text.trim().slice(0, 500), at: new Date().toISOString() });
    }
  });

  ws.on("close", () => {
    members.delete(ws);
    broadcast({ type: "presence", count: members.size });
  });
});

// 응답 없는(죽은) 연결을 30초마다 정리한다. 모바일·프록시 환경에서는 close 이벤트 없이 끊기는 일이 흔하다.
const sweep = setInterval(() => {
  for (const ws of members.keys() as Iterable<WebSocket & { alive?: boolean }>) {
    if (ws.alive === false) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
  }
}, 30_000);
sweep.unref();

// ── 우아한 종료: 배포 시 SIGTERM을 받으면 새 연결을 막고 진행 중인 요청을 마친 뒤 끝낸다 ──
function shutdown(signal: string) {
  console.log(JSON.stringify({ level: "info", msg: "shutting down", signal }));
  server.close(() => process.exit(0));
  for (const ws of members.keys()) ws.close(1001, "server shutting down");
  setTimeout(() => process.exit(1), 10_000).unref(); // 10초 안에 안 끝나면 강제 종료
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
