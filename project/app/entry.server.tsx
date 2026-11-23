import { PassThrough } from "node:stream";

import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";
import type { EntryContext, HandleErrorFunction, RouterContextProvider } from "react-router";
import { ServerRouter } from "react-router";

export const streamTimeout = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  // 미들웨어를 켜면 loadContext는 RouterContextProvider다.
  _loadContext: RouterContextProvider,
) {
  // HEAD 요청은 본문 없이 헤더만 돌려준다.
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, { status: responseStatusCode, headers: responseHeaders });
  }

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get("user-agent");

    // 검색 봇·SPA 모드는 모든 내용이 준비된 뒤 응답한다. 일반 브라우저는 껍데기부터 스트리밍한다.
    const readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode ? "onAllReady" : "onShellReady";

    // 느린 데이터가 끝없이 기다리지 않도록 제한 시간 뒤에 렌더링을 중단한다.
    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1000,
    );

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeoutId);
              timeoutId = undefined;
              callback();
            },
          });
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          pipe(body);
          resolve(new Response(stream, { headers: responseHeaders, status: responseStatusCode }));
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) console.error(error);
        },
      },
    );
  });
}

/** loader·action·렌더링에서 던져진 "예상 밖" 오류가 서버 로그에 한 줄 JSON으로 남는다. */
export const handleError: HandleErrorFunction = (error, { request }) => {
  // 사용자가 탭을 닫아 요청이 끊긴 경우는 오류가 아니다.
  if (request.signal.aborted) return;
  console.error(
    JSON.stringify({
      level: "error",
      msg: "server error",
      method: request.method,
      path: new URL(request.url).pathname,
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    }),
  );
};
