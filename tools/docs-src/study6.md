# study6 — DB·API 연동

> 기준: [노션 · React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06) · **[게시판 공통 API 스펙 v1](https://app.notion.com/p/3d6d7dec5e2e8139adbfd36dd506c65e)**. 코드: [midpoint/app/db/](midpoint/app/db/), [midpoint/app/services/](midpoint/app/services/), [midpoint/app/routes/api/](midpoint/app/routes/api/).

## ① 목표 한 줄

DB를 연결해 목록·상세·등록·수정·삭제(CRUD)를 만들고, 오류를 처리하며, 공통 API 스펙 v1에 맞추고, 연결 정보를 환경변수로 분리한다.

## ② 📖 이론

### 왜 이렇게 나누는가

`loader`·`action`에 SQL을 직접 쓰면 금방 엉킵니다. 그래서 **3겹**으로 나눕니다.

```text
route(loader/action·API)  →  service(업무 규칙·검증)  →  repo(SQL, DB 종류에 따라 다름)  →  DB
   "무엇을 받아 무엇을 돌려줄까"      "누가, 어떤 조건에서 할 수 있나"         "어떻게 저장·조회하나"
```

- **route**는 요청을 읽고 응답을 만든다(얇게).
- **service**는 규칙을 가진다(검증, 권한, "남의 글은 수정 불가").
- **repo**는 DB와만 대화한다. `Repo` 인터페이스(`db/types.ts`)가 약속이라, 구현을 바꿔도(study11) service는 그대로다.

### 핵심 개념

- **마이그레이션**: 스키마(테이블 구조)를 **번호가 붙은 변경 기록**으로 관리한다. 항목을 추가만 하고 고치지 않는다. DB의 `user_version`이 "어디까지 적용했는지"를 기억한다.
- **자리표시자 `?`**: 값을 SQL 문장에 이어 붙이지 않고 **따로 전달**한다. 사용자의 입력이 SQL로 해석되는 **SQL 주입**을 막는 기본 장치다.
- **허용 목록(allow-list)**: 정렬처럼 SQL 문장 일부를 바꿔야 할 땐, 입력을 그대로 쓰지 않고 `{키 → SQL 조각}` 표에서 **고른다**.
- **트랜잭션**: 여러 변경을 "모두 성공 또는 모두 취소"로 묶는다(마이그레이션이 이것을 쓴다).
- **공통 API 스펙 v1**: 어느 백엔드로 바꿔 끼워도 프런트가 그대로 동작하도록 **경로·응답·오류 모양**을 정한 약속이다.

### 비유

service는 **은행 창구 직원**(규칙을 알고 판단), repo는 **금고 담당**(꺼내고 넣기만), DB는 **금고**입니다. 창구 직원이 금고 안 구조를 몰라도 되고, 금고를 새것으로 바꿔도 창구 규칙은 그대로입니다. `?` 자리표시자는 **봉투에 담아 건네는 것**: 봉투 안의 글자가 어떤 명령처럼 보여도 금고 담당은 열어서 실행하지 않고 그냥 보관합니다.

## ③ 🛠️ 실기 — 전체 코드와 줄별 설명

### 1. 연결과 스키마(마이그레이션)

@@code midpoint/app/db/sqlite.server.ts from=/^\/\/ 번호가 곧 스키마 버전이다/ to=/^\];/
`// 번호가 곧` | 주석: 배열 위치가 곧 버전. 한 번 배포한 항목은 **고치지 않고** 새 항목을 뒤에 추가한다.
`const MIGRATIONS = [` | 마이그레이션 목록.
`CREATE TABLE users` | 사용자 테이블.
`id INTEGER PRIMARY KEY AUTOINCREMENT` | 번호가 자동으로 1, 2, 3… 늘어나는 기본키.
`email TEXT NOT NULL UNIQUE` | **UNIQUE**: 같은 이메일은 DB가 거절한다. 서비스의 "이미 있는지" 확인이 동시에 두 번 통과해도 마지막 방어선이 된다.
`nickname TEXT NOT NULL` | 필수 칸.
`password_hash TEXT NOT NULL` | **비밀번호 원문이 아니라 해시**를 저장한다(study7).
`created_at TEXT NOT NULL DEFAULT` | 생성 시각을 DB가 UTC ISO 문자열로 채운다(`strftime`). 앱의 시간대와 무관하다.
`CREATE TABLE posts` | 글 테이블.
`author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE` | 외래키: 존재하는 사용자만 작성자가 될 수 있다. 사용자가 지워지면 글도 함께 지워진다(CASCADE).
`tags TEXT NOT NULL DEFAULT '[]'` | 태그 배열을 JSON 문자열로 저장한다(SQLite에는 배열 타입이 없다).
`CREATE INDEX idx_posts_created` | 정렬·조회를 빠르게 하는 색인.
`CREATE TABLE comments` | 댓글 테이블.
`post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE` | **글을 지우면 그 글의 댓글도 함께** 지워진다.
`CREATE INDEX idx_comments_post` | 글별 댓글 조회용 색인.
@@end

