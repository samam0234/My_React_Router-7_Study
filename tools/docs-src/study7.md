# study7 — 인증·보안 기초

> 기준: [노션 · React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06) · 인증 규칙은 [공통 API 스펙 v1](https://app.notion.com/p/3d6d7dec5e2e8139adbfd36dd506c65e) 6절. 코드: [midpoint/app/middleware/auth.server.ts](midpoint/app/middleware/auth.server.ts), [midpoint/app/session.server.ts](midpoint/app/session.server.ts), [midpoint/app/lib/](midpoint/app/lib/).

## ① 목표 한 줄

회원가입·로그인(쿠키 세션과 토큰)·권한 확인·비밀번호 해시·CORS·XSS·CSRF의 기초를 구현하고, 로그인 상태를 화면(프런트)과 API(백엔드)가 공유하게 만든다.

## ② 📖 이론

### 인증과 인가

- **인증(authentication)**: "당신은 **누구**인가"를 확인한다(로그인).
- **인가(authorization)**: "당신은 이것을 **해도 되는가**"를 확인한다(남의 글 수정 금지).

둘은 다른 코드입니다. 이 저장소는 인증을 **미들웨어**가, 인가를 **서비스**가 맡습니다.

### 쿠키 세션 vs 토큰(JWT)

| | 쿠키 세션 | Bearer 토큰(JWT) |
| --- | --- | --- |
| 담는 곳 | 브라우저 쿠키(`Cookie` 헤더) | 코드가 직접(`Authorization: Bearer …`) |
| 브라우저가 자동으로 보내나 | 예(같은 사이트 요청에 자동) | 아니오(코드가 붙여야 함) |
| JS가 읽을 수 있나 | **`HttpOnly`면 읽지 못함** → XSS에 강함 | 저장한 곳(`localStorage` 등)에서 읽힘 → XSS에 약함 |
| 위험 | **CSRF**(남의 사이트가 쿠키를 달고 요청) | 토큰 유출 시 만료 전까지 사용 가능 |
| 잘 맞는 곳 | **같은 도메인의 웹 화면** | 모바일 앱, 다른 도메인의 SPA, 서버 간 호출 |

이 저장소는 **화면은 쿠키 세션, API는 둘 다**(Bearer 우선, 없으면 쿠키)를 받습니다. 스펙 v1이 "기본은 Bearer, 같은 도메인 풀스택은 httpOnly 쿠키도 된다"고 정한 그대로입니다.

### 핵심 개념

- **해시 ≠ 암호화**: 비밀번호는 **되돌릴 수 없게** 해시한다(scrypt). 로그인은 입력값을 같은 방식으로 해시해 **비교**한다. DB가 유출돼도 원문을 알 수 없다. 해시에는 사람마다 다른 **솔트**를 섞어 같은 비밀번호도 다른 값이 된다.
- **서명된 쿠키**: 쿠키 내용에 비밀키로 서명을 붙인다. 내용을 바꾸면 서명이 어긋나 거절된다(내용을 *숨기지는* 않는다 → 비밀번호를 담지 않는다).
- **CORS**: 브라우저가 "다른 출처의 JS가 내 응답을 읽어도 되나"를 서버에 묻는 규칙. 서버가 허용한 출처에만 `Access-Control-Allow-Origin`을 준다. **CORS는 브라우저 보호 장치일 뿐 서버 보안이 아니다**(curl은 무시한다).
- **XSS**: 공격자의 스크립트가 우리 페이지에서 실행되는 것. React는 `{값}`을 **자동 이스케이프**하므로 `<script>` 글자가 그냥 글자로 나온다. `dangerouslySetInnerHTML`·`href={사용자값}`이 위험 지점이다.
- **CSRF**: 사용자가 로그인한 상태에서 **공격자 사이트**가 사용자의 브라우저로 우리 서버에 POST를 보내는 것. 방어: `SameSite` 쿠키 + **Origin 검사**.

### 비유

로그인은 **놀이공원 입장**입니다. 매표소에서 신분 확인(비밀번호 비교)을 하고 **손목 밴드**(세션 쿠키·토큰)를 받습니다. 놀이기구마다 신분증을 다시 보지 않고 밴드만 확인합니다(미들웨어). 밴드에는 위조 방지 홀로그램(서명)이 있고, 밴드 색(권한)이 "이 기구는 키 120cm 이상"을 정합니다(인가). **HttpOnly**는 밴드를 손목에서 못 빼게 하는 잠금장치입니다.

## ③ 🛠️ 실기 — 전체 코드와 줄별 설명

### 1. 비밀번호 해시 (scrypt)

@@code midpoint/app/lib/password.server.ts from=/^const scrypt = promisify/ to=/^\}/
`const scrypt = promisify` | Node의 콜백 방식 `scrypt`를 `await`할 수 있게 바꾼다.
`const KEY_LENGTH = 64` | 만들어질 해시의 길이(바이트).
`export async function hashPassword` | 가입 때 호출: 비밀번호 → 저장용 문자열.
`const salt = randomBytes(16)` | **사용자마다 다른 무작위 솔트**. 같은 비밀번호도 다른 해시가 된다.
`const hash = await scrypt(` | 일부러 **느리고 메모리를 많이 쓰는** 해시. 공격자가 초당 시도할 수 있는 횟수를 크게 줄인다.
`return `scrypt$` | 저장 형식 `알고리즘$솔트$해시`. 나중에 알고리즘을 바꿔도 구분할 수 있다.
@@end

@@code midpoint/app/lib/password.server.ts from=/^export async function verifyPassword/ to=/^\}/
`export async function verifyPassword` | 로그인 때 호출.
`const [scheme, saltB64, hashB64]` | 저장 문자열을 분해한다.
`if (scheme !== "scrypt"` | 형식이 다르거나 깨졌으면 즉시 거절(소셜 로그인 계정의 `oauth:…` 값 등도 여기서 걸린다).
`const expected = Buffer.from(hashB64` | 저장된 해시.
`const actual = await scrypt(` | **같은 솔트**로 입력한 비밀번호를 해시한다.
`return actual.length === expected.length && timingSafeEqual` | **상수 시간 비교**. `===`는 다른 글자를 만나는 순간 끝나서, 걸리는 시간으로 값을 추측당할 수 있다.
@@end

### 2. 로그인 서비스: 있는지 없는지도 숨긴다

@@code midpoint/app/services/auth.server.ts from=/^\/\/ 없는 이메일도/ to=/^const getDummyHash/
`// 없는 이메일도` | 주석: 이유 설명.
`let dummyHash` | 가짜 해시를 한 번만 만들어 재사용한다.
`const getDummyHash` | 처음 필요할 때 만든다(지연 초기화).
@@end

@@code midpoint/app/services/auth.server.ts from=/^export async function login/ to=/^\}/
`export async function login` | 로그인 규칙.
`const data = parseOrThrow(loginSchema` | 입력 검증.
`const user = await repo.users.findByEmail` | 이메일로 사용자를 찾는다.
`const ok = await verifyPassword(` | **사용자가 없어도** 가짜 해시로 같은 시간 동안 비교한다. 응답 시간으로 "가입된 이메일인지" 알아내는 공격(사용자 열거)을 막는다.
`if (!user || !ok) throw invalidCredentials()` | 이메일이 없든 비밀번호가 틀리든 **같은 오류·같은 메시지**(401 `INVALID_CREDENTIALS`).
`return toPublicUser(user)` | 비밀번호 해시를 뺀 공개 정보만 돌려준다.
@@end

### 3. 쿠키 세션

@@code midpoint/app/session.server.ts from=/^function createStorage/ to=/^\}/
`function createStorage` | 세션 저장소를 만든다.
`createCookieSessionStorage<` | **쿠키 자체에 세션 데이터를 담는** 저장소. 서버에 세션 테이블이 필요 없다(단순). 대신 데이터가 작아야 하고, 서버에서 강제로 로그아웃시키기 어렵다.
`name: "__rr7_board"` | 쿠키 이름.
`httpOnly: true` | **브라우저의 JS가 이 쿠키를 읽지 못한다.** XSS가 일어나도 세션 쿠키를 훔치기 어렵다.
`sameSite: "lax"` | **다른 사이트에서 시작된 POST에는 쿠키를 붙이지 않는다.** CSRF의 1차 방어. (링크 클릭 같은 최상위 GET 이동에는 붙는다.)
`path: "/"` | 사이트 전체에서 보낸다.
`maxAge: 60 * 60 * 24 * 7` | 7일 뒤 만료.
`secrets: [config.SESSION_SECRET]` | **서명 키**. 배열이라 키를 교체할 때 새 키를 앞에, 옛 키를 뒤에 두면 기존 로그인이 유지된다.
`secure: config.cookieSecure` | 운영(HTTPS)에서는 `true`: HTTP로는 쿠키를 보내지 않는다.
@@end

@@code midpoint/app/session.server.ts from=/^export async function createUserSession/ to=/^\}/
`export async function createUserSession` | 로그인 성공 후 호출.
`const session = await getSession(` | 요청의 쿠키에서 현재 세션을 읽는다.
`session.set("userId", userId)` | 세션에 **사용자 번호만** 담는다(비밀번호·이메일 등은 담지 않는다).
`if (message) session.flash(` | 한 번 보여 주고 사라지는 메시지.
`return redirect(redirectTo, { headers:` | **로그인 → 다른 화면으로 이동**(PRG). `Set-Cookie` 헤더로 새 세션 쿠키를 심는다.
@@end

