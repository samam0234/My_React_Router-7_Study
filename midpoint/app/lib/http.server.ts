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
    headers.set("Access-Control-Expose-Headers", "X-Request-Id, Location");
  }
  return headers;
}

export function preflight(request: Request): Response {
  const headers = corsHeaders(request);
  if (headers.has("Access-Control-Allow-Origin")) {
    headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-Id");
    headers.set("Access-Control-Max-Age", "600");
  }
  return new Response(null, { status: 204, headers });
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
