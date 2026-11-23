// 테스트는 항상 메모리 DB와 가짜 비밀키를 쓴다. 실제 .env는 읽지 않는다.
process.env.SESSION_SECRET = "test-session-secret-0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-0123456789abcdefghij";
process.env.DATABASE_PATH = ":memory:";
process.env.CORS_ORIGIN = "http://localhost:5173";
process.env.LOG_REQUESTS = "0";