### 4. 열린 리다이렉트 막기

@@code midpoint/app/session.server.ts from=/^\/\*\* 열린 리다이렉트를/ to=/^\}/
`/** 열린 리다이렉트를` | 주석.
`export function safeRedirect` | 로그인 후 돌아갈 주소(`?redirectTo=`)를 **검증**한다.
`if (typeof to !== "string"` | 네 조건을 한 줄에 모았다. ① 문자열이 아니면 거절 ② `/`로 시작하지 않으면 거절: 같은 사이트 경로(`/posts`)만 허용하고 `https://evil.example`은 막는다 ③ `//`로 시작하면 거절: `//evil.example`은 프로토콜 없는 **외부 주소**다 ④ `\`가 있으면 거절: 일부 브라우저가 `\`를 `/`로 해석하는 우회를 막는다.
`return fallback` | 의심스러우면 안전한 기본 주소.
`return to` | 통과.
@@end

### 5. 로그인 화면의 `loader`·`action`

@@code midpoint/app/routes/login.tsx from=/^export async function loader/ to=/^\}$/
`export async function loader` | 로그인 화면을 열 때.
`const redirectTo = safeRedirect(` | 돌아갈 주소를 안전하게 정한다.
`// 이미 로그인했다면` | 주석.
`if (context.get(userContext)) throw redirect(redirectTo)` | **이미 로그인한 사용자**는 로그인 화면을 건너뛴다(`throw redirect`로 이동).
`return { redirectTo }` | 폼의 숨은 필드에 실려 `action`으로 돌아온다.
@@end

@@code midpoint/app/routes/login.tsx from=/^export async function action/ to=/^\}$/
`export async function action` | 로그인 폼 제출.
`const values = readFields(form, ["email"])` | 다시 채울 값은 **이메일만**. 비밀번호는 오류가 나도 응답에 되돌려 싣지 않는다.
`const redirectTo = safeRedirect(` | 숨은 필드의 돌아갈 주소도 **다시 검증**한다(사용자가 바꿔 보낼 수 있다).
`const user = await login(` | 이메일·비밀번호 확인.
`return await createUserSession(` | 성공 → 세션 쿠키 + 돌아갈 곳으로 redirect.
`return failure(error, values)` | 실패 → 401과 "이메일 또는 비밀번호가 올바르지 않습니다."
@@end

