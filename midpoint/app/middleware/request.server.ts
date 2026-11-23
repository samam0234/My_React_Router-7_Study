import type { MiddlewareFunction } from "react-router";
import { getConfig } from "~/config.server";
import { requestIdContext } from "~/context";
import { corsHeaders, preflight } from "~/lib/http.server";

/**
 * 가장 바깥 미들웨어. 요청 번호를 붙이고, /api 의 CORS를 처리하고, 요청 한 줄을 로그로 남긴다.
 * next() 앞은 "들어갈 때", 뒤는 "나올 때"다.
 */
export const requestMiddleware: MiddlewareFunction<Response> = async (
  { request, url, context },
  next,
) => {
  const started = performance.now();
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  context.set(requestIdContext, requestId);

  const isApi = url.pathname.startsWith("/api/");
  const response =
    isApi && request.method === "OPTIONS" ? preflight(request) : await next();

  response.headers.set("X-Request-Id", requestId);
  if (isApi) {
    for (const [name, value] of corsHeaders(request)) response.headers.set(name, value);
  }

  if (getConfig().LOG_REQUESTS === "1") {
    console.log(
      JSON.stringify({
        level: "info",
        msg: "request",
        requestId,
        method: request.method,
        path: url.pathname,
        status: response.status,
        ms: Math.round(performance.now() - started),
      }),
    );
  }
  return response;
};
