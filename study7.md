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

**`midpoint/app/lib/password.server.ts`** — 실제 파일 4–17줄 · [파일 열기](midpoint/app/lib/password.server.ts#L4-L17)

```ts
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keyLength: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

/** 저장 형식: scrypt$솔트(base64)$해시(base64). 솔트는 비밀번호마다 새로 만든다. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1–5 | <code>const scrypt = promisify(scryptCallback) as (</code> | Node의 콜백 방식 `scrypt`를 `await`할 수 있게 바꾼다. |
| 7–9 | <code>const KEY_LENGTH = 64;</code> | 만들어질 해시의 길이(바이트). |
| 10 | <code>export async function hashPassword(password: s…</code> | 가입 때 호출: 비밀번호 → 저장용 문자열. |
| 11 | <code>const salt = randomBytes(16);</code> | **사용자마다 다른 무작위 솔트**. 같은 비밀번호도 다른 해시가 된다. |
| 12 | <code>const hash = await scrypt(password, salt, KEY_…</code> | 일부러 **느리고 메모리를 많이 쓰는** 해시. 공격자가 초당 시도할 수 있는 횟수를 크게 줄인다. |
| 13–14 | <code>return `scrypt$${salt.toString("base64")}$${ha…</code> | 저장 형식 `알고리즘$솔트$해시`. 나중에 알고리즘을 바꿔도 구분할 수 있다. |

**`midpoint/app/lib/password.server.ts`** — 실제 파일 19–26줄 · [파일 열기](midpoint/app/lib/password.server.ts#L19-L26)

```ts
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  // 길이가 같을 때만 비교하고, 시간 차이로 값을 추측하지 못하게 상수 시간 비교를 쓴다.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export async function verifyPassword(password:…</code> | 로그인 때 호출. |
| 2 | <code>const [scheme, saltB64, hashB64] = stored.spli…</code> | 저장 문자열을 분해한다. |
| 3 | <code>if (scheme !== "scrypt" &#124;&#124; !saltB64 &#124;&#124; !hashB6…</code> | 형식이 다르거나 깨졌으면 즉시 거절(소셜 로그인 계정의 `oauth:…` 값 등도 여기서 걸린다). |
| 4 | <code>const expected = Buffer.from(hashB64, "base64"…</code> | 저장된 해시. |
| 5–6 | <code>const actual = await scrypt(password, Buffer.f…</code> | **같은 솔트**로 입력한 비밀번호를 해시한다. |
| 7–8 | <code>return actual.length === expected.length &amp;&amp; ti…</code> | **상수 시간 비교**. `===`는 다른 글자를 만나는 순간 끝나서, 걸리는 시간으로 값을 추측당할 수 있다. |

### 2. 로그인 서비스: 있는지 없는지도 숨긴다

**`midpoint/app/services/auth.server.ts`** — 실제 파일 14–16줄 · [파일 열기](midpoint/app/services/auth.server.ts#L14-L16)

```ts
// 없는 이메일도 같은 시간 동안 해시 비교를 하게 해서, 응답 시간으로 가입 여부를 알아내지 못하게 한다.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("not-a-real-password"));
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>// 없는 이메일도 같은 시간 동안 해시 비교를 하게 해서, 응답 시간으로 가입 여…</code> | 주석: 이유 설명. |
| 2 | <code>let dummyHash: Promise&lt;string&gt; &#124; undefined;</code> | 가짜 해시를 한 번만 만들어 재사용한다. |
| 3 | <code>const getDummyHash = () =&gt; (dummyHash ??= hash…</code> | 처음 필요할 때 만든다(지연 초기화). |

**`midpoint/app/services/auth.server.ts`** — 실제 파일 29–35줄 · [파일 열기](midpoint/app/services/auth.server.ts#L29-L35)

```ts
export async function login(input: unknown, repo: Repo = getRepo()): Promise<PublicUser> {
  const data = parseOrThrow(loginSchema, input);
  const user = await repo.users.findByEmail(data.email);
  const ok = await verifyPassword(data.password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok) throw invalidCredentials();
  return toPublicUser(user);
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export async function login(input: unknown, re…</code> | 로그인 규칙. |
| 2 | <code>const data = parseOrThrow(loginSchema, input);</code> | 입력 검증. |
| 3 | <code>const user = await repo.users.findByEmail(data…</code> | 이메일로 사용자를 찾는다. |
| 4 | <code>const ok = await verifyPassword(data.password,…</code> | **사용자가 없어도** 가짜 해시로 같은 시간 동안 비교한다. 응답 시간으로 "가입된 이메일인지" 알아내는 공격(사용자 열거)을 막는다. |
| 5 | <code>if (!user &#124;&#124; !ok) throw invalidCredentials();</code> | 이메일이 없든 비밀번호가 틀리든 **같은 오류·같은 메시지**(401 `INVALID_CREDENTIALS`). |
| 6–7 | <code>return toPublicUser(user);</code> | 비밀번호 해시를 뺀 공개 정보만 돌려준다. |

### 3. 쿠키 세션

**`midpoint/app/session.server.ts`** — 실제 파일 11–24줄 · [파일 열기](midpoint/app/session.server.ts#L11-L24)

```ts
function createStorage() {
  const config = getConfig();
  return createCookieSessionStorage<SessionData, SessionFlash>({
    cookie: {
      name: "__rr7_board",
      httpOnly: true, // 브라우저 JS가 읽지 못한다 → XSS로 세션을 훔치기 어렵다.
      sameSite: "lax", // 다른 사이트에서 온 POST에는 쿠키를 붙이지 않는다 → CSRF 1차 방어.
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      secrets: [config.SESSION_SECRET], // 값을 서명한다. 배열 앞쪽이 새 키(키 교체 지원).
      secure: config.cookieSecure,
    },
  });
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1–2 | <code>function createStorage() {</code> | 세션 저장소를 만든다. |
| 3–4 | <code>return createCookieSessionStorage&lt;SessionData,…</code> | **쿠키 자체에 세션 데이터를 담는** 저장소. 서버에 세션 테이블이 필요 없다(단순). 대신 데이터가 작아야 하고, 서버에서 강제로 로그아웃시키기 어렵다. |
| 5 | <code>name: "__rr7_board",</code> | 쿠키 이름. |
| 6 | <code>httpOnly: true, // 브라우저 JS가 읽지 못한다 → XSS로 세션을 …</code> | **브라우저의 JS가 이 쿠키를 읽지 못한다.** XSS가 일어나도 세션 쿠키를 훔치기 어렵다. |
| 7 | <code>sameSite: "lax", // 다른 사이트에서 온 POST에는 쿠키를 붙이지 …</code> | **다른 사이트에서 시작된 POST에는 쿠키를 붙이지 않는다.** CSRF의 1차 방어. (링크 클릭 같은 최상위 GET 이동에는 붙는다.) |
| 8 | <code>path: "/",</code> | 사이트 전체에서 보낸다. |
| 9 | <code>maxAge: 60 * 60 * 24 * 7,</code> | 7일 뒤 만료. |
| 10 | <code>secrets: [config.SESSION_SECRET], // 값을 서명한다. …</code> | **서명 키**. 배열이라 키를 교체할 때 새 키를 앞에, 옛 키를 뒤에 두면 기존 로그인이 유지된다. |
| 11–14 | <code>secure: config.cookieSecure,</code> | 운영(HTTPS)에서는 `true`: HTTP로는 쿠키를 보내지 않는다. |

**`midpoint/app/session.server.ts`** — 실제 파일 42–52줄 · [파일 열기](midpoint/app/session.server.ts#L42-L52)

```ts
export async function createUserSession(
  request: Request,
  userId: number,
  redirectTo: string,
  message?: string,
) {
  const session = await getSession(request.headers.get("Cookie"));
  session.set("userId", userId);
  if (message) session.flash("message", message);
  return redirect(redirectTo, { headers: { "Set-Cookie": await commitSession(session) } });
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1–6 | <code>export async function createUserSession(</code> | 로그인 성공 후 호출. |
| 7 | <code>const session = await getSession(request.heade…</code> | 요청의 쿠키에서 현재 세션을 읽는다. |
| 8 | <code>session.set("userId", userId);</code> | 세션에 **사용자 번호만** 담는다(비밀번호·이메일 등은 담지 않는다). |
| 9 | <code>if (message) session.flash("message", message)…</code> | 한 번 보여 주고 사라지는 메시지. |
| 10–11 | <code>return redirect(redirectTo, { headers: { "Set-…</code> | **로그인 → 다른 화면으로 이동**(PRG). `Set-Cookie` 헤더로 새 세션 쿠키를 심는다. |

### 4. 열린 리다이렉트 막기

**`midpoint/app/session.server.ts`** — 실제 파일 34–40줄 · [파일 열기](midpoint/app/session.server.ts#L34-L40)

```ts
/** 열린 리다이렉트를 막는다. "/"로 시작하는 같은 사이트 경로만 허용한다. */
export function safeRedirect(to: unknown, fallback = "/"): string {
  if (typeof to !== "string" || !to.startsWith("/") || to.startsWith("//") || to.includes("\\")) {
    return fallback;
  }
  return to;
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>/** 열린 리다이렉트를 막는다. "/"로 시작하는 같은 사이트 경로만 허용한다. …</code> | 주석. |
| 2 | <code>export function safeRedirect(to: unknown, fall…</code> | 로그인 후 돌아갈 주소(`?redirectTo=`)를 **검증**한다. |
| 3 | <code>if (typeof to !== "string" &#124;&#124; !to.startsWith("…</code> | 네 조건을 한 줄에 모았다. ① 문자열이 아니면 거절 ② `/`로 시작하지 않으면 거절: 같은 사이트 경로(`/posts`)만 허용하고 `https://evil.example`은 막는다 ③ `//`로 시작하면 거절: `//evil.example`은 프로토콜 없는 **외부 주소**다 ④ `\`가 있으면 거절: 일부 브라우저가 `\`를 `/`로 해석하는 우회를 막는다. |
| 4–5 | <code>return fallback;</code> | 의심스러우면 안전한 기본 주소. |
| 6–7 | <code>return to;</code> | 통과. |

### 5. 로그인 화면의 `loader`·`action`

**`midpoint/app/routes/login.tsx`** — 실제 파일 13–18줄 · [파일 열기](midpoint/app/routes/login.tsx#L13-L18)

```tsx
export async function loader({ url, context }: Route.LoaderArgs) {
  const redirectTo = safeRedirect(url.searchParams.get("redirectTo"), "/posts");
  // 이미 로그인했다면 로그인 화면을 보여 줄 이유가 없다.
  if (context.get(userContext)) throw redirect(redirectTo);
  return { redirectTo };
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export async function loader({ url, context }:…</code> | 로그인 화면을 열 때. |
| 2 | <code>const redirectTo = safeRedirect(url.searchPara…</code> | 돌아갈 주소를 안전하게 정한다. |
| 3 | <code>// 이미 로그인했다면 로그인 화면을 보여 줄 이유가 없다.</code> | 주석. |
| 4 | <code>if (context.get(userContext)) throw redirect(r…</code> | **이미 로그인한 사용자**는 로그인 화면을 건너뛴다(`throw redirect`로 이동). |
| 5–6 | <code>return { redirectTo };</code> | 폼의 숨은 필드에 실려 `action`으로 돌아온다. |

**`midpoint/app/routes/login.tsx`** — 실제 파일 20–30줄 · [파일 열기](midpoint/app/routes/login.tsx#L20-L30)

```tsx
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const values = readFields(form, ["email"]);
  const redirectTo = safeRedirect(form.get("redirectTo"), "/posts");
  try {
    const user = await login({ email: values.email, password: String(form.get("password") ?? "") });
    return await createUserSession(request, user.id, redirectTo, `${user.nickname}님 환영합니다.`);
  } catch (error) {
    return failure(error, values); // 비밀번호는 다시 채워 보내지 않는다.
  }
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1–2 | <code>export async function action({ request }: Rout…</code> | 로그인 폼 제출. |
| 3 | <code>const values = readFields(form, ["email"]);</code> | 다시 채울 값은 **이메일만**. 비밀번호는 오류가 나도 응답에 되돌려 싣지 않는다. |
| 4–5 | <code>const redirectTo = safeRedirect(form.get("redi…</code> | 숨은 필드의 돌아갈 주소도 **다시 검증**한다(사용자가 바꿔 보낼 수 있다). |
| 6 | <code>const user = await login({ email: values.email…</code> | 이메일·비밀번호 확인. |
| 7–8 | <code>return await createUserSession(request, user.i…</code> | 성공 → 세션 쿠키 + 돌아갈 곳으로 redirect. |
| 9–11 | <code>return failure(error, values); // 비밀번호는 다시 채워 …</code> | 실패 → 401과 "이메일 또는 비밀번호가 올바르지 않습니다." |

### 6. 인증 미들웨어: 요청마다 "누구인가"를 한 번만

**`midpoint/app/middleware/auth.server.ts`** — 실제 파일 15–34줄 · [파일 열기](midpoint/app/middleware/auth.server.ts#L15-L34)

```ts
export const authMiddleware: MiddlewareFunction<Response> = async ({ request, url, context }) => {
  // 다른 사이트의 폼이 쿠키를 달고 보내는 변경 요청(CSRF)을 출처로 한 번 더 막는다.
  if (!isTrustedOrigin(request, url)) {
    return errorResponse(forbidden("허용되지 않은 출처의 요청입니다."), context.get(requestIdContext));
  }

  let user: PublicUser | null = null;
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const payload = verifyAccessToken(authorization.slice(7), getConfig().JWT_SECRET);
    user = payload ? await findUser(Number(payload.sub)) : null;
    context.set(authSourceContext, user ? "bearer" : "none");
  } else {
    const session = await getSession(request.headers.get("Cookie"));
    const userId = session.get("userId");
    user = userId ? await findUser(userId) : null;
    context.set(authSourceContext, user ? "cookie" : "none");
  }
  context.set(userContext, user);
};
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1–2 | <code>export const authMiddleware: MiddlewareFunctio…</code> | `root.tsx`의 `middleware` 배열에 들어 있어 **모든 요청에서 가장 먼저 실행**된다. |
| 3 | <code>if (!isTrustedOrigin(request, url)) {</code> | 변경 요청(POST 등)이 **낯선 출처**에서 왔는지 확인한다(CSRF 2차 방어). |
| 4–5 | <code>return errorResponse(forbidden("허용되지 않은 출처의 요청…</code> | 막으면 403. 미들웨어가 `Response`를 반환하면 **그 뒤 단계는 실행되지 않는다.** |
| 7 | <code>let user: PublicUser &#124; null = null;</code> | 기본은 "아무도 아님". |
| 8–9 | <code>const authorization = request.headers.get("aut…</code> | `Authorization` 헤더가 있으면 토큰을 우선한다. |
| 10 | <code>const payload = verifyAccessToken(authorizatio…</code> | 서명·만료·알고리즘을 검증한다. 실패하면 `null`. |
| 11 | <code>user = payload ? await findUser(Number(payload…</code> | 토큰이 맞아도 **DB에서 사용자를 다시 확인**한다(탈퇴·삭제된 사용자의 토큰을 거절). |
| 12 | <code>context.set(authSourceContext, user ? "bearer"…</code> | 어떤 수단으로 인증됐는지 기록한다. |
| 13 | <code>} else {</code> | 토큰이 없으면 쿠키 세션을 본다. |
| 14 | <code>const session = await getSession(request.heade…</code> | 서명을 확인하며 쿠키를 읽는다. 위조된 쿠키는 빈 세션이 된다. |
| 15–18 | <code>const userId = session.get("userId");</code> | 세션에 담긴 사용자 번호. |
| 19–20 | <code>context.set(userContext, user);</code> | 이후의 모든 `loader`·`action`이 `context.get(userContext)`로 꺼내 쓴다. |

### 7. 보호된 라우트

**`midpoint/app/middleware/auth.server.ts`** — 실제 파일 36–41줄 · [파일 열기](midpoint/app/middleware/auth.server.ts#L36-L41)

```ts
/** 보호된 화면 라우트용. 로그인하지 않았으면 /login으로 보내고, 돌아올 주소를 남긴다. */
export const requireUserMiddleware: MiddlewareFunction<Response> = ({ url, context }) => {
  if (!context.get(userContext)) {
    throw redirect(`/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
  }
};
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>/** 보호된 화면 라우트용. 로그인하지 않았으면 /login으로 보내고, 돌아올 …</code> | 주석. |
| 2 | <code>export const requireUserMiddleware: Middleware…</code> | **라우트의 `middleware`에 넣어** 쓰는 가드. |
| 3 | <code>if (!context.get(userContext)) {</code> | 로그인하지 않았다면 |
| 4–6 | <code>throw redirect(`/login?redirectTo=${encodeURIC…</code> | `/login`으로 보낸다. `throw`하면 `loader`·`action`이 **실행되기도 전에** 막힌다. 주소 뒤의 `?redirectTo=…`는 로그인 후 **원래 가려던 곳**으로 돌아오게 하는 값이고, `encodeURIComponent`가 `?`·`&` 같은 글자를 안전하게 인코딩한다. |

**`midpoint/app/routes/posts/new.tsx`** — 실제 파일 13–14줄 · [파일 열기](midpoint/app/routes/posts/new.tsx#L13-L14)

```tsx
// 이 라우트의 loader·action이 실행되기 전에 로그인 여부를 확인한다. 아니면 /login으로 보낸다.
export const middleware: Route.MiddlewareFunction[] = [requireUserMiddleware];
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>// 이 라우트의 loader·action이 실행되기 전에 로그인 여부를 확인한다.…</code> | 주석. |
| 2 | <code>export const middleware: Route.MiddlewareFunct…</code> | `[requireUserMiddleware]`를 넣은 이 한 줄이 `/posts/new`를 보호한다. 레이아웃에 넣으면 그 아래 **모든 자식**이 보호된다(project의 `/documents`). |

**`midpoint/app/middleware/auth.server.ts`** — 실제 파일 43–48줄 · [파일 열기](midpoint/app/middleware/auth.server.ts#L43-L48)

```ts
/** 화면용 action·loader 안에서 사용자를 꺼낸다. 없으면 /login으로 보낸다. */
export function requireUser(context: Readonly<RouterContextProvider>, url: URL): PublicUser {
  const user = context.get(userContext);
  if (!user) throw redirect(`/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
  return user;
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>/** 화면용 action·loader 안에서 사용자를 꺼낸다. 없으면 /login…</code> | 주석. |
| 2 | <code>export function requireUser(context: Readonly&lt;…</code> | `action` 안에서 사용자를 **직접** 꺼내는 함수. |
| 3 | <code>const user = context.get(userContext);</code> | 미들웨어가 넣어 둔 사용자. |
| 4 | <code>if (!user) throw redirect(`/login?redirectTo=$…</code> | 없으면 로그인으로. 가드 미들웨어를 우회해 `action`만 직접 부르는 요청에도 안전하다. |
| 5–6 | <code>return user;</code> | 이후 코드에서는 `null`이 아님이 보장된다(타입도 그렇게 좁혀진다). |

### 8. 액세스 토큰(JWT)

**`midpoint/app/lib/token.server.ts`** — 실제 파일 9–26줄 · [파일 열기](midpoint/app/lib/token.server.ts#L9-L26)

```ts
/** HS256 JWT를 만든다. 만료 시각(exp)은 초 단위다. */
export function signAccessToken(
  user: { id: number; email: string; nickname: string },
  secret: string,
  ttlSeconds: number,
  nowMs = Date.now(),
): string {
  const iat = Math.floor(nowMs / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    sub: String(user.id),
    email: user.email,
    nickname: user.nickname,
    iat,
    exp: iat + ttlSeconds,
  });
  return `${header}.${payload}.${sign(`${header}.${payload}`, secret)}`;
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>/** HS256 JWT를 만든다. 만료 시각(exp)은 초 단위다. */</code> | 주석. |
| 2–7 | <code>export function signAccessToken(</code> | 로그인 API가 토큰을 발급할 때. |
| 8 | <code>const iat = Math.floor(nowMs / 1000);</code> | 발급 시각(초). `nowMs`를 인자로 받는 이유는 **테스트에서 시간을 고정**하기 위해서다. |
| 9 | <code>const header = encode({ alg: "HS256", typ: "JW…</code> | `{"alg":"HS256"}`를 base64url로. |
| 10–14 | <code>const payload = encode({</code> | **내용(클레임)**: 사용자 번호(`sub`), 이메일, 닉네임, 발급(`iat`)·만료(`exp`) 시각. **누구나 읽을 수 있으므로 비밀을 넣지 않는다.** |
| 15–16 | <code>exp: iat + ttlSeconds,</code> | 만료 시각. 스펙 v1은 1시간 권장. |
| 17–18 | <code>return `${header}.${payload}.${sign(`${header}…</code> | `머리.내용.서명` 세 조각. |

**`midpoint/app/lib/token.server.ts`** — 실제 파일 28–49줄 · [파일 열기](midpoint/app/lib/token.server.ts#L28-L49)

```ts
/** 서명·알고리즘·만료를 모두 확인한다. 하나라도 틀리면 null. */
export function verifyAccessToken(
  token: string,
  secret: string,
  nowMs = Date.now(),
): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = Buffer.from(sign(`${header}.${payload}`, secret));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const head = JSON.parse(Buffer.from(header, "base64url").toString());
    if (head.alg !== "HS256") return null; // alg를 토큰이 정하게 두지 않는다.
    const body = JSON.parse(Buffer.from(payload, "base64url").toString()) as TokenPayload;
    if (typeof body.exp !== "number" || body.exp * 1000 <= nowMs) return null;
    return body;
  } catch {
    return null;
  }
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>/** 서명·알고리즘·만료를 모두 확인한다. 하나라도 틀리면 null. */</code> | 주석. |
| 2–7 | <code>export function verifyAccessToken(</code> | 요청이 가져온 토큰을 검증한다. |
| 8–9 | <code>if (parts.length !== 3) return null;</code> | 세 조각이 아니면 토큰이 아니다. |
| 10–11 | <code>const expected = Buffer.from(sign(`${header}.$…</code> | 우리 비밀키로 **다시 계산한** 서명. |
| 12–13 | <code>if (actual.length !== expected.length &#124;&#124; !timi…</code> | 서명이 다르면(내용 변조·다른 키) 거절한다. `timingSafeEqual`은 길이가 같아야 해서 먼저 길이를 본다. |
| 14 | <code>const head = JSON.parse(Buffer.from(header, "b…</code> | 서명이 맞은 뒤에야 내용을 해석한다. |
| 15–16 | <code>if (head.alg !== "HS256") return null; // alg를…</code> | **`alg: none` 공격 차단**: 토큰이 "나는 서명이 필요 없다"고 주장해도 믿지 않는다. |
| 17–18 | <code>if (typeof body.exp !== "number" &#124;&#124; body.exp *…</code> | 만료 확인. |
| 19 | <code>} catch {</code> | 깨진 JSON이면 |
| 20–22 | <code>return null;</code> | 그냥 거절(예외로 서버가 죽지 않는다). |

### 9. CORS와 출처 검사

**`midpoint/app/lib/http.server.ts`** — 실제 파일 6–16줄 · [파일 열기](midpoint/app/lib/http.server.ts#L6-L16)

```ts
/** 브라우저가 보낸 Origin이 같은 사이트이거나 CORS_ORIGIN 허용 목록에 있는지. Origin이 없으면(curl 등) 통과. */
export function isTrustedOrigin(request: Request, url: URL): boolean {
  if (SAFE_METHODS.has(request.method)) return true;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === url.host || getConfig().corsOrigins.includes(origin);
  } catch {
    return false;
  }
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>/** 브라우저가 보낸 Origin이 같은 사이트이거나 CORS_ORIGIN 허용 …</code> | 주석. |
| 2 | <code>export function isTrustedOrigin(request: Reque…</code> | 변경 요청의 `Origin`이 믿을 만한가. |
| 3 | <code>if (SAFE_METHODS.has(request.method)) return t…</code> | GET·HEAD·OPTIONS는 상태를 바꾸지 않으니 검사하지 않는다. |
| 4 | <code>const origin = request.headers.get("origin");</code> | 브라우저가 보낸 출처. |
| 5–6 | <code>if (!origin) return true;</code> | `curl`·서버 간 호출은 `Origin`이 없다. 쿠키 없이 오므로(= CSRF 대상이 아니므로) 통과. |
| 7 | <code>return new URL(origin).host === url.host &#124;&#124; ge…</code> | **같은 사이트**에서 온 요청이면 통과. `\|\|` 뒤의 `corsOrigins.includes(origin)`은 우리가 `CORS_ORIGIN`으로 허용한 다른 출처도 통과시킨다. |
| 8 | <code>} catch {</code> | `Origin` 값이 URL이 아니면 |
| 9–11 | <code>return false;</code> | 거절. |

**`midpoint/app/lib/http.server.ts`** — 실제 파일 18–28줄 · [파일 열기](midpoint/app/lib/http.server.ts#L18-L28)

```ts
/** 허용된 출처에만 CORS 헤더를 붙인다. 허용 목록 밖이면 아무것도 붙이지 않는다. */
export function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  if (origin && getConfig().corsOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Expose-Headers", "X-Request-Id, Location");
  }
  return headers;
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>/** 허용된 출처에만 CORS 헤더를 붙인다. 허용 목록 밖이면 아무것도 붙이지 …</code> | 주석. |
| 2–3 | <code>export function corsHeaders(request: Request):…</code> | 응답에 붙일 CORS 헤더. |
| 4 | <code>const origin = request.headers.get("origin");</code> | 요청한 출처. |
| 5 | <code>if (origin &amp;&amp; getConfig().corsOrigins.includes…</code> | **허용 목록에 있을 때만** 헤더를 준다. `*`(전부 허용)는 쓰지 않는다. |
| 6 | <code>headers.set("Access-Control-Allow-Origin", ori…</code> | 그 출처의 JS가 응답을 읽어도 된다. |
| 7 | <code>headers.set("Vary", "Origin");</code> | 캐시가 출처별로 응답을 따로 보관하게 한다(없으면 A 출처용 응답이 B에게 갈 수 있다). |
| 8–11 | <code>headers.set("Access-Control-Expose-Headers", "…</code> | 브라우저 JS가 읽을 수 있는 응답 헤더(`X-Request-Id`, `Location`). |

**`midpoint/app/lib/http.server.ts`** — 실제 파일 30–38줄 · [파일 열기](midpoint/app/lib/http.server.ts#L30-L38)

```ts
export function preflight(request: Request): Response {
  const headers = corsHeaders(request);
  if (headers.has("Access-Control-Allow-Origin")) {
    headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-Id");
    headers.set("Access-Control-Max-Age", "600");
  }
  return new Response(null, { status: 204, headers });
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export function preflight(request: Request): R…</code> | **사전 확인(OPTIONS)** 응답. 브라우저는 `Authorization`·`PATCH`처럼 "단순하지 않은" 요청 전에 먼저 물어본다. |
| 2 | <code>const headers = corsHeaders(request);</code> | 허용 출처이면 기본 헤더가 들어 있다. |
| 3 | <code>if (headers.has("Access-Control-Allow-Origin")…</code> | 허용 출처일 때만 나머지를 준다. |
| 4 | <code>headers.set("Access-Control-Allow-Methods", "G…</code> | 어떤 방법을 허용하는지. |
| 5 | <code>headers.set("Access-Control-Allow-Headers", "A…</code> | 어떤 요청 헤더를 허용하는지(`Authorization` 필수). |
| 6–7 | <code>headers.set("Access-Control-Max-Age", "600");</code> | 10분 동안 사전 확인을 다시 하지 않아도 된다. |
| 8–9 | <code>return new Response(null, { status: 204, heade…</code> | 본문 없는 204. |

### 10. XSS: React가 막아 주는 것과 안 막아 주는 것

**`midpoint/app/routes/posts/detail.tsx`** — 실제 파일 76–77줄 · [파일 열기](midpoint/app/routes/posts/detail.tsx#L76-L77)

```tsx
{/* React가 문자열을 이스케이프하므로 본문을 HTML로 해석하지 않는다(XSS 방어). */}
<div className="mt-4 whitespace-pre-wrap leading-relaxed">{post.body}</div>
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>{/* React가 문자열을 이스케이프하므로 본문을 HTML로 해석하지 않는다(XS…</code> | 주석: 이 한 줄이 핵심. |
| 2 | <code>&lt;div className="mt-4 whitespace-pre-wrap leadi…</code> | `{post.body}`처럼 **글자로** 끼워 넣으면 `<script>alert(1)</script>`가 화면에 **글자 그대로** 보이고 실행되지 않는다. (`whitespace-pre-wrap`은 줄바꿈 표시용.) |

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