@@code midpoint/app/db/sqlite.server.ts from=/^export function openSqlite/ to=/^\}/
`export function openSqlite` | DB를 열고 스키마를 맞춰 돌려준다.
`if (path !== ":memory:")` | 테스트용 메모리 DB가 아니면 폴더(`data/`)가 없을 때 만든다.
`const db = new DatabaseSync(path)` | 파일을 연다(없으면 새로 만든다). 동기 API라 `await`가 필요 없다.
`db.exec("PRAGMA journal_mode = WAL` | **WAL**: 읽기와 쓰기가 서로 덜 막는다. **`foreign_keys = ON`**: SQLite는 기본이 꺼져 있어 켜야 외래키 규칙이 지켜진다.
`migrate(db)` | 아직 적용 안 한 변경만 적용한다.
`return db` | 열린 연결.
@@end

@@code midpoint/app/db/sqlite.server.ts from=/^function migrate/ to=/^\}/
`function migrate` | 마이그레이션 실행기.
`const { user_version }` | DB가 기억하는 "적용한 버전". 새 DB는 0.
`for (let version = user_version` | 적용 안 한 것부터 끝까지 순서대로.
`db.exec("BEGIN")` | **트랜잭션 시작**: 아래가 도중에 실패하면 전부 되돌린다.
`db.exec(MIGRATIONS[version])` | 해당 변경 실행.
`db.exec(`PRAGMA user_version` | 적용 완료를 DB에 기록. 변경과 기록이 **같은 트랜잭션**이라 어긋나지 않는다.
`db.exec("COMMIT")` | 확정.
`} catch (error) {` | 실패하면
`db.exec("ROLLBACK")` | 취소하고
`throw error` | 서버 시작을 멈춘다(스키마가 어정쩡한 채로 서비스하지 않는다).
@@end

### 2. 모델 ↔ 행: 읽기 쿼리

@@code midpoint/app/db/sqlite.server.ts from=/^\/\/ 정렬 키를 SQL로/ to=/FROM posts p JOIN/
`// 정렬 키를 SQL로` | 주석: 허용 목록.
`const ORDER_BY` | 정렬 키 → SQL 조각 표. 사용자가 보낸 `sort`는 **이 표의 키일 때만** 쓰인다.
`createdAt:` | 오래된 순. 같은 시각이면 id로 안정적으로 정렬.
`"-createdAt":` | 최신순(기본).
`"-commentCount":` | 댓글 많은 순.
`const POST_SELECT` | 글 조회의 공통 부분.
`SELECT p.id, p.title` | 필요한 칸만.
`u.id AS author_id` | 작성자 정보를 JOIN으로 함께 읽는다(글마다 따로 조회하지 않는다 = N+1 방지).
`(SELECT COUNT(*)` | 댓글 수는 서브쿼리로 계산한다.
`FROM posts p JOIN users` | 글과 작성자를 잇는다.
@@end

@@code midpoint/app/db/sqlite.server.ts from=/^      async list\(/ to=/^      \},/
`async list(` | 목록 + 검색 + 정렬 + 쪽 나누기.
`const where = q ?` | 검색어가 있을 때만 제목·본문을 `LIKE`로 찾는다. `lower()`로 대소문자를 무시한다.
`const filter` | `LIKE`에 넘길 값(자리표시자에 들어간다).
`const total = Number(` | **전체 개수**(쪽 수 계산용).
`get(`SELECT COUNT(*)` | 같은 조건으로 개수만 센다.
`const rows = all(` | 실제 한 쪽 분량.
`${POST_SELECT} ${where} ORDER BY ${ORDER_BY[sort]} LIMIT ? OFFSET ?` | 정렬은 **허용 목록에서 고른 조각**, 값(검색어·`limit`·`offset`)은 모두 `?`로 전달한다.
`(page - 1) * limit` | 쪽 번호(1부터)를 건너뛸 개수로 바꾼다.
`return { items: rows.map(toSummary), total }` | 행을 모델(`PostSummary`)로 바꿔 돌려준다.
@@end

### 3. 서비스: 규칙과 공통 스펙

@@code midpoint/app/services/posts.server.ts from=/^\/\*\* 공통 스펙 v1/ to=/^\}/
`/** 공통 스펙 v1` | 주석: 쿼리 규칙.
`export function parseListQuery` | URL의 쿼리를 **검증·보정**해 안전한 값으로 만든다. 오류를 던지지 않고 기본값으로 고친다(목록은 관대하게).
`const page = Math.max(1` | `page`는 1부터. `abc`·`-3`·`0`은 모두 1이 된다(`Number("abc")`는 `NaN`이고 `NaN || 1`이 1).
`const limit = Math.min(50` | `limit`은 1~50. **500을 보내도 50으로 줄인다**(스펙: 50 초과는 50으로).
`const requested = params.get("sort")` | 허용되는 정렬인지 확인한다.
`const sort = SORT_KEYS.find` | 목록에 있으면 그 값, 아니면 기본 `-createdAt`.
`const q =` | 검색어는 공백 제거 후 100자까지만.
`return { q, page, limit, sort }` | 이 객체만 repo로 간다.
@@end

@@code midpoint/app/services/posts.server.ts from=/^export async function listPosts/ to=/^\}/
`export async function listPosts` | 목록 조회 서비스. `repo`를 인자로 받을 수 있어(기본값은 실제 저장소) 테스트에서 가짜를 끼운다.
`const { items, total }` | 저장소에서 한 쪽 분량과 전체 개수를 받는다.
`data: items` | 스펙의 `{ data, meta }` 중 `data`.
`page: params.page` | `meta`: 지금 쪽, 쪽당 개수, 전체 개수.
`totalPages: Math.max(1` | 전체 쪽 수. 글이 0개여도 1쪽으로 본다.
`...(params.q ? { q: params.q } : {})` | 검색어가 있을 때만 `meta.q`를 포함한다(스펙의 예시와 같다).
@@end

@@code midpoint/app/services/posts.server.ts from=/^export async function getPost/ to=/^\}/
`export async function getPost` | 상세 조회.
`const post = await repo.posts.find(id)` | 저장소에 없으면 `null`.
`if (!post) throw notFound(` | `null`을 **404 오류로** 바꾼다. 호출하는 쪽은 "있다/없다"를 따로 검사하지 않아도 된다.
`return post` | 항상 존재하는 글만 돌려준다.
@@end

@@code midpoint/app/services/posts.server.ts from=/^export async function updatePost/ to=/^\}/
`export async function updatePost` | 부분 수정(PATCH).
`const patch = parseOrThrow(` | 입력 검증. 안 보낸 필드는 그대로 둔다.
`const post = await getPost(` | 먼저 글을 읽는다(없으면 404).
`if (post.author.id !== user.id)` | **남의 글이면 403**. "인증"(누구인가)과 "인가"(해도 되는가)는 다르다.
`return (await repo.posts.update(` | 통과하면 저장하고 수정된 글을 돌려준다.
@@end

### 4. API 라우트: 얇게

@@code midpoint/app/routes/api/posts.ts from=/^\/\/ GET \/api\/posts\?q=/ to=/^\}\);$/
`// GET /api/posts?q=` | 주석: 이 파일이 받는 요청.
`export const loader = api(` | GET `/api/posts`. 목록. 인자의 `url`은 정규화된 주소 객체라 여기서 쿼리를 읽는다.
`const { data, meta } = await listPosts(parseListQuery(url.searchParams))` | 쿼리 보정 → 서비스 호출. **이 라우트에는 규칙이 없다.**
`return ok(data, { meta })` | `{ "data": [...], "meta": {...} }` 모양으로 200 응답.
@@end

@@code midpoint/app/routes/api/posts.ts from=/^\/\/ POST \/api\/posts → 201/ to=/^\}\);$/
`// POST /api/posts` | 주석.
`export const action = api(` | POST `/api/posts`. 작성.
`const user = requireApiUser(context)` | 인증 필수. 아니면 401.
`const post = await createPost(user, await readJson(request))` | JSON 본문을 읽어 서비스에 넘긴다. 검증은 서비스 안에서.
`return ok(post, { status: 201` | **201 Created** + 만들어진 글 + `Location` 헤더(새 글의 주소, 스펙 v1).
@@end

### 5. 응답과 오류의 공통 모양

@@code midpoint/app/lib/http.server.ts from=/^\/\*\* 모든 JSON 응답의 단일 창구/ to=/^\}$/
`/** 모든 JSON 응답의` | 주석: 스펙 v1 7절의 `Content-Type` 규칙과 그 이유.
`export function jsonResponse` | **모든 JSON 응답이 거치는 한 곳.** 본문과 `ResponseInit`(상태·헤더)을 받는다.
`const headers = new Headers(init.headers)` | 호출한 쪽이 준 헤더(`Location` 등)를 복사한다.
`headers.set("Content-Type"` | **`application/json; charset=utf-8`로 고정**한다. `Response.json()`은 `charset`을 붙이지 않아, Windows PowerShell 5.1 같은 일부 클라이언트가 한글을 Latin-1로 잘못 해석해 `첫 글`이 `ì²« ê¸`로 보인다(이 저장소를 검증하다 실제로 겪었다).
`return new Response(JSON.stringify(body)` | 본문을 직접 직렬화해 응답을 만든다.
@@end

@@code midpoint/app/lib/http.server.ts from=/^\/\*\* 성공 응답/ to=/^\}$/
`/** 성공 응답` | 주석.
`export function ok(` | 성공 응답 만들기.
`return jsonResponse(` | 위의 JSON 창구로 응답한다. 목록은 `{data, meta}`, 단건은 `{data}`로 만든다(스펙 v1의 모양).
`status: init?.status ?? 200` | 기본 200, 작성은 201.
`headers: init?.headers` | `Location` 같은 추가 헤더.
@@end

@@code midpoint/app/lib/http.server.ts from=/^\/\*\* 모든 4xx·5xx 공통/ to=/^\}$/
`/** 모든 4xx·5xx 공통` | 주석: 스택·예외 원문은 응답에 넣지 않는다.
`export function errorResponse` | 어떤 오류든 **스펙 v1 오류 본문**으로 바꾼다.
`if (error instanceof AppError)` | 우리가 정한 오류: 상태·`code`·메시지를 그대로 쓴다.
`error: {` | `{ "error": { code, message, fields?, requestId } }`.
`...(error.fields ? { fields` | 검증 오류일 때만 `fields`.
`requestId,` | 요청 번호. 사용자가 이 번호를 알려 주면 로그에서 해당 요청을 찾는다.
`{ status: error.status }` | 상태 코드.
`if (error instanceof Response) return error` | 이미 완성된 응답이면 그대로.
`console.error(JSON.stringify(` | 예상 밖 오류는 **서버 로그에만** 자세히 남긴다.
`code: "INTERNAL"` | 사용자에게는 일반 문구(500)만 준다. 내부 정보를 노출하지 않는다.
@@end

@@code midpoint/app/lib/api.server.ts from=/^export function api/ to=/^\}$/
`export function api<` | 핸들러를 감싸는 고차 함수. 제네릭으로 `loader`/`action` 인자 타입을 그대로 통과시킨다.
`handler: (args: A)` | 우리가 쓰는 핸들러(정상 흐름만 쓴다).
`return async (args: A)` | 프레임워크가 부르는 진짜 함수.
`try {` | 정상 실행.
`return await handler(args)` | `await`가 중요하다: 없으면 비동기 오류가 `catch`에 안 잡힌다.
`} catch (error) {` | 던져진 모든 것.
`return errorResponse(error, args.context.get(requestIdContext))` | JSON 오류로 변환. 이 한 줄 덕분에 **라우트는 오류를 던지기만** 하면 된다.
@@end

### 6. 연결 정보는 환경변수로: 설정 한 곳

@@code midpoint/app/config.server.ts from=/^const envSchema/ to=/^\}\);/
`const envSchema = z.object({` | 환경변수의 **기대하는 모양**을 선언한다.
`NODE_ENV:` | 허용값 세 가지, 기본 `development`.
`SESSION_SECRET: z.string().min(32` | 32자 미만이면 **서버 시작 단계에서** 실패한다. 약한 키로 조용히 운영되는 사고를 막는다.
`JWT_SECRET:` | 토큰 서명 키.
`DATABASE_PATH:` | DB 파일 경로. **코드에 경로를 박지 않는다.** 환경(개발·테스트·운영)마다 다른 값을 준다.
`CORS_ORIGIN:` | 허용할 출처 목록(쉼표 구분).
`ACCESS_TOKEN_TTL_SECONDS: z.coerce.number()` | 환경변수는 항상 문자열이므로 숫자로 **변환(`coerce`)**하고 양의 정수인지 검사한다.
`COOKIE_SECURE:` | `"true"`/`"false"`만 허용. 안 주면 `NODE_ENV`로 결정한다.
`LOG_REQUESTS:` | 요청 로그 켜기/끄기.
@@end

@@code midpoint/app/config.server.ts from=/^export function getConfig/ to=/^\}/
`export function getConfig` | 설정을 읽는 **유일한 문**. 다른 파일은 `process.env`를 직접 만지지 않는다.
`if (cached) return cached` | 한 번 읽고 검증한 값을 재사용한다.
`const parsed = envSchema.safeParse(process.env)` | 검증.
`if (!parsed.success) {` | 하나라도 틀리면
`throw new Error(` | **무엇이 틀렸는지** 메시지와 해결 방법(.env.example 복사)을 담아 즉시 실패한다.
`cached = {` | 가공된 설정: `CORS_ORIGIN`을 배열로, `COOKIE_SECURE`를 불리언으로.
`corsOrigins:` | `"a, b"` → `["a", "b"]`.
`cookieSecure:` | 명시했으면 그 값, 아니면 운영(production)에서만 `true`.
@@end

@@code midpoint/app/db/index.server.ts
`import { getConfig }` | 설정에서 DB 경로를 읽는다.
`import { createSqliteRepo` | SQLite 구현.
`const globalForRepo` | 개발 중에는 파일을 고칠 때마다 모듈이 다시 로드된다. 연결을 `globalThis`에 두면 **연결이 계속 늘어나는 것**을 막는다.
`export function getRepo` | 서비스가 부르는 유일한 통로.
`globalForRepo.__rr7Repo ??=` | 없을 때만 만든다(처음 한 번).
`return globalForRepo.__rr7Repo` | 같은 연결을 모두가 공유한다.
`export function setRepoForTest` | 테스트에서 메모리 DB나 가짜 저장소로 갈아 끼운다(study9).
@@end

## ④ 🔗 연동 포인트

### 공통 API 스펙 v1 대응

| 스펙(노션) | 이 구현 |
| --- | --- |
| 경로 `/api/posts`, `/api/posts/{id}`, `/api/posts/{id}/comments`, `/api/comments/{id}` | `app/routes.ts`의 `prefix("api", …)` |
| `GET /health` → `{ "status": "ok" }` (접두어 없이) | [routes/health.ts](midpoint/app/routes/health.ts) |
| 성공 `{ data }` / 목록 `{ data, meta }` (page는 1부터) | `lib/http.server.ts`의 `ok`, `listPosts` |
| 쿼리 `q`, `page`(1+), `limit`(기본 10, 1~50), `sort`(`createdAt`·`-createdAt`·`-commentCount`) | `parseListQuery` |
| 작성 `201` + `Location`, 삭제 `204` | `routes/api/posts.ts`, `post.ts` |
| 오류 `{ error: { code, message, fields?, requestId } }` | `errorResponse` + `AppError` |
| `X-Request-Id` 요청·응답 헤더 | `middleware/request.server.ts` |
| 필드 이름 camelCase(`createdAt`) | repo의 `toSummary` 등 매핑 함수 |
| 비밀번호·해시는 어떤 응답에도 없음 | `PublicUser`만 돌려줌 |

### 환경변수로 연결 정보 분리하기

| 환경 | DB 경로 | 어디서 주나 |
| --- | --- | --- |
| 개발 | `./data/board.db` | `midpoint/.env`(Git 제외) |
| 테스트 | `:memory:` | `tests/setup.ts`가 코드로 지정 |
| 운영(컨테이너) | `/app/data/board.db` | 서버 설정·compose의 `environment`(study10) |

같은 코드가 환경마다 다른 DB를 쓰는 것은 **코드가 아니라 환경변수가 다르기 때문**입니다.

### 요청해서 확인하기

```powershell
# 가입 → 로그인 → 토큰으로 글 작성 → 목록
curl.exe -s -X POST http://localhost:5173/api/auth/signup -H "Content-Type: application/json" -d '{\"email\":\"mina@example.com\",\"password\":\"password123\",\"nickname\":\"mina\"}'
$token = (curl.exe -s -X POST http://localhost:5173/api/auth/login -H "Content-Type: application/json" -d '{\"email\":\"mina@example.com\",\"password\":\"password123\"}' | ConvertFrom-Json).data.accessToken
# 값에 공백이 든 JSON은 5.1에서 -d 로 넘기면 깨지므로 표준 입력으로 보낸다
'{"title":"first post","body":"hello world","tags":["intro"]}' | curl.exe -s -i -X POST http://localhost:5173/api/posts -H "Authorization: Bearer $token" -H "Content-Type: application/json" --data-binary "@-"
curl.exe -s "http://localhost:5173/api/posts?q=first&limit=5"
```

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 서버 시작 시 `환경변수 오류 — DATABASE_PATH …` / `SESSION_SECRET` | `.env` 누락·검증 실패 | 메시지가 가리키는 변수를 `.env`에서 고친다 |
| `SQLITE_CANTOPEN` / `unable to open database file` | DB 폴더가 없거나 쓰기 권한 없음 | `openSqlite`가 폴더를 만든다. 컨테이너라면 `/app/data`를 볼륨·권한 `node`로 |
| `FOREIGN KEY constraint failed` | `PRAGMA foreign_keys = ON`을 안 켰거나 없는 id 참조 | 연결 직후 켠다(이 코드는 켠다). 서비스에서 존재 확인 |
| `UNIQUE constraint failed: users.email` | 이미 있는 이메일 | repo가 `EMAIL_TAKEN`(409)으로 변환한다 |
| `limit=abc`가 오류가 아니라 10으로 처리됨 | 의도된 보정(목록 쿼리는 관대하게) | 엄격히 하려면 `parseOrThrow`로 400. 스펙은 보정을 택했다 |
| 목록 검색에서 `%`를 입력하면 전부 나옴 | `LIKE`의 와일드카드를 이스케이프하지 않음 | `likePattern`이 `%`·`_`를 `!%`·`!_`로 바꾼다(`ESCAPE '!'`) |
| 개발 서버를 껐다 켰더니 `database is locked` | 이전 프로세스가 아직 파일을 잡고 있음 | 프로세스를 종료한다. WAL 모드(`-wal`·`-shm` 파일)는 정상이다 |
| `ExperimentalWarning: SQLite` | `node:sqlite`가 아직 실험 기능 | 정상. 운영에서 부담되면 study11의 PostgreSQL로 교체 |
| 응답에 `password_hash`가 섞여 나옴 | repo의 행을 그대로 응답에 사용 | 항상 `PublicUser`로 **매핑해서** 응답한다(`toPublicUser`) |

## ⑥ 직접 해보기

1. `curl.exe`로 글을 12개 만들고 `?page=2`, `?limit=500`, `?limit=abc`, `?sort=-commentCount`, `?sort=id;DROP TABLE posts`를 각각 요청해 `meta`가 어떻게 보정되는지, 마지막 요청이 왜 안전한지 `ORDER_BY` 표로 설명한다.
2. `db/sqlite.server.ts`의 `MIGRATIONS` 배열 **끝에** `ALTER TABLE posts ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`을 새 항목으로 추가하고 서버를 재시작해, 기존 데이터가 유지되면서 `PRAGMA user_version`이 2가 되는지 확인한다(기존 항목은 고치지 않는다).
3. `.env`의 `DATABASE_PATH`를 `./data/other.db`로 바꿔 서버를 켜서 **빈 DB가 새로 생기는** 것을 보고, 원래 값으로 되돌려 기존 글이 다시 보이는지 확인한다(연결 정보 = 환경변수의 의미).

## ⑦ ☐ 체크리스트

- [ ] `loader`로 데이터 불러오기 (Next의 서버 컴포넌트 fetch, SvelteKit load와 같은 자리)
- [ ] route → service → repo 3겹이 각각 무엇을 맡는지 말하고, 수정·삭제의 "남의 글 403"이 어느 층에 있는지 안다.
- [ ] `?` 자리표시자와 정렬 허용 목록으로 SQL 주입을 막는 방법을 설명할 수 있다.
- [ ] 목록·상세·등록·수정·삭제 API를 `curl`로 모두 호출해 상태 코드(200·201·204·400·401·403·404)를 확인했다.
- [ ] 응답 본문이 스펙 v1(`data`/`meta`/`error`)과 같고, 비밀번호 관련 값이 응답에 없음을 확인했다.
- [ ] 연결 정보(DB 경로, 비밀키)가 코드가 아닌 환경변수에 있고, 잘못 주면 시작 단계에서 실패함을 확인했다.

> 원문 항목 안의 괄호(Next·SvelteKit과 같은 자리)는 노션 표기를 그대로 둔 것입니다. 이 과정은 React Router 7만 다루므로 비교하지 않고, RR7 `loader`가 서버에서 DB 데이터를 읽어 화면에 주는 흐름만 확인합니다.

## ⑧ 다음 단계 연결

데이터를 저장하고 읽을 수 있게 됐으니 [study7.md](study7.md)에서 **누가** 쓸 수 있는지(회원가입·로그인·세션·토큰·권한)와 기본 보안(해시·CORS·XSS·CSRF)을 다룹니다.
