# study4 — 라우팅과 요청 처리

> 기준: [노션 · React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06) · 경로 기준은 [공통 API 스펙 v1](https://app.notion.com/p/3d6d7dec5e2e8139adbfd36dd506c65e). 코드: [midpoint/app/routes.ts](midpoint/app/routes.ts), [midpoint/app/routes/](midpoint/app/routes/).

## ① 목표 한 줄

URL 라우팅·동적 경로·요청과 응답의 흐름·오류 페이지를 익히고, 쿼리 파라미터와 페이지 이동으로 화면을 잇고, 프런트(화면)와 백엔드(API)의 경로를 맞춘다.

## ② 📖 이론

### 왜 중요한가

웹에서 모든 것은 **주소 + 방법(GET/POST …)** 하나로 시작합니다. 라우팅은 "이 주소와 방법이 오면 어느 코드를 실행할까"를 정하는 일입니다. React Router 7은 같은 라우트 트리로 **화면(HTML)**과 **데이터(JSON)**를 모두 처리합니다.

### 라우팅 두 방식

| 방식 | 모양 | 장단점 |
| --- | --- | --- |
| **설정 기반** (이 과정) | `app/routes.ts`에 `route("posts/:postId", "routes/posts/detail.tsx")` | 한 파일에서 전체 지도를 본다. 파일 이름이 자유롭다 |
| **파일 기반** | `@react-router/fs-routes`의 `flatRoutes()` + `posts.$postId.tsx` | 파일을 만들면 주소가 생긴다. 이름 규칙(`.`=`/`, `$`=동적, `_`=경로 없는 레이아웃)을 외워야 한다 |

둘은 섞어 쓸 수 있고(`flatRoutes()`를 `routes.ts` 배열에 펼치기), 결과는 같은 **라우트 트리**입니다.

| 설정 기반 (이 저장소) | 파일 기반으로 쓰면 |
| --- | --- |
| `index("routes/home.tsx")` | `_index.tsx` |
| `route("posts", …, [index(list)])` | `posts._index.tsx` + `posts.tsx`(레이아웃) |
| `route(":postId", …)` | `posts.$postId.tsx` |
| `route("*", …)` | `$.tsx` |
| `layout(…)`(경로 없음) | `_auth.tsx` + `_auth.login.tsx` |

### 요청·응답 흐름: 세 종류

| 종류 | 언제 | 응답 | 실행되는 것 |
| --- | --- | --- | --- |
| **문서 요청** | 주소창 입력, 새로고침, 외부 링크 | 완성된 **HTML** | 미들웨어 → 일치한 모든 라우트의 `loader` → 서버 렌더링 |
| **데이터 요청** | 브라우저 안에서 `Link` 이동·폼 제출 | **JSON 비슷한 스트림**(`….data`) | 미들웨어 → 필요한 `loader`/`action`만(화면은 브라우저가 그림) |
| **리소스 요청** | `/api/…`, `/health` 등 default export가 없는 라우트 | 우리가 만든 `Response` | 미들웨어 → 그 라우트의 `loader`/`action` |

**메서드 규칙**: `GET`·`HEAD`는 `loader`, `POST`·`PUT`·`PATCH`·`DELETE`는 `action`이 처리합니다.

```text
브라우저 ─(GET /posts/12)──▶ 미들웨어(요청번호·인증) ──▶ root.loader + posts/detail.loader(병렬)
                                                      ──▶ React가 HTML 렌더링 ──▶ 응답(HTML)
브라우저 ─(POST /posts/12)─▶ 미들웨어 ──▶ detail.action ──▶ (redirect 또는 데이터)
                                      └▶ 끝나면 화면의 loader들을 자동으로 다시 실행(재검증)
```

### 오류 처리 계층

`loader`·`action`·렌더링에서 던져진 오류는 **가장 가까운 `ErrorBoundary`**가 받습니다. 없으면 부모로 올라가 `root`의 것이 받습니다. `throw data("메시지", { status: 404 })`로 던지면 "예상한 오류(응답)", 그냥 `Error`는 "예상 못 한 오류(500)"입니다.

### 비유

주소는 **우편 주소**, 라우터는 **우체국 분류기**입니다. 분류기는 주소를 보고(`/posts/12`) 어느 창구(라우트)로 보낼지 정하고, 창구는 "읽기 요청"(GET)이면 자료실 담당(`loader`)에게, "쓰기 요청"(POST)이면 접수 담당(`action`)에게 넘깁니다. 어느 창구에도 안 맞으면 `*` 창구가 "그런 주소는 없습니다"라고 답합니다.

## ③ 🛠️ 실기 — 전체 코드와 줄별 설명

### 1. 라우트 지도: 리소스 라우트와 동적 경로

@@code midpoint/app/routes.ts from=/^  route\("health"/ to=/^  \]\),/
`route("health"` | `/health`. 파일에 `default export`가 없으니 HTML이 아니라 `Response`를 돌려주는 **리소스 라우트**다.
`// 리소스 라우트` | 주석.
`...prefix("api", [` | `prefix`는 안의 모든 경로 앞에 `api/`를 붙이는 도우미다. 결과가 배열이라 `...`로 펼쳐 넣는다.
`route("auth/signup"` | `/api/auth/signup`. 한 번에 여러 세그먼트(`auth/signup`)를 쓸 수 있다.
`route("auth/login"` | `/api/auth/login`.
`route("auth/logout"` | `/api/auth/logout`.
`route("auth/me"` | `/api/auth/me`.
`route("posts", "routes/api/posts.ts")` | `/api/posts` — 목록(GET)과 작성(POST)을 한 파일이 받는다.
`route("posts/:postId"` | `:postId`는 **동적 세그먼트**. `/api/posts/12`면 `params.postId === "12"`(항상 문자열).
`route("posts/:postId/comments"` | 중첩된 자원은 경로도 중첩한다(REST).
`route("comments/:commentId"` | 댓글 자체를 가리키는 주소.
`route("*"` | **splat**: 위 어디에도 안 맞는 `/api/…`. 그래서 없는 API 주소는 HTML 404가 아니라 JSON 404가 된다.
@@end

