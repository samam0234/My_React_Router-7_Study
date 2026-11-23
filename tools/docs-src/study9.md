# study9 — 테스트·디버깅

> 기준: [노션 · React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06). 코드: [midpoint/tests/](midpoint/tests/), [midpoint/tools/request-test.mjs](midpoint/tools/request-test.mjs), [midpoint/vitest.config.ts](midpoint/vitest.config.ts).

## ① 목표 한 줄

단위 테스트와 요청(HTTP) 테스트를 작성하고, 디버깅 도구와 로그 읽는 법을 익히며, 자주 나는 오류 TOP 10을 알고, 테스트에서 DB·API를 가짜(mock)로 바꾼다.

## ② 📖 이론

### 왜 테스트하는가

사람이 눈으로 확인하는 것은 **한 번**이지만 테스트는 **매번** 합니다. 코드를 고칠 때마다 "다른 데가 안 깨졌나"를 몇 초 만에 알려 주는 안전망입니다. 이 저장소가 study4~8을 거치며 구조를 나눈 이유도 **층마다 따로 시험하기** 위해서입니다.

### 테스트의 종류와 도구

| 종류 | 무엇을 시험 | 속도 | 이 저장소 |
| --- | --- | --- | --- |
| **단위(unit)** | 순수 함수·서비스 하나 | 매우 빠름 | `password.test.ts`, `token.test.ts`, `schemas.test.ts`, `services.test.ts` |
| **가짜 저장소** | 서비스의 "판단"만(DB 없이) | 매우 빠름 | `mock-repo.test.ts` |
| **컴포넌트** | 화면 조각이 입력에 따라 어떻게 그려지고 반응하나 | 빠름 | `post-form.test.tsx`(`createRoutesStub`) |
| **요청(HTTP)** | 실제 서버를 띄워 요청·응답 전체 | 느림(수 초) | `tools/request-test.mjs` |

비율은 **아래(단위)를 많이, 위(요청)를 적게**: 빠른 것으로 넓게 덮고, 느린 것은 핵심 흐름만.

### 가짜(mock)의 종류

| 이름 | 하는 일 | 예 |
| --- | --- | --- |
| **fake** | 진짜처럼 동작하는 가벼운 대체물 | 메모리 SQLite(`:memory:`) |
| **stub** | 정해진 값을 돌려주는 대체물 | `find: async () => null` |
| **spy** | 진짜를 부르되 호출 기록을 본다 | `vi.spyOn(repo.posts, "list")` |
| **mock** | 호출 여부·인자까지 검증하는 대체물 | `expect(repo.posts.find).toHaveBeenCalledWith(1)` |

### 핵심 개념: 의존성 주입(DI)

서비스 함수가 `repo`를 **인자로 받으면**(기본값은 진짜) 테스트가 가짜를 **그냥 넘기면** 됩니다. 복잡한 가로채기(`vi.mock`으로 모듈 교체)가 필요 없습니다. study6에서 서비스를 `getPost(id, repo = getRepo())`로 쓴 이유가 이것입니다.

### 비유

자동차 공장입니다. **단위 테스트**는 부품 시험대(브레이크만 따로 당겨 본다), **가짜 저장소**는 엔진 없이 시험하는 모의 엔진, **요청 테스트**는 조립된 차를 실제로 몰아 보는 시운전입니다. 시운전만 하면 불량 부품을 찾기 어렵고, 부품만 보면 조립 불량을 놓칩니다.

## ③ 🛠️ 실기 — 전체 코드와 줄별 설명

### 1. 설정: 테스트는 `.env`를 읽지 않는다

@@code midpoint/tests/setup.ts
`// 테스트는 항상` | 주석: 개발자 PC의 `.env`에 영향받지 않는 테스트가 **어디서 돌려도 같은 결과**를 낸다.
`process.env.SESSION_SECRET` | 가짜 비밀키(검증 규칙인 32자 이상은 지킨다).
`process.env.JWT_SECRET` | 가짜 토큰 키.
`process.env.DATABASE_PATH = ":memory:"` | **메모리 DB**: 파일을 만들지 않고 테스트가 끝나면 사라진다. 실제 SQL을 실행하는 "진짜 같은 가짜".
`process.env.CORS_ORIGIN` | 출처 검사 시험용.
`process.env.LOG_REQUESTS = "0"` | 테스트 출력에 요청 로그가 섞이지 않게 한다.
@@end