### 6. 인증 미들웨어: 요청마다 "누구인가"를 한 번만

@@code midpoint/app/middleware/auth.server.ts from=/^export const authMiddleware/ to=/^\};/
`export const authMiddleware` | `root.tsx`의 `middleware` 배열에 들어 있어 **모든 요청에서 가장 먼저 실행**된다.
`if (!isTrustedOrigin(request, url))` | 변경 요청(POST 등)이 **낯선 출처**에서 왔는지 확인한다(CSRF 2차 방어).
`return errorResponse(forbidden(` | 막으면 403. 미들웨어가 `Response`를 반환하면 **그 뒤 단계는 실행되지 않는다.**
`let user: PublicUser | null = null` | 기본은 "아무도 아님".
`const authorization = request.headers.get(` | `Authorization` 헤더가 있으면 토큰을 우선한다.
`const payload = verifyAccessToken(` | 서명·만료·알고리즘을 검증한다. 실패하면 `null`.
`user = payload ? await findUser(` | 토큰이 맞아도 **DB에서 사용자를 다시 확인**한다(탈퇴·삭제된 사용자의 토큰을 거절).
`context.set(authSourceContext,` | 어떤 수단으로 인증됐는지 기록한다.
`} else {` | 토큰이 없으면 쿠키 세션을 본다.
`const session = await getSession(` | 서명을 확인하며 쿠키를 읽는다. 위조된 쿠키는 빈 세션이 된다.
`const userId = session.get("userId")` | 세션에 담긴 사용자 번호.
`context.set(userContext, user)` | 이후의 모든 `loader`·`action`이 `context.get(userContext)`로 꺼내 쓴다.
@@end

