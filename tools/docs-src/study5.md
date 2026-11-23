# study5 — 폼·입력·검증

> 기준: [노션 · React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06) · 응답 규칙은 [공통 API 스펙 v1](https://app.notion.com/p/3d6d7dec5e2e8139adbfd36dd506c65e) 5절(오류 응답). 코드: [midpoint/app/lib/](midpoint/app/lib/), [midpoint/app/components/post-form.tsx](midpoint/app/components/post-form.tsx), [midpoint/app/routes/posts/new.tsx](midpoint/app/routes/posts/new.tsx).

## ① 목표 한 줄

`action` + `Form`으로 사용자 입력을 받아 서버에서 검증하고, 오류 메시지를 표시하며, 중복 제출을 막고, 입력값을 서버 API로 보내 응답 코드(200·400·422)에 따라 화면을 바꾼다.

## ② 📖 이론

### 왜 `action` + `Form`인가

전통적인 웹 폼은 "`<form>`을 제출하면 서버가 처리하고 새 화면을 돌려준다"입니다. React Router 7은 이 단순한 모델을 그대로 살립니다.

1. `<Form method="post">`를 제출하면
2. 그 라우트의 **`action`**이 서버에서 실행되고
3. 끝나면 화면의 `loader`가 **자동으로 다시 실행**되어 최신 데이터가 보입니다.

`useState`로 입력마다 상태를 만들고, `fetch`로 보내고, 로딩·오류 상태를 직접 관리하는 코드가 거의 사라집니다. 자바스크립트가 아직 로드되기 전에도 폼이 동작합니다(점진적 향상).

### 핵심 개념

- **검증은 서버가 최종 책임**: 브라우저 검증(`required`, `maxLength`)은 편의일 뿐, 요청은 `curl`로도 올 수 있다. **서버에서 반드시** 다시 검증한다.
- **하나의 스키마를 두 곳에서**: 검증 규칙을 `zod` 스키마로 한 번 쓰고 서버·(필요하면) 브라우저가 같이 쓴다.
- **오류의 모양을 통일**: 검증 실패는 `{ 필드: [메시지] }`로 만들어 화면(폼)과 API가 같은 모양을 쓴다.
- **PRG 패턴**(Post → Redirect → Get): 저장에 성공하면 화면을 돌려주지 않고 **다른 주소로 redirect**한다. 새로고침해도 폼이 다시 제출되지 않는다.
- **중복 제출 방지**: 전송 중에는 버튼을 막는다(`useNavigation().state`). 서버 쪽 최종 방어선은 DB의 UNIQUE 제약이다.

### 응답 코드와 화면

| 응답 | 뜻 | 화면에서 할 일 |
| --- | --- | --- |
| 200 / 201 / 204 | 성공 | 성공 화면으로 이동(`redirect`) 또는 갱신 |
| **400** `VALIDATION_ERROR` | 입력이 규칙에 맞지 않음(`fields` 포함) | 필드 아래에 메시지, 입력값 유지 |
| **422** | (다른 서버들이 검증 실패에 쓰는 코드) | 400과 **똑같이** 필드 오류로 처리 |
| 401 `UNAUTHORIZED` / `INVALID_CREDENTIALS` | 로그인 필요 / 로그인 실패 | 로그인 화면 이동 / 폼 위 오류 문구 |
| 403 | 권한 없음 | 오류 화면 |
| 409 `EMAIL_TAKEN` | 중복 | 해당 필드에 메시지 |
| 429 | 너무 많은 요청 | "잠시 후 다시" + `Retry-After` |
| 5xx | 서버 오류 | 일반 오류 안내(내부 정보 노출 금지) |

이 저장소의 공통 스펙 v1은 검증 실패에 **400**을 씁니다. 다른 서버(Rails, FastAPI 등)는 **422**를 쓰는 경우가 많아, 클라이언트는 `400 || 422`를 같은 갈래로 처리하는 것이 안전합니다.

### 비유

폼은 **은행 창구 신청서**입니다. 신청서(입력)를 내면 창구 직원(`action`)이 **서류를 검사**(검증)하고, 틀린 칸에 **빨간 펜으로 표시**(필드 오류)해서 돌려주거나, 접수하고 **영수증 창구로 안내**(redirect)합니다. 접수 도장(DB의 UNIQUE)이 이미 찍혀 있으면 "중복 접수"라고 막습니다.

## ③ 🛠️ 실기 — 전체 코드와 줄별 설명

### 1. 검증 규칙을 한 곳에: zod 스키마

@@code midpoint/app/lib/schemas.ts from=/^const email = z/ to=/^\}\);/
`const email = z` | 이메일 규칙을 변수로 빼 가입·로그인이 같이 쓴다.
`.string()` | 문자열이어야 한다(숫자·배열이면 오류).
`.trim()` | 앞뒤 공백을 **먼저 제거**한다. 값 변환과 검증이 한 흐름이다.
`.toLowerCase()` | 소문자로 통일한다. `Mina@x.com`과 `mina@x.com`을 같은 이메일로 본다.
`.pipe(z.email(` | 변환이 끝난 값을 이메일 형식 검사에 넘긴다. 실패 메시지는 한국어로 지정한다.
`export const signupSchema` | 가입 입력의 전체 규칙.
`email,` | 위에서 만든 규칙 재사용.
`password: z` | 비밀번호 규칙. **trim을 하지 않는다**(공백도 비밀번호의 일부일 수 있다).
`.min(8` | 8자 미만이면 이 메시지가 해당 필드의 오류가 된다.
`.max(72` | 72자 제한. bcrypt 계열의 한계와 서버 과부하(아주 긴 입력) 방지를 겸한다.
`nickname:` | 2~20자. 앞뒤 공백은 제거된다.
@@end

