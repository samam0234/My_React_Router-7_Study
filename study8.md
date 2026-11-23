# study8 — 구조화·재사용

> 기준: [노션 · React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06). 코드: [midpoint/app/](midpoint/app/) 전체의 구조, [midpoint/app/lib/](midpoint/app/lib/), [midpoint/app/config.server.ts](midpoint/app/config.server.ts).

## ① 목표 한 줄

폴더 구조를 정리하고, 공통 모듈과 유틸을 분리하며, 설정·환경변수를 한 곳으로 모아 코드 중복을 줄이고, 개발·운영 설정을 나눈다.

## ② 📖 이론

### 왜 구조가 중요한가

처음 100줄은 어떻게 짜도 됩니다. 하지만 기능이 열 개가 되면 "어디에 있지?", "고치면 어디가 깨지지?"가 비용이 됩니다. 좋은 구조는 **찾기 쉽게** 하고 **바꾸기 안전하게** 합니다.

### 핵심 원칙

1. **바뀌는 이유가 같은 것끼리 모은다.** 화면 모양(`components`), 업무 규칙(`services`), DB(`db`), 작은 도구(`lib`)는 바뀌는 이유가 다르다.
2. **의존성은 한 방향으로만 흐른다.** 아래 화살표를 거꾸로 거슬러 import하지 않는다.
3. **같은 코드를 세 번 쓰면 뽑는다.** 두 번까지는 참는다(성급한 추상화는 더 나쁘다).
4. **환경이 다른 것은 코드가 아니라 설정으로 나눈다.**

```text
routes ──▶ services ──▶ db(repo)         routes/components ──▶ lib(작은 도구)
  │             │                         services ──▶ lib
  └──▶ components                         lib은 아무것도 의존하지 않는다(맨 아래)
(위에서 아래로만. services가 routes를 import하면 안 된다)
```

### React Router 7의 규칙: `.server`와 `.client`

| 이름 | 의미 |
| --- | --- |
| `*.server.ts` | **서버 번들에만** 들어간다. 브라우저 코드가 value로 import하면 빌드가 막는다. 비밀값·DB·파일 접근은 여기에 둔다 |
| `*.client.ts` | 브라우저에서만 실행(서버에서 import하면 빈 값) |
| `lib/schemas.ts`처럼 접미사 없음 | 서버·브라우저 **양쪽**에서 쓰는 순수한 코드(zod 스키마·포매터). 비밀값·DB 금지 |

이 규칙 덕분에 "실수로 DB 비밀번호가 브라우저로 나가는" 사고를 **빌드가 막아 줍니다.** 라우트 파일(`routes/*.tsx`)은 예외적으로 양쪽에서 읽히지만, `loader`·`action`·`middleware`에서만 쓰는 `.server` import는 브라우저 번들에서 자동으로 제거됩니다.

### 비유

폴더 구조는 **주방의 동선**입니다. 재료 손질대(`lib`) · 불판(`services`) · 냉장고(`db`) · 서빙 카운터(`routes`/`components`)가 정해진 자리에 있으면 누가 와도 헤매지 않습니다. `.server`는 **주방 직원 전용 출입문**이고, 손님(브라우저)은 들어올 수 없습니다.

## ③ 🛠️ 실기 — 전체 코드와 줄별 설명

### 1. 폴더 구조와 각 폴더의 역할

```text
app/
├─ root.tsx · routes.ts · entry.server.tsx · app.css        프레임워크가 정한 이름(바꾸지 않는다)
├─ routes/        라우트 모듈. 얇게: 읽기 → 서비스 호출 → 응답
│  ├─ api/        JSON을 돌려주는 리소스 라우트(스펙 v1)
│  └─ posts/      /posts 아래 화면(layout, list, detail, new, edit)
├─ components/    재사용 UI(props로만 동작, 서버 코드를 모른다)
├─ services/      업무 규칙(검증·권한·흐름). *.server.ts
├─ db/            저장소 인터페이스(types.ts) + 구현(sqlite.server.ts) + 연결(index.server.ts)
├─ middleware/    요청마다 먼저 도는 함수(요청번호·CORS·인증)
├─ lib/           공통 도구: errors, schemas, validate, http, api, form, session …
├─ context.ts     요청 안에서 값을 나눠 쓰는 열쇠
├─ session.server.ts · config.server.ts                      서버 전용 단일 창구
tests/            Vitest
tools/            실제 서버를 띄워 HTTP로 검증하는 스크립트
```

**어디에 둘지 헷갈릴 때의 판별표**