### 7. 보호된 라우트

@@code midpoint/app/middleware/auth.server.ts from=/^\/\*\* 보호된 화면 라우트용/ to=/^\};/
`/** 보호된 화면 라우트용` | 주석.
`export const requireUserMiddleware` | **라우트의 `middleware`에 넣어** 쓰는 가드.
`if (!context.get(userContext))` | 로그인하지 않았다면
`throw redirect(` | `/login`으로 보낸다. `throw`하면 `loader`·`action`이 **실행되기도 전에** 막힌다. 주소 뒤의 `?redirectTo=…`는 로그인 후 **원래 가려던 곳**으로 돌아오게 하는 값이고, `encodeURIComponent`가 `?`·`&` 같은 글자를 안전하게 인코딩한다.
@@end

@@code midpoint/app/routes/posts/new.tsx from=/^\/\/ 이 라우트의 loader·action이/ to=/^export const middleware/
`// 이 라우트의` | 주석.
`export const middleware` | `[requireUserMiddleware]`를 넣은 이 한 줄이 `/posts/new`를 보호한다. 레이아웃에 넣으면 그 아래 **모든 자식**이 보호된다(project의 `/documents`).
@@end

@@code midpoint/app/middleware/auth.server.ts from=/^\/\*\* 화면용 action·loader 안에서/ to=/^\}/
`/** 화면용` | 주석.
`export function requireUser` | `action` 안에서 사용자를 **직접** 꺼내는 함수.
`const user = context.get(userContext)` | 미들웨어가 넣어 둔 사용자.
`if (!user) throw redirect(` | 없으면 로그인으로. 가드 미들웨어를 우회해 `action`만 직접 부르는 요청에도 안전하다.
`return user` | 이후 코드에서는 `null`이 아님이 보장된다(타입도 그렇게 좁혀진다).
@@end

### 8. 액세스 토큰(JWT)

