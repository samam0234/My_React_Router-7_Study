import { data } from "react-router";
import { AppError, type FieldErrors } from "./errors";

/** FormData에서 문자열 필드만 꺼낸다. 파일 필드나 빠진 필드는 빈 문자열이 된다. */
export function readFields<K extends string>(form: FormData, keys: readonly K[]): Record<K, string> {
  const values = {} as Record<K, string>;
  for (const key of keys) {
    const value = form.get(key);
    values[key] = typeof value === "string" ? value : "";
  }
  return values;
}

export type FormFailure = {
  errors: FieldErrors;
  formError?: string;
  values: Record<string, string>;
};

/**
 * action에서 AppError를 화면용 데이터로 바꾼다. 상태 코드는 그대로 유지한다(400, 401, 409 …).
 * 예상하지 못한 오류는 다시 던져서 ErrorBoundary가 받게 한다.
 */
export function failure(error: unknown, values: Record<string, string>) {
  if (error instanceof AppError) {
    const body: FormFailure = {
      errors: error.fields ?? {},
      formError: error.fields ? undefined : error.message,
      values,
    };
    return data(body, { status: error.status });
  }
  throw error;
}
