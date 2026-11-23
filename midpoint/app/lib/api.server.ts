import type { RouterContextProvider } from "react-router";
import { requestIdContext } from "~/context";
import { AppError } from "./errors";
import { errorResponse } from "./http.server";

/**
 * API 핸들러를 감싸서, 던져진 AppError를 공통 오류 JSON으로 바꾼다.
 * 라우트 파일은 정상 흐름만 쓰고 오류는 던지면 된다.
 */
export function api<A extends { context: Readonly<RouterContextProvider> }>(
  handler: (args: A) => Promise<Response> | Response,
) {
  return async (args: A): Promise<Response> => {
    try {
      return await handler(args);
    } catch (error) {
      return errorResponse(error, args.context.get(requestIdContext));
    }
  };
}

export const methodNotAllowed = (method: string) =>
  new AppError(405, "METHOD_NOT_ALLOWED", `${method} 메서드는 지원하지 않습니다.`);
