import { data } from "react-router";
import { AppError } from "./errors";

/**
 * 서비스가 던진 AppError를 "화면용 오류 응답"으로 바꿔 다시 던진다.
 * data(메시지, { status })를 던지면 가장 가까운 ErrorBoundary가 상태 코드와 메시지를 받아 그린다.
 * 그냥 AppError를 던지면 "예상 밖 오류"로 취급돼 500 화면이 된다.
 */
export function routeError(error: unknown): never {
  if (error instanceof AppError) {
    // 화면 주소의 id가 숫자가 아니면(예: /posts/abc) "그런 페이지는 없다"가 맞으므로 400을 404로 본다.
    const status = error.code === "BAD_REQUEST" ? 404 : error.status;
    throw data(status === 404 ? "찾을 수 없습니다." : error.message, { status });
  }
  throw error;
}
