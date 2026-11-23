# study13 — 외부 서비스 연동

> 기준: [노션 · React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06). 코드: [project/app/services/](project/app/services/)(`mail`·`uploads`·`payments`·`oauth`), [project/app/routes/](project/app/routes/)(`auth-github*`·`api/payments-*`·`api/uploads`), 모의 서버 시험 [project/tools/request-test.mjs](project/tools/request-test.mjs).

## ① 목표 한 줄

메일(Resend), 파일 업로드, 결제(Stripe 테스트), 소셜 로그인(GitHub OAuth)을 React Router 7 서버에 연결하고, **비밀키는 서버만 갖는다**는 원칙과 실패에 대비하는 방법을 익힌다.

## ② 📖 이론

### 외부 서비스를 붙일 때의 다섯 가지 원칙

| 원칙 | 의미 | 이 단계의 구현 |
| --- | --- | --- |
| **비밀은 서버만** | API 키·클라이언트 시크릿은 브라우저로 내려가면 안 된다 | `.server.ts` 안에서만 사용, 환경변수로 주입 |
| **시간 제한** | 남의 서버는 느려지거나 멈춘다 | `AbortSignal.timeout(10_000)` |
| **실패는 다시 시도** | 일시적 오류(500, 네트워크)는 흔하다 | 작업 큐의 재시도(지수 백오프, study15) |
| **응답을 기다리지 않는다** | 메일 서버가 느려도 가입은 빨라야 한다 | `enqueue()`로 뒤에서 처리 |
| **들어오는 것은 믿지 않는다** | 웹훅·콜백·업로드는 외부에서 온 입력이다 | 서명 검증, `state` 확인, 매직 넘버 검사 |

### 네 가지 연동의 모양

| 서비스 | 방향 | 인증 | 핵심 위험 |
| --- | --- | --- | --- |
| **메일(Resend)** | 우리 → 서비스(HTTP API) | `Authorization: Bearer 키` | 느려서 응답이 지연, 헤더 주입 |
| **파일 업로드** | 브라우저 → 우리(multipart) | 우리 로그인 | 가짜 확장자, 거대 파일, 경로 조작 |
| **결제(Stripe)** | 우리 → 서비스 → 브라우저 이동, 그리고 **서비스 → 우리(웹훅)** | 비밀키 / 웹훅 서명 | 웹훅 위조·재전송, "결제 완료 화면"을 믿는 실수 |
| **소셜 로그인(OAuth)** | 브라우저 ↔ GitHub ↔ 우리 | 클라이언트 ID·시크릿 | 로그인 CSRF, 검증 안 된 이메일로 계정 연결 |

### 비유

외부 서비스는 **택배사·은행·신분증 발급소**입니다. 택배사(메일)에 맡기고 영수증만 받고 돌아오며(기다리지 않기), 은행(결제)이 "입금 완료"를 **전화로 알려 올 때는 본인 확인 암호(서명)를 대조**하고, 신분증 발급소(OAuth)에서 돌아온 사람은 **우리가 발급한 쪽지(state)를 들고 왔는지** 확인합니다.

## ③ 🛠️ 실기 — 전체 코드와 줄별 설명

### 1. 메일: Resend HTTP API

@@code project/app/services/mail.server.ts from=/^export async function sendMail/ to=/^\}/
`export async function sendMail` | 메일 한 통을 보낸다. 실패하면 **던진다**(호출하는 쪽의 작업 큐가 재시도한다).
`const config = getConfig()` | 설정은 한 곳에서.
`if (config.MAIL_DRIVER === "log") {` | **개발·테스트 모드**: 실제로 보내지 않고 로그만 남긴다. 가짜 메일 서비스를 켜지 않고도 개발할 수 있다.
`// 수신자 주소 전체를` | 주석: 개인정보 보호.
`const [local, domain]` | 주소를 앞뒤로 나눈다.
`console.log(JSON.stringify(` | `mi***@example.com`처럼 **일부만** 기록한다.
`return` | 끝.
`if (!config.RESEND_API_KEY) throw` | 운영 모드인데 키가 없으면 분명한 오류로 실패한다.
`const response = await fetch(` | Resend의 HTTP API를 부른다(별도 SDK 없이 `fetch`면 충분하다). 주소는 `RESEND_BASE_URL` 환경변수라서 **테스트에서 모의 서버로** 돌릴 수 있다.
`method: "POST"` | 메일 생성.
`headers: { Authorization:` | 비밀키는 **헤더로**(URL 쿼리에 넣으면 로그에 남는다).
`body: JSON.stringify({ from:` | 보내는 사람·받는 사람·제목·본문.
`signal: AbortSignal.timeout(10_000)` | 10초 안에 안 오면 중단한다. 이게 없으면 서비스가 멈췄을 때 우리 작업이 영원히 대기한다.
`if (!response.ok) {` | 2xx가 아니면
`throw new Error(` | 상태와 응답 앞부분(200자)을 담아 던진다(전체를 로그에 넣지 않는다).
@@end

