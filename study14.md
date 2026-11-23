# study14 — API 설계

> 기준: [노션 · React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06) · **[게시판 공통 API 스펙 v1](https://app.notion.com/p/3d6d7dec5e2e8139adbfd36dd506c65e)**(이 단계가 그 스펙을 문서·버전·규칙으로 완성한다). 코드: [project/app/openapi.ts](project/app/openapi.ts), [project/app/routes.ts](project/app/routes.ts), [project/app/lib/http.server.ts](project/app/lib/http.server.ts).

## ① 목표 한 줄

REST 설계 규칙, OpenAPI(Swagger) 문서화, 버전 관리, 페이지네이션, 오류 응답 규칙을 정리하고 React Router 7의 리소스 라우트로 구현해 **문서·구현·테스트가 어긋나지 않게** 만든다.

## ② 📖 이론

### API는 "계약"이다

화면은 우리가 바꿔도 되지만 **API는 남이 이미 쓰고 있습니다**(모바일 앱, 다른 팀, MCP 도구). 그래서 API는 "구현"이 아니라 **계약**으로 설계합니다. 계약을 어기면(필드 이름 변경, 상태 코드 변경) 남의 앱이 고장 납니다.

### REST 설계 규칙 (이 저장소가 지키는 것)

| 규칙 | 좋은 예 | 나쁜 예 |
| --- | --- | --- |
| 주소는 **명사 복수형** | `/api/posts`, `/api/posts/12/comments` | `/api/getPost`, `/api/createComment` |
| **메서드가 동사** | `GET` 읽기 · `POST` 만들기 · `PATCH` 일부 수정 · `DELETE` 삭제 | `POST /api/posts/12/delete` |
| 소문자·하이픈 | `/api/post-tags` | `/api/postTags`, `/api/Post_Tags` |
| 중첩은 얕게(2단계) | `/api/posts/12/comments` | `/api/users/3/posts/12/comments/7/likes` |
| 걸러내기·정렬·쪽은 **쿼리** | `/api/posts?q=react&sort=-createdAt&page=2` | `/api/posts/search/react/page/2` |
| 수정은 `PATCH` 하나로 | 일부 필드만 | `PUT`(전체 교체)과 `PATCH`를 섞어 쓰기 |
| 응답 필드 **camelCase** | `createdAt` | `created_at`과 `createdAt` 혼용 |
| 시각은 **ISO 8601 UTC** | `2026-11-01T09:00:00Z` | `2026.11.01 오후 6시` |

**상태 코드는 약속**입니다.

| 상황 | 코드 | 본문 |
| --- | --- | --- |
| 읽기 성공 | 200 | `{ data }` / `{ data, meta }` |
| 만들기 성공 | **201** + `Location` 헤더 | 만든 자원 |
| 지우기 성공 | **204** | 없음 |
| 접수만 했고 나중에 처리 | **202** | (선택) |
| 바뀌지 않음(조건부 GET) | **304** | 없음 |
| 잘못된 요청 | 400 `BAD_REQUEST` / `VALIDATION_ERROR` | 오류 객체 |
| 로그인 필요 | 401 | 오류 객체 |
| 권한 없음 | 403 | 오류 객체 |
| 없음 | 404 | 오류 객체 |
| 충돌(중복) | 409 | 오류 객체 |
| 너무 큼 / 너무 많음 | 413 / 429(+`Retry-After`) | 오류 객체 |
| 서버 오류 | 500 | **내부 정보 없이** 일반 문구 + `requestId` |

> **401 vs 403**: 로그인 자체가 안 됨(401) / 로그인은 했는데 이 일은 금지(403). **404로 숨기기**: 남의 비공개 자원은 403 대신 404로 존재 자체를 숨길 수도 있다(이 앱의 글은 공개라 403).

### 문서화: OpenAPI

**OpenAPI**는 API를 기계가 읽을 수 있는 JSON/YAML로 적는 표준입니다. 이것 하나로 ① 사람이 읽고 직접 호출해 보는 문서(Swagger UI) ② 클라이언트 코드 자동 생성 ③ 자동 검증 ④ 모의 서버 생성이 됩니다. 핵심은 **문서가 코드와 따로 놀지 않게** 하는 것입니다. 이 저장소는 문서를 **코드(`openapi.ts`)로** 두고, **테스트가 검증기에 넣어** 문법 오류를 잡고, 요청 테스트가 실제 응답을 확인합니다.

### 버전 관리

| 방식 | 모양 | 특징 |
| --- | --- | --- |
| **URL 버전**(이 과정) | `/api/v1/posts` | 눈에 보이고 쉽다. 캐시·로그에 잘 맞는다 |
| 헤더 버전 | `Accept: application/vnd.board.v1+json` | 주소가 깔끔하지만 눈에 안 보인다 |
| 쿼리 버전 | `?version=1` | 비권장 |

- **깨지 않는 변경**(필드 추가, 새 엔드포인트, 선택 파라미터 추가)은 **같은 버전**에서 한다.
- **깨는 변경**(필드 삭제·이름 변경·의미 변경, 필수 파라미터 추가)은 `/api/v2`를 새로 연다. 옛 버전은 **알린 뒤 기간을 두고** 끈다(`Deprecation`·`Sunset` 헤더).
- 이 앱: `/api`는 **최신 별칭**, `/api/v1`은 **고정**. 모든 `/api` 응답에 `X-API-Version: 1`.

### 페이지네이션 두 가지

| | offset(쪽 번호) — 구현함 | cursor(커서) |
| --- | --- | --- |
| 요청 | `?page=3&limit=10` | `?after=<마지막 항목의 표지>&limit=10` |
| 장점 | 쪽 번호로 이동, 구현 쉬움, 전체 쪽 수 | **글이 계속 추가돼도 중복·누락 없음**, 깊은 쪽도 빠름(`WHERE id < ?`) |
| 단점 | 앞에서 글이 추가되면 쪽이 밀림, 큰 offset은 느림 | 임의의 쪽으로 점프 불가 |
| 쓰는 곳 | 게시판 목록 | 피드·무한 스크롤·로그 |

### 비유

API는 **식당의 메뉴판과 주문 규칙**입니다. 메뉴 이름(주소)과 주문 방법(메서드)이 정해져 있고, 주방(서버)은 "준비 완료", "재료 없음", "주문 방식이 틀렸어요"를 **정해진 신호(상태 코드)**로 알립니다. 메뉴가 바뀌면(버전) 단골이 당황하지 않게 **예전 메뉴판을 한동안 같이 둡니다.** 메뉴판(OpenAPI)이 실제 주방과 다르면 손님이 엉뚱한 주문을 하게 되므로, 메뉴판과 주방을 **정기적으로 맞춰 보는 점검**(테스트)이 필요합니다.

## ③ 🛠️ 실기 — 전체 코드와 줄별 설명

### 1. 한 구현을 두 주소(`/api`, `/api/v1`)에 마운트

**`project/app/routes.ts`** — 실제 파일 7–33줄 · [파일 열기](project/app/routes.ts#L7-L33)

```ts
const apiRoutes = (idPrefix: string) => {
  const r = (path: string, file: string) =>
    idPrefix ? route(path, `routes/api/${file}`, { id: `${idPrefix}${file}` }) : route(path, `routes/api/${file}`);
  return [
    r("auth/signup", "auth-signup.ts"),
    r("auth/login", "auth-login.ts"),
    r("auth/logout", "auth-logout.ts"),
    r("auth/me", "auth-me.ts"),
    r("auth/ws-ticket", "auth-ws-ticket.ts"),
    r("posts", "posts.ts"),
    r("posts/:postId", "post.ts"),
    r("posts/:postId/comments", "post-comments.ts"),
    r("comments/:commentId", "comment.ts"),
    r("documents", "documents.ts"),
    r("documents/:documentId", "document.ts"),
    r("documents/:documentId/summarize", "document-summarize.ts"),
    r("documents/:documentId/ask", "document-ask.ts"),
    r("uploads", "uploads.ts"),
    r("contact", "contact.ts"),
    r("events", "events.ts"),
    r("export/posts.csv", "export-posts-csv.ts"),
    r("payments/checkout", "payments-checkout.ts"),
    r("payments/webhook", "payments-webhook.ts"),
    r("openapi.json", "openapi.ts"),
    r("*", "not-found.ts"), // 맨 마지막: 어떤 라우트와도 맞지 않는 /api 주소는 JSON 404
  ];
};
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>const apiRoutes = (idPrefix: string) =&gt; {</code> | API 라우트 묶음을 **함수로** 만든다. 같은 파일 목록을 두 번 쓰기 위해서다. |
| 2 | <code>const r = (path: string, file: string) =&gt;</code> | 경로와 파일 이름만 적으면 라우트 설정을 만들어 주는 도우미. |
| 3 | <code>idPrefix ? route(path, `routes/api/${file}`, {…</code> | 같은 파일을 두 번 쓰면 라우트 **id가 겹치므로**, 버전 쪽에는 `v1-파일명` 같은 id를 붙인다. |
| 4 | <code>return [</code> | 모든 API 라우트. |
| 5–9 | <code>r("auth/signup", "auth-signup.ts"),</code> | 인증 5개(가입·로그인·로그아웃·내 정보·웹소켓 티켓). |
| 10–13 | <code>r("posts", "posts.ts"),</code> | 글: `posts`, `posts/:postId`, 댓글 두 개. |
| 14–17 | <code>r("documents", "documents.ts"),</code> | 문서 AI 4개(study18). |
| 18–23 | <code>r("uploads", "uploads.ts"),</code> | 업로드·문의·실시간·내보내기·결제(study13·17). |
| 24 | <code>r("openapi.json", "openapi.ts"),</code> | **API 설명서 자체**도 API로 제공한다. |
| 25–27 | <code>r("*", "not-found.ts"), // 맨 마지막: 어떤 라우트와도 맞지 …</code> | **맨 마지막**: 어디에도 안 맞는 `/api/…`는 JSON 404. 순서가 중요하다(위에서부터 구체적인 것이 먼저 맞는다). |

**`project/app/routes.ts`** — 실제 파일 47–49줄 · [파일 열기](project/app/routes.ts#L47-L49)

```ts
// 공통 API 스펙 v1: /api (최신 별칭)와 /api/v1 (버전 고정)
...prefix("api", apiRoutes("")),
...prefix("api/v1", apiRoutes("v1-")),
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>// 공통 API 스펙 v1: /api (최신 별칭)와 /api/v1 (버전 고정)</code> | 주석. |
| 2 | <code>...prefix("api", apiRoutes("")),</code> | `/api/…` 최신 별칭. id는 파일명 그대로. |
| 3 | <code>...prefix("api/v1", apiRoutes("v1-")),</code> | `/api/v1/…` 고정 버전. 나중에 `/api/v2`를 새로 만들어도 이 줄은 건드리지 않는다. |

### 2. 문서를 코드로: OpenAPI

**`project/app/openapi.ts`** — 실제 파일 10–18줄 · [파일 열기](project/app/openapi.ts#L10-L18)

```ts
const ERRORS = {
  "400": problem("검증 실패(VALIDATION_ERROR) 또는 잘못된 요청(BAD_REQUEST)"),
  "401": problem("인증 필요(UNAUTHORIZED) 또는 로그인 실패(INVALID_CREDENTIALS)"),
  "403": problem("권한 없음(FORBIDDEN)"),
  "404": problem("없는 자원(NOT_FOUND)"),
  "409": problem("중복(EMAIL_TAKEN)"),
  "429": problem("호출 제한 초과(RATE_LIMITED). Retry-After 헤더 참고"),
} as const;
const errors = (...codes: (keyof typeof ERRORS)[]) => Object.fromEntries(codes.map((c) => [c, ERRORS[c]]));
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>const ERRORS = {</code> | **오류 응답 모양을 한 번만** 정의하고 모든 엔드포인트가 재사용한다. 중복을 줄이고 문서가 일관된다. |
| 2 | <code>"400": problem("검증 실패(VALIDATION_ERROR) 또는 잘못된…</code> | 검증 실패 또는 잘못된 요청. |
| 3 | <code>"401": problem("인증 필요(UNAUTHORIZED) 또는 로그인 실패(…</code> | 인증 필요 또는 로그인 실패. |
| 4 | <code>"403": problem("권한 없음(FORBIDDEN)"),</code> | 권한 없음. |
| 5 | <code>"404": problem("없는 자원(NOT_FOUND)"),</code> | 없음. |
| 6 | <code>"409": problem("중복(EMAIL_TAKEN)"),</code> | 중복. |
| 7 | <code>"429": problem("호출 제한 초과(RATE_LIMITED). Retry-…</code> | 호출 제한과 `Retry-After`. |
| 8 | <code>} as const;</code> | 키를 리터럴 타입으로 고정해 아래 `errors("400", "401")` 호출의 **철자 오류를 컴파일러가 잡는다.** |
| 9 | <code>const errors = (...codes: (keyof typeof ERRORS…</code> | `errors("400", "401")`처럼 필요한 코드만 골라 응답 객체를 만든다. |

**`project/app/openapi.ts`** — 실제 파일 57–74줄 · [파일 열기](project/app/openapi.ts#L57-L74)

```ts
"/posts": {
  get: {
    tags: ["posts"], summary: "글 목록(검색·정렬·페이지)", operationId: "listPosts",
    parameters: [
      { name: "q", in: "query", schema: { type: "string", maxLength: 100 }, description: "제목·본문 부분 일치(대소문자 무시)" },
      { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
      { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 10 }, description: "50 초과는 50으로 보정" },
      { name: "sort", in: "query", schema: { type: "string", enum: ["createdAt", "-createdAt", "-commentCount"], default: "-createdAt" } },
    ],
    responses: {
      "200": {
        description: "목록. `ETag`와 `Link`(first/prev/next/last), `X-Total-Count` 헤더를 함께 준다. `If-None-Match`가 같으면 304.",
        content: { "application/json": { schema: { type: "object", required: ["data", "meta"], properties: { data: { type: "array", items: ref("PostSummary") }, meta: ref("Meta") } } } },
      },
      "304": { description: "바뀌지 않음" },
    },
  },
  post: {
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>"/posts": {</code> | 경로 `/api/posts`(`servers: [{ url: "/api" }]`가 앞부분을 붙인다). |
| 2 | <code>get: {</code> | `GET` 연산. |
| 3 | <code>tags: ["posts"], summary: "글 목록(검색·정렬·페이지)", o…</code> | 문서 화면에서 묶는 이름·한 줄 설명·고유 `operationId`(클라이언트 코드 생성기가 함수 이름으로 쓴다). |
| 4 | <code>parameters: [</code> | **쿼리 파라미터 명세**. |
| 5 | <code>{ name: "q", in: "query", schema: { type: "str…</code> | 검색어(최대 100자). |
| 6 | <code>{ name: "page", in: "query", schema: { type: "…</code> | 1 이상, 기본 1. |
| 7 | <code>{ name: "limit", in: "query", schema: { type: …</code> | 1~50, 기본 10. "50 초과는 50으로 보정"이라는 **동작**을 설명에 적는다. |
| 8–9 | <code>{ name: "sort", in: "query", schema: { type: "…</code> | **허용 값 목록**(`enum`)이 곧 서버의 허용 목록이다. |
| 10 | <code>responses: {</code> | 가능한 응답들. |
| 11 | <code>"200": {</code> | 성공 응답. |
| 12–14 | <code>description: "목록. `ETag`와 `Link`(first/prev/ne…</code> | 응답 **헤더**(`ETag`, `Link`, `X-Total-Count`)도 설명에 적어 클라이언트가 알게 한다. |
| 15–17 | <code>"304": { description: "바뀌지 않음" },</code> | 조건부 요청에서 바뀌지 않은 경우. |
| 18 | <code>post: {</code> | 같은 경로의 `POST`(글 작성) 연산이 이어진다. |

문서와 검증기를 한 번에 확인합니다.

```powershell
curl.exe -s http://localhost:5173/api/openapi.json | node -e "const s=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(s.openapi, Object.keys(s.paths).length+' paths')"
# 브라우저에서 http://localhost:5173/api-docs  → Swagger UI에서 직접 "Try it out"
npx vitest run tests/advanced.test.ts -t "OpenAPI"   # swagger-parser가 OpenAPI 3.1 문법을 검증한다
```

### 3. 쪽 나누기와 조건부 요청

**`project/app/lib/http.server.ts`** — 실제 파일 73–79줄 · [파일 열기](project/app/lib/http.server.ts#L73-L79)

```ts
export function okConditional(request: Request, data: unknown, init?: { meta?: unknown; headers?: Record<string, string> }) {
  const body = JSON.stringify(init?.meta ? { data, meta: init.meta } : { data });
  const etag = `W/"${createHash("sha1").update(body).digest("base64url").slice(0, 20)}"`;
  const headers = { ...init?.headers, ETag: etag, "Cache-Control": "public, max-age=0, must-revalidate" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(body, { status: 200, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export function okConditional(request: Request…</code> | 목록처럼 **자주 읽히고 가끔 바뀌는** 응답에 쓴다. |
| 2 | <code>const body = JSON.stringify(init?.meta ? { dat…</code> | 본문을 먼저 문자열로 만든다. |
| 3 | <code>const etag = `W/"${createHash("sha1").update(b…</code> | 본문의 **해시를 짧게** 줄여 `W/"…"`(약한 ETag)로 만든다. 본문이 같으면 같은 값이 나온다. |
| 4 | <code>const headers = { ...init?.headers, ETag: etag…</code> | `ETag`와 `Cache-Control: public, max-age=0, must-revalidate`(= "저장해도 되지만 쓰기 전에 서버에 물어봐라"). |
| 5 | <code>if (request.headers.get("if-none-match") === e…</code> | 클라이언트가 가진 값이 **지금과 같으면 본문 없이 304**를 돌려준다. 전송량이 0에 가깝다. |
| 6–7 | <code>return new Response(body, { status: 200, heade…</code> | 다르면 200과 새 본문. |

**`project/app/lib/http.server.ts`** — 실제 파일 82–92줄 · [파일 열기](project/app/lib/http.server.ts#L82-L92)

```ts
export function paginationLinks(url: URL, meta: { page: number; totalPages: number }): string {
  const link = (page: number, rel: string) => {
    const next = new URL(url);
    next.searchParams.set("page", String(page));
    return `<${next.pathname}${next.search}>; rel="${rel}"`;
  };
  const parts = [link(1, "first"), link(meta.totalPages, "last")];
  if (meta.page > 1) parts.push(link(meta.page - 1, "prev"));
  if (meta.page < meta.totalPages) parts.push(link(meta.page + 1, "next"));
  return parts.join(", ");
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export function paginationLinks(url: URL, meta…</code> | RFC 8288의 `Link` 헤더를 만든다. 클라이언트가 **쪽 주소를 직접 조립하지 않고** 헤더를 따라가게 한다. |
| 2 | <code>const link = (page: number, rel: string) =&gt; {</code> | 쪽 번호를 받아 `<주소>; rel="next"` 모양 한 조각을 만든다. |
| 3–6 | <code>const next = new URL(url);</code> | **현재 요청 주소를 복사**해서 `page`만 바꾼다. `q`·`sort`·`limit`이 그대로 유지된다. |
| 7 | <code>const parts = [link(1, "first"), link(meta.tot…</code> | 처음과 마지막은 항상. |
| 8 | <code>if (meta.page &gt; 1) parts.push(link(meta.page -…</code> | 이전 쪽이 있으면 `prev`. |
| 9 | <code>if (meta.page &lt; meta.totalPages) parts.push(li…</code> | 다음 쪽이 있으면 `next`. |
| 10–11 | <code>return parts.join(", ");</code> | 쉼표로 이어 한 헤더로. |

**`project/app/routes/api/posts.ts`** — 실제 파일 7–14줄 · [파일 열기](project/app/routes/api/posts.ts#L7-L14)

```ts
// GET /api/posts?q=&page=&limit=&sort= → 200 { data: [...], meta } + ETag·Link·X-Total-Count (같으면 304)
export const loader = api(async ({ request, url }: Route.LoaderArgs) => {
  const { data, meta } = await listPosts(parseListQuery(url.searchParams));
  return okConditional(request, data, {
    meta,
    headers: { Link: paginationLinks(url, meta), "X-Total-Count": String(meta.total) },
  });
});
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>// GET /api/posts?q=&amp;page=&amp;limit=&amp;sort= → 200 …</code> | 주석. |
| 2 | <code>export const loader = api(async ({ request, ur…</code> | 목록 API. |
| 3 | <code>const { data, meta } = await listPosts(parseLi…</code> | 서비스(캐시 포함, study15). |
| 4 | <code>return okConditional(request, data, {</code> | `ETag`·304 처리 + 본문. |
| 5 | <code>meta,</code> | `{ data, meta }`의 `meta`. |
| 6–8 | <code>headers: { Link: paginationLinks(url, meta), "…</code> | `Link`(쪽 이동)와 `X-Total-Count`(전체 개수)를 헤더로도 준다. 브라우저에서 읽으려면 CORS의 `Expose-Headers`에 들어 있어야 한다(`corsHeaders`가 한다). |

```powershell
$u = "http://localhost:5173/api/posts?limit=2"
$r = curl.exe -s -i $u
$etag = ($r | Select-String -Pattern "^ETag: (.+)$").Matches[0].Groups[1].Value.Trim()   # W/"…" 모양(큰따옴표 포함)
# Windows PowerShell 5.1은 인자 안의 큰따옴표를 지워 버린다 → 백슬래시로 이스케이프해서 넘긴다
$header = "If-None-Match: " + $etag.Replace('"', '\"')
curl.exe -s -i $u -H $header | Select-Object -First 1     # HTTP/1.1 304 Not Modified
curl.exe -s -D - -o NUL $u | Select-String "Link|X-Total-Count|X-API-Version"
```

### 4. 커서 방식은 어떻게 다를까 (개념 예시 — 이 앱은 offset을 구현했다)

```ts
// GET /api/posts?after=120&limit=10  → "id가 120보다 작은 글 중 최신 10개"
const rows = await db.all(
  `SELECT … FROM posts p … WHERE p.id < ? ORDER BY p.id DESC LIMIT ?`,
  [after, limit + 1],            // 하나 더 읽어서 "다음 쪽이 있는지"를 알아낸다
);
const hasMore = rows.length > limit;
return { data: rows.slice(0, limit), meta: { nextCursor: hasMore ? rows[limit - 1].id : null } };
// OFFSET을 쓰지 않으므로 앞쪽에 글이 늘어도 중복·누락이 없고, 아무리 깊어도 인덱스로 빠르다.
```

### 5. 오류 응답 규칙을 지키는 코드는 이미 있다

모든 4xx·5xx는 하나의 모양입니다(`errorResponse`, study6). 호출 제한은 같은 모양에 `Retry-After`를 더합니다.

**`project/app/middleware/request.server.ts`** — 실제 파일 32–48줄 · [파일 열기](project/app/middleware/request.server.ts#L32-L48)

```ts
// 로그인·가입은 무차별 대입 공격 대상이라 훨씬 촘촘하게 제한한다.
const isAuth = request.method === "POST" && AUTH_PATHS.test(url.pathname);
const limit = isAuth ? config.RATE_LIMIT_AUTH_PER_MIN : config.RATE_LIMIT_API_PER_MIN;
const result =
  config.RATE_LIMIT === "1" && (isApi || isAuth) ? hit(`${ip}|${isAuth ? "auth" : "api"}`, limit) : undefined;
if (result && !result.allowed) {
  const retry = { "Retry-After": String(result.retryAfterSeconds) };
  if (!isApi) throw data("요청이 너무 많습니다. 잠시 후 다시 시도하세요.", { status: 429, headers: retry });
  response = errorResponse(rateLimited(), requestId);
  response.headers.set("Retry-After", retry["Retry-After"]);
} else {
  response = await next();
  if (result) {
    response.headers.set("RateLimit-Limit", String(result.limit));
    response.headers.set("RateLimit-Remaining", String(result.remaining));
  }
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>// 로그인·가입은 무차별 대입 공격 대상이라 훨씬 촘촘하게 제한한다.</code> | 주석: 인증 경로는 더 촘촘하게 제한한다. |
| 2 | <code>const isAuth = request.method === "POST" &amp;&amp; AU…</code> | POST 로그인·가입(API와 화면 모두). |
| 3 | <code>const limit = isAuth ? config.RATE_LIMIT_AUTH_…</code> | 인증은 분당 10회(기본), 나머지는 분당 300회. |
| 4–5 | <code>const result =</code> | 접속자 주소와 정책별로 한 번 센다. 한도를 끄는 설정(`RATE_LIMIT=0`)도 있다. |
| 6 | <code>if (result &amp;&amp; !result.allowed) {</code> | 한도를 넘었으면 |
| 7 | <code>const retry = { "Retry-After": String(result.r…</code> | 몇 초 뒤에 다시 오라는 안내. |
| 8 | <code>if (!isApi) throw data("요청이 너무 많습니다. 잠시 후 다시 시…</code> | 화면 요청은 오류 화면(429)으로. |
| 9 | <code>response = errorResponse(rateLimited(), reques…</code> | API는 **공통 오류 JSON**(`RATE_LIMITED`). |
| 10 | <code>response.headers.set("Retry-After", retry["Ret…</code> | `Retry-After` 헤더. |
| 11 | <code>} else {</code> | 한도 안이면 |
| 12 | <code>response = await next();</code> | 정상 처리하고 |
| 13 | <code>if (result) {</code> | 남은 횟수를 알려 준다. |
| 14 | <code>response.headers.set("RateLimit-Limit", String…</code> | 한도. |
| 15–17 | <code>response.headers.set("RateLimit-Remaining", St…</code> | 남은 횟수 → 클라이언트가 스스로 속도를 조절할 수 있다. |

## ④ 🔗 연동 포인트

### 이 단계의 규칙을 다음 단계·소비자와 잇는 방법

| 소비자 | 어떻게 이 계약을 쓰나 |
| --- | --- |
| **화면(React)** | 같은 서비스를 쓰므로 규칙이 자동으로 같다. 외부 SPA라면 `Link`·`ETag`를 활용 |
| **다른 팀·앱** | `/api/openapi.json`을 받아 클라이언트 코드를 생성(`openapi-typescript` 등)하거나 `/api-docs`에서 시험 |
| **MCP 서버(study18)** | 공개 읽기 API(`/api/posts`)만 호출 → 계약이 곧 도구의 안정성 |
| **테스트** | 요청 테스트가 상태 코드·`Location`·`Link`·`ETag`·오류 `code`를 확인, `advanced.test.ts`가 문서 문법을 확인 |
| **운영(study16)** | `X-Request-Id`·`Server-Timing`·메트릭이 같은 요청을 추적 |

### 공통 스펙 v1과 이 구현의 대응(최종)

| 스펙 v1 절 | 구현 |
| --- | --- |
| 1. 경로 | `routes.ts`(`/api`, `/api/v1`) |
| 2. 요청 본문(camelCase) | `lib/schemas.ts` |
| 3. 성공 응답 `data`/`meta` | `ok()`, `okConditional()` |
| 4. 쿼리 파라미터 | `parseListQuery` |
| 5. 오류 응답 | `errorResponse()`, `AppError` |
| 6. 인증 규칙(Bearer + 쿠키) | `authMiddleware` |
| 7. 공통 헤더(`X-Request-Id`, CORS, `/api-docs`) | `requestMiddleware`, `/api-docs`, `/api/openapi.json` |
| 8. "고칠 것" 표 | 해당 없음(처음부터 스펙대로 구현) |

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 라우트 id 충돌 `Unable to define routes with duplicate route id` | 같은 파일을 두 곳에 마운트하며 id를 안 붙임 | `route(path, file, { id })` 로 고유 id(이 저장소의 `v1-` 접두사) |
| `/api/v1/posts`가 `*` 라우트(404)로 감 | 구체적 경로가 `*`보다 뒤에 있거나 prefix 오타 | `*`는 항상 마지막, `prefix("api/v1", …)` 확인 |
| 브라우저에서 `Link`·`ETag`·`X-Total-Count`를 읽지 못함 | CORS `Access-Control-Expose-Headers`에 없음 | `corsHeaders`의 노출 목록에 추가 |
| 304를 기대했는데 항상 200 | 본문이 매번 달라짐(시각·무작위 포함), `If-None-Match`를 안 보냄 | 응답에서 변하는 값을 빼고, 클라이언트가 직전 `ETag`를 보낸다 |
| OpenAPI 문서는 맞는데 실제는 다름 | 코드를 바꾸고 문서를 안 고침 | 요청 테스트로 응답 모양을 고정하고, 변경 PR에 문서 수정을 포함 |
| Swagger UI가 빈 화면 | CDN 차단·`/api/openapi.json` 오류 | 브라우저 콘솔·네트워크 탭 확인, 사내망은 `swagger-ui-dist`를 직접 호스팅 |
| 같은 오류가 화면과 API에서 다른 코드 | 화면과 API가 규칙을 따로 구현 | 서비스에서 던지는 `AppError`를 공유(이 저장소 구조) |
| 큰 `page`에서 응답이 느림 | `OFFSET`이 앞의 행을 모두 읽고 버림 | 커서 방식, 또는 `limit` 상한·`page` 상한 |
| 429 후에도 계속 재시도해 더 막힘 | `Retry-After`를 무시 | 클라이언트는 헤더의 초만큼 기다린 뒤 지수적으로 늘려 재시도 |

## ⑥ 직접 해보기

1. `/api-docs`를 열어 **"Try it out"**으로 `GET /posts?limit=2`를 호출하고, 응답 헤더의 `ETag`·`Link`를 확인한다. 이어서 `Authorize`에 로그인으로 받은 토큰을 넣어 `POST /posts`를 실행한다.
2. `/api/v1/posts`와 `/api/posts`가 같은 응답인지 비교하고, `/api/v1/존재안함`이 JSON 404인지 확인한다. 그다음 `routes.ts`에서 `apiRoutes("v2-")`를 `api/v2`에 추가하는 상상으로, v1을 건드리지 않고 v2에서만 응답 필드 이름을 바꾸려면 어느 층을 복제해야 할지(라우트? 서비스?) 적는다.
3. `openapi.ts`의 `"/posts"` 설명에서 `sort`의 `enum`에서 `-commentCount`를 빼고 `vitest`를 돌려 보며, **문서와 코드가 어긋나도 이 테스트는 잡지 못한다**는 점(문법만 검증)을 확인한다. 어긋남을 잡으려면 요청 테스트에 어떤 항목을 추가해야 하는지 하나 쓴다.

## ⑦ ☐ 체크리스트

- [ ] REST 주소·메서드·상태 코드 규칙을 나쁜 예와 좋은 예로 설명할 수 있다.
- [ ] 401·403·404, 400·422, 201·204·304의 쓰임을 구분한다.
- [ ] `/api/openapi.json`과 `/api-docs`를 열어 보고, 문서를 코드로 두는 이유(어긋남 방지)를 안다.
- [ ] `/api`(별칭)와 `/api/v1`(고정)의 차이와, "깨지 않는 변경 / 깨는 변경"의 구분을 설명할 수 있다.
- [ ] offset과 cursor 페이지네이션의 차이를 알고, `Link`·`X-Total-Count`·`ETag`/304를 직접 확인했다.
- [ ] 오류 응답 모양(`code`·`message`·`fields`·`requestId`)과 429의 `Retry-After`를 확인했다.

## ⑧ 다음 단계 연결

계약이 정리됐으니 [study15.md](study15.md)에서 그 API가 **빠르고 안정적**으로 동작하게 합니다: 캐시, 비동기 처리, 백그라운드 작업, 그리고 **측정하는 법**.