@@code midpoint/app/lib/schemas.ts from=/^const title = z/ to=/^  \.refine/
`const title` | 제목: 1~200자.
`const body` | 본문: 1~10000자.
`const tag =` | 태그 하나: 1~30자.
`const tags` | 태그 배열: 최대 5개.
`export const postCreateSchema` | 글 **작성**의 규칙.
`tags: tags.default([])` | 태그를 안 보내면 빈 배열. 작성에서는 "안 보냄 = 없음"이 맞다.
`// PATCH는` | 주석: 수정은 일부 필드만 올 수 있다.
`export const postPatchSchema` | 글 **수정**의 규칙.
`title: title.optional()` | 안 보내도 된다. 여기에 `.default()`를 두면 **안 보낸 필드가 기본값으로 덮어써지는** 버그가 생긴다(그래서 `optional`만).
`.refine` | 모든 필드가 비어 있는 수정 요청(`{}`)은 거절한다.
@@end

### 2. 검증 결과를 오류 모양으로

@@code midpoint/app/lib/validate.ts from=/^\/\*\* zod 오류를/ to=/^\}$/
`/** zod 오류를` | 주석.
`export function toFieldErrors` | zod의 오류 목록을 `{ 필드: [메시지, …] }`로 바꾼다.
`const fields: FieldErrors = {}` | 결과를 담을 객체.
`for (const issue of error.issues)` | 규칙을 어긴 항목마다.
`const key = issue.path.join(".")` | 필드 이름. 중첩이면 `tags.0`처럼 점으로 잇는다. 필드가 없는 오류는 `_`.
`(fields[key] ??= []).push(` | 그 필드의 배열이 없으면 만들고 메시지를 추가한다(`??=`).
`return fields` | 폼과 API가 같이 쓰는 모양.
@@end

@@code midpoint/app/lib/validate.ts from=/^\/\*\* 검증에 성공하면/ to=/^\}$/
`/** 검증에 성공하면` | 주석.
`export function parseOrThrow` | **성공하면 정제된 값**, 실패하면 오류를 던진다.
`const result = schema.safeParse(input)` | 던지지 않는 검증. 결과 객체에 `success`가 있다.
`if (result.success) return result.data` | `data`는 `trim`·`toLowerCase`·`default`가 적용된 **정제된 값**이다. 입력 원본이 아니라 이것을 쓴다.
`throw validationError(` | 실패하면 `VALIDATION_ERROR`(400) + `fields`.
@@end

### 3. 폼 → `action`: 입력을 읽고 검증하고 이동