### 2. 메서드로 나누는 리소스 라우트

한 주소(`/api/posts/12`)가 GET·PATCH·DELETE를 모두 받습니다. GET은 `loader`, 나머지는 `action`이고, `action` 안에서 `request.method`로 다시 나눕니다.

@@code midpoint/app/routes/api/post.ts from=/^\/\/ GET \/api\/posts\/:postId/ to=/^\}\);$/
`// GET /api/posts/:postId` | 주석.
`export const loader = api(` | GET 요청이 오면 실행된다. `api()`는 던져진 `AppError`를 JSON 오류로 바꿔 주는 래퍼(study8).
`return ok(await getPost(parseId(params.postId)))` | `params.postId`는 라우트 설정의 `:postId`에서 온 **문자열**이다. 숫자로 검증(`"abc"`면 400)하고 글을 읽어 `{ data: … }`로 응답한다.
@@end

@@code midpoint/app/routes/api/post.ts from=/^\/\/ 한 파일의 action이/ to=/^\}\);$/
`// 한 파일의 action이` | 주석.
`export const action = api(` | GET이 아닌 요청(PATCH·DELETE)이 오면 실행된다.
`const user = requireApiUser(context)` | 로그인하지 않았으면 여기서 401을 던진다.
`const id = parseId(params.postId)` | 주소의 id를 검증한다.
`switch (request.method)` | 같은 주소라도 방법으로 일을 나눈다.
`case "PATCH":` | 부분 수정 → 200과 수정된 글.
`case "DELETE":` | 삭제 → 본문 없는 204.
`default:` | 그 밖의 방법은 405(허용되지 않는 메서드).
@@end

### 3. 화면과 API의 404 — 처음부터 끝까지

@@code midpoint/app/routes/not-found.tsx
`import { data }` | 상태 코드를 가진 "응답 같은 오류"를 만드는 도우미.
`export function loader` | 어떤 화면 라우트와도 맞지 않는 주소(`/이상한/주소`)가 오면 실행된다.
`throw data(` | **던진다**(반환하지 않는다). 가장 가까운 `ErrorBoundary`로 간다. 상태 코드 404가 그대로 응답에 실린다.
`export default function NotFound` | `default export`가 있어야 "화면 라우트"로 취급된다. 없으면 리소스 라우트가 되어 HTML 대신 `Response`를 직접 돌려주는 라우트가 된다.
`return null` | 어차피 `loader`가 던지니 이 화면은 그려지지 않는다.
@@end

