import { createHash } from "node:crypto";
import { getConfig } from "~/config.server";
import { AppError } from "./errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** 브라우저가 보낸 Origin이 같은 사이트이거나 CORS_ORIGIN 허용 목록에 있는지. Origin이 없으면(curl 등) 통과. */
export function isTrustedOrigin(request: Request, url: URL): boolean {
  if (SAFE_METHODS.has(request.method)) return true;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === url.host || getConfig().corsOrigins.includes(origin);
  } catch {
    return false;
  }
}

/** 허용된 출처에만 CORS 헤더를 붙인다. 허용 목록 밖이면 아무것도 붙이지 않는다. */
export function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  if (origin && getConfig().corsOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Expose-Headers", "X-Request-Id, Location, Link, X-Total-Count, ETag, Retry-After");
  }
  return headers;
}

export function preflight(request: Request): Response {
  const headers = corsHeaders(request);
  if (headers.has("Access-Control-Allow-Origin")) {
    headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-Id, If-None-Match");
    headers.set("Access-Control-Max-Age", "600");
  }
  return new Response(null, { status: 204, headers });
}

/** 보안 헤더. 모든 응답(화면·API)에 붙인다. */
export function securityHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
  // HTTPS로 서비스할 때만: 브라우저가 앞으로 6개월간 HTTP로 접속하지 못하게 한다.
  if (getConfig().cookieSecure) headers["Strict-Transport-Security"] = "max-age=15552000; includeSubDomains";
  return headers;
}

/** 모든 JSON 응답의 단일 창구. 스펙 v1 7절: Content-Type은 항상 application/json; charset=utf-8. charset이 없으면 일부 클라이언트(Windows PowerShell 5.1 등)가 한글을 Latin-1로 잘못 해석한다. */
export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

/** 성공 응답: { data, meta? } */
export function ok(data: unknown, init?: { status?: number; meta?: unknown; headers?: HeadersInit }) {
  return jsonResponse(init?.meta ? { data, meta: init.meta } : { data }, {
    status: init?.status ?? 200,
    headers: init?.headers,
  });
}

/**
 * 조건부 GET: 본문의 해시를 ETag로 달고, 클라이언트가 If-None-Match로 같은 값을 보내면 본문 없이 304를 돌려준다.
 * 바뀌지 않은 목록을 다시 내려받는 비용(전송량)을 줄인다. 서버의 계산 비용은 줄지 않는다는 점에 주의.
 */
export function okConditional(request: Request, data: unknown, init?: { meta?: unknown; headers?: Record<string, string> }) {
  const body = JSON.stringify(init?.meta ? { data, meta: init.meta } : { data });
  const etag = `W/"${createHash("sha1").update(body).digest("base64url").slice(0, 20)}"`;
  const headers = { ...init?.headers, ETag: etag, "Cache-Control": "public, max-age=0, must-revalidate" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(body, { status: 200, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
}

/** RFC 8288 Link 헤더: 다음·이전 쪽 주소를 헤더로도 알려 준다. */
export function paginationLinks(url: URL, meta: { page: number; totalPages: number }): string {
  const link = (page: number, rel: string) => {
    const next = new URL(url);
    next.searchParams.set("page", String(page));
    return `<${next.pathname}${next.search}>; rel="${rel}"`;
  };
  const parts = [link(1, "first"), link(meta.totalPages, "last")];
  if (meta.page > 1) parts.push(link(meta.page - 1, "prev"));
  if (meta.page < meta.totalPages) parts.push(link(meta.page + 1, "next"));
  return parts.join(", ");
}

export function noContent() {
  return new Response(null, { status: 204 });
}

/** 모든 4xx·5xx 공통 오류 본문. 예외 원문과 스택은 응답에 넣지 않고 로그에만 남긴다. */
export function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof AppError) {
    return jsonResponse(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.fields ? { fields: error.fields } : {}),
          requestId,
        },
      },
      { status: error.status },
    );
  }
  if (error instanceof Response) return error;
  console.error(JSON.stringify({ level: "error", msg: "unhandled", requestId, error: String(error) }));
  return jsonResponse(
    { error: { code: "INTERNAL", message: "서버 오류가 발생했습니다.", requestId } },
    { status: 500 },
  );
}

/** JSON 본문을 읽는다. 문법 오류는 BAD_REQUEST로 바꾼다. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError(400, "BAD_REQUEST", "JSON 형식이 올바르지 않습니다.");
  }
}