### 2. 단위 테스트: 순수 함수

@@code midpoint/tests/password.test.ts
`import { describe` | 테스트 도구. `describe`는 묶음, `it`은 시험 하나, `expect`는 확인.
`import { hashPassword` | 시험할 대상.
`describe("password"` | "비밀번호" 묶음.
`it("같은 비밀번호도` | **시험 하나 = 약속 하나.** 이름에 약속을 문장으로 쓴다(실패 시 이 이름이 출력된다).
`const [a, b] = await Promise.all(` | 같은 입력으로 두 번 해시한다.
`expect(a).not.toBe(b)` | **솔트** 때문에 결과가 달라야 한다.
`expect(a.startsWith(` | 저장 형식 약속(`scrypt$…`)을 확인한다.
`it("맞는 비밀번호만` | 두 번째 약속.
`const stored = await hashPassword(` | 준비(arrange).
`expect(await verifyPassword("password123"` | 맞는 비밀번호 → `true`.
`expect(await verifyPassword("password124"` | 한 글자만 달라도 → `false`.
`it("형식이 깨진` | 경계 사례: 이상한 저장값에도 **죽지 않고** `false`.
`plain-text` | `$` 구분자가 없는 값.
@@end

### 3. 서비스 테스트: 진짜 SQL을 메모리에서

@@code midpoint/tests/services.test.ts from=/^async function expectAppError/ to=/^\}\);/
`async function expectAppError` | 도우미: "이 작업은 **이 상태 코드와 code**로 실패해야 한다"를 한 줄로 확인한다.
`const error = await promise.then(` | 성공했으면 `null`, 실패했으면 그 오류를 받아 온다(`catch`로 흐름이 끊기지 않는다).
`expect(error).toBeInstanceOf(AppError)` | 우리가 정한 오류인가(예상 못 한 `TypeError` 등이 아닌가).
`expect({ status:` | 상태와 `code`를 함께 비교한다.
`beforeEach(async () => {` | **시험마다** 새로 준비한다. 시험끼리 데이터가 섞이지 않는다(시험 순서가 바뀌어도 같은 결과).
`repo = createSqliteRepo(openSqlite(":memory:"))` | 새 메모리 DB와 새 저장소.
`mina = await signup(` | 사용자 둘을 만든다. 서비스에 `repo`를 **직접 넘겨서** 전역 저장소를 건드리지 않는다.
@@end

@@code midpoint/tests/services.test.ts from=/  it\("남의 글은 403, 없는 글은 404"/ to=/^  \}\);/
`it("남의 글은 403` | 권한 규칙 시험.
`const post = await createPost(mina` | mina의 글을 만든다.
`await expectAppError(updatePost(joon` | joon이 고치면 → 403 `FORBIDDEN`.
`await expectAppError(deletePost(joon` | joon이 지우면 → 403.
`await expectAppError(getPost(9999` | 없는 글 → 404 `NOT_FOUND`.
@@end

### 4. 가짜 저장소: DB 없이 "판단"만

@@code midpoint/tests/mock-repo.test.ts from=/^function fakeRepo/ to=/^\}/
`function fakeRepo(` | 필요한 메서드만 덮어쓸 수 있는 가짜 저장소 공장.
`posts: Partial<Repo["posts"]> = {}` | `Partial`: 글 관련 메서드 중 **일부만** 바꿔 넣을 수 있다.
`const notUsed = () => {` | 이 시험에서 **호출되면 안 되는** 메서드.
`throw new Error(` | 호출되면 즉시 실패한다 → "필요 없는 곳에서 저장소를 부르는" 코드가 드러난다.
`return {` | `Repo` 인터페이스의 모양을 갖춘 객체.
`driver: "fake"` | 이름만.
`users: { create: notUsed,` | 기본은 "사용자 없음"(`findByEmail`은 `null`을 돌려주는 `vi.fn`). `...users`로 시험마다 덮어쓴다.
`posts: { list: notUsed,` | 기본은 "글 없음".
`comments:` | 이 시험들에선 쓰지 않는 메서드는 전부 `notUsed`.
`close:` | 아무것도 안 한다.
@@end