@@code midpoint/app/lib/form.server.ts from=/^\/\*\* FormData에서/ to=/^\}$/
`/** FormData에서` | 주석.
`export function readFields` | 폼에서 **문자열 필드만** 꺼낸다.
`const values = {} as Record<K, string>` | 키 이름이 타입에 남도록 제네릭으로 만든다.
`for (const key of keys)` | 필요한 필드만 순회한다. 폼에 몰래 끼워 넣은 다른 필드는 무시된다.
`typeof value === "string" ? value : ""` | `form.get()`은 문자열·파일·`null`일 수 있다. 문자열만 받고 나머지는 빈 문자열로.
@@end

@@code midpoint/app/lib/form.server.ts from=/^export function failure/ to=/^\}$/
`export function failure` | `action`의 `catch`에서 쓰는 도우미.
`if (error instanceof AppError)` | **우리가 정한 오류**(검증·인증·중복 등)만 화면용으로 바꾼다.
`const body: FormFailure = {` | 화면이 쓸 모양: `errors`(필드별), `formError`(폼 전체 오류), `values`(다시 채울 값).
`errors: error.fields ?? {}` | 필드 오류가 없으면 빈 객체.
`formError: error.fields ?` | 필드가 아니라 폼 전체에 대한 오류(예: 로그인 실패)면 메시지 하나.
`return data(body, { status: error.status })` | 상태 코드를 **그대로 유지**한다(400, 401, 409 …). 화면과 로그가 같은 코드를 본다.
`throw error` | **그 밖의 오류는 다시 던진다.** 코드 버그는 500으로, `throw redirect()`는 이동으로 올바르게 처리된다.
@@end

@@code midpoint/app/routes/posts/new.tsx from=/^export async function action/ to=/^\}$/
`export async function action` | `POST /posts/new`를 받는다.
`const user = requireUser(context, url)` | 화면을 가린 미들웨어와 **별개로** `action`도 직접 확인한다. 미들웨어를 우회하는 요청에도 안전하다.
`const form = await request.formData()` | 폼 본문을 읽는다. **한 번만** 읽을 수 있다.
`const values = readFields(` | 필요한 세 필드만 문자열로.
`try {` | 저장을 시도한다.
`createPost(user, { ...values, tags: parseTags(values.tags) })` | `"a, b"` 같은 글자를 태그 배열로 바꿔 서비스에 넘긴다. **검증은 서비스 안**에서 한다.
`return await redirectWithFlash(` | **성공 → redirect(PRG)**. 새로고침해도 다시 제출되지 않고, "글을 등록했습니다" 메시지를 다음 화면에 한 번 보여 준다.
`} catch (error) {` | 검증·권한 오류.
`return failure(error, values)` | 실패 → 상태 코드와 함께 `errors`·`values`를 돌려준다. 화면은 이 값으로 입력칸을 다시 채운다.
@@end

### 4. 폼 화면: 오류 표시와 중복 제출 방지

@@code midpoint/app/components/post-form.tsx from=/^export function PostForm/ to=/^\}$/
`export function PostForm` | 글쓰기·수정이 같이 쓰는 폼. 서버가 돌려준 오류(`failure`)를 props로 받는다.
`const navigation = useNavigation()` | 이동·제출의 진행 상태를 알려 준다.
`const submitting = navigation.state !== "idle"` | `idle`이 아니면(`submitting`/`loading`) 제출 중이다.
`const values = failure?.values ?? defaults` | 서버가 돌려준 값이 있으면 그것으로, 없으면 기본값으로 입력칸을 채운다.
`<Form method="post"` | 제출하면 **현재 주소의 `action`**으로 간다. `/posts/new`면 `new.tsx`의 `action`.
`<FormError message=` | 폼 전체 오류(필드에 속하지 않는 것).
`<label htmlFor="title"` | **label과 input을 연결**한다. 글자를 눌러도 입력칸에 포커스가 가고, 스크린 리더가 읽는다.
`defaultValue={values.title}` | 비제어 입력. 값은 제출 때 `FormData`로 읽힌다.
`maxLength={200}` | 브라우저의 1차 방어(편의). 서버가 최종이다.
`aria-invalid=` | 오류가 있는 입력칸을 접근성 도구에 알린다.
`<FieldError messages=` | 그 필드의 첫 오류 메시지를 보여 준다.
`<textarea` | 본문 입력칸.
`id="tags"` | 쉼표로 구분한 태그 입력칸. 서버에서 `parseTags`가 배열로 바꾼다.
`{/* 전송 중에는` | 주석.
`disabled={submitting}` | **중복 제출 방지**: 전송 중에는 눌러도 동작하지 않는다.
`{submitting ? "저장 중…" : submitLabel}` | 상태를 글자로도 알려 준다.
@@end