@@code midpoint/app/routes/api/not-found.ts
`import { api }` | 오류를 JSON으로 바꿔 주는 래퍼.
`import { AppError }` | 사용자에게 보여 줘도 되는 오류.
`function missing(url: URL): never` | `never`: 이 함수는 **절대 값을 돌려주지 않고 항상 던진다**는 뜻이다. 반환 타입 검사를 통과시키기 위해 쓴다.
`throw new AppError(404` | `NOT_FOUND`와 어떤 경로가 없는지 알려 준다.
`export const loader` | GET `/api/없는주소`.
`export const action` | POST·PATCH·DELETE `/api/없는주소`. 어느 방법이든 같은 JSON 404가 된다.
@@end

### 4. `ErrorBoundary`: 가까운 것이 먼저

@@code midpoint/app/routes/posts/layout.tsx from=/^export function ErrorBoundary/ to=/^\}/
`export function ErrorBoundary` | `/posts` 아래 어디서든 던져진 오류가 이곳으로 온다(예: 없는 글 404, 남의 글 수정 403). `root`까지 올라가지 않는다.
`const known = isRouteErrorResponse(error)` | `data()`로 던진 "응답 같은 오류"인지 확인한다. 아니면 코드 버그 등 예상 못 한 오류.
`const status = known ? error.status : 500` | 예상 밖 오류는 500으로 본다.
`const message =` | 던질 때 준 메시지가 있으면 그것을, 없으면 상태별 기본 문구를 쓴다.
`return (` | 게시판 틀(제목)을 유지한 채 오류만 보여 준다.
`role="alert"` | 스크린 리더가 즉시 읽어 주는 영역.
`<Link to="/posts"` | 막다른 길을 만들지 않고 돌아갈 길을 준다.
@@end

@@code midpoint/app/root.tsx from=/^export function ErrorBoundary/ to=/^\}/
`export function ErrorBoundary` | 가장 바깥 안전망. 어떤 라우트에도 ErrorBoundary가 없을 때, 그리고 `root` 자체의 오류를 받는다.
`let title` | 기본 제목. 상황에 따라 아래에서 바꾼다.
`let detail` | 기본 설명.
`let stack` | 개발 중에만 채우는 스택.
`if (isRouteErrorResponse(error))` | `data()`로 던진 응답형 오류(404·403 등).
`title = error.status === 404` | 404면 "페이지를 찾을 수 없습니다", 아니면 `오류 상태코드`.
`detail = typeof error.data === "string"` | `throw data("메시지")`의 메시지를 보여 준다.
`} else if (import.meta.env.DEV` | **개발 모드일 때만** 실제 오류 메시지·스택을 보여 준다. 운영에서는 내부 정보를 숨긴다.
`stack = error.stack` | 스택 문자열.
`return (` | 최종 화면.
`<h1 className` | 제목.
`<p className="mt-2` | 설명.
`{stack ?` | 스택이 있을 때만 `<pre>`로 출력.
`<p className="mt-4">` | 홈으로 가는 링크.
@@end

### 5. 서비스의 오류를 화면의 404로: `routeError`

주소의 id가 숫자가 아니면(`/posts/abc`) 서비스는 400(`BAD_REQUEST`)을 던집니다. 그러나 **화면에서는 "그런 페이지가 없다"가 맞으므로** 404로 바꿔 던집니다.

@@code midpoint/app/lib/route-error.server.ts from=/^export function routeError/ to=/^\}/
`export function routeError` | `never`를 반환한다: 항상 던진다.
`if (error instanceof AppError)` | 우리가 정의한 오류만 변환한다. 진짜 버그는 그대로 올려 500이 되게 한다.
`const status = error.code === "BAD_REQUEST" ? 404` | 화면 주소의 잘못된 id는 404.
`throw data(` | 404는 정보 노출을 줄이려고 고정 문구를 쓰고, 나머지는 서비스의 메시지를 그대로 보여 준다.
`throw error` | 알 수 없는 오류는 변환하지 않는다.
@@end

### 6. 리다이렉트: 이동은 "던지거나 돌려준다"

@@code midpoint/app/routes/logout.ts
`import { redirect }` | 다른 주소로 보내는 응답을 만든다(상태 302).
`import { destroyUserSession }` | 세션 쿠키를 지우는 도우미(study7).
`export async function action` | `POST /logout`을 받는다. 로그아웃은 상태를 바꾸니 POST만 허용한다.
`return destroyUserSession(request, "/")` | 쿠키를 지우고 `/`로 보내는 응답을 돌려준다.
`export function loader` | 주소창에 `/logout`을 직접 친 GET.
`return redirect("/")` | 아무것도 바꾸지 않고 홈으로 돌려보낸다(GET은 안전해야 하므로 로그아웃하지 않는다).
@@end

