import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 테스트에는 reactRouter() 플러그인을 넣지 않는다. 라우트 모듈 변환은 빌드 전용이다.
export default defineConfig({
  resolve: {
    alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
    setupFiles: ["tests/setup.ts"],
  },
});
