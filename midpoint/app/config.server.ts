import { z } from "zod";

// 환경변수는 한 곳에서만 읽고 검증한다. 다른 파일은 process.env를 직접 만지지 않는다.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET은 32자 이상이어야 합니다."),
  JWT_SECRET: z.string().min(32, "JWT_SECRET은 32자 이상이어야 합니다."),
  DATABASE_PATH: z.string().default("./data/board.db"),
  CORS_ORIGIN: z.string().default(""),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  LOG_REQUESTS: z.enum(["0", "1"]).default("1"),
});

export type AppConfig = z.infer<typeof envSchema> & {
  corsOrigins: string[];
  cookieSecure: boolean;
};

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`환경변수 오류 — ${detail}. .env.example을 복사해 .env를 만드세요.`);
  }
  const env = parsed.data;
  cached = {
    ...env,
    corsOrigins: env.CORS_ORIGIN.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    cookieSecure: env.COOKIE_SECURE
      ? env.COOKIE_SECURE === "true"
      : env.NODE_ENV === "production",
  };
  return cached;
}

/** 테스트에서 환경변수를 바꾼 뒤 다시 읽게 한다. */
export function resetConfigForTest() {
  cached = undefined;
}
