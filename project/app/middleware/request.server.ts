import { data, type MiddlewareFunction } from "react-router";
import { getConfig } from "~/config.server";
import { clientIpContext, requestIdContext } from "~/context";
import { rateLimited } from "~/lib/errors";
import { corsHeaders, errorResponse, preflight, securityHeaders } from "~/lib/http.server";
import { observeRequest } from "~/lib/metrics.server";
import { hit } from "~/lib/rate-limit.server";

const AUTH_PATHS = /^\/(api\/(v1\/)?auth\/(login|signup)|login|signup)$/;

/**
 * 가장 바깥 미들웨어. 요청 번호, CORS, 레이트 리밋, 보안 헤더, 응답 시간 측정, 요청 로그를 맡는다.
 * next() 앞은 "들어갈 때", 뒤는 "나올 때"다.
 */
export const requestMiddleware: MiddlewareFunction<Response> = async ({ request, url, context }, next) => {
  const started = performance.now();
  const config = getConfig();
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  context.set(requestIdContext, requestId);

  // 커스텀 서버가 넣어 준 접속자 주소. 프록시 뒤라면 X-Forwarded-For의 첫 값을 쓴다(TRUST_PROXY=1일 때만 신뢰).
  let ip = context.get(clientIpContext);
  if (ip === "unknown" && config.TRUST_PROXY === "1") {
    ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  }

  const isApi = url.pathname.startsWith("/api/");
  let response: Response;
  if (isApi && request.method === "OPTIONS") {
    response = preflight(request);
  } else {
    // 로그인·가입은 무차별 대입 공격 대상이라 훨씬 촘촘하게 제한한다.
    const isAuth = request.method === "POST" && AUTH_PATHS.test(url.pathname);
    const limit = isAuth ? config.RATE_LIMIT_AUTH_PER_MIN : config.RATE_LIMIT_API_PER_MIN;
    const result =
      config.RATE_LIMIT === "1" && (isApi || isAuth) ? hit(`${ip}|${isAuth ? "auth" : "api"}`, limit) : undefined;
    if (result && !result.allowed) {
      const retry = { "Retry-After": String(result.retryAfterSeconds) };
      if (!isApi) throw data("요청이 너무 많습니다. 잠시 후 다시 시도하세요.", { status: 429, headers: retry });
      response = errorResponse(rateLimited(), requestId);
      response.headers.set("Retry-After", retry["Retry-After"]);
    } else {
      response = await next();
      if (result) {
        response.headers.set("RateLimit-Limit", String(result.limit));
        response.headers.set("RateLimit-Remaining", String(result.remaining));
      }
    }
  }

  const ms = performance.now() - started;
  response.headers.set("X-Request-Id", requestId);
  response.headers.set("Server-Timing", `total;dur=${ms.toFixed(1)}`);
  for (const [name, value] of Object.entries(securityHeaders())) response.headers.set(name, value);
  if (isApi) {
    response.headers.set("X-API-Version", "1");
    for (const [name, value] of corsHeaders(request)) response.headers.set(name, value);
  }
  observeRequest(request.method, response.status, ms);

  if (config.LOG_REQUESTS === "1") {
    console.log(
      JSON.stringify({
        level: "info",
        msg: "request",
        requestId,
        method: request.method,
        path: url.pathname,
        status: response.status,
        ms: Math.round(ms),
        ip,
      }),
    );
  }
  return response;
};