@@code midpoint/app/lib/token.server.ts from=/^\/\*\* HS256 JWT를/ to=/^\}$/
`/** HS256 JWT를` | 주석.
`export function signAccessToken` | 로그인 API가 토큰을 발급할 때.
`const iat = Math.floor(nowMs / 1000)` | 발급 시각(초). `nowMs`를 인자로 받는 이유는 **테스트에서 시간을 고정**하기 위해서다.
`const header = encode(` | `{"alg":"HS256"}`를 base64url로.
`const payload = encode({` | **내용(클레임)**: 사용자 번호(`sub`), 이메일, 닉네임, 발급(`iat`)·만료(`exp`) 시각. **누구나 읽을 수 있으므로 비밀을 넣지 않는다.**
`exp: iat + ttlSeconds` | 만료 시각. 스펙 v1은 1시간 권장.
`return `${header}.${payload}.${sign(` | `머리.내용.서명` 세 조각.
@@end

@@code midpoint/app/lib/token.server.ts from=/^\/\*\* 서명·알고리즘·만료를/ to=/^\}$/
`/** 서명·알고리즘·만료를` | 주석.
`export function verifyAccessToken` | 요청이 가져온 토큰을 검증한다.
`if (parts.length !== 3) return null` | 세 조각이 아니면 토큰이 아니다.
`const expected = Buffer.from(sign(` | 우리 비밀키로 **다시 계산한** 서명.
`if (actual.length !== expected.length` | 서명이 다르면(내용 변조·다른 키) 거절한다. `timingSafeEqual`은 길이가 같아야 해서 먼저 길이를 본다.
`const head = JSON.parse(` | 서명이 맞은 뒤에야 내용을 해석한다.
`if (head.alg !== "HS256") return null` | **`alg: none` 공격 차단**: 토큰이 "나는 서명이 필요 없다"고 주장해도 믿지 않는다.
`body.exp * 1000 <= nowMs` | 만료 확인.
`} catch {` | 깨진 JSON이면
`return null` | 그냥 거절(예외로 서버가 죽지 않는다).
@@end

### 9. CORS와 출처 검사

@@code midpoint/app/lib/http.server.ts from=/^\/\*\* 브라우저가 보낸 Origin/ to=/^\}/
`/** 브라우저가 보낸 Origin` | 주석.
`export function isTrustedOrigin` | 변경 요청의 `Origin`이 믿을 만한가.
`if (SAFE_METHODS.has(request.method)) return true` | GET·HEAD·OPTIONS는 상태를 바꾸지 않으니 검사하지 않는다.
`const origin = request.headers.get("origin")` | 브라우저가 보낸 출처.
`if (!origin) return true` | `curl`·서버 간 호출은 `Origin`이 없다. 쿠키 없이 오므로(= CSRF 대상이 아니므로) 통과.
`return new URL(origin).host === url.host` | **같은 사이트**에서 온 요청이면 통과. `||` 뒤의 `corsOrigins.includes(origin)`은 우리가 `CORS_ORIGIN`으로 허용한 다른 출처도 통과시킨다.
`} catch {` | `Origin` 값이 URL이 아니면
`return false` | 거절.
@@end

@@code midpoint/app/lib/http.server.ts from=/^\/\*\* 허용된 출처에만/ to=/^\}/
`/** 허용된 출처에만` | 주석.
`export function corsHeaders` | 응답에 붙일 CORS 헤더.
`const origin = request.headers.get("origin")` | 요청한 출처.
`if (origin && getConfig().corsOrigins.includes(origin))` | **허용 목록에 있을 때만** 헤더를 준다. `*`(전부 허용)는 쓰지 않는다.
`headers.set("Access-Control-Allow-Origin", origin)` | 그 출처의 JS가 응답을 읽어도 된다.
`headers.set("Vary", "Origin")` | 캐시가 출처별로 응답을 따로 보관하게 한다(없으면 A 출처용 응답이 B에게 갈 수 있다).
`Access-Control-Expose-Headers` | 브라우저 JS가 읽을 수 있는 응답 헤더(`X-Request-Id`, `Location`).
@@end

@@code midpoint/app/lib/http.server.ts from=/^export function preflight/ to=/^\}/
`export function preflight` | **사전 확인(OPTIONS)** 응답. 브라우저는 `Authorization`·`PATCH`처럼 "단순하지 않은" 요청 전에 먼저 물어본다.
`const headers = corsHeaders(request)` | 허용 출처이면 기본 헤더가 들어 있다.
`if (headers.has("Access-Control-Allow-Origin"))` | 허용 출처일 때만 나머지를 준다.
`Access-Control-Allow-Methods` | 어떤 방법을 허용하는지.
`Access-Control-Allow-Headers` | 어떤 요청 헤더를 허용하는지(`Authorization` 필수).
`Access-Control-Max-Age` | 10분 동안 사전 확인을 다시 하지 않아도 된다.
`return new Response(null, { status: 204` | 본문 없는 204.
@@end

### 10. XSS: React가 막아 주는 것과 안 막아 주는 것

@@code midpoint/app/routes/posts/detail.tsx from=/\{\/\* React가 문자열을 이스케이프/ to=/<div className="mt-4 whitespace-pre-wrap/
`{/* React가` | 주석: 이 한 줄이 핵심.
`<div className="mt-4 whitespace-pre-wrap` | `{post.body}`처럼 **글자로** 끼워 넣으면 `<script>alert(1)</script>`가 화면에 **글자 그대로** 보이고 실행되지 않는다. (`whitespace-pre-wrap`은 줄바꿈 표시용.)
@@end

| 안전 | 위험 | 대처 |
| --- | --- | --- |
| `{post.body}` | `dangerouslySetInnerHTML={{ __html: post.body }}` | 꼭 필요하면 서버에서 **정제 라이브러리**로 허용 태그만 남긴다 |
| `<a href={`/posts/${id}`}>` | `<a href={사용자가 입력한 주소}>` (`javascript:` 주소) | `https://`·`/`로 시작하는지 검사 |
| 쿠키 `HttpOnly` | `localStorage`에 토큰 저장 | XSS가 있으면 읽힌다. 가능하면 `HttpOnly` 쿠키 |

## ④ 🔗 연동 포인트

### 로그인 상태를 프런트와 백엔드가 공유하는 방법

| 구성 | 인증 수단 | 어떻게 공유되나 | 이 저장소의 예 |
| --- | --- | --- | --- |
| **같은 앱의 화면 + API** | 세션 쿠키(`HttpOnly`) | 브라우저가 같은 출처 요청에 쿠키를 자동으로 붙인다. 화면의 `loader`와 `/api/*`가 같은 `authMiddleware`를 지나 같은 `userContext`를 얻는다 | `root.tsx`의 `loader`가 `user`를 화면에 전달 |
| **다른 도메인의 SPA/앱 → 이 API** | `Authorization: Bearer` | `POST /api/auth/login`의 `accessToken`을 앱이 보관하고 요청마다 붙인다. 서버는 `CORS_ORIGIN`에 그 출처를 등록한다 | `tools/request-test.mjs`의 `call(…, { token })` |
| **서버 간 호출·CLI** | Bearer | `Origin`이 없으므로 출처 검사를 통과한다 | `curl.exe -H "Authorization: Bearer …"` |

```text
브라우저 ──(쿠키 자동)──▶ authMiddleware ──▶ context.userContext ──▶ 화면 loader / action / API
외부 앱  ──(Bearer)────▶ authMiddleware ──▶ context.userContext ──▶ API
```

**한 곳에서 판단**하고 결과(`userContext`)만 나눠 쓰기 때문에, 화면 규칙과 API 규칙이 어긋나지 않습니다. 프런트는 "내가 로그인했나"를 직접 계산하지 않고 `root`의 `loader`가 준 `user`를 받아 씁니다(`GET /api/auth/me`가 같은 일을 API로 합니다).

### 보안 점검 요약

| 위협 | 방어 | 위치 |
| --- | --- | --- |
| 비밀번호 유출 | scrypt + 솔트, 응답에 해시 없음 | `password.server.ts`, `PublicUser` |
| 사용자 열거 | 같은 오류·같은 시간 | `login` |
| 세션 탈취(XSS) | `HttpOnly` 쿠키, React 자동 이스케이프 | `session.server.ts` |
| CSRF | `SameSite=Lax` + Origin 검사 | `session.server.ts`, `isTrustedOrigin` |
| 토큰 위조 | HS256 서명 + `alg` 고정 + 만료 | `token.server.ts` |
| 열린 리다이렉트 | `safeRedirect` | `session.server.ts` |
| SQL 주입 | `?` 자리표시자 + 정렬 허용 목록 | `db/sqlite.server.ts` |
| 무차별 대입 | 레이트 리밋(429) | project(study14·15) |

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 로그인했는데 새로고침하면 로그아웃 | 쿠키가 안 저장됨: `secure: true`인데 HTTP로 접속 | 로컬 HTTP에서는 `COOKIE_SECURE=false`(개발 기본은 false), 운영은 HTTPS |
| 배포 후 모든 사용자가 로그아웃 | `SESSION_SECRET`이 바뀜(서명 불일치) | 키를 바꿀 때는 `secrets: [새 키, 옛 키]`로 둘 다 두었다가 옛 키를 제거 |
| `/api/…`가 401, 같은 브라우저 화면은 로그인 상태 | API를 **다른 출처**에서 호출해 쿠키가 안 붙음 | 다른 출처는 Bearer 토큰을 쓴다(쿠키+CORS `credentials`는 `SameSite=None; Secure`가 필요해 위험이 커진다) |
| 브라우저 콘솔 `blocked by CORS policy` | 출처가 `CORS_ORIGIN`에 없음 / 사전 확인(OPTIONS)이 막힘 | `.env`의 `CORS_ORIGIN`에 정확한 출처(스킴·포트 포함)를 넣는다. `Authorization`을 쓰면 사전 확인이 반드시 간다 |
| 낯선 출처의 POST가 403 | `isTrustedOrigin`이 막음(의도) | 허용할 앱이면 `CORS_ORIGIN`에 추가 |
| 프록시 뒤에서 모든 POST가 403 | 프록시가 `Host`를 바꿔 `url.host`가 `Origin`과 다름 | 프록시가 원래 `Host`를 전달하게 한다(`proxy_set_header Host $host`) |
| 로그인 후 `redirectTo`가 무시됨 | `safeRedirect`가 거절(외부 주소·`//`) | 같은 사이트 경로(`/posts/new`)만 쓴다 |
| `payload.sub`가 문자열이라 DB 조회 실패 | JWT 클레임은 문자열로 저장됨 | `Number(payload.sub)`로 변환 |
| 토큰은 유효한데 401 | 사용자가 삭제됨 / 만료됨 | 정상 동작(`findUser`가 DB로 확인). 만료면 다시 로그인 |
| 로그아웃해도 API 토큰이 계속 통함 | Bearer 토큰은 서버에 저장되지 않아 **서버가 취소할 수 없다** | 만료를 짧게(1시간) 하고, 필요하면 refresh 토큰·블랙리스트를 둔다(이 과정 범위 밖) |

## ⑥ 직접 해보기

1. 가입 후 로그인하고 개발자도구 Application → Cookies에서 `__rr7_board`를 확인한다(`HttpOnly`·`SameSite=Lax` 속성). 값의 일부를 직접 고쳐 새로고침하면 로그아웃되는 이유(서명)를 설명한다.
2. `/posts/new`를 로그아웃한 채로 열어 `/login?redirectTo=%2Fposts%2Fnew`로 이동하는지, 로그인 후 원래 화면으로 돌아오는지 확인한다. 이어서 `?redirectTo=//evil.example`로 로그인해 `/posts`로 가는 것을 본다.
3. `curl.exe`로 `Authorization: Bearer 잘못된토큰`으로 `/api/auth/me`를 호출해 401을 확인하고, 올바른 토큰을 JWT 디코더(예: 터미널에서 `node -e`로 base64url 디코딩)로 열어 **내용이 누구에게나 보임**을 확인한다. 비밀번호 같은 값이 없음을 점검한다.

## ⑦ ☐ 체크리스트

- [ ] 쿠키 세션 로그인과 보호된 라우트
- [ ] 인증(누구인가)과 인가(해도 되는가)를 구분하고, 각각 어느 파일이 맡는지 말할 수 있다.
- [ ] 비밀번호를 해시(솔트·상수 시간 비교)로 저장하는 이유와, "이메일이 없든 비밀번호가 틀리든 같은 오류"인 이유를 설명할 수 있다.
- [ ] `HttpOnly`·`SameSite`·`Secure`·서명(`secrets`)이 각각 무엇을 막는지 안다.
- [ ] CORS가 **브라우저의 규칙**이며 서버 보안이 아님을 알고, `CORS_ORIGIN`으로 허용 출처를 설정해 보았다.
- [ ] XSS(React 자동 이스케이프)와 CSRF(SameSite + Origin)의 방어 위치를 코드에서 가리킬 수 있다.
- [ ] 같은 `authMiddleware`가 화면과 API 양쪽의 로그인 상태를 판단함을 확인했다.

## ⑧ 다음 단계 연결

기능과 보안이 갖춰졌으니 [study8.md](study8.md)에서 코드가 커져도 무너지지 않도록 **폴더 구조·공통 모듈·설정 분리**로 정리하고, 개발·운영 설정을 나눕니다.