@@code midpoint/tests/mock-repo.test.ts from=/  it\("저장소가 null을 돌려주면/ to=/^  \}\);/
`it("저장소가 null을` | 서비스 규칙: 저장소의 `null`을 **404로 바꾼다**.
`const repo = fakeRepo()` | 글이 하나도 없는 가짜.
`await expect(getPost(1, repo)).rejects.toMatchObject(` | `getPost`가 상태 404·`NOT_FOUND`로 **거절(reject)**되는지 본다.
`expect(repo.posts.find).toHaveBeenCalledWith(1)` | **mock 확인**: 서비스가 저장소에 `1`을 넘겨 호출했는가.
@@end

### 5. 컴포넌트 테스트: 화면 조각의 반응

@@code midpoint/tests/post-form.test.tsx from=/  it\("제출하면 action이/ to=/^  \}\);/
`it("제출하면` | 시험: 제출하면 `action`이 불리고, 보내는 동안 버튼이 막힌다.
`const action = vi.fn(async () => {` | **가짜 `action`**: 호출 기록을 남기는 `vi.fn`.
`await new Promise(` | 일부러 50ms 느리게: "전송 중" 상태를 관찰할 시간을 만든다.
`return null` | 성공 응답.
`const Stub = createRoutesStub(` | **가짜 라우터**: 진짜 서버 없이 `<Form>`·`useNavigation`이 동작하는 작은 라우트 트리를 만든다.
`Component: () => <PostForm` | 시험할 컴포넌트를 라우트의 화면으로.
`action,` | 위의 가짜 `action`을 연결한다.
`render(<Stub />)` | 가상 브라우저(jsdom)에 그린다.
`await userEvent.type(` | 사용자가 입력하는 것처럼 글자를 친다(접근성 라벨 `제목`으로 찾는다).
`await userEvent.click(` | 버튼을 누른다.
`expect(await screen.findByRole(` | "저장 중…" 버튼이 **나타나기를 기다렸다가** 확인한다. `toBeDisabled()`: 중복 제출 방지.
`await vi.waitFor(` | 가짜 `action`이 정확히 1번 불렸는지(연타해도 1번).
@@end

> 컴포넌트 테스트 파일 맨 위의 `// @vitest-environment jsdom`이 이 파일만 브라우저 환경으로 돌립니다. 나머지는 빠른 Node 환경입니다.

### 6. 요청(HTTP) 테스트: 진짜 서버를 띄운다

@@code midpoint/tools/request-test.mjs from=/^const server = spawn\(/ to=/^\);/
`const server = spawn(` | 빌드된 서버를 **자식 프로세스로** 띄운다. 실제 `npm start`와 같은 코드가 돈다.
`process.execPath,` | 지금 쓰는 `node` 실행 파일.
`["node_modules/@react-router/serve/bin.js"` | 빌드 결과를 서빙하는 실행기.
`env: {` | 서버에 줄 환경변수. 테스트 전용이다.
`...process.env,` | 현재 환경을 물려받고
`PORT: String(port)` | **빈 포트**를 골라 다른 서버와 충돌하지 않는다.
`NODE_ENV: "production"` | 운영과 같은 모드로 시험한다(스택 숨김 등).
`COOKIE_SECURE: "false"` | 시험은 HTTP라서 Secure 쿠키를 끈다.
`SESSION_SECRET:` | 시험용 비밀키.
`DATABASE_PATH: join(dir` | **임시 폴더의 DB**. 끝나면 지운다. 개발 DB를 건드리지 않는다.
`CORS_ORIGIN:` | 출처 검사 시험용.
`LOG_REQUESTS: "0"` | 로그 소음 제거.
`stdio:` | 서버의 출력을 가로채 실패 시 보여 준다.
@@end

@@code midpoint/tools/request-test.mjs from=/const forbidden = await call/ to=/check\("남의 글 삭제/
`const forbidden = await call(` | **진짜 HTTP 요청**: joon의 토큰으로 mina의 글을 PATCH.
`check("남의 글 수정` | 기대: 403과 `FORBIDDEN` 코드. 상태만이 아니라 **오류 본문의 약속**까지 확인한다.
`const patched = await call(` | 주인이 일부 필드만 수정.
`check("부분 수정` | 200이고, **안 보낸 `tags`가 유지**되는지(study5의 PATCH 함정).
`check("빈 PATCH` | 경계 사례: 빈 수정은 400.
`check("남의 글 삭제` | 삭제도 403.
@@end

```powershell
cd midpoint
npm test                  # Vitest: 단위·가짜 저장소·컴포넌트 (1~2초)
npm run build             # 요청 테스트는 빌드 결과를 쓴다
npm run test:requests     # 서버를 띄워 HTTP로 전체 흐름 확인 (74개 항목)
```

### 7. 디버깅 도구

| 도구 | 언제 | 쓰는 법 |
| --- | --- | --- |
| **`console.log`** | 값을 빨리 보고 싶을 때 | `loader`·`action`의 로그는 **터미널**에, 컴포넌트의 로그는 **브라우저 콘솔**에 나온다(서버 렌더링 중에는 양쪽에 나올 수 있다) |
| **VS Code 디버거** | 한 줄씩 멈춰 보고 싶을 때 | 아래 `launch.json` 예시로 `npm run dev`를 디버그 모드로 실행하고 `loader` 안에 중단점 |
| **Network 탭** | 요청·응답 확인 | 문서 요청과 `….data` 요청 구분, 상태 코드, `X-Request-Id` 응답 헤더 |
| **React DevTools** | 컴포넌트 props·상태 | 브라우저 확장. `Components`에서 props를 눈으로 본다 |
| **`curl.exe -i`** | 브라우저 없이 API 확인 | 헤더까지 출력(`-i`), 본문 전송(`-d`) |
| **Vitest** | 한 파일만 | `npx vitest run tests/schemas.test.ts`, 이름으로 `-t "남의 글"` |

```jsonc
// .vscode/launch.json (예시 — 직접 만들어 쓴다)
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "midpoint 개발 서버 디버그",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "cwd": "${workspaceFolder}/midpoint",
      "console": "integratedTerminal"
    }
  ]
}
```

### 8. 로그 보는 법

서버는 **요청마다 JSON 한 줄**을 터미널에 찍습니다(`middleware/request.server.ts`). 실제 출력 예:

```json
{"level":"info","msg":"request","requestId":"b95b070b-f814-4fbe-8e3c-20a0685af7c7","method":"GET","path":"/posts","status":200,"ms":5}
{"level":"info","msg":"request","requestId":"d5f3829e-c665-488c-91a3-b3e2a6c41bea","method":"GET","path":"/nope","status":404,"ms":3}
```

| 필드 | 보는 이유 |
| --- | --- |
| `requestId` | 한 요청을 **로그·오류 응답·브라우저**에서 같은 번호로 추적한다. 사용자가 오류 화면의 번호를 알려 주면 바로 찾는다 |
| `status` | 5xx가 몰리는지 |
| `ms` | 느린 요청 찾기 |
| `level: "error"` | 예상 밖 오류(스택 포함) |

```powershell
npm start 2>&1 | Tee-Object server.log          # 화면에도 보고 파일에도 저장
# 오류와 5xx만 골라 보기
Get-Content server.log | ForEach-Object { try { $_ | ConvertFrom-Json } catch { } } |
  Where-Object { $_.level -eq "error" -or $_.status -ge 500 }
# 특정 요청 번호 추적
Select-String -Path server.log -Pattern "b95b070b-f814"
```

`entry.server.tsx`의 `handleError`가 `loader`·`action`·렌더링에서 던져진 **예상 밖 오류**를 JSON(`level: "error"`, 메서드·경로·스택)으로 남깁니다. 사용자가 연결을 끊어서 생긴 취소(`request.signal.aborted`)는 오류가 아니므로 기록하지 않습니다.

### 9. 자주 나는 오류 TOP 10

| 순위 | 증상 | 원인 | 해결 |
| --- | --- | --- | --- |
| 1 | `Hydration failed because the server rendered HTML didn't match` | 서버와 브라우저가 다른 글자를 만듦(`Date`·시간대, `localStorage`, `Math.random`) | 날짜는 시간대 고정 포매터, 브라우저 전용 값은 `useEffect` 뒤에 읽는다 |
| 2 | `환경변수 오류 — SESSION_SECRET …` | `.env` 누락·짧은 키 | `.env.example` 복사, 32자 이상 키 |
| 3 | `Server-only module referenced by client` | 컴포넌트가 `.server` 모듈을 value로 import | `loader`에서 호출하고 `loaderData`로 받는다 |
| 4 | API가 401인데 로그인한 것 같음 | `Authorization: Bearer` 누락/오타, 만료, 다른 출처에서 쿠키가 안 붙음 | 헤더 확인, `/api/auth/me`로 점검, 다른 출처는 토큰 사용 |
| 5 | `blocked by CORS policy` | `CORS_ORIGIN`에 출처 없음 / `OPTIONS` 사전 확인 실패 | 정확한 출처(스킴·포트 포함)를 등록 |
| 6 | `Body is unusable: Body has already been read` | `request.formData()`/`json()`을 두 번 | 한 번 읽어 변수에 담는다 |
| 7 | 저장했는데 화면이 안 바뀜 | `action` 대신 `fetch`를 직접 호출해 재검증이 없음 | `<Form>`/`fetcher` 또는 `revalidate()` |
| 8 | `UNIQUE constraint failed` / `FOREIGN KEY constraint failed` | 중복 값 / 없는 부모 참조 | 서비스에서 먼저 확인, repo가 `AppError`(409 등)로 변환 |
| 9 | 오류 화면이 500인데 원인 모름 | 예상 밖 오류는 사용자에게 숨김 | 터미널의 `level:"error"` 로그와 `requestId`로 찾는다 |
| 10 | 테스트에서 `document is not defined` / `Invalid hook call` | 컴포넌트 테스트인데 jsdom 환경이 아님 / React 중복 설치 | 파일 맨 위에 `// @vitest-environment jsdom`, `npm ls react`로 중복 확인 |

## ④ 🔗 연동 포인트

### 테스트에서 DB·API를 가짜(mock)로 바꾸는 방법

| 바꿀 것 | 방법 | 쓰는 때 | 예 |
| --- | --- | --- | --- |
| **DB(진짜 SQL로)** | 메모리 DB를 만들어 **인자로 주입** | 서비스의 SQL 결과까지 믿고 싶을 때 | `createSqliteRepo(openSqlite(":memory:"))` → `getPost(id, repo)` |
| **DB(판단만)** | 필요한 메서드만 가진 **가짜 저장소** 주입 | 서비스의 분기·오류 변환만 시험 | `fakeRepo({ find: async () => null })` |
| **전역 저장소** | `setRepoForTest(repo)` | 서비스가 아니라 **라우트까지** 시험할 때 | `afterEach(() => setRepoForTest(undefined))` |
| **환경변수** | `tests/setup.ts` 또는 `vi.stubEnv` | 설정이 다른 경우를 시험 | `resetConfigForTest()` 후 `getConfig()` |
| **외부 HTTP API** | `fetch`를 가짜로 교체 | 외부 서비스 호출 코드 | 아래 예 |
| **시간** | 시간을 **인자로** 받게 설계 | 만료·토큰 시험 | `signAccessToken(user, secret, 60, 1_000_000)` |
| **무작위·솔트** | 결과가 아닌 **성질**을 시험 | 해시 | `expect(a).not.toBe(b)` |

```ts
// 외부 API(fetch)를 가짜로 바꾸는 예: 호출한 주소와 인자를 검사하고, 원하는 응답을 돌려준다.
const fetchMock = vi.fn(async () => Response.json({ ok: true }));
vi.stubGlobal("fetch", fetchMock);
await sendSomething();                       // 시험 대상이 fetch를 부른다
expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/x", expect.objectContaining({ method: "POST" }));
vi.unstubAllGlobals();                       // 반드시 원래대로 되돌린다
```

project(study13)에서는 한 걸음 더 나아가 **로컬 모의 서버**(Resend·Stripe·GitHub·Ollama를 흉내 내는 작은 HTTP 서버)를 띄우고 앱의 `*_BASE_URL` 환경변수를 그쪽으로 돌립니다. 코드를 하나도 고치지 않고 **실제 네트워크 호출 경로 전체**를 시험하는 방법입니다.

### CI(자동 실행)와의 연결

`npm run typecheck && npm test && npm run build && npm run test:requests`가 한 묶음입니다. study16의 GitHub Actions가 푸시마다 이것을 그대로 실행합니다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 단독 실행하면 통과하는데 전체 실행하면 실패 | 시험끼리 **전역 상태**(싱글턴 저장소, 캐시)를 공유 | `beforeEach`에서 새 DB를 만들어 **인자로 주입**, 전역은 `afterEach`에서 되돌린다 |
| 시험이 가끔만 실패(flaky) | 시간·무작위·네트워크 의존, 비동기 대기 부족 | 시간을 주입, `vi.waitFor`/`findBy…`로 **조건을 기다린다**(고정 `sleep` 금지) |
| `EPERM: operation not permitted, rmdir`(Windows) | 아직 열려 있는 DB 파일을 지우려 함 | 지우기 전에 `db.close()`(요청 테스트의 `finally`에서도 서버를 먼저 끈다) |
| 요청 테스트가 `fetch failed` | 서버가 시작 전·이미 종료됨 | `waitReady()`로 `/health`를 기다리고, 실패 시 `serverLog`를 출력한다 |
| 요청 테스트에서 `Set-Cookie`가 안 보임 | `fetch`의 `redirect: "follow"`가 중간 응답을 삼킴 | `redirect: "manual"`로 직접 받고 `getSetCookie()`로 읽는다 |
| `expect(…).toBe(…)`가 객체에서 실패 | `toBe`는 **같은 참조** 비교 | 값 비교는 `toEqual`/`toMatchObject` |
| 비동기 오류를 `expect`가 못 잡음 | `await expect(promise).rejects…`에서 `await` 누락 | 항상 `await expect(…).rejects` |
| Vitest가 `~/…`를 못 찾음 | `vitest.config.ts`의 `alias` 누락 | `~` → `app`을 지정(이 저장소는 되어 있음) |
| 컴포넌트 테스트의 `act(...)` 경고 | 상태 변경이 테스트가 끝난 뒤 일어남 | `await screen.findBy…`/`vi.waitFor`로 끝까지 기다린다 |

## ⑥ 직접 해보기

1. `tests/schemas.test.ts`에 새 시험을 추가한다: `parseListQuery`가 아닌 `parseTags`에 `"a,,b ,a"`를 넣어 `["a", "b"]`가 나오는지. **먼저 틀린 기대값으로 실패하는 것을 보고**(빨강) 고쳐서 통과(초록)시킨다.
2. 가짜 저장소를 써서 `deletePost`가 **남의 글이면 403을 던지고 `repo.posts.remove`가 호출되지 않는다**는 시험을 쓴다(`expect(remove).not.toHaveBeenCalled()`). 이어서 `remove`를 `notUsed`로 두면 같은 시험이 코드 버그를 어떻게 잡아 주는지 설명한다.
3. `npm run build && npm run test:requests`를 실행하다가 서버 코드를 일부러 고쳐(예: `forbidden`을 `unauthorized`로) 요청 테스트가 **어느 항목에서 실패**하는지 보고, 서버 로그의 `requestId`로 해당 요청을 찾는다. 고친 것을 되돌린다.

## ⑦ ☐ 체크리스트

- [ ] 단위·가짜 저장소·컴포넌트·요청 테스트가 각각 무엇을 시험하는지 구분하고 `npm test`, `npm run test:requests`를 실행했다.
- [ ] 서비스에 `repo`를 **인자로 주입**하는 이유(DI)와 fake·stub·spy·mock의 차이를 설명할 수 있다.
- [ ] 테스트가 `.env`가 아닌 `tests/setup.ts`와 메모리 DB를 쓰는 이유를 안다.
- [ ] 요청 로그(JSON)에서 `requestId`로 한 요청을 추적하고 5xx만 골라 볼 수 있다.
- [ ] 자주 나는 오류 TOP 10 중 세 가지를 직접 재현하고 고쳐 보았다.
- [ ] 외부 HTTP API 호출을 `vi.stubGlobal("fetch", …)` 또는 로컬 모의 서버로 바꾸는 방법을 설명할 수 있다.

## ⑧ 다음 단계 연결

시험이 통과하는 코드를 [study10.md](study10.md)에서 **빌드·배포**하고, 도메인·HTTPS 개념과 배포 환경의 환경변수·DB 연결, 배포 후 점검표까지 기초 구간을 정리합니다.