## ④ 🔗 연동 포인트

### 쿼리 파라미터와 페이지 이동

@@code midpoint/app/routes/posts/list.tsx from=/^  const hrefFor/ to=/^  \};/
`const hrefFor` | 쪽 번호를 받아 **현재 검색 조건을 유지한** 주소를 만든다. `Pagination` 컴포넌트에 props로 넘긴다.
`const next = new URLSearchParams()` | 쿼리 문자열을 안전하게 조립하는 내장 도구(인코딩을 자동으로 해 준다).
`if (params.q)` | 검색어가 있을 때만 `q`를 넣는다.
`params.sort !== "-createdAt"` | 기본 정렬이면 굳이 주소에 쓰지 않는다. 주소가 짧고 깔끔해진다.
`if (page > 1)` | 1쪽은 기본값이라 생략한다.
`const query = next.toString()` | `q=react&page=2` 형태의 문자열.
`return query ?` | 쿼리가 없으면 `/posts`, 있으면 `/posts?…`.
@@end

| 이동 방법 | 코드 | 특징 |
| --- | --- | --- |
| `Link` / `NavLink` | `<Link to="/posts/12">` | 클라이언트 이동. `prefetch="intent"`를 주면 마우스를 올릴 때 미리 불러온다(study15) |
| GET `<Form>` | `<Form method="get">` | 입력값이 쿼리가 된다. 자바스크립트 없이도 동작 |
| `redirect()` | `return redirect("/posts")` | 서버가 "다른 곳으로 가라"고 응답. `action` 뒤 이동(PRG)에 쓴다 |
| `useNavigate()` | `navigate("/posts")` | 이벤트 핸들러에서 코드로 이동 |
| `useSearchParams()` | `setSearchParams({ page: "2" })` | 쿼리만 바꿔 같은 화면의 `loader`를 다시 실행 |

### 프런트(화면)와 백엔드(API) 경로 맞추기

한 앱이 **화면 라우트**와 **API 라우트**를 함께 갖고, 둘이 **같은 서비스 함수**를 부릅니다. 그래서 규칙이 어긋날 수 없습니다.

| 하는 일 | 화면 주소(HTML) | API 주소(JSON, 스펙 v1) | 공통 서비스 |
| --- | --- | --- | --- |
| 글 목록 | `GET /posts?q=&page=` | `GET /api/posts?q=&page=&limit=&sort=` | `listPosts` |
| 글 상세 | `GET /posts/:postId` | `GET /api/posts/:postId` | `getPost` |
| 글 작성 | `POST /posts/new` | `POST /api/posts` | `createPost` |
| 글 수정 | `POST /posts/:postId/edit` | `PATCH /api/posts/:postId` | `updatePost` |
| 글 삭제 | `POST /posts/:postId`(`intent=delete-post`) | `DELETE /api/posts/:postId` | `deletePost` |
| 로그인 | `POST /login` | `POST /api/auth/login` | `login` |

**다른 출처의 프런트**(예: 별도 Vite 앱이 `localhost:5173`)에서 이 API를 부르려면 브라우저가 **CORS**를 요구합니다. 서버의 `CORS_ORIGIN` 환경변수에 그 출처를 적으면, 사전 확인 요청(`OPTIONS`)과 응답 헤더를 미들웨어가 처리합니다(study7).

```powershell
# 화면 404와 API 404는 모양이 다르다
curl.exe -i http://localhost:5173/no/such/page       # HTML, 404
curl.exe -i http://localhost:5173/api/no/such          # JSON { "error": { "code": "NOT_FOUND", … } }, 404
curl.exe -i http://localhost:5173/api/posts/abc      # JSON 400 BAD_REQUEST
curl.exe -i http://localhost:5173/posts/abc          # HTML 404 (routeError가 400을 404로 바꿈)
```

### 7.18 주의: `request.url` 대신 `url`

