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

**`project/app/services/mail.server.ts`** — 실제 파일 10–29줄 · [파일 열기](project/app/services/mail.server.ts#L10-L29)

```ts
export async function sendMail(mail: Mail): Promise<void> {
  const config = getConfig();
  if (config.MAIL_DRIVER === "log") {
    // 수신자 주소 전체를 로그에 남기지 않는다(개인정보).
    const [local, domain] = mail.to.split("@");
    console.log(JSON.stringify({ level: "info", msg: "mail (log driver)", to: `${local.slice(0, 2)}***@${domain}`, subject: mail.subject }));
    return;
  }
  if (!config.RESEND_API_KEY) throw new AppError(500, "MAIL_NOT_CONFIGURED", "RESEND_API_KEY가 필요합니다.");

  const response = await fetch(`${config.RESEND_BASE_URL}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: config.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
    signal: AbortSignal.timeout(10_000), // 외부 서비스가 멈춰도 우리 작업이 영원히 매달리지 않게 한다.
  });
  if (!response.ok) {
    throw new Error(`Resend ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export async function sendMail(mail: Mail): Pr…</code> | 메일 한 통을 보낸다. 실패하면 **던진다**(호출하는 쪽의 작업 큐가 재시도한다). |
| 2 | <code>const config = getConfig();</code> | 설정은 한 곳에서. |
| 3 | <code>if (config.MAIL_DRIVER === "log") {</code> | **개발·테스트 모드**: 실제로 보내지 않고 로그만 남긴다. 가짜 메일 서비스를 켜지 않고도 개발할 수 있다. |
| 4 | <code>// 수신자 주소 전체를 로그에 남기지 않는다(개인정보).</code> | 주석: 개인정보 보호. |
| 5 | <code>const [local, domain] = mail.to.split("@");</code> | 주소를 앞뒤로 나눈다. |
| 6 | <code>console.log(JSON.stringify({ level: "info", ms…</code> | `mi***@example.com`처럼 **일부만** 기록한다. |
| 7–8 | <code>return;</code> | 끝. |
| 9 | <code>if (!config.RESEND_API_KEY) throw new AppError…</code> | 운영 모드인데 키가 없으면 분명한 오류로 실패한다. |
| 11 | <code>const response = await fetch(`${config.RESEND_…</code> | Resend의 HTTP API를 부른다(별도 SDK 없이 `fetch`면 충분하다). 주소는 `RESEND_BASE_URL` 환경변수라서 **테스트에서 모의 서버로** 돌릴 수 있다. |
| 12 | <code>method: "POST",</code> | 메일 생성. |
| 13 | <code>headers: { Authorization: `Bearer ${config.RES…</code> | 비밀키는 **헤더로**(URL 쿼리에 넣으면 로그에 남는다). |
| 14 | <code>body: JSON.stringify({ from: config.MAIL_FROM,…</code> | 보내는 사람·받는 사람·제목·본문. |
| 15–16 | <code>signal: AbortSignal.timeout(10_000), // 외부 서비스…</code> | 10초 안에 안 오면 중단한다. 이게 없으면 서비스가 멈췄을 때 우리 작업이 영원히 대기한다. |
| 17 | <code>if (!response.ok) {</code> | 2xx가 아니면 |
| 18–20 | <code>throw new Error(`Resend ${response.status}: ${…</code> | 상태와 응답 앞부분(200자)을 담아 던진다(전체를 로그에 넣지 않는다). |

가입 응답을 메일 서버 속도에 묶지 않도록 **큐에 넣고 바로 돌아옵니다**.

**`project/app/services/auth.server.ts`** — 실제 파일 30–31줄 · [파일 열기](project/app/services/auth.server.ts#L30-L31)

```ts
// 가입 응답을 메일 서버 속도에 묶어 두지 않는다. 실패하면 작업 큐가 다시 시도한다.
enqueue("welcome-mail", () => sendMail(welcomeMail(user)));
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>// 가입 응답을 메일 서버 속도에 묶어 두지 않는다. 실패하면 작업 큐가 다시 시…</code> | 주석. |
| 2 | <code>enqueue("welcome-mail", () =&gt; sendMail(welcome…</code> | 작업 이름과 함수를 큐에 넣고 **기다리지 않고** 다음 줄로 간다. 메일이 500을 돌려줘도 가입은 이미 성공했고, 큐가 알아서 다시 시도한다. |

### 2. 파일 업로드: 믿지 않고 검사한다

**`project/app/services/uploads.server.ts`** — 실제 파일 7–17줄 · [파일 열기](project/app/services/uploads.server.ts#L7-L17)

```ts
// 클라이언트가 보낸 Content-Type은 믿지 않는다. 파일 첫 바이트(매직 넘버)로 종류를 직접 판별한다.
const SIGNATURES: { type: string; ext: string; match: (b: Buffer) => boolean }[] = [
  { type: "image/png", ext: "png", match: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  { type: "image/jpeg", ext: "jpg", match: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: "image/webp",
    ext: "webp",
    match: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  },
  { type: "application/pdf", ext: "pdf", match: (b) => b.subarray(0, 4).toString("ascii") === "%PDF" },
];
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>// 클라이언트가 보낸 Content-Type은 믿지 않는다. 파일 첫 바이트(매직…</code> | 주석: 브라우저가 보낸 `Content-Type`이나 파일 이름의 확장자는 **거짓말일 수 있다.** |
| 2 | <code>const SIGNATURES: { type: string; ext: string;…</code> | 종류별 "매직 넘버" 판별표. 파일의 **첫 바이트**가 진짜 종류를 말해 준다. |
| 3 | <code>{ type: "image/png", ext: "png", match: (b) =&gt;…</code> | PNG는 항상 `89 50 4E 47`로 시작한다. |
| 4–5 | <code>{ type: "image/jpeg", ext: "jpg", match: (b) =…</code> | JPEG는 `FF D8 FF`. |
| 6–9 | <code>type: "image/webp",</code> | WEBP는 `RIFF`로 시작하고 8~12번째 바이트가 `WEBP`. |
| 10–11 | <code>{ type: "application/pdf", ext: "pdf", match: …</code> | PDF는 `%PDF`. |

**`project/app/services/uploads.server.ts`** — 실제 파일 24–50줄 · [파일 열기](project/app/services/uploads.server.ts#L24-L50)

```ts
export async function saveUpload(request: Request): Promise<StoredUpload> {
  const config = getConfig();
  // 본문을 읽기 전에 헤더로 먼저 거른다. 거짓말하는 헤더는 아래에서 실제 크기로 다시 막는다.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > config.MAX_UPLOAD_BYTES + 4096) throw payloadTooLarge(`파일은 ${config.MAX_UPLOAD_BYTES}바이트 이하여야 합니다.`);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw badRequest("multipart/form-data 형식이어야 합니다.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw validationError({ file: ["file 필드에 파일을 넣어 주세요."] });
  if (file.size === 0) throw validationError({ file: ["빈 파일입니다."] });
  if (file.size > config.MAX_UPLOAD_BYTES) throw payloadTooLarge(`파일은 ${config.MAX_UPLOAD_BYTES}바이트 이하여야 합니다.`);

  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = SIGNATURES.find((s) => s.match(bytes));
  if (!kind) throw validationError({ file: ["PNG, JPEG, WEBP, PDF만 올릴 수 있습니다."] });

  // 저장 이름은 서버가 정한다. 원래 파일 이름(경로 조작 문자 포함 가능)을 쓰지 않는다.
  const name = `${randomUUID()}.${kind.ext}`;
  await mkdir(config.UPLOAD_DIR, { recursive: true });
  await writeFile(join(config.UPLOAD_DIR, name), bytes);
  return { name, url: `/uploads/${name}`, size: bytes.length, contentType: kind.type };
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export async function saveUpload(request: Requ…</code> | 요청의 multipart 본문에서 `file` 필드를 검사하고 저장한다. |
| 2 | <code>const config = getConfig();</code> | 한도(`MAX_UPLOAD_BYTES`)와 저장 폴더(`UPLOAD_DIR`)는 환경변수. |
| 3 | <code>// 본문을 읽기 전에 헤더로 먼저 거른다. 거짓말하는 헤더는 아래에서 실제 크기로…</code> | 주석: 값싼 검사부터. |
| 4 | <code>const declared = Number(request.headers.get("c…</code> | 헤더가 말하는 크기. |
| 5 | <code>if (declared &gt; config.MAX_UPLOAD_BYTES + 4096)…</code> | **본문을 읽기 전에** 너무 크면 거절한다(거대 요청이 메모리를 채우지 못하게). 헤더는 거짓일 수 있어 아래에서 실제 크기로 한 번 더 본다. |
| 7 | <code>let form: FormData;</code> | 폼 데이터. |
| 8 | <code>try {</code> | 파싱을 시도하고 |
| 9 | <code>form = await request.formData();</code> | multipart를 읽는다. **이 방식은 파일을 메모리에 올린다.** 한도가 작을 때만 안전하다(큰 파일은 스트리밍 파서 필요). |
| 10–12 | <code>} catch {</code> | multipart가 아니면 |
| 13 | <code>const file = form.get("file");</code> | `file` 필드. |
| 14 | <code>if (!(file instanceof File)) throw validationE…</code> | 파일이 아니면 400(필드 오류 `file`). |
| 15 | <code>if (file.size === 0) throw validationError({ f…</code> | 빈 파일 거절. |
| 16 | <code>if (file.size &gt; config.MAX_UPLOAD_BYTES) throw…</code> | **실제 크기**로 한 번 더 검사 → 413. |
| 18 | <code>const bytes = Buffer.from(await file.arrayBuff…</code> | 바이트로 읽는다. |
| 19 | <code>const kind = SIGNATURES.find((s) =&gt; s.match(by…</code> | **첫 바이트로 종류를 판별**한다. |
| 20 | <code>if (!kind) throw validationError({ file: ["PNG…</code> | PNG·JPEG·WEBP·PDF가 아니면 400. 이름이 `.png`여도 내용이 HTML이면 여기서 막힌다. |
| 22 | <code>// 저장 이름은 서버가 정한다. 원래 파일 이름(경로 조작 문자 포함 가능)을 쓰…</code> | 주석: 파일 이름도 입력이다. |
| 23 | <code>const name = `${randomUUID()}.${kind.ext}`;</code> | **서버가 만든 무작위 이름 + 판별한 확장자**. 사용자가 보낸 이름(`../../x`)은 쓰지 않는다 → 경로 조작·덮어쓰기 불가. |
| 24 | <code>await mkdir(config.UPLOAD_DIR, { recursive: tr…</code> | 폴더가 없으면 만든다. |
| 25 | <code>await writeFile(join(config.UPLOAD_DIR, name),…</code> | 저장. |
| 26–27 | <code>return { name, url: `/uploads/${name}`, size: …</code> | 주소(`/uploads/이름`), 크기, 종류를 돌려준다. |

**`project/app/services/uploads.server.ts`** — 실제 파일 52–63줄 · [파일 열기](project/app/services/uploads.server.ts#L52-L63)

```ts
export async function readUpload(name: string): Promise<{ bytes: Buffer; contentType: string }> {
  if (!NAME_PATTERN.test(name)) throw notFound("파일을 찾을 수 없습니다."); // ../ 같은 경로 조작을 이름 검사로 차단
  const ext = name.split(".").pop()!;
  const kind = SIGNATURES.find((s) => s.ext === ext)!;
  const path = join(getConfig().UPLOAD_DIR, name);
  try {
    await stat(path);
  } catch {
    throw notFound("파일을 찾을 수 없습니다.");
  }
  return { bytes: await readFile(path), contentType: kind.type };
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export async function readUpload(name: string)…</code> | 저장된 파일을 읽는다. |
| 2 | <code>if (!NAME_PATTERN.test(name)) throw notFound("…</code> | 이름이 **우리가 만든 형식(UUID.확장자)**일 때만 통과. `..%2f..%2fpackage.json` 같은 경로 조작 요청은 여기서 404. |
| 3 | <code>const ext = name.split(".").pop()!;</code> | 확장자로 |
| 4 | <code>const kind = SIGNATURES.find((s) =&gt; s.ext === …</code> | 응답에 쓸 `Content-Type`을 정한다(저장된 확장자 기준). |
| 5 | <code>const path = join(getConfig().UPLOAD_DIR, name…</code> | 폴더와 이름을 안전하게 합친다. |
| 6 | <code>try {</code> | 파일 존재 확인. |
| 7 | <code>await stat(path);</code> | 없으면 |
| 8–10 | <code>} catch {</code> | 404. |
| 11–12 | <code>return { bytes: await readFile(path), contentT…</code> | 바이트와 종류. |

**`project/app/routes/uploads-file.ts`** — 실제 파일 7–22줄 · [파일 열기](project/app/routes/uploads-file.ts#L7-L22)

```ts
export async function loader({ params }: Route.LoaderArgs) {
  try {
    const { bytes, contentType } = await readUpload(params.name);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff", // 브라우저가 내용을 보고 종류를 멋대로 바꿔 해석하지 못하게
        "Content-Security-Policy": "default-src 'none'; sandbox", // 혹시 HTML이 섞여 있어도 스크립트가 실행되지 않게
        "Cache-Control": "public, max-age=31536000, immutable", // 이름이 내용마다 유일하므로 영구 캐시 가능
      },
    });
  } catch (error) {
    if (error instanceof AppError) return errorResponse(error, "");
    throw error;
  }
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export async function loader({ params }: Route…</code> | `GET /uploads/:name`. |
| 2 | <code>try {</code> | 읽기를 시도. |
| 3 | <code>const { bytes, contentType } = await readUploa…</code> | 이름 검사 포함. |
| 4–5 | <code>return new Response(new Uint8Array(bytes), {</code> | 파일 내용을 그대로 응답한다. |
| 6 | <code>"Content-Type": contentType,</code> | 서버가 판별한 종류만 보낸다. |
| 7 | <code>"X-Content-Type-Options": "nosniff", // 브라우저가 …</code> | 브라우저가 내용을 보고 종류를 **멋대로 바꿔 해석하지 못하게** 한다(이미지로 올린 HTML 실행 방지). |
| 8 | <code>"Content-Security-Policy": "default-src 'none'…</code> | 혹시 HTML이 섞여도 스크립트·자원 로딩을 **전부 금지**한다(이중 방어). |
| 9–11 | <code>"Cache-Control": "public, max-age=31536000, im…</code> | 이름이 내용마다 유일하므로 영구 캐시해도 된다. |
| 12 | <code>} catch (error) {</code> | 오류는 |
| 13 | <code>if (error instanceof AppError) return errorRes…</code> | JSON 오류(404 등)로. |
| 14–16 | <code>throw error;</code> | 예상 밖 오류는 그대로. |

### 3. 결제: Stripe Checkout

흐름: ① 우리 서버가 Stripe에 **결제 세션**을 만든다 → ② 브라우저를 Stripe의 결제 화면으로 보낸다(카드 정보는 **우리 서버를 거치지 않는다**) → ③ 결제가 끝나면 Stripe가 우리 **웹훅**으로 알린다.

**`project/app/services/payments.server.ts`** — 실제 파일 9–33줄 · [파일 열기](project/app/services/payments.server.ts#L9-L33)

```ts
export async function createCheckoutSession(user: PublicUser): Promise<{ id: string; url: string }> {
  const config = getConfig();
  if (!config.STRIPE_SECRET_KEY || !config.STRIPE_PRICE_ID) {
    throw new AppError(503, "PAYMENTS_NOT_CONFIGURED", "결제가 설정되지 않았습니다.");
  }
  // Stripe API는 JSON이 아니라 form-urlencoded를 받는다. 중첩 키는 대괄호로 쓴다.
  const body = new URLSearchParams({
    mode: "payment",
    "line_items[0][price]": config.STRIPE_PRICE_ID,
    "line_items[0][quantity]": "1",
    success_url: `${config.APP_ORIGIN}/lab?paid=1`,
    cancel_url: `${config.APP_ORIGIN}/lab?paid=0`,
    client_reference_id: String(user.id),
    customer_email: user.email,
  });
  const response = await fetch(`${config.STRIPE_BASE_URL}/v1/checkout/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new AppError(502, "PAYMENT_PROVIDER_ERROR", "결제 서비스 오류입니다.");
  const session = (await response.json()) as { id: string; url: string };
  return { id: session.id, url: session.url };
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export async function createCheckoutSession(us…</code> | 결제 세션 생성. |
| 2 | <code>const config = getConfig();</code> | 설정. |
| 3–5 | <code>if (!config.STRIPE_SECRET_KEY &#124;&#124; !config.STRIP…</code> | 키·상품이 없으면 **503으로 분명히** 알린다(조용히 실패하지 않는다). |
| 6 | <code>// Stripe API는 JSON이 아니라 form-urlencoded를 받는다.…</code> | 주석: Stripe는 JSON이 아니라 폼 인코딩을 받는다. |
| 7 | <code>const body = new URLSearchParams({</code> | `key=value&…` 본문을 안전하게 만든다. |
| 8 | <code>mode: "payment",</code> | 일회성 결제. |
| 9–10 | <code>"line_items[0][price]": config.STRIPE_PRICE_ID…</code> | **중첩 키는 대괄호**로 쓴다. 상품 가격 ID(`price_…`)는 Stripe 대시보드에서 만든 것. |
| 11–12 | <code>success_url: `${config.APP_ORIGIN}/lab?paid=1`…</code> | 결제 후 돌아올 주소. **이 화면에 왔다고 결제가 끝난 것은 아니다**(아래 웹훅이 진실). |
| 13–15 | <code>client_reference_id: String(user.id),</code> | 우리 사용자 번호. 웹훅에서 "누구의 결제인지" 알 수 있다. |
| 16–19 | <code>const response = await fetch(`${config.STRIPE_…</code> | Stripe 호출. `Authorization: Bearer 비밀키`. |
| 20–21 | <code>signal: AbortSignal.timeout(10_000),</code> | 10초 제한. |
| 22 | <code>if (!response.ok) throw new AppError(502, "PAY…</code> | 결제 서비스가 거절하면 502(상대 서버 문제)로. |
| 23 | <code>const session = (await response.json()) as { i…</code> | `id`와 결제 화면 `url`을 받는다. |
| 24–25 | <code>return { id: session.id, url: session.url };</code> | 이 `url`로 브라우저를 보낸다. |

**`project/app/services/payments.server.ts`** — 실제 파일 39–48줄 · [파일 열기](project/app/services/payments.server.ts#L39-L48)

```ts
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, now = Date.now(), toleranceSeconds = 300): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const timestamp = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(timestamp)) return false;
  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) return false; // 오래된 요청 재전송(replay) 차단
  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex"));
  const actual = Buffer.from(parts.v1);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export function verifyStripeSignature(rawBody:…</code> | 웹훅이 **진짜 Stripe가 보낸 것인지** 확인한다. 웹훅 주소는 인터넷에 공개돼 있어 누구나 흉내 낼 수 있다. |
| 2 | <code>if (!header &#124;&#124; !secret) return false;</code> | 서명 헤더나 비밀이 없으면 즉시 거절. |
| 3 | <code>const parts = Object.fromEntries(header.split(…</code> | `t=타임스탬프,v1=서명` 헤더를 분해. |
| 4 | <code>const timestamp = Number(parts.t);</code> | 보낸 시각. |
| 5 | <code>if (!parts.v1 &#124;&#124; !Number.isFinite(timestamp)) …</code> | 형식이 틀리면 거절. |
| 6 | <code>if (Math.abs(now / 1000 - timestamp) &gt; toleran…</code> | **5분을 넘은 서명은 거절**: 예전에 도청한 요청을 다시 보내는 **재전송(replay) 공격**을 막는다. |
| 7 | <code>const expected = Buffer.from(createHmac("sha25…</code> | **원본 본문**으로 HMAC-SHA256을 다시 계산한다(`타임스탬프.본문`). |
| 8 | <code>const actual = Buffer.from(parts.v1);</code> | 받은 서명. |
| 9–10 | <code>return actual.length === expected.length &amp;&amp; ti…</code> | 상수 시간 비교. |

**`project/app/routes/api/payments-webhook.ts`** — 실제 파일 8–17줄 · [파일 열기](project/app/routes/api/payments-webhook.ts#L8-L17)

```ts
// POST /api/payments/webhook — Stripe 서버가 부른다. 로그인도 CORS도 없으므로 "서명"이 유일한 신원 증명이다.
export const action = api(async ({ request }: Route.ActionArgs) => {
  // 서명은 원본 바이트로 계산된다. request.json()으로 먼저 읽으면 공백·순서가 달라져 검증이 깨진다.
  const raw = await request.text();
  if (!verifyStripeSignature(raw, request.headers.get("stripe-signature"), getConfig().STRIPE_WEBHOOK_SECRET)) {
    throw new AppError(400, "BAD_SIGNATURE", "웹훅 서명이 올바르지 않습니다.");
  }
  const result = handleStripeEvent(JSON.parse(raw) as StripeEvent);
  return jsonResponse({ received: true, ...result });
});
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>// POST /api/payments/webhook — Stripe 서버가 부른다…</code> | 주석: 로그인도 CORS도 없다. **서명이 유일한 신원 증명.** |
| 2–3 | <code>export const action = api(async ({ request }: …</code> | POST만 받는다. |
| 4 | <code>const raw = await request.text();</code> | **원본 문자열**로 읽는다. `request.json()`으로 읽고 다시 직렬화하면 공백·키 순서가 달라져 서명 검증이 깨진다. |
| 5 | <code>if (!verifyStripeSignature(raw, request.header…</code> | 서명이 틀리면 |
| 6–7 | <code>throw new AppError(400, "BAD_SIGNATURE", "웹훅 서…</code> | 400. 처리하지 않는다. |
| 8 | <code>const result = handleStripeEvent(JSON.parse(ra…</code> | **검증이 끝난 뒤에만** 파싱·처리한다. |
| 9–10 | <code>return jsonResponse({ received: true, ...resul…</code> | Stripe에 "받았다"고 응답(2xx를 안 주면 Stripe가 다시 보낸다). |

### 4. 소셜 로그인: GitHub OAuth (인가 코드 흐름)

```text
① 브라우저 → /auth/github            우리가 state(무작위)를 만들어 쿠키에 넣고 GitHub로 보냄
② 브라우저 → github.com/login/oauth/authorize?client_id&state&scope   사용자가 "허용"
③ GitHub → /auth/github/callback?code=…&state=…   (사용자의 브라우저를 통해)
④ 우리 서버 → GitHub: code + client_secret 으로 액세스 토큰 교환   ← 비밀은 서버끼리만
⑤ 우리 서버 → GitHub API: 프로필·이메일 조회 → 우리 사용자 찾기/만들기 → 우리 세션 쿠키 발급
```

**`project/app/services/oauth.server.ts`** — 실제 파일 12–20줄 · [파일 열기](project/app/services/oauth.server.ts#L12-L20)

```ts
export function buildAuthorizeUrl(state: string): string {
  const config = getConfig();
  const url = new URL(config.GITHUB_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", callbackUrl());
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);
  return url.toString();
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export function buildAuthorizeUrl(state: strin…</code> | 1단계: 사용자를 보낼 GitHub 승인 주소. |
| 2 | <code>const config = getConfig();</code> | 설정. |
| 3 | <code>const url = new URL(config.GITHUB_AUTHORIZE_UR…</code> | 주소 주인은 환경변수(테스트에서는 모의 서버). |
| 4 | <code>url.searchParams.set("client_id", config.GITHU…</code> | 우리 앱의 공개 ID. |
| 5 | <code>url.searchParams.set("redirect_uri", callbackU…</code> | 승인 후 돌아올 우리 주소(`APP_ORIGIN/auth/github/callback`). GitHub OAuth App 설정과 **글자까지 같아야** 한다. |
| 6 | <code>url.searchParams.set("scope", "read:user user:…</code> | **필요한 권한만** 요청한다(프로필과 이메일 읽기). |
| 7–9 | <code>url.searchParams.set("state", state);</code> | **일회용 무작위 값**. 돌아올 때 같은 값인지 확인해 "남이 만든 로그인 요청"을 막는다. |

**`project/app/services/oauth.server.ts`** — 실제 파일 29–52줄 · [파일 열기](project/app/services/oauth.server.ts#L29-L52)

```ts
export async function fetchGithubProfile(code: string): Promise<{ email: string; nickname: string }> {
  const config = getConfig();
  const token = await githubJson<{ access_token?: string; error?: string }>(config.GITHUB_TOKEN_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.GITHUB_CLIENT_ID,
      client_secret: config.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl(),
    }),
  });
  if (!token.access_token) throw new AppError(401, "OAUTH_DENIED", "GitHub 인증에 실패했습니다.");

  const headers = { Authorization: `Bearer ${token.access_token}`, Accept: "application/json", "User-Agent": "rr7-board" };
  const [user, emails] = await Promise.all([
    githubJson<{ login: string }>(`${config.GITHUB_API_URL}/user`, { headers }),
    githubJson<{ email: string; primary: boolean; verified: boolean }[]>(`${config.GITHUB_API_URL}/user/emails`, { headers }),
  ]);
  // 확인되지 않은 이메일로 기존 계정에 연결하면 계정 탈취 통로가 된다 → verified만 쓴다.
  const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
  if (!primary) throw new AppError(401, "OAUTH_NO_VERIFIED_EMAIL", "GitHub에 인증된 이메일이 없습니다.");
  return { email: primary.email, nickname: user.login };
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export async function fetchGithubProfile(code:…</code> | 2~5단계: `code`를 프로필로 바꾼다. |
| 2 | <code>const config = getConfig();</code> | 설정. |
| 3–12 | <code>const token = await githubJson&lt;{ access_token?…</code> | **코드 → 액세스 토큰 교환.** `client_secret`이 필요하므로 반드시 서버에서만. |
| 13 | <code>if (!token.access_token) throw new AppError(40…</code> | 코드가 틀렸거나 만료되면 401. |
| 15 | <code>const headers = { Authorization: `Bearer ${tok…</code> | 이후 호출은 `Bearer 액세스 토큰`. `User-Agent`는 GitHub API가 요구한다. |
| 16–19 | <code>const [user, emails] = await Promise.all([</code> | 로그인 이름과 이메일 목록을 **동시에** 요청한다. |
| 20 | <code>// 확인되지 않은 이메일로 기존 계정에 연결하면 계정 탈취 통로가 된다 → ver…</code> | 주석: 계정 탈취 방지. |
| 21 | <code>const primary = emails.find((e) =&gt; e.primary &amp;…</code> | **대표(primary)이면서 확인된(verified)** 이메일을 우선, 없으면 확인된 아무 이메일. 확인 안 된 이메일로 기존 계정에 붙으면 남의 계정을 가로챌 수 있다. |
| 22 | <code>if (!primary) throw new AppError(401, "OAUTH_N…</code> | 확인된 이메일이 없으면 거절. |
| 23–24 | <code>return { email: primary.email, nickname: user.…</code> | 우리가 쓸 최소 정보. |

**`project/app/routes/auth-github-callback.ts`** — 실제 파일 8–28줄 · [파일 열기](project/app/routes/auth-github-callback.ts#L8-L28)

```ts
export async function loader({ request, url }: Route.LoaderArgs) {
  const cookie = oauthStateCookie();
  const expected = await cookie.parse(request.headers.get("Cookie"));
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  // state가 쿠키와 다르면 남이 만든 로그인 요청일 수 있다(로그인 CSRF).
  if (!code || !state || !expected || state !== expected) {
    return redirectWithFlash(request, "/login", "로그인 요청이 만료되었거나 올바르지 않습니다.");
  }
  try {
    const profile = await fetchGithubProfile(code);
    const user = await findOrCreateOAuthUser(profile);
    const response = await createUserSession(request, user.id, "/posts", `${user.nickname}님 환영합니다.`);
    response.headers.append("Set-Cookie", await cookie.serialize("", { maxAge: 0 })); // 일회용 state 폐기
    return response;
  } catch (error) {
    if (error instanceof AppError) return redirectWithFlash(request, "/login", error.message);
    throw error;
  }
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export async function loader({ request, url }:…</code> | `GET /auth/github/callback`. |
| 2 | <code>const cookie = oauthStateCookie();</code> | 서명된 일회용 `state` 쿠키(10분). |
| 3 | <code>const expected = await cookie.parse(request.he…</code> | 우리가 1단계에서 심어 둔 값. |
| 4 | <code>const state = url.searchParams.get("state");</code> | GitHub가 돌려준 값. |
| 5 | <code>const code = url.searchParams.get("code");</code> | 교환할 코드. |
| 7 | <code>// state가 쿠키와 다르면 남이 만든 로그인 요청일 수 있다(로그인 CSRF)…</code> | 주석. |
| 8 | <code>if (!code &#124;&#124; !state &#124;&#124; !expected &#124;&#124; state !== …</code> | **네 가지 중 하나라도 어긋나면 거부**: 쿠키가 없거나, state가 다르면 남이 만든 요청일 수 있다(로그인 CSRF). |
| 9–10 | <code>return redirectWithFlash(request, "/login", "로…</code> | 안내 메시지와 함께 로그인 화면으로. |
| 11 | <code>try {</code> | 정상 흐름. |
| 12 | <code>const profile = await fetchGithubProfile(code)…</code> | 프로필 조회. |
| 13 | <code>const user = await findOrCreateOAuthUser(profi…</code> | 우리 사용자로 변환. |
| 14 | <code>const response = await createUserSession(reque…</code> | **우리의 세션 쿠키**를 발급해 `/posts`로 보낸다(이후는 일반 로그인과 같다). |
| 15 | <code>response.headers.append("Set-Cookie", await co…</code> | 일회용 `state` 쿠키를 **폐기**한다(재사용 방지). |
| 16 | <code>return response;</code> | 완료. |
| 17 | <code>} catch (error) {</code> | GitHub 쪽 실패 |
| 18 | <code>if (error instanceof AppError) return redirect…</code> | 사용자에게 이유를 알리고 로그인 화면으로. |
| 19–21 | <code>throw error;</code> | 예상 밖 오류는 그대로. |

**`project/app/services/auth.server.ts`** — 실제 파일 48–63줄 · [파일 열기](project/app/services/auth.server.ts#L48-L63)

```ts
/** 소셜 로그인: 검증된 이메일로 기존 계정을 찾고, 없으면 비밀번호 없는 계정을 만든다. */
export async function findOrCreateOAuthUser(
  profile: { email: string; nickname: string },
  repo: Repo = getRepo(),
): Promise<PublicUser> {
  const existing = await repo.users.findByEmail(profile.email.toLowerCase());
  if (existing) return toPublicUser(existing);
  const nickname = profile.nickname.replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 20).padEnd(2, "_");
  const created = await repo.users.create({
    email: profile.email.toLowerCase(),
    nickname,
    // verifyPassword는 "scrypt$..." 형식만 통과시키므로 이 값으로는 비밀번호 로그인이 불가능하다.
    passwordHash: "oauth:github",
  });
  return toPublicUser(created);
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>/** 소셜 로그인: 검증된 이메일로 기존 계정을 찾고, 없으면 비밀번호 없는 계정…</code> | 주석. |
| 2–5 | <code>export async function findOrCreateOAuthUser(</code> | GitHub 프로필 → 우리 사용자. |
| 6 | <code>const existing = await repo.users.findByEmail(…</code> | **검증된 이메일**로 기존 계정을 찾는다. 있으면 그 계정으로 로그인(같은 사람의 두 로그인 방법). |
| 7 | <code>if (existing) return toPublicUser(existing);</code> | 연결. |
| 8 | <code>const nickname = profile.nickname.replace(/[^\…</code> | GitHub 로그인 이름에서 허용 글자만 남기고 2~20자로 맞춘다. |
| 9–12 | <code>const created = await repo.users.create({</code> | 새 계정. |
| 13–14 | <code>passwordHash: "oauth:github",</code> | **비밀번호가 없는 계정**. `verifyPassword`는 `scrypt$…` 형식만 통과시키므로 이 값으로는 **비밀번호 로그인이 불가능**하다. |
| 15–16 | <code>return toPublicUser(created);</code> | 완료. |

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

**`project/tools/request-test.mjs`** — 실제 파일 7–13줄 · [파일 열기](project/tools/request-test.mjs#L7-L13)

```js
// ── 모의 외부 서비스 ─────────────────────────────────────────────
let resendFailsLeft = 1; // 첫 요청은 일부러 500 → 작업 큐의 재시도를 확인한다
const resend = await mockServer((req, res) => {
  if (resendFailsLeft-- > 0) return res.writeHead(500).end("boom");
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ id: "mail_1" }));
});
const stripe = await mockServer((req, res) => {
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>// ── 모의 외부 서비스 ──────────────────────────────…</code> | 주석. |
| 2 | <code>let resendFailsLeft = 1; // 첫 요청은 일부러 500 → 작업…</code> | 첫 요청은 일부러 **500으로 실패**시킨다 → 작업 큐가 재시도하는지 확인하려고. |
| 3 | <code>const resend = await mockServer((req, res) =&gt; …</code> | 가짜 Resend. 호출 기록(`calls`)이 쌓인다. |
| 4 | <code>if (resendFailsLeft-- &gt; 0) return res.writeHea…</code> | 처음 한 번은 500을 돌려준다. |
| 5–7 | <code>res.writeHead(200, { "Content-Type": "applicat…</code> | 그다음부터는 정상 응답. |

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