## ④ 🔗 연동 포인트

### 입력값을 서버 API로 보내고 응답 코드에 따라 화면 바꾸기

같은 서비스를 **API로도** 부를 수 있습니다. 화면 폼과 API가 같은 검증·같은 오류 모양을 쓰므로 어느 쪽으로 보내든 결과가 같습니다. 서버를 띄우고(`npm run dev`) 아래를 실행해 응답 코드를 직접 보세요.

```powershell
# 1) 검증 실패 → 400 + 필드별 메시지
curl.exe -s -i -X POST http://localhost:5173/api/auth/signup `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"x\",\"password\":\"1\",\"nickname\":\"\"}'
```

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
X-Request-Id: 3c0f…

{"error":{"code":"VALIDATION_ERROR","message":"입력값을 확인하세요.",
 "fields":{"email":["올바른 이메일을 입력하세요."],"password":["8자 이상 입력하세요."],"nickname":["2~20자로 입력하세요."]},
 "requestId":"3c0f…"}}
```

```powershell
# 2) 성공 → 201, 3) 같은 이메일 다시 → 409 EMAIL_TAKEN
curl.exe -s -o NUL -w "%{http_code}`n" -X POST http://localhost:5173/api/auth/signup -H "Content-Type: application/json" -d '{\"email\":\"mina@example.com\",\"password\":\"password123\",\"nickname\":\"mina\"}'
curl.exe -s -o NUL -w "%{http_code}`n" -X POST http://localhost:5173/api/auth/signup -H "Content-Type: application/json" -d '{\"email\":\"MINA@example.com\",\"password\":\"password123\",\"nickname\":\"dup\"}'
```

브라우저의 `fetch`로 보낼 때 화면을 바꾸는 갈래는 다음과 같이 씁니다(실제 구현은 [project의 문의 폼](project/app/components/lab/ui-demos.tsx), study12).

```ts
const response = await fetch("/api/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
if (response.status === 201) navigate(response.headers.get("Location")!);        // 성공: Location 헤더가 새 글 주소
else if (response.status === 400 || response.status === 422) showFieldErrors((await response.json()).error.fields); // 검증 실패
else if (response.status === 401) navigate("/login");                           // 로그인 필요
else if (response.status === 429) showMessage(`잠시 후 다시 (${response.headers.get("Retry-After")}초)`);
else showMessage("잠시 후 다시 시도하세요.");                                   // 5xx 등
```

> 화면(`<Form>`)은 위 갈래를 **직접 코딩할 필요가 없습니다.** `action`이 `data(body, { status })`를 돌려주면 `useActionData()`로 받고, 성공은 `redirect`가 처리하기 때문입니다.

### 서비스 계층과의 연결

`action`은 얇습니다: 읽기(`formData`) → 서비스 호출 → 결과에 따라 `redirect` 또는 `failure`. 검증·업무 규칙은 서비스(`createPost`)에 있어서 API 라우트(`routes/api/posts.ts`)도 같은 함수를 부릅니다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `Body is unusable: Body has already been read` | `request.formData()`를 두 번 호출 | 한 번 읽어 변수에 담아 쓴다 |
| 체크박스를 끄면 서버에 필드가 아예 없음 | 체크 해제된 체크박스는 `FormData`에 포함되지 않음 | `form.get("agree") === "on"`처럼 **없음 = false**로 해석 |
| 성공했는데 새로고침하면 "다시 제출하시겠습니까?" | `action`이 화면 데이터를 돌려줌(PRG 아님) | 성공 시 `redirect`한다 |
| 오류가 나도 입력한 내용이 사라짐 | `failure`의 `values`로 다시 채우지 않음 | `defaultValue={failure?.values.x ?? 기본값}` |
| `try/catch`가 `redirect`를 삼켜 이동이 안 됨 | `throw redirect(…)`를 `catch`에서 오류로 처리 | `failure()`는 `AppError` 외에는 **다시 던진다** |
| 버튼을 연타하면 글이 두 개 | 전송 중에도 버튼이 활성 | `disabled={navigation.state !== "idle"}`, 최종 방어는 DB UNIQUE·멱등 키 |
| 한글 이메일/공백 때문에 가입이 안 됨 | 검증 규칙과 입력이 다름 | 스키마의 `trim`·`toLowerCase`가 적용된 **`result.data`**를 쓴다 |
| PATCH로 태그를 안 보냈는데 태그가 지워짐 | 수정 스키마에 `.default([])`를 둠 | 수정 스키마는 `optional()`만 쓴다([midpoint/tests/schemas.test.ts](midpoint/tests/schemas.test.ts)) |
| Windows PowerShell 5.1에서 `curl.exe`에 한글을 넘기면 400·글자 깨짐 | 5.1은 인자·출력을 시스템 코드 페이지(CP949)로 다뤄 UTF-8과 어긋남 | 명령 예시는 ASCII로 쓰고, 한글이 필요하면 본문을 파일에 저장해 `-d "@body.json"`, 또는 PowerShell 7(`pwsh`) 사용 |
| 값에 공백이 든 JSON을 `-d '{\"a\":\"b c\"}'`로 보내면 400(5.1) | 5.1이 따옴표와 공백이 섞인 인자를 잘못 쪼갬 | `'{"a":"b c"}' \| curl.exe … --data-binary "@-"`처럼 표준 입력으로 보낸다 |
| 자바스크립트를 끄면 폼이 안 됨 | `<form>` 대신 `div`+`onClick`으로 만듦 | `<Form>`(진짜 form)을 쓰면 JS 없이도 제출된다 |

## ⑥ 직접 해보기

1. `/posts/new`에서 제목을 비우고 제출해 오류 문구와 **입력한 본문이 유지되는지** 확인한다. 이어서 제목을 201자로 만들어 보고(브라우저 `maxLength`를 개발자도구에서 지운 뒤), 서버가 같은 오류를 내는지 본다.
2. 개발자도구 Network의 **Throttling → Slow 3G**로 느리게 만든 뒤 "등록"을 연타해 글이 몇 개 생기는지 확인한다. `disabled={submitting}`를 지웠다가 되돌려 비교한다.
3. 위 `curl.exe` 예제를 실행해 400·201·409 응답을 확인하고, 본문 JSON을 일부러 깨뜨려(`{not json`) `BAD_REQUEST`가 나오는 것을 본다. 400과 422를 다 받는 클라이언트 `if` 문을 한 줄로 적어 본다.

## ⑦ ☐ 체크리스트

- [ ] `action` + `Form` 컴포넌트로 글쓰기 (Next Server Action, SvelteKit form action과 비교)
- [ ] 검증이 서버에서 이뤄지는 이유와, 브라우저 검증(`maxLength`)이 "편의"인 이유를 설명할 수 있다.
- [ ] 같은 `zod` 스키마가 가입·글쓰기·API에서 재사용되는 흐름을 따라갔다.
- [ ] 검증 실패 → `failure()` → `actionData` → 필드 아래 메시지와 입력값 유지까지 직접 확인했다.
- [ ] 성공 시 `redirect`(PRG)를 쓰는 이유와, 전송 중 버튼 `disabled`로 중복 제출을 막는 방법을 안다.
- [ ] 200·201·204·400·401·409·422·429에 따라 화면이 어떻게 갈라지는지 표로 말할 수 있다.

> 원문 항목 끝의 "(Next Server Action, SvelteKit form action과 비교)"는 노션 표기를 그대로 둔 것입니다. 이 과정은 React Router 7만 다루므로 **비교는 수행하지 않았고**, RR7의 `action` + `Form`으로 글쓰기를 구현·확인하는 데까지 합니다(README의 "넣지 못한 항목" 참고).

## ⑧ 다음 단계 연결

입력을 검증해 안전하게 받았으니 [study6.md](study6.md)에서 그 값을 **DB에 저장하고 읽는 CRUD**를 만들고, 공통 API 스펙 v1에 맞춰 환경변수로 연결 정보를 분리합니다.