`react-router.config.ts`에서 `v8_passThroughRequests`를 켜면 `request.url`이 **가공되지 않은 원래 주소**입니다(브라우저 안 이동에서는 `….data` 같은 접미사가 붙을 수 있습니다). 정규화된 주소(`/posts?q=react`)가 필요하면 `loader`·`action`·`middleware` 인자의 **`url`**(`URL` 객체)을 씁니다. 이 저장소의 코드는 모두 `url.pathname`, `url.searchParams`를 씁니다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 이상한 주소인데 **200** 빈 화면 | `*` 라우트가 던지지 않고 `null`만 반환 | `loader`에서 `throw data(…, { status: 404 })` |
| `/posts/abc`가 500 오류 화면 | 서비스의 `AppError(400)`를 그대로 던짐(예상 밖 오류로 취급) | `routeError`로 `data(…, 404)` 변환 |
| `You made a GET request to "/…" but did not provide a loader` | `action`만 있는 라우트를 GET으로 호출 | GET이 필요하면 `loader`를 추가하거나, 그 주소로 GET하지 않는다(로그아웃은 `loader`에서 `redirect`) |
| API가 `Unexpected Server Error`라는 **글자**만 돌려줌 | 리소스 라우트에서 일반 `Error`를 던짐 | `api()` 래퍼로 감싸 `AppError`를 JSON으로 바꾼다 |
| 로그인 ↔ 보호된 화면을 무한히 오감 | `redirectTo`를 검증 없이 쓰거나 로그인 화면이 이미 로그인한 사용자를 다시 보냄 | 이미 로그인했으면 로그인 화면에서 `redirect`하되 도착지는 로그인 화면이 아닌 곳(study7) |
| 오류 화면에서 **헤더가 사라짐** | `ErrorBoundary`가 라우트의 `default`를 대체하므로, 헤더를 그 안에 두면 같이 사라짐 | 헤더는 `root`의 `Layout`에 둔다(정상·오류 화면 모두 감싼다) |
| 쿼리를 바꿨는데 같은 화면이 안 바뀜 | `loader`가 `url.searchParams`를 읽지 않음 | `loader`에서 쿼리를 읽는다. 쿼리 변경 시 `loader`가 자동 재실행된다 |
| `…/?_data=…`·`….data` 요청이 로그에 섞임 | 브라우저 안 이동은 데이터 요청으로 처리됨 | 정상. 같은 경로의 문서 요청과 구분해서 본다 |

## ⑥ 직접 해보기

1. `app/routes.ts`에 `route("about", "routes/about.tsx")`를 추가하고 간단한 소개 페이지를 만들어 헤더에 `NavLink`를 추가한다. 일부러 파일 이름을 틀리게 적어 빌드·개발 서버가 어떤 오류를 내는지 읽어 본다.
2. `curl.exe -i`로 `/no/such/page`, `/api/no/such`, `/posts/abc`, `/api/posts/abc`를 각각 요청해 **상태 코드와 본문 모양**을 표로 정리하고, 왜 서로 다른지 `routes.ts`의 `*` 두 개로 설명한다.
3. `routes/posts/layout.tsx`의 `ErrorBoundary`를 임시로 지우고 `/posts/99999`에 접속해 `root`의 `ErrorBoundary`가 대신 받는 것을 확인한다(헤더·제목이 어떻게 달라지는지 비교한 뒤 되돌린다).

## ⑦ ☐ 체크리스트

- [ ] 파일 또는 설정 기반 라우팅, 중첩 레이아웃
- [ ] SSR과 로딩·에러 경계
- [ ] 문서 요청·데이터 요청·리소스 요청의 차이와, GET→`loader`, 그 외→`action` 규칙을 설명할 수 있다.
- [ ] 동적 경로(`:postId`)와 splat(`*`)이 각각 무엇에 쓰이는지 예를 들 수 있다.
- [ ] 가장 가까운 `ErrorBoundary`가 오류를 받는 것을 직접 확인했고, `throw data(…)`와 일반 `Error`의 차이를 안다.
- [ ] 쿼리 파라미터(`url.searchParams`)와 `redirect`·`Link`·GET `<Form>`으로 화면을 잇고, 화면 경로와 API 경로(`/api`)를 표로 대응시킬 수 있다.

> **"로딩 경계"**는 이 단계에서 `useNavigation().state`로 "불러오는 중" 표시를 하는 데까지 다룹니다(`list.tsx`의 `loading`). 스트리밍으로 일부만 먼저 보여 주는 로딩 경계(`Suspense`/`Await`)는 [study15](study15.md)에서 이어집니다.

## ⑧ 다음 단계 연결

주소와 요청 흐름을 이해했으니 [study5.md](study5.md)에서 그 흐름으로 **사용자의 입력을 받아(폼) 검증하고 서버에 저장하는** `action`을 만듭니다.