가입 응답을 메일 서버 속도에 묶지 않도록 **큐에 넣고 바로 돌아옵니다**.

@@code project/app/services/auth.server.ts from=/^  \/\/ 가입 응답을 메일 서버/ to=/^  enqueue\("welcome-mail"/
`// 가입 응답을` | 주석.
`enqueue("welcome-mail"` | 작업 이름과 함수를 큐에 넣고 **기다리지 않고** 다음 줄로 간다. 메일이 500을 돌려줘도 가입은 이미 성공했고, 큐가 알아서 다시 시도한다.
@@end

### 2. 파일 업로드: 믿지 않고 검사한다

@@code project/app/services/uploads.server.ts from=/^\/\/ 클라이언트가 보낸 Content-Type은/ to=/^\];/
`// 클라이언트가` | 주석: 브라우저가 보낸 `Content-Type`이나 파일 이름의 확장자는 **거짓말일 수 있다.**
`const SIGNATURES` | 종류별 "매직 넘버" 판별표. 파일의 **첫 바이트**가 진짜 종류를 말해 준다.
`image/png` | PNG는 항상 `89 50 4E 47`로 시작한다.
`image/jpeg` | JPEG는 `FF D8 FF`.
`image/webp` | WEBP는 `RIFF`로 시작하고 8~12번째 바이트가 `WEBP`.
`application/pdf` | PDF는 `%PDF`.
@@end