| 이 코드는… | 둔다 |
| --- | --- |
| 주소와 1:1로 대응하고 응답을 만든다 | `routes/` |
| 화면 조각이고 props만 받는다 | `components/` |
| "누가 무엇을 해도 되는가", 여러 단계 규칙 | `services/` |
| SQL·DB 드라이버·파일 | `db/` |
| 서버·브라우저 모두 쓰는 순수 함수(검증 규칙, 날짜 포맷) | `lib/*.ts` |
| 서버에서만 쓰는 도구(해시, 토큰, 응답 만들기) | `lib/*.server.ts` |

### 2. 경로 별칭 `~`: 상대 경로 지옥 탈출

**`midpoint/tsconfig.json`** — 실제 파일 17–19줄 · [파일 열기](midpoint/tsconfig.json#L17-L19)

```json
"paths": {
  "~/*": ["./app/*"]
},
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>"paths": {</code> | TypeScript에게 별칭을 알려 준다. |
| 2–3 | <code>"~/*": ["./app/*"]</code> | `~/lib/errors`는 어디서 쓰든 `app/lib/errors`를 뜻한다. `../../../lib/errors`처럼 깊이를 세지 않아도 된다. Vite(`resolve.tsconfigPaths`)와 Vitest(`alias`)도 같은 규칙을 쓴다. |

**`midpoint/vitest.config.ts`** — 실제 파일 5–14줄 · [파일 열기](midpoint/vitest.config.ts#L5-L14)

```ts
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
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export default defineConfig({</code> | 테스트 도구 설정. 앱 설정(`vite.config.ts`)과 **일부러 분리**한다. |
| 2 | <code>resolve: {</code> | 모듈 해석 규칙. |
| 3–4 | <code>alias: { "~": fileURLToPath(new URL("./app", i…</code> | 테스트에서도 `~/…` import가 동작하게 한다. |
| 5 | <code>test: {</code> | Vitest 옵션. |
| 6 | <code>include: ["tests/**/*.test.{ts,tsx}"],</code> | 이 패턴의 파일만 테스트로 실행한다. |
| 7 | <code>environment: "node",</code> | 기본은 Node. 컴포넌트 테스트 파일만 `// @vitest-environment jsdom`으로 브라우저 흉내를 쓴다. |
| 8–10 | <code>setupFiles: ["tests/setup.ts"],</code> | 모든 테스트 전에 실행할 파일(가짜 환경변수 설정). |

### 3. 공통 오류: 한 곳에서 정의하고 어디서나 던진다

**`midpoint/app/lib/errors.ts`** — 실제 파일 18–46줄 · [파일 열기](midpoint/app/lib/errors.ts#L18-L46)

```ts
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
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1–2 | <code>export const badRequest = (message = "요청 형식이 올…</code> | 400 `BAD_REQUEST`: JSON 문법 오류, 숫자가 아닌 id. |
| 4–5 | <code>export const validationError = (fields: FieldE…</code> | 400 `VALIDATION_ERROR` + 필드별 메시지. |
| 7–10 | <code>export const unauthorized = (message = "로그인이 필…</code> | 401: 로그인이 필요하다. |
| 11–12 | <code>export const invalidCredentials = () =&gt;</code> | 401: 로그인 실패. 이메일·비밀번호 중 어느 쪽인지 알려 주지 않는다. |
| 14–15 | <code>export const forbidden = (message = "권한이 없습니다.…</code> | 403: 권한 없음. |
| 17–18 | <code>export const notFound = (message = "찾을 수 없습니다.…</code> | 404: 없는 자원. |
| 20–23 | <code>export const emailTaken = () =&gt;</code> | 409: 중복 이메일. 필드 오류(`email`)도 함께 담는다. |
| 25–26 | <code>export const payloadTooLarge = (message = "요청이…</code> | 413: 크기 초과. |
| 28–29 | <code>export const rateLimited = (message = "요청이 너무 …</code> | 429: 호출 제한. |

호출하는 쪽은 `throw notFound("글을 찾을 수 없습니다.")` 한 줄이면 됩니다. 상태 코드·`code` 문자열을 곳곳에 **복사해 쓰지 않으므로** 스펙이 바뀌어도 이 파일만 고칩니다.

### 4. 공통 미들웨어: 횡단 관심사를 한 곳에

**`midpoint/app/middleware/request.server.ts`** — 실제 파일 10–41줄 · [파일 열기](midpoint/app/middleware/request.server.ts#L10-L41)

```ts
export const requestMiddleware: MiddlewareFunction<Response> = async (
  { request, url, context },
  next,
) => {
  const started = performance.now();
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  context.set(requestIdContext, requestId);

  const isApi = url.pathname.startsWith("/api/");
  const response =
    isApi && request.method === "OPTIONS" ? preflight(request) : await next();

  response.headers.set("X-Request-Id", requestId);
  if (isApi) {
    for (const [name, value] of corsHeaders(request)) response.headers.set(name, value);
  }

  if (getConfig().LOG_REQUESTS === "1") {
    console.log(
      JSON.stringify({
        level: "info",
        msg: "request",
        requestId,
        method: request.method,
        path: url.pathname,
        status: response.status,
        ms: Math.round(performance.now() - started),
      }),
    );
  }
  return response;
};
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1–4 | <code>export const requestMiddleware: MiddlewareFunc…</code> | 모든 요청의 **바깥 껍질**. 로그·요청번호·CORS처럼 "모든 곳에 필요한 것"은 라우트마다 쓰지 않고 여기서 한 번만 한다. |
| 5 | <code>const started = performance.now();</code> | 걸린 시간을 재기 시작한다. |
| 6 | <code>const requestId = request.headers.get("x-reque…</code> | 들어온 `X-Request-Id`가 있으면 쓰고(프록시·클라이언트가 이미 붙였을 수 있다) 없으면 새로 만든다. |
| 7 | <code>context.set(requestIdContext, requestId);</code> | 이후 단계(오류 응답 등)가 같은 번호를 쓰도록 요청 저장소에 넣는다. |
| 9 | <code>const isApi = url.pathname.startsWith("/api/")…</code> | `/api/`로 시작하면 API 요청. |
| 10–11 | <code>const response =</code> | API의 사전 확인(`OPTIONS`)은 `next()`를 부르지 않고 바로 답한다. 나머지는 `await next()`로 **안쪽 단계를 실행하고 응답을 받아 온다**. |
| 13 | <code>response.headers.set("X-Request-Id", requestId…</code> | **나올 때**: 응답에 요청번호를 붙인다. |
| 14–16 | <code>if (isApi) {</code> | API 응답에만 CORS 헤더를 붙인다. |
| 18 | <code>if (getConfig().LOG_REQUESTS === "1") {</code> | 환경변수로 로그를 끌 수 있다(테스트에서는 끈다). |
| 19–30 | <code>console.log(</code> | **JSON 한 줄** 로그: 사람은 읽기 어렵지만 로그 도구가 필드로 검색한다(study9). |
| 31–32 | <code>return response;</code> | 응답을 그대로 위로 돌려준다. |

### 5. 중복 줄이기: 같은 폼, 같은 오류 처리

글쓰기(`new.tsx`)와 수정(`edit.tsx`)은 **같은 폼**을 씁니다. 차이는 "처음에 채워 둘 값"과 "제출 버튼 글자"뿐입니다.

**`midpoint/app/routes/posts/edit.tsx`** — 실제 파일 45–57줄 · [파일 열기](midpoint/app/routes/posts/edit.tsx#L45-L57)

```tsx
export default function EditPost({ loaderData, actionData }: Route.ComponentProps) {
  const { post } = loaderData;
  return (
    <>
      <h2 className="mb-4 text-xl font-semibold">글 수정</h2>
      <PostForm
        submitLabel="저장"
        defaults={{ title: post.title, body: post.body, tags: post.tags.join(", ") }}
        failure={actionData as FormFailure | undefined}
      />
    </>
  );
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export default function EditPost({ loaderData,…</code> | 수정 화면. |
| 2–4 | <code>const { post } = loaderData;</code> | `loader`가 읽어 준 글. |
| 5 | <code>&lt;h2 className="mb-4 text-xl font-semibold"&gt;글 수…</code> | 소제목. |
| 6 | <code>&lt;PostForm</code> | **같은 컴포넌트를 재사용**한다. 폼의 모양·검증 메시지·중복 제출 방지를 고치면 글쓰기와 수정이 함께 좋아진다. |
| 7 | <code>submitLabel="저장"</code> | 글쓰기는 "등록", 수정은 "저장". |
| 8 | <code>defaults={{ title: post.title, body: post.body…</code> | 수정은 기존 값으로 채운다(`tags`는 배열을 `", "`로 이어 문자열로). |
| 9–13 | <code>failure={actionData as FormFailure &#124; undefined…</code> | 서버가 돌려준 검증 오류가 있으면 그것으로 다시 채운다. |

**이 저장소에서 "세 번 이상 쓰여서 뽑은" 것들**

| 뽑은 것 | 쓰이는 곳 | 없었다면 |
| --- | --- | --- |
| `api()` 래퍼 | API 라우트 파일 9개(핸들러 13개) | 핸들러마다 `try/catch` + 오류 변환 13번 |
| `parseOrThrow` | 서비스 5곳(가입·로그인·글 작성·글 수정·댓글) | `safeParse` → 오류 변환 5번 |
| `readFields` + `failure` | 폼 `action` 5개(로그인·가입·글쓰기·수정·상세) | `form.get` + 오류 처리 5번 |
| `PostForm` | 글쓰기·수정 | 폼 마크업 2벌 |
| `routeError` | 상세·수정 화면의 `loader`·`action` 4곳 | 서비스 오류 → 404/403 변환 4번 |

> 반대로 **두 번만 쓰인 것은 뽑지 않았습니다.** `FieldError`처럼 작은 것은 뽑았지만, 로그인·가입 화면의 입력칸 마크업은 서로 조금씩 달라서 그대로 두었습니다.

### 6. 설정·환경변수 분리 (개발 ↔ 운영)

study6의 `config.server.ts`가 **유일한 창구**입니다. 다른 파일이 `process.env.X`를 직접 읽으면 오타·누락·기본값 불일치가 흩어집니다.

| 설정 | 개발(`npm run dev`) | 운영(`npm start`·컨테이너) | 어디서 정하나 |
| --- | --- | --- | --- |
| `NODE_ENV` | `development` | `production` | 스크립트·Dockerfile(`ENV NODE_ENV=production`) |
| 쿠키 `Secure` | `false`(HTTP 개발 가능) | `true`(HTTPS 필수) | `cookieSecure`: `COOKIE_SECURE` 명시 > `NODE_ENV` |
| 오류 화면의 스택 | **보임** | **숨김** | `root.tsx`의 `import.meta.env.DEV` |
| 비밀키 | `.env`(내 PC) | 서버 환경변수·시크릿 | 같은 이름, 값만 다름 |
| DB | `./data/board.db` | `/app/data/board.db` 볼륨 | `DATABASE_PATH` |
| CORS | `http://localhost:5173` | 실제 프런트 도메인 | `CORS_ORIGIN` |
| 요청 로그 | 켬 | 켬(수집기가 읽음) | `LOG_REQUESTS` |
| 테스트 | `:memory:` 등 | — | `tests/setup.ts` |

**`midpoint/app/config.server.ts`** — 실제 파일 32–40줄 · [파일 열기](midpoint/app/config.server.ts#L32-L40)

```ts
cached = {
  ...env,
  corsOrigins: env.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  cookieSecure: env.COOKIE_SECURE
    ? env.COOKIE_SECURE === "true"
    : env.NODE_ENV === "production",
};
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>cached = {</code> | 검증을 통과한 값에 **가공한 값**을 더해 저장한다. |
| 2 | <code>...env,</code> | 원래 환경변수 값들. |
| 3–5 | <code>corsOrigins: env.CORS_ORIGIN.split(",")</code> | `"http://a, http://b"` 같은 문자열을 `["http://a", "http://b"]` 배열로. 쓰는 쪽은 문자열 조작을 하지 않는다. |
| 6–9 | <code>cookieSecure: env.COOKIE_SECURE</code> | 환경별 기본값을 **한 곳에서** 정한다. `COOKIE_SECURE`를 명시하면 그것을, 아니면 `production`일 때만 `true`. |

### 7.18 미래 플래그도 "설정"이다

`react-router.config.ts`의 `future`(study0)처럼 **프레임워크의 동작 선택**도 코드가 아니라 설정 한 곳에서 켜고 끕니다. 7.18에서 `v8_*` 플래그를 켜 두면 v8로 올릴 때 바꿀 코드가 줄어듭니다.

## ④ 🔗 연동 포인트

### 개발·운영 설정을 나누는 방법

1. **같은 이름의 환경변수**를 쓰고 **값만** 환경별로 다르게 줍니다(코드에 `if (production)` 분기를 흩뿌리지 않는다).
2. `.env.example`(Git에 포함)이 **필요한 변수의 목록과 설명**입니다. 새 변수를 추가하면 `config.server.ts`의 스키마와 `.env.example`을 함께 고칩니다.
3. 운영에서 빠진 변수가 있으면 서버가 **시작 단계에서** 이유를 적어 실패합니다(운영 중 첫 요청에서 터지지 않는다).
4. 환경 차이는 **세 층**으로 나눕니다: 빌드(`npm run build` — 환경 무관), 실행 설정(환경변수), 인프라(compose·서버).

### 중복 점검 체크 방법

```powershell
# 같은 코드를 여러 번 쓰고 있지 않은지 눈으로 확인하는 간단한 검색
Get-ChildItem midpoint/app/routes -Recurse -File | Select-String -Pattern "catch \(error\)" | Measure-Object
Get-ChildItem midpoint/app -Recurse -File | Select-String -Pattern "process\.env" | Select-Object Path   # config.server.ts 한 곳뿐이어야 한다
```

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `Server-only module referenced by client` 빌드 오류 | 컴포넌트·`lib`(접미사 없음)가 `.server` 모듈을 value로 import | 서버 코드는 `loader`·`action`에서만 호출하고 컴포넌트는 `loaderData`로 받는다. 타입만 필요하면 `import type` |
| 순환 import(`Cannot access 'x' before initialization`) | `services/a`가 `services/b`를, `b`가 `a`를 import | 공통 부분을 제3의 모듈로 뺀다. 의존성 방향 다이어그램을 다시 확인 |
| `process.env.X`가 브라우저에서 `undefined` | 서버 환경변수는 브라우저로 가지 않는다(당연한 보호) | 브라우저가 알아야 하는 값은 `loader`로 내려 주거나 `VITE_` 접두사(**공개되어도 되는 값만**) |
| 개발에선 되는데 운영에서 `환경변수 오류` | 운영 환경에 변수를 안 넣음 | 서버 설정·compose의 `environment`를 `.env.example`과 비교 |
| 설정을 바꿨는데 반영 안 됨 | `getConfig()`가 첫 호출 결과를 캐시 | 서버를 재시작한다(테스트는 `resetConfigForTest()`) |
| 파일이 너무 많아 어디 있는지 모름 | 역할별 폴더 대신 기능별로 흩어짐 | 위 판별표로 다시 분류. 기능이 커지면 `features/posts/…`처럼 **기능 단위 폴더**로 묶는 방법도 있다 |
| `~/…` import가 에디터에서만 빨간 줄 | `tsconfig.json`의 `paths`를 에디터가 못 읽음 | VS Code의 TypeScript 서버 재시작(`TypeScript: Restart TS Server`) |
| 공통 컴포넌트가 점점 props 10개 | 성급한 추상화 | 조건 분기가 늘어나면 컴포넌트를 둘로 나눈다 |

## ⑥ 직접 해보기

1. `grep`/`Select-String`으로 `process.env`가 `config.server.ts`, `tests/setup.ts` 외에 쓰였는지 확인한다. 새 환경변수 `APP_NAME`을 하나 추가하는 과정(스키마 → `.env.example` → 사용처)을 순서대로 해 본다.
2. `routes/posts/new.tsx`와 `routes/posts/edit.tsx`의 `action`을 나란히 놓고 **무엇이 같고 무엇이 다른지** 표로 정리한 뒤, 같은 부분을 하나의 함수로 뽑을 가치가 있는지 판단해 한 줄로 적는다(뽑지 않기로 한 이유도 좋은 답이다).
3. `NODE_ENV=production`으로 빌드·실행(`npm run build && $env:NODE_ENV="production"; npm start`)해 `/없는/주소`가 보여 주는 오류 화면과 `npm run dev`의 오류 화면(스택 표시)을 비교한다.

## ⑦ ☐ 체크리스트

- [ ] 폴더(`routes`·`components`·`services`·`db`·`lib`·`middleware`)가 각각 무엇을 맡는지, 의존성 방향을 그림으로 그릴 수 있다.
- [ ] `.server` 접미사가 브라우저 번들에서 코드를 제외하는 규칙임을 알고, 어느 파일이 `.server`여야 하는지 판단할 수 있다.
- [ ] 공통 모듈(`errors`, `api()`, `parseOrThrow`, `PostForm`)로 중복이 줄어든 지점을 세 곳 이상 가리킬 수 있다.
- [ ] 환경변수를 `config.server.ts` 한 곳에서만 읽고, 잘못 주면 시작 단계에서 실패함을 확인했다.
- [ ] 개발과 운영의 차이(쿠키 `Secure`, 스택 노출, DB 경로, CORS)가 **코드가 아니라 설정**으로 나뉘어 있음을 설명할 수 있다.

## ⑧ 다음 단계 연결

구조가 정리됐으니 [study9.md](study9.md)에서 이 구조의 장점(층마다 따로 시험할 수 있음)을 살려 **테스트·디버깅**을 하고, DB와 외부 API를 **가짜(mock)**로 바꾸는 법을 익힙니다.
