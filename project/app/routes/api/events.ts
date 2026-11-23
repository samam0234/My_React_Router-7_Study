import { userContext } from "~/context";
import { api } from "~/lib/api.server";
import { subscribe, type HubEvent } from "~/realtime/hub.server";
import type { Route } from "./+types/events";

// GET /api/events → Server-Sent Events. 서버가 브라우저로 일방향 푸시한다(채팅처럼 양방향이 필요하면 WebSocket).
export const loader = api(({ request, context }: Route.LoaderArgs) => {
  const userId = context.get(userContext)?.id ?? null;
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (text: string) => controller.enqueue(encoder.encode(text));
      const send = (event: HubEvent) => write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
      write("retry: 3000\n: connected\n\n"); // 끊기면 3초 뒤 브라우저가 자동으로 다시 연결한다
      const unsubscribe = subscribe(userId, send);
      // 프록시가 "아무 말 없는 연결"을 끊지 않도록 주기적으로 주석 줄을 보낸다.
      const heartbeat = setInterval(() => write(": ping\n\n"), 25_000);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* 이미 닫힘 */
        }
      });
    },
    cancel: () => cleanup(),
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform: 압축 미들웨어가 스트림을 모아서 버퍼링하지 못하게 한다.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no", // nginx 버퍼링 끄기
    },
  });
});