@@code project/app/services/uploads.server.ts from=/^export async function saveUpload/ to=/^\}/
`export async function saveUpload` | 요청의 multipart 본문에서 `file` 필드를 검사하고 저장한다.
`const config = getConfig()` | 한도(`MAX_UPLOAD_BYTES`)와 저장 폴더(`UPLOAD_DIR`)는 환경변수.
`// 본문을 읽기 전에` | 주석: 값싼 검사부터.
`const declared = Number(` | 헤더가 말하는 크기.
`if (declared >` | **본문을 읽기 전에** 너무 크면 거절한다(거대 요청이 메모리를 채우지 못하게). 헤더는 거짓일 수 있어 아래에서 실제 크기로 한 번 더 본다.
`let form: FormData` | 폼 데이터.
`try {` | 파싱을 시도하고
`form = await request.formData()` | multipart를 읽는다. **이 방식은 파일을 메모리에 올린다.** 한도가 작을 때만 안전하다(큰 파일은 스트리밍 파서 필요).
`} catch {` | multipart가 아니면
`const file = form.get("file")` | `file` 필드.
`if (!(file instanceof File))` | 파일이 아니면 400(필드 오류 `file`).
`if (file.size === 0)` | 빈 파일 거절.
`if (file.size > config` | **실제 크기**로 한 번 더 검사 → 413.
`const bytes = Buffer.from(` | 바이트로 읽는다.
`const kind = SIGNATURES.find(` | **첫 바이트로 종류를 판별**한다.
`if (!kind) throw` | PNG·JPEG·WEBP·PDF가 아니면 400. 이름이 `.png`여도 내용이 HTML이면 여기서 막힌다.
`// 저장 이름은` | 주석: 파일 이름도 입력이다.
`const name = `${randomUUID()}` | **서버가 만든 무작위 이름 + 판별한 확장자**. 사용자가 보낸 이름(`../../x`)은 쓰지 않는다 → 경로 조작·덮어쓰기 불가.
`await mkdir(` | 폴더가 없으면 만든다.
`await writeFile(` | 저장.
`return { name` | 주소(`/uploads/이름`), 크기, 종류를 돌려준다.
@@end

@@code project/app/services/uploads.server.ts from=/^export async function readUpload/ to=/^\}/
`export async function readUpload` | 저장된 파일을 읽는다.
`if (!NAME_PATTERN.test(name))` | 이름이 **우리가 만든 형식(UUID.확장자)**일 때만 통과. `..%2f..%2fpackage.json` 같은 경로 조작 요청은 여기서 404.
`const ext = name.split(".").pop()!` | 확장자로
`const kind = SIGNATURES.find(` | 응답에 쓸 `Content-Type`을 정한다(저장된 확장자 기준).
`const path = join(` | 폴더와 이름을 안전하게 합친다.
`try {` | 파일 존재 확인.
`await stat(path)` | 없으면
`} catch {` | 404.
`return { bytes: await readFile(` | 바이트와 종류.
@@end

@@code project/app/routes/uploads-file.ts from=/^export async function loader/ to=/^\}/
`export async function loader` | `GET /uploads/:name`.
`try {` | 읽기를 시도.
`const { bytes, contentType } = await readUpload(` | 이름 검사 포함.
`return new Response(new Uint8Array(bytes), {` | 파일 내용을 그대로 응답한다.
`"Content-Type": contentType` | 서버가 판별한 종류만 보낸다.
`"X-Content-Type-Options": "nosniff"` | 브라우저가 내용을 보고 종류를 **멋대로 바꿔 해석하지 못하게** 한다(이미지로 올린 HTML 실행 방지).
`"Content-Security-Policy": "default-src 'none'; sandbox"` | 혹시 HTML이 섞여도 스크립트·자원 로딩을 **전부 금지**한다(이중 방어).
`"Cache-Control": "public, max-age=31536000, immutable"` | 이름이 내용마다 유일하므로 영구 캐시해도 된다.
`} catch (error) {` | 오류는
`if (error instanceof AppError) return errorResponse(` | JSON 오류(404 등)로.
`throw error` | 예상 밖 오류는 그대로.
@@end

### 3. 결제: Stripe Checkout

흐름: ① 우리 서버가 Stripe에 **결제 세션**을 만든다 → ② 브라우저를 Stripe의 결제 화면으로 보낸다(카드 정보는 **우리 서버를 거치지 않는다**) → ③ 결제가 끝나면 Stripe가 우리 **웹훅**으로 알린다.

@@code project/app/services/payments.server.ts from=/^export async function createCheckoutSession/ to=/^\}/
`export async function createCheckoutSession` | 결제 세션 생성.
`const config = getConfig()` | 설정.
`if (!config.STRIPE_SECRET_KEY` | 키·상품이 없으면 **503으로 분명히** 알린다(조용히 실패하지 않는다).
`// Stripe API는 JSON이` | 주석: Stripe는 JSON이 아니라 폼 인코딩을 받는다.
`const body = new URLSearchParams({` | `key=value&…` 본문을 안전하게 만든다.
`mode: "payment"` | 일회성 결제.
`"line_items[0][price]"` | **중첩 키는 대괄호**로 쓴다. 상품 가격 ID(`price_…`)는 Stripe 대시보드에서 만든 것.
`success_url:` | 결제 후 돌아올 주소. **이 화면에 왔다고 결제가 끝난 것은 아니다**(아래 웹훅이 진실).
`client_reference_id` | 우리 사용자 번호. 웹훅에서 "누구의 결제인지" 알 수 있다.
`const response = await fetch(` | Stripe 호출. `Authorization: Bearer 비밀키`.
`signal: AbortSignal.timeout` | 10초 제한.
`if (!response.ok) throw new AppError(502` | 결제 서비스가 거절하면 502(상대 서버 문제)로.
`const session = (await response.json())` | `id`와 결제 화면 `url`을 받는다.
`return { id: session.id` | 이 `url`로 브라우저를 보낸다.
@@end

@@code project/app/services/payments.server.ts from=/^export function verifyStripeSignature/ to=/^\}/
`export function verifyStripeSignature` | 웹훅이 **진짜 Stripe가 보낸 것인지** 확인한다. 웹훅 주소는 인터넷에 공개돼 있어 누구나 흉내 낼 수 있다.
`if (!header || !secret) return false` | 서명 헤더나 비밀이 없으면 즉시 거절.
`const parts = Object.fromEntries(` | `t=타임스탬프,v1=서명` 헤더를 분해.
`const timestamp = Number(parts.t)` | 보낸 시각.
`if (!parts.v1 ||` | 형식이 틀리면 거절.
`if (Math.abs(now / 1000 - timestamp)` | **5분을 넘은 서명은 거절**: 예전에 도청한 요청을 다시 보내는 **재전송(replay) 공격**을 막는다.
`const expected = Buffer.from(createHmac(` | **원본 본문**으로 HMAC-SHA256을 다시 계산한다(`타임스탬프.본문`).
`const actual = Buffer.from(parts.v1)` | 받은 서명.
`return actual.length === expected.length && timingSafeEqual` | 상수 시간 비교.
@@end

@@code project/app/routes/api/payments-webhook.ts from=/^\/\/ POST \/api\/payments\/webhook/ to=/^\}\);/
`// POST /api/payments/webhook` | 주석: 로그인도 CORS도 없다. **서명이 유일한 신원 증명.**
`export const action = api(` | POST만 받는다.
`const raw = await request.text()` | **원본 문자열**로 읽는다. `request.json()`으로 읽고 다시 직렬화하면 공백·키 순서가 달라져 서명 검증이 깨진다.
`if (!verifyStripeSignature(` | 서명이 틀리면
`throw new AppError(400, "BAD_SIGNATURE"` | 400. 처리하지 않는다.
`const result = handleStripeEvent(` | **검증이 끝난 뒤에만** 파싱·처리한다.
`return jsonResponse({ received: true` | Stripe에 "받았다"고 응답(2xx를 안 주면 Stripe가 다시 보낸다).
@@end

### 4. 소셜 로그인: GitHub OAuth (인가 코드 흐름)

```text
① 브라우저 → /auth/github            우리가 state(무작위)를 만들어 쿠키에 넣고 GitHub로 보냄
② 브라우저 → github.com/login/oauth/authorize?client_id&state&scope   사용자가 "허용"
③ GitHub → /auth/github/callback?code=…&state=…   (사용자의 브라우저를 통해)
④ 우리 서버 → GitHub: code + client_secret 으로 액세스 토큰 교환   ← 비밀은 서버끼리만
⑤ 우리 서버 → GitHub API: 프로필·이메일 조회 → 우리 사용자 찾기/만들기 → 우리 세션 쿠키 발급
```

@@code project/app/services/oauth.server.ts from=/^export function buildAuthorizeUrl/ to=/^\}/
`export function buildAuthorizeUrl` | 1단계: 사용자를 보낼 GitHub 승인 주소.
`const config = getConfig()` | 설정.
`const url = new URL(config.GITHUB_AUTHORIZE_URL)` | 주소 주인은 환경변수(테스트에서는 모의 서버).
`searchParams.set("client_id"` | 우리 앱의 공개 ID.
`"redirect_uri"` | 승인 후 돌아올 우리 주소(`APP_ORIGIN/auth/github/callback`). GitHub OAuth App 설정과 **글자까지 같아야** 한다.
`"scope", "read:user user:email"` | **필요한 권한만** 요청한다(프로필과 이메일 읽기).
`"state", state` | **일회용 무작위 값**. 돌아올 때 같은 값인지 확인해 "남이 만든 로그인 요청"을 막는다.
@@end

@@code project/app/services/oauth.server.ts from=/^export async function fetchGithubProfile/ to=/^\}/
`export async function fetchGithubProfile` | 2~5단계: `code`를 프로필로 바꾼다.
`const config = getConfig()` | 설정.
`const token = await githubJson<` | **코드 → 액세스 토큰 교환.** `client_secret`이 필요하므로 반드시 서버에서만.
`if (!token.access_token) throw` | 코드가 틀렸거나 만료되면 401.
`const headers = {` | 이후 호출은 `Bearer 액세스 토큰`. `User-Agent`는 GitHub API가 요구한다.
`const [user, emails] = await Promise.all(` | 로그인 이름과 이메일 목록을 **동시에** 요청한다.
`// 확인되지 않은 이메일로` | 주석: 계정 탈취 방지.
`const primary = emails.find(` | **대표(primary)이면서 확인된(verified)** 이메일을 우선, 없으면 확인된 아무 이메일. 확인 안 된 이메일로 기존 계정에 붙으면 남의 계정을 가로챌 수 있다.
`if (!primary) throw` | 확인된 이메일이 없으면 거절.
`return { email: primary.email` | 우리가 쓸 최소 정보.
@@end

@@code project/app/routes/auth-github-callback.ts from=/^export async function loader/ to=/^\}/
`export async function loader` | `GET /auth/github/callback`.
`const cookie = oauthStateCookie()` | 서명된 일회용 `state` 쿠키(10분).
`const expected = await cookie.parse(` | 우리가 1단계에서 심어 둔 값.
`const state = url.searchParams.get("state")` | GitHub가 돌려준 값.
`const code = url.searchParams.get("code")` | 교환할 코드.
`// state가 쿠키와` | 주석.
`if (!code || !state || !expected || state !== expected)` | **네 가지 중 하나라도 어긋나면 거부**: 쿠키가 없거나, state가 다르면 남이 만든 요청일 수 있다(로그인 CSRF).
`return redirectWithFlash(` | 안내 메시지와 함께 로그인 화면으로.
`try {` | 정상 흐름.
`const profile = await fetchGithubProfile(code)` | 프로필 조회.
`const user = await findOrCreateOAuthUser(` | 우리 사용자로 변환.
`const response = await createUserSession(` | **우리의 세션 쿠키**를 발급해 `/posts`로 보낸다(이후는 일반 로그인과 같다).
`response.headers.append("Set-Cookie"` | 일회용 `state` 쿠키를 **폐기**한다(재사용 방지).
`return response` | 완료.
`} catch (error) {` | GitHub 쪽 실패
`if (error instanceof AppError) return redirectWithFlash(` | 사용자에게 이유를 알리고 로그인 화면으로.
`throw error` | 예상 밖 오류는 그대로.
@@end

@@code project/app/services/auth.server.ts from=/^\/\*\* 소셜 로그인:/ to=/^\}/
`/** 소셜 로그인:` | 주석.
`export async function findOrCreateOAuthUser` | GitHub 프로필 → 우리 사용자.
`const existing = await repo.users.findByEmail(` | **검증된 이메일**로 기존 계정을 찾는다. 있으면 그 계정으로 로그인(같은 사람의 두 로그인 방법).
`if (existing) return toPublicUser(existing)` | 연결.
`const nickname = profile.nickname.replace(` | GitHub 로그인 이름에서 허용 글자만 남기고 2~20자로 맞춘다.
`const created = await repo.users.create({` | 새 계정.
`passwordHash: "oauth:github"` | **비밀번호가 없는 계정**. `verifyPassword`는 `scrypt$…` 형식만 통과시키므로 이 값으로는 **비밀번호 로그인이 불가능**하다.
`return toPublicUser(created)` | 완료.
@@end

### 5. 키 발급과 설정 (직접 해보려면)

> 각 서비스의 화면은 자주 바뀝니다. 아래는 **무엇을 얻어 어느 환경변수에 넣는지**의 지도이고, 최신 절차는 공식 문서를 확인하세요. **이 환경에서는 실제 서비스를 호출하지 않았습니다**(아래 검증 범위 참고).

| 서비스 | 준비 | 환경변수 |
| --- | --- | --- |
| Resend | 가입 → API Key 생성(개발은 `onboarding@resend.dev`에서 **본인 계정 이메일로만** 발송 가능, 다른 주소로 보내려면 도메인 인증) | `MAIL_DRIVER=resend`, `RESEND_API_KEY=re_…`, `MAIL_FROM` |
| Stripe(**테스트 모드**) | 대시보드(테스트) → 상품·가격 만들기 → `price_…`, API 키 `sk_test_…`. 웹훅은 Stripe CLI의 `stripe listen --forward-to localhost:5173/api/payments/webhook`이 알려 주는 `whsec_…` | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` |
| GitHub OAuth | Settings → Developer settings → OAuth Apps → New. Callback URL = `APP_ORIGIN/auth/github/callback` | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |

## ④ 🔗 연동 포인트

### 이 단계의 결과를 다음 단계·DB·API와 잇는 방법

- **study14(API)**: 위 엔드포인트는 OpenAPI 문서(`/api/openapi.json`)에 `uploads`·`payments`·`contact`로 올라 있다.
- **study15(성능)**: 메일·결제 알림 메일은 `enqueue()`(작업 큐)로 뒤에서 처리한다. 재시도·백오프가 여기서 쓰인다.
- **DB(study11)**: OAuth 사용자는 일반 사용자 테이블에 `passwordHash="oauth:github"`로 저장된다. 이메일이 같으면 한 계정에 두 로그인 방법이 연결된다.
- **study16(운영)**: 비밀키는 이미지가 아니라 서버 환경변수로. 웹훅 주소는 **HTTPS 공개 주소**여야 한다.
- **AI 서버(study18)**: 같은 패턴(비밀·시간 제한·실패 처리)으로 Ollama를 부른다.

### 모의 서버로 실제 HTTP 경로를 시험하는 법

외부 서비스의 주소를 환경변수(`RESEND_BASE_URL`, `STRIPE_BASE_URL`, `GITHUB_*_URL`)로 뽑아 두었기 때문에, 시험에서는 **같은 컴퓨터의 작은 HTTP 서버**를 가리키게 할 수 있습니다. 앱 코드를 하나도 바꾸지 않고 요청 헤더·본문·재시도까지 확인합니다.

@@code project/tools/request-test.mjs from=/^\/\/ ── 모의 외부 서비스/ to=/^const stripe = await mockServer/
`// ── 모의 외부` | 주석.
`let resendFailsLeft = 1` | 첫 요청은 일부러 **500으로 실패**시킨다 → 작업 큐가 재시도하는지 확인하려고.
`const resend = await mockServer(` | 가짜 Resend. 호출 기록(`calls`)이 쌓인다.
`if (resendFailsLeft-- > 0)` | 처음 한 번은 500을 돌려준다.
`res.writeHead(200,` | 그다음부터는 정상 응답.
@@end

**이 시험이 확인하는 것(전부 통과)**: 환영 메일이 첫 시도 500 후 **재시도로 성공**, 메일 API 호출의 헤더(`Bearer`)·본문, 결제 세션 요청의 형식(폼 인코딩·`mode=payment`·`price`), 웹훅 서명 4가지(정상·서명 없음·본문 변조·5분 넘은 타임스탬프), OAuth의 `state` 검사(다른 값·쿠키 없음·잘못된 코드 거부)와 성공 시 세션 쿠키 발급·비밀번호 로그인 불가, 업로드(가짜 PNG 거절, 한도 초과 413, 경로 조작 404, 보안 헤더).

> **검증하지 못한 것**: 실제 Resend·Stripe·GitHub 서버와의 통신(자격증명 필요), Stripe의 실제 결제 화면, 실제 도메인에서의 OAuth 콜백. 이 부분은 위 "키 발급" 표대로 직접 연결해 확인해야 합니다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| Resend `403 … only send testing emails to your own email address` | 도메인 인증 없이 `onboarding@resend.dev`로 남에게 발송 | 본인 이메일로 시험하거나 도메인을 인증한다 |
| 메일이 오지 않는데 가입은 성공 | 큐의 재시도가 모두 실패(키 오류 등) | 서버 로그의 `job failed`·`job retry`를 본다. 키·발신 주소 확인 |
| 결제 웹훅이 계속 400 `BAD_SIGNATURE` | `STRIPE_WEBHOOK_SECRET`이 CLI/대시보드의 값과 다름, 또는 본문을 JSON으로 먼저 읽음 | 비밀 확인, **원본 텍스트**로 서명 계산 |
| 웹훅이 한 번 성공 후 다시 오면 중복 처리 | Stripe는 **같은 이벤트를 여러 번** 보낼 수 있다 | 이벤트 `id`를 저장해 이미 처리했는지 확인(멱등성). 이 예제는 메일만 보내므로 DB 원장은 두지 않았다 |
| 결제 화면에서 돌아왔는데 "결제 안 됨" | `success_url`에 왔다고 완료가 아님 / 웹훅이 아직 | 완료 판정은 **웹훅**으로. 화면은 "확인 중"을 보여 준다 |
| OAuth `redirect_uri_mismatch` | GitHub 앱의 콜백 주소와 `APP_ORIGIN/auth/github/callback`이 한 글자라도 다름 | 두 곳을 똑같이(스킴·포트·경로) |
| 로그인 후 "로그인 요청이 만료되었거나 올바르지 않습니다" | `state` 쿠키가 없음(10분 경과, 다른 브라우저, 쿠키 차단) | 처음부터 다시. `SameSite=Lax`로 콜백 GET에는 쿠키가 붙는다 |
| 업로드가 항상 400 "PNG, JPEG, WEBP, PDF만" | 지원하지 않는 종류이거나 `Content-Type`을 직접 지정해 **boundary가 빠짐** | `FormData`만 넘기고 헤더는 브라우저에 맡긴다 |
| 큰 파일이 413 | `MAX_UPLOAD_BYTES`(기본 2MB) 초과 | 값을 올리거나, 아주 크면 스트리밍 업로드·객체 저장소(S3 등)로 |
| 업로드 파일이 재배포 후 사라짐 | 컨테이너 파일시스템에 저장 | `UPLOAD_DIR`을 볼륨에 두거나 객체 저장소 사용 |
| 서비스가 멈췄는데 우리 서버도 느려짐 | 타임아웃 없이 호출 | `AbortSignal.timeout`, 작업은 큐로 |

## ⑥ 직접 해보기

1. `MAIL_DRIVER=log`(기본)로 가입해 서버 로그에 `mail (log driver)`와 마스킹된 주소가 찍히는 것을 확인한다. 이어서 `tools/request-test.mjs`의 `resendFailsLeft`를 `3`으로 올려 재시도가 **백오프(0.5초→1초)**를 두고 일어나다 결국 실패(`job failed`)하는 로그를 본다.
2. 확장자를 `.png`로 바꾼 텍스트 파일, 3MB 파일, 이름이 `../../x.png`인 파일을 `/lab`에서 올려 각각 어떤 오류가 나는지 보고, 정상 PNG를 올려 `/uploads/…` 주소가 열리는지 확인한다. 응답 헤더에서 `nosniff`·`sandbox` CSP를 찾는다.
3. 웹훅 서명 함수를 직접 시험해 본다: `node -e`로 본문과 비밀키로 `t=…,v1=…`를 만들어 `curl.exe`로 `/api/payments/webhook`에 보내 200과 400(본문 한 글자 변경)을 재현한다.

## ⑦ ☐ 체크리스트

- [ ] 비밀키가 서버(`.server.ts`·환경변수)에만 있고 브라우저 번들·응답·로그에 없음을 확인했다.
- [ ] 외부 호출에 **시간 제한**과 **재시도(큐)**를 두는 이유를 설명할 수 있다.
- [ ] 업로드를 매직 넘버·크기·서버가 만든 이름으로 검사하는 이유 세 가지를 말할 수 있다.
- [ ] 결제의 "완료"를 `success_url`이 아니라 **서명 검증된 웹훅**으로 판단하는 이유와, 원본 본문으로 서명하는 이유를 설명할 수 있다.
- [ ] OAuth의 `state`(로그인 CSRF 방어)와 "검증된 이메일만 연결"의 이유를 설명할 수 있다.
- [ ] 모의 서버로 외부 서비스 호출 경로를 시험했고, **실제 서비스로는 검증하지 못한 범위**를 구분해 기록했다.

## ⑧ 다음 단계 연결

연동한 기능들을 일관된 규칙으로 공개해야 합니다. [study14.md](study14.md)에서 **API 설계**(REST 규칙, OpenAPI 문서, 버전 관리, 페이지네이션, 오류 응답 규칙)를 정리합니다.
