import { z } from "zod";

// 환경변수는 한 곳에서만 읽고 검증한다. 다른 파일은 process.env를 직접 만지지 않는다.
const flag = z.enum(["0", "1"]);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ORIGIN: z.string().default("http://localhost:3000"),

  // 보안
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET은 32자 이상이어야 합니다."),
  JWT_SECRET: z.string().min(32, "JWT_SECRET은 32자 이상이어야 합니다."),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  CORS_ORIGIN: z.string().default(""),
  RATE_LIMIT: flag.default("1"),
  RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_API_PER_MIN: z.coerce.number().int().positive().default(300),
  TRUST_PROXY: flag.default("0"), // 1이면 리버스 프록시 뒤에서 X-Forwarded-For를 믿는다
  METRICS_TOKEN: z.string().default(""), // 비우면 /metrics 비활성화

  // 데이터베이스: sqlite는 DATABASE_PATH, 나머지는 DATABASE_URL
  DB_DRIVER: z.enum(["sqlite", "postgres", "mariadb", "mongo"]).default("sqlite"),
  DATABASE_PATH: z.string().default("./data/board.db"),
  DATABASE_URL: z.string().default(""),

  // 메일
  MAIL_DRIVER: z.enum(["log", "resend"]).default("log"),
  MAIL_FROM: z.string().default("RR7 Board <onboarding@resend.dev>"),
  RESEND_API_KEY: z.string().default(""),
  RESEND_BASE_URL: z.string().default("https://api.resend.com"),

  // 결제(Stripe 테스트 모드)
  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_PRICE_ID: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),
  STRIPE_BASE_URL: z.string().default("https://api.stripe.com"),

  // 소셜 로그인(GitHub OAuth)
  GITHUB_CLIENT_ID: z.string().default(""),
  GITHUB_CLIENT_SECRET: z.string().default(""),
  GITHUB_AUTHORIZE_URL: z.string().default("https://github.com/login/oauth/authorize"),
  GITHUB_TOKEN_URL: z.string().default("https://github.com/login/oauth/access_token"),
  GITHUB_API_URL: z.string().default("https://api.github.com"),

  // 파일 업로드
  UPLOAD_DIR: z.string().default("./data/uploads"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(2_000_000),

  // AI(Ollama)
  OLLAMA_BASE_URL: z.string().default("http://127.0.0.1:11434"),
  AI_MODEL: z.string().default("gemma4:12b"),

  // 운영
  LOG_REQUESTS: flag.default("1"),
  BACKUP_DIR: z.string().default("./data/backups"),
});

export type AppConfig = z.infer<typeof envSchema> & {
  corsOrigins: string[];
  cookieSecure: boolean;
};

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (cached) return cached;
  // .env에 `KEY=` 처럼 비워 둔 값은 "설정 안 함"으로 보고 기본값을 쓴다.
  const source = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ""));
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`환경변수 오류 — ${detail}. .env.example을 복사해 .env를 만드세요.`);
  }
  const env = parsed.data;
  if (env.DB_DRIVER !== "sqlite" && !env.DATABASE_URL) {
    throw new Error(`환경변수 오류 — DB_DRIVER=${env.DB_DRIVER} 에는 DATABASE_URL이 필요합니다.`);
  }
  cached = {
    ...env,
    corsOrigins: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean),
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : env.NODE_ENV === "production",
  };
  return cached;
}

/** 테스트에서 환경변수를 바꾼 뒤 다시 읽게 한다. */
export function resetConfigForTest() {
  cached = undefined;
}
