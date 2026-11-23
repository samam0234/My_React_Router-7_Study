import type { z } from "zod";
import { badRequest, validationError, type FieldErrors } from "./errors";

/** zod 오류를 { 필드: [메시지] } 모양으로 바꾼다. 폼과 API가 같은 모양을 쓴다. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

/** 검증에 성공하면 정제된 값을, 실패하면 VALIDATION_ERROR를 던진다. */
export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw validationError(toFieldErrors(result.error));
}

/** 숫자가 아닌 id는 스펙대로 400 BAD_REQUEST로 거절한다. */
export function parseId(value: string | undefined): number {
  const id = Number(value);
  if (!value || !Number.isInteger(id) || id < 1) {
    throw badRequest("id는 1 이상의 정수여야 합니다.");
  }
  return id;
}
