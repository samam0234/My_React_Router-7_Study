export type FieldErrors = Record<string, string[]>;

/** 사용자에게 보여 줘도 되는 오류. 상태 코드와 공통 오류 code를 함께 가진다. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: FieldErrors;

  constructor(status: number, code: string, message: string, fields?: FieldErrors) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (message = "요청 형식이 올바르지 않습니다.") =>
  new AppError(400, "BAD_REQUEST", message);

export const validationError = (fields: FieldErrors) =>
  new AppError(400, "VALIDATION_ERROR", "입력값을 확인하세요.", fields);

export const unauthorized = (message = "로그인이 필요합니다.") =>
  new AppError(401, "UNAUTHORIZED", message);

// 이메일과 비밀번호 중 무엇이 틀렸는지 알려 주지 않는다.
export const invalidCredentials = () =>
  new AppError(401, "INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다.");

export const forbidden = (message = "권한이 없습니다.") =>
  new AppError(403, "FORBIDDEN", message);

export const notFound = (message = "찾을 수 없습니다.") =>
  new AppError(404, "NOT_FOUND", message);

export const emailTaken = () =>
  new AppError(409, "EMAIL_TAKEN", "이미 가입된 이메일입니다.", {
    email: ["이미 가입된 이메일입니다."],
  });

export const payloadTooLarge = (message = "요청이 너무 큽니다.") =>
  new AppError(413, "PAYLOAD_TOO_LARGE", message);

export const rateLimited = (message = "요청이 너무 많습니다. 잠시 후 다시 시도하세요.") =>
  new AppError(429, "RATE_LIMITED", message);
