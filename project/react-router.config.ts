import type { Config } from "@react-router/dev/config";

export default {
  // 서버에서 HTML을 먼저 만든다(SSR). false로 바꾸면 SPA 모드가 된다.
  ssr: true,
  // 7.18에서 켤 수 있는 v8 동작. 지금 켜 두면 v8로 올릴 때 코드를 고칠 일이 줄어든다.
  future: {
    v8_middleware: true,
    v8_splitRouteModules: true,
    v8_viteEnvironmentApi: true,
    v8_passThroughRequests: true,
    v8_trailingSlashAwareDataRequests: true,
  },
} satisfies Config;
