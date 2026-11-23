# study17 — 실시간·확장

> 기준: [노션 · React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06). 코드: [project/app/realtime/hub.server.ts](project/app/realtime/hub.server.ts), [project/app/routes/api/events.ts](project/app/routes/api/events.ts), [project/server.ts](project/server.ts), [project/app/routes/api/export-posts-csv.ts](project/app/routes/api/export-posts-csv.ts).

## ① 목표 한 줄

React Router 7 앱에 실시간 알림(SSE), 양방향 통신(WebSocket), 파일 처리(CSV 스트리밍 내보내기)를 붙이고, 각 방식을 **언제 고르는지**와 **여러 서버로 늘릴 때의 한계**를 익힌다.

## ② 📖 이론

### 왜 실시간이 따로 필요한가

HTTP는 "묻고 답하기"입니다. **서버가 먼저** 말을 거는 일(누가 내 글에 댓글을 달았다, 채팅 메시지가 왔다)은 요청-응답으로는 어렵습니다. 방법이 세 가지 있습니다.

| 방식 | 모양 | 장점 | 단점 | 이 앱 |
| --- | --- | --- | --- | --- |
| **폴링**(주기적으로 묻기) | 3초마다 `GET` | 가장 단순, 어디서나 동작 | 낭비·지연 | 문서 요약 상태(study18) |
| **SSE**(Server-Sent Events) | 브라우저가 연결을 하나 열어 두고 **서버 → 브라우저**로만 흘림 | 단순한 HTTP, **자동 재연결**, 프록시·인증 쉬움 | 단방향 | **알림**(`/api/events`) |
| **WebSocket** | 연결 하나로 **양방향** | 채팅·게임·협업 | 별도 프로토콜, 프록시·확장·인증이 더 어려움 | **채팅**(`/ws`) |

**고르는 기준**: 서버가 알려 주기만 하면 → SSE. 클라이언트도 자주 보내야 하면 → WebSocket. 아주 가끔이면 → 폴링.

### React Router 7과 실시간

- **SSE**는 `Response`에 `ReadableStream`을 담아 돌려주는 **리소스 라우트**로 만든다. 별도 서버가 필요 없다(개발 서버·`react-router-serve`에서도 동작).
- **WebSocket**은 HTTP `Upgrade` 요청을 처리해야 하는데 **React Router에는 내장 기능이 없다.** 그래서 이 앱은 운영용 서버를 직접 만든다(`server.ts`: Express + `ws`). **`react-router dev` 개발 서버에는 `/ws`가 없다**(SSE는 있다). `npm run build && npm start`로 시험한다.

### 확장(여러 서버)의 한계

이 앱의 허브(`hub.server.ts`)는 **한 프로세스의 메모리**입니다. 서버가 둘이면 A 서버에 연결된 사용자에게 B 서버에서 일어난 이벤트가 **전달되지 않습니다.** 해결: Redis pub/sub·NATS·Postgres `LISTEN/NOTIFY` 같은 **서버 간 메시지 통로**로 이벤트를 모든 서버에 퍼뜨린다. WebSocket은 추가로 연결이 한 서버에 붙어 있어야 하므로 로드밸런서의 **스티키 세션**이 필요할 수 있다.

### 비유

폴링은 **"다 됐어요?" 하고 계속 전화하는 것**, SSE는 **라디오 방송**(듣기만 한다, 끊기면 알아서 다시 맞춘다), WebSocket은 **무전기**(양쪽이 말한다)입니다. 허브는 **방송국 주조정실**이고, 서버가 여러 대면 조정실이 여러 개라 서로 연결하는 **회선(Redis)**이 필요합니다.

## ③ 🛠️ 실기 — 전체 코드와 줄별 설명

### 1. 허브: 누가 연결돼 있고 누구에게 보낼까

**`project/app/realtime/hub.server.ts`** — 전체 · [파일 열기](project/app/realtime/hub.server.ts#L1-L31)

```ts
export type HubEvent = {
  type: "post.created" | "comment.created";
  data: Record<string, unknown>;
};

type Subscriber = { userId: number | null; send: (event: HubEvent) => void };

// HMR이나 번들 분리로 모듈이 두 번 로드돼도 구독자 목록은 하나여야 한다.
const globalForHub = globalThis as unknown as { __rr7Hub?: Set<Subscriber> };
const subscribers = (globalForHub.__rr7Hub ??= new Set<Subscriber>());

/** 연결 하나를 등록한다. 돌려받은 함수를 호출하면 등록이 해제된다. */
export function subscribe(userId: number | null, send: Subscriber["send"]): () => void {
  const subscriber = { userId, send };
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

/** toUserId가 있으면 그 사용자의 연결에만, 없으면 모두에게 보낸다. */
export function publish(event: HubEvent, toUserId?: number) {
  for (const subscriber of subscribers) {
    if (toUserId !== undefined && subscriber.userId !== toUserId) continue;
    try {
      subscriber.send(event);
    } catch {
      subscribers.delete(subscriber); // 이미 닫힌 연결
    }
  }
}

export const subscriberCount = () => subscribers.size;
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1–4 | <code>export type HubEvent = {</code> | 이벤트의 종류(`post.created`, `comment.created`)와 데이터. 종류를 **문자열 리터럴 타입**으로 제한해 오타를 컴파일러가 잡는다. |
| 6 | <code>type Subscriber = { userId: number &#124; null; sen…</code> | 구독자 하나: 어느 사용자(`null`=비로그인)의 연결이고, 이벤트를 어떻게 전달하는지(`send`). |
| 8 | <code>// HMR이나 번들 분리로 모듈이 두 번 로드돼도 구독자 목록은 하나여야 한다.</code> | 주석: 이유. |
| 9 | <code>const globalForHub = globalThis as unknown as …</code> | 개발 중 파일을 고치면 모듈이 다시 로드된다. 구독자 목록을 `globalThis`에 두어 **연결이 끊기지 않게** 한다. |
| 10 | <code>const subscribers = (globalForHub.__rr7Hub ??=…</code> | 모든 연결의 집합. |
| 12 | <code>/** 연결 하나를 등록한다. 돌려받은 함수를 호출하면 등록이 해제된다. */</code> | 주석. |
| 13 | <code>export function subscribe(userId: number &#124; nul…</code> | 연결을 등록한다. |
| 14 | <code>const subscriber = { userId, send };</code> | 연결 정보를 만들고 |
| 15 | <code>subscribers.add(subscriber);</code> | 집합에 넣는다. |
| 16–17 | <code>return () =&gt; subscribers.delete(subscriber);</code> | **해제 함수**를 돌려준다. 연결이 끊길 때 반드시 호출해야 한다(안 하면 메모리가 새고 죽은 연결에 계속 보낸다). |
| 19 | <code>/** toUserId가 있으면 그 사용자의 연결에만, 없으면 모두에게 보낸다. *…</code> | 주석. |
| 20 | <code>export function publish(event: HubEvent, toUse…</code> | 이벤트를 보낸다. |
| 21 | <code>for (const subscriber of subscribers) {</code> | 모든 연결을 돌며 |
| 22 | <code>if (toUserId !== undefined &amp;&amp; subscriber.userI…</code> | **특정 사용자에게만** 보낼 때는 다른 사람의 연결을 건너뛴다(댓글 알림은 글쓴이에게만). |
| 23 | <code>try {</code> | 전달을 시도하고 |
| 24 | <code>subscriber.send(event);</code> | 연결에 쓴다. |
| 25 | <code>} catch {</code> | 이미 닫힌 연결이라 실패하면 |
| 26–29 | <code>subscribers.delete(subscriber); // 이미 닫힌 연결</code> | 목록에서 지운다. 한 연결의 실패가 다른 연결에 퍼지지 않는다. |
| 31 | <code>export const subscriberCount = () =&gt; subscribe…</code> | 현재 연결 수(`/metrics`의 `realtime_subscribers`). |

이벤트를 **발생시키는 쪽**은 서비스입니다(화면·API 어느 쪽에서 댓글을 달아도 알림이 나가도록).

**`project/app/services/comments.server.ts`** — 실제 파일 25–34줄 · [파일 열기](project/app/services/comments.server.ts#L25-L34)

```ts
// 내 글에 내가 단 댓글은 알리지 않는다. 글쓴이에게만 보낸다.
if (post.author.id !== user.id) {
  publish(
    {
      type: "comment.created",
      data: { postId, postTitle: post.title, commentId: comment.id, from: user.nickname },
    },
    post.author.id,
  );
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>// 내 글에 내가 단 댓글은 알리지 않는다. 글쓴이에게만 보낸다.</code> | 주석. |
| 2 | <code>if (post.author.id !== user.id) {</code> | **자기 글에 자기가 단 댓글은 알리지 않는다.** |
| 3–4 | <code>publish(</code> | 이벤트를 만든다. |
| 5 | <code>type: "comment.created",</code> | 종류. |
| 6–7 | <code>data: { postId, postTitle: post.title, comment…</code> | 알림 문구를 만드는 데 필요한 값만(글 제목, 댓글 번호, 작성자 닉네임). **댓글 본문 전체는 싣지 않는다**(알림은 가볍게, 내용은 눌러서 본다). |
| 8–10 | <code>post.author.id,</code> | 두 번째 인자: **받을 사람**(글쓴이)만. |

### 2. SSE: 서버 → 브라우저 한 방향 스트림

**`project/app/routes/api/events.ts`** — 실제 파일 7–44줄 · [파일 열기](project/app/routes/api/events.ts#L7-L44)

```ts
export const loader = api(({ request, context }: Route.LoaderArgs) => {
  const userId = context.get(userContext)?.id ?? null;
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (text: string) => controller.enqueue(encoder.encode(text));
      const send = (event: HubEvent) => write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
      write("retry: 3000\n: connected\n\n"); // 끊기면 3초 뒤 브라우저가 자동으로 다시 연결한다
      const unsubscribe = subscribe(userId, send);
      // 프록시가 "아무 말 없는 연결"을 끊지 않도록 주기적으로 주석 줄을 보낸다.
      const heartbeat = setInterval(() => write(": ping\n\n"), 25_000);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* 이미 닫힘 */
        }
      });
    },
    cancel: () => cleanup(),
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform: 압축 미들웨어가 스트림을 모아서 버퍼링하지 못하게 한다.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no", // nginx 버퍼링 끄기
    },
  });
});
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export const loader = api(({ request, context …</code> | `GET /api/events`. |
| 2 | <code>const userId = context.get(userContext)?.id ??…</code> | 로그인했으면 사용자 번호, 아니면 `null`. 인증 미들웨어가 이미 판단해 둔 값이다(쿠키 또는 Bearer). |
| 3 | <code>const encoder = new TextEncoder();</code> | 글자를 바이트로. |
| 4 | <code>let cleanup = () =&gt; {};</code> | 연결이 끝날 때 정리할 함수(아래에서 채운다). |
| 6 | <code>const stream = new ReadableStream&lt;Uint8Array&gt;(…</code> | **끝나지 않는 응답 본문.** 우리가 원할 때마다 조각을 밀어 넣는다. |
| 7 | <code>start(controller) {</code> | 스트림이 열릴 때 한 번. |
| 8 | <code>const write = (text: string) =&gt; controller.enq…</code> | 조각을 쓴다. |
| 9 | <code>const send = (event: HubEvent) =&gt; write(`event…</code> | SSE 형식: `event: 이름\ndata: JSON\n\n`. **빈 줄이 메시지의 끝**이다. |
| 10 | <code>write("retry: 3000\n: connected\n\n"); // 끊기면 …</code> | `retry: 3000`: 연결이 끊기면 브라우저가 **3초 뒤 자동으로 다시 연결**한다. `: connected`는 주석 줄(브라우저가 무시) — 연결이 열렸음을 즉시 흘려 프록시가 응답을 붙잡지 않게 한다. |
| 11 | <code>const unsubscribe = subscribe(userId, send);</code> | 허브에 이 연결을 등록한다. |
| 12 | <code>// 프록시가 "아무 말 없는 연결"을 끊지 않도록 주기적으로 주석 줄을 보낸다.</code> | 주석. |
| 13 | <code>const heartbeat = setInterval(() =&gt; write(": p…</code> | **25초마다 주석 줄(`: ping`)**을 보낸다. 일정 시간 아무것도 안 흐르면 중간 장비(프록시·로드밸런서)가 연결을 끊는다. |
| 14–17 | <code>cleanup = () =&gt; {</code> | 정리: 심장박동 정지, 허브 등록 해제. |
| 18–26 | <code>request.signal.addEventListener("abort", () =&gt;…</code> | **브라우저가 탭을 닫거나 끊으면** 정리하고 스트림을 닫는다. |
| 27–28 | <code>cancel: () =&gt; cleanup(),</code> | 스트림이 취소돼도 정리한다(이중 안전). |
| 30–31 | <code>return new Response(stream, {</code> | 스트림을 응답으로. |
| 32 | <code>"Content-Type": "text/event-stream; charset=ut…</code> | **SSE의 표시.** 브라우저의 `EventSource`가 이것을 본다. |
| 33 | <code>// no-transform: 압축 미들웨어가 스트림을 모아서 버퍼링하지 못하게 한…</code> | 주석: 압축 미들웨어가 스트림을 모아서 버퍼링하지 못하게. |
| 34 | <code>"Cache-Control": "no-cache, no-transform",</code> | 캐시 금지 + 변환 금지. |
| 35–38 | <code>"X-Accel-Buffering": "no", // nginx 버퍼링 끄기</code> | nginx에게 버퍼링을 끄라고 알린다. |

**`project/app/components/notifications.tsx`** — 실제 파일 6–31줄 · [파일 열기](project/app/components/notifications.tsx#L6-L31)

```tsx
export function NotificationsListener({ enabled }: { enabled: boolean }) {
  const pushToast = useUiStore((s) => s.pushToast);
  const bump = useUiStore((s) => s.bump);
  const revalidator = useRevalidator();

  useEffect(() => {
    if (!enabled) return;
    // EventSource는 끊기면 서버가 알려 준 retry(3초) 뒤에 알아서 다시 연결한다.
    const source = new EventSource("/api/events");
    source.addEventListener("comment.created", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { from: string; postTitle: string };
      pushToast(`${data.from}님이 "${data.postTitle}"에 댓글을 남겼습니다.`);
      bump();
      void revalidator.revalidate(); // 화면의 댓글 수도 새로 읽는다
    });
    source.addEventListener("post.created", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { title: string; author: string };
      pushToast(`새 글: ${data.title} (${data.author})`);
    });
    return () => source.close();
    // revalidator 객체는 매 렌더 바뀌므로 의존성에서 뺀다. 연결은 enabled가 바뀔 때만 다시 만든다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pushToast, bump]);

  return null;
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export function NotificationsListener({ enable…</code> | 화면에 아무것도 그리지 않는 컴포넌트(`return null`). **연결만** 관리한다. `root.tsx`에 한 번 넣는다. |
| 2 | <code>const pushToast = useUiStore((s) =&gt; s.pushToas…</code> | 스토어(study12)의 토스트 추가 함수. |
| 3 | <code>const bump = useUiStore((s) =&gt; s.bump);</code> | 안 읽은 수 +1. |
| 4 | <code>const revalidator = useRevalidator();</code> | 화면의 `loader`를 **수동으로 다시 실행**하는 도구. |
| 6 | <code>useEffect(() =&gt; {</code> | 브라우저에서만 실행되는 자리(서버 렌더링에는 `EventSource`가 없다). |
| 7 | <code>if (!enabled) return;</code> | 로그인하지 않았으면 연결하지 않는다. |
| 8 | <code>// EventSource는 끊기면 서버가 알려 준 retry(3초) 뒤에 알아서 …</code> | 주석. |
| 9 | <code>const source = new EventSource("/api/events");</code> | 연결을 연다. 쿠키가 자동으로 붙어 로그인 사용자를 알아본다. 끊기면 **자동으로 다시 연결**한다. |
| 10 | <code>source.addEventListener("comment.created", (ev…</code> | 서버가 보낸 `event:` 이름으로 듣는다. |
| 11 | <code>const data = JSON.parse((event as MessageEvent…</code> | `data:` 줄의 JSON. |
| 12 | <code>pushToast(`${data.from}님이 "${data.postTitle}"에…</code> | 토스트로 알린다. |
| 13 | <code>bump();</code> | 종 모양의 숫자 +1. |
| 14–15 | <code>void revalidator.revalidate(); // 화면의 댓글 수도 새로…</code> | **화면의 `loader`를 다시 실행**해 글 목록의 댓글 수·상세 화면의 댓글이 새로 보이게 한다. 서버 상태가 바뀌었다고 알려 주면 재검증으로 화면을 맞추는 방식이다. |
| 16–19 | <code>source.addEventListener("post.created", (event…</code> | 새 글 알림(모든 구독자에게). |
| 20 | <code>return () =&gt; source.close();</code> | **정리 함수**: 컴포넌트가 사라지거나 `enabled`가 바뀌면 연결을 닫는다. 안 하면 연결이 쌓인다. |
| 21–22 | <code>// revalidator 객체는 매 렌더 바뀌므로 의존성에서 뺀다. 연결은 ena…</code> | 주석: 의존성 배열에서 `revalidator`를 뺀 이유(매 렌더 바뀌어 연결을 계속 다시 만들게 되므로). |
| 23 | <code>}, [enabled, pushToast, bump]);</code> | 이 값이 바뀔 때만 연결을 새로 만든다. |
| 25–26 | <code>return null;</code> | 그리는 것은 없다. |

```powershell
# 터미널 A: SSE 연결을 열어 둔다 (로그인한 사용자의 토큰이 필요)
$token = "<로그인으로 받은 accessToken>"
curl.exe -N -H "Authorization: Bearer $token" http://localhost:3000/api/events
# 터미널 B: 다른 사용자로 내 글에 댓글을 달면 터미널 A에 즉시 이런 줄이 흐른다
#   event: comment.created
#   data: {"postId":1,"postTitle":"…","commentId":3,"from":"joon"}
```

### 3. WebSocket: 양방향 채팅

WebSocket 연결 요청에는 `Authorization` 헤더를 **붙일 수 없습니다**(브라우저 API의 제약). 그래서 ① 로그인 사용자가 **60초짜리 티켓**을 받고 ② 그 티켓을 주소에 실어 연결합니다.

**`project/app/routes/api/auth-ws-ticket.ts`** — 실제 파일 8–13줄 · [파일 열기](project/app/routes/api/auth-ws-ticket.ts#L8-L13)

```ts
// POST /api/auth/ws-ticket → 60초짜리 토큰. WebSocket 연결 주소의 ?ticket= 으로 쓴다.
// 브라우저의 WebSocket은 요청 헤더(Authorization)를 붙일 수 없어서, 짧은 수명의 티켓을 주소에 실어 보낸다.
export const action = api(async ({ context }: Route.ActionArgs) => {
  const user = requireApiUser(context);
  return ok({ ticket: signAccessToken(user, getConfig().JWT_SECRET, 60) }, { status: 201 });
});
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1–2 | <code>// POST /api/auth/ws-ticket → 60초짜리 토큰. WebSoc…</code> | 주석. |
| 3 | <code>export const action = api(async ({ context }: …</code> | `POST`만 받는다. |
| 4 | <code>const user = requireApiUser(context);</code> | **로그인한 사용자만** 티켓을 받는다. |
| 5–6 | <code>return ok({ ticket: signAccessToken(user, getC…</code> | 같은 JWT를 **수명 60초**로 만든다. 주소에 실려 로그에 남을 수 있으므로 **금방 만료**되게 한다. |

**`project/server.ts`** — 실제 파일 52–71줄 · [파일 열기](project/server.ts#L52-L71)

```ts
server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname !== "/ws") return socket.destroy();

  // 다른 사이트의 페이지가 사용자의 브라우저로 몰래 연결하는 것(CSWSH)을 막는다.
  const origin = request.headers.origin;
  if (origin && new URL(origin).host !== request.headers.host) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    return socket.destroy();
  }
  const payload = verifyAccessToken(url.searchParams.get("ticket") ?? "", jwtSecret);
  if (!payload) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    return socket.destroy();
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    members.set(ws, { id: Number(payload.sub), nickname: payload.nickname, recent: [] });
    wss.emit("connection", ws);
  });
});
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>server.on("upgrade", (request, socket, head) =…</code> | HTTP 서버가 "WebSocket으로 바꿔 달라"(`Upgrade`) 요청을 받을 때. |
| 2 | <code>const url = new URL(request.url ?? "/", "http:…</code> | 요청 주소 분해. |
| 3 | <code>if (url.pathname !== "/ws") return socket.dest…</code> | `/ws`가 아니면 연결을 끊는다. |
| 5 | <code>// 다른 사이트의 페이지가 사용자의 브라우저로 몰래 연결하는 것(CSWSH)을 막…</code> | 주석. |
| 6 | <code>const origin = request.headers.origin;</code> | **WebSocket에는 CORS가 없다.** 아무 사이트의 페이지나 사용자의 브라우저로 우리 서버에 연결할 수 있다(CSWSH). |
| 7–10 | <code>if (origin &amp;&amp; new URL(origin).host !== request…</code> | 그래서 **`Origin`이 우리 호스트와 다르면 403**으로 직접 막는다. |
| 11 | <code>const payload = verifyAccessToken(url.searchPa…</code> | 티켓(JWT)을 검증한다. 서명·만료·알고리즘을 확인. |
| 12–15 | <code>if (!payload) {</code> | 틀리면 **401**을 쓰고 끊는다. |
| 16 | <code>wss.handleUpgrade(request, socket, head, (ws) …</code> | 통과하면 연결을 WebSocket으로 전환한다. |
| 17–20 | <code>members.set(ws, { id: Number(payload.sub), nic…</code> | 연결과 사용자 정보(번호·**닉네임은 토큰에서**)를 기억한다. 클라이언트가 보내는 "내 이름"을 믿지 않는다. |

**`project/server.ts`** — 실제 파일 73–105줄 · [파일 열기](project/server.ts#L73-L105)

```ts
wss.on("connection", (ws: WebSocket & { alive?: boolean }) => {
  ws.alive = true;
  ws.on("pong", () => (ws.alive = true));
  // 반드시 필요하다: 'error' 리스너가 없으면 비정상 프레임(너무 큰 메시지 등) 하나로 서버 프로세스 전체가 죽는다.
  // ws 라이브러리가 알아서 올바른 코드(예: 1009)로 연결을 닫으므로 여기서는 기록만 한다.
  ws.on("error", (error) => console.error(JSON.stringify({ level: "warn", msg: "ws error", error: String(error) })));
  broadcast({ type: "presence", count: members.size });

  ws.on("message", (raw) => {
    const member = members.get(ws)!;
    // 연결마다 10초에 10개까지만 받는다. 도배를 막는다.
    const now = Date.now();
    member.recent = member.recent.filter((t) => now - t < 10_000);
    if (member.recent.length >= 10) return ws.send(JSON.stringify({ type: "error", message: "너무 빨리 보내고 있습니다." }));
    member.recent.push(now);

    let message: { type?: string; text?: unknown };
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return ws.send(JSON.stringify({ type: "error", message: "JSON 형식이 아닙니다." }));
    }
    if (message.type === "ping") return ws.send(JSON.stringify({ type: "pong" }));
    if (message.type === "chat" && typeof message.text === "string" && message.text.trim()) {
      broadcast({ type: "chat", from: member.nickname, text: message.text.trim().slice(0, 500), at: new Date().toISOString() });
    }
  });

  ws.on("close", () => {
    members.delete(ws);
    broadcast({ type: "presence", count: members.size });
  });
});
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>wss.on("connection", (ws: WebSocket &amp; { alive?…</code> | 연결이 성립했을 때. |
| 2 | <code>ws.alive = true;</code> | **살아 있음 표시**. |
| 3 | <code>ws.on("pong", () =&gt; (ws.alive = true));</code> | 상대가 `ping`에 답하면 다시 표시한다(아래 정리 타이머가 쓴다). |
| 4–5 | <code>// 반드시 필요하다: 'error' 리스너가 없으면 비정상 프레임(너무 큰 메시지…</code> | 주석: **이 핸들러가 없으면 서버 전체가 죽는다**(이 저장소의 테스트가 실제로 잡은 버그). |
| 6 | <code>ws.on("error", (error) =&gt; console.error(JSON.s…</code> | 비정상 프레임(너무 큰 메시지 등)에서 `ws`가 `error` 이벤트를 낸다. **리스너가 없으면 Node가 처리되지 않은 예외로 프로세스를 종료**한다. 기록만 하고 넘어가면 `ws`가 알맞은 코드(1009)로 연결만 닫는다. |
| 7 | <code>broadcast({ type: "presence", count: members.s…</code> | 접속자 수를 모두에게 알린다. |
| 9 | <code>ws.on("message", (raw) =&gt; {</code> | 메시지를 받을 때. |
| 10 | <code>const member = members.get(ws)!;</code> | 이 연결의 사용자. |
| 11 | <code>// 연결마다 10초에 10개까지만 받는다. 도배를 막는다.</code> | 주석. |
| 12 | <code>const now = Date.now();</code> | 지금. |
| 13 | <code>member.recent = member.recent.filter((t) =&gt; no…</code> | 최근 10초 안의 메시지 시각만 남긴다. |
| 14 | <code>if (member.recent.length &gt;= 10) return ws.send…</code> | **10초에 10개를 넘으면** 거절한다(도배 방지). |
| 15 | <code>member.recent.push(now);</code> | 이번 메시지를 기록. |
| 17 | <code>let message: { type?: string; text?: unknown }…</code> | 파싱할 메시지. |
| 18 | <code>try {</code> | 안전하게 |
| 19 | <code>message = JSON.parse(raw.toString());</code> | JSON으로 읽고 |
| 20–22 | <code>} catch {</code> | 아니면 **오류 메시지만 돌려주고 연결은 유지**한다. |
| 23 | <code>if (message.type === "ping") return ws.send(JS…</code> | 앱 수준의 `ping`에 `pong`. |
| 24–27 | <code>if (message.type === "chat" &amp;&amp; typeof message.…</code> | 채팅: 문자열이고 비어 있지 않을 때만. 닉네임은 **토큰의 값**, 본문은 500자로 자르고, 시각은 **서버가** 붙인다. |
| 29–33 | <code>ws.on("close", () =&gt; {</code> | 연결이 끝나면 목록에서 지우고 접속자 수를 다시 알린다. |

`new WebSocketServer({ noServer: true, maxPayload: 2048 })`의 `maxPayload`는 **2KB를 넘는 메시지가 오면 연결을 끊습니다**(메모리 공격 방지).

**`project/app/components/lab/service-demos.tsx`** — 실제 파일 70–88줄 · [파일 열기](project/app/components/lab/service-demos.tsx#L70-L88)

```tsx
async function connect() {
  setState("connecting");
  const response = await fetch("/api/auth/ws-ticket", { method: "POST" });
  if (!response.ok) return setState("closed");
  const { data } = (await response.json()) as { data: { ticket: string } };
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${scheme}://${location.host}/ws?ticket=${encodeURIComponent(data.ticket)}`);
  socket.current = ws;
  ws.onopen = () => setState("open");
  ws.onclose = () => {
    setState("closed");
    push("— 연결이 끊겼습니다 —");
  };
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data) as { type: string; from?: string; text?: string; count?: number };
    if (message.type === "chat") push(`${message.from}: ${message.text}`);
    if (message.type === "presence") push(`· 접속자 ${message.count}명`);
  };
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>async function connect() {</code> | "채팅 연결" 버튼. |
| 2 | <code>setState("connecting");</code> | 연결 중 표시. |
| 3 | <code>const response = await fetch("/api/auth/ws-tic…</code> | **티켓을 먼저 받는다.** |
| 4 | <code>if (!response.ok) return setState("closed");</code> | 로그인이 풀렸으면 중단. |
| 5 | <code>const { data } = (await response.json()) as { …</code> | 티켓. |
| 6 | <code>const scheme = location.protocol === "https:" …</code> | **HTTPS 페이지는 `wss://`, HTTP 페이지는 `ws://`**를 써야 한다(섞으면 브라우저가 막는다). |
| 7 | <code>const ws = new WebSocket(`${scheme}://${locati…</code> | 티켓을 쿼리에 실어 연결한다. 브라우저가 `Origin` 헤더를 자동으로 붙인다(서버가 검사한다). |
| 8 | <code>socket.current = ws;</code> | 보낼 때 쓰도록 보관(`useRef`). |
| 9 | <code>ws.onopen = () =&gt; setState("open");</code> | 연결됨. |
| 10–13 | <code>ws.onclose = () =&gt; {</code> | 끊김(서버 종료·네트워크·티켓 만료). |
| 14–19 | <code>ws.onmessage = (event) =&gt; {</code> | 메시지 수신: 채팅이면 줄을 추가하고 접속자 수 이벤트면 그 줄을 추가한다. 서버가 보낸 닉네임을 그대로 **글자로** 출력한다(React가 이스케이프 → XSS 안전). |

### 4. 파일 처리: 큰 CSV를 스트리밍으로 내려받기

**`project/app/lib/csv.ts`** — 전체 · [파일 열기](project/app/lib/csv.ts#L1-L11)

```ts
/**
 * CSV 한 칸. 쉼표·따옴표·줄바꿈이 있으면 큰따옴표로 감싸고 안의 "를 ""로 바꾼다.
 * 엑셀은 =, +, -, @ 로 시작하는 칸을 수식으로 실행하므로(CSV 인젝션) 앞에 ' 를 붙여 글자로 만든다.
 */
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const toCsvRow = (cells: unknown[]) => cells.map(csvCell).join(",") + "\r\n";
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1–4 | <code>/**</code> | 주석: CSV 인젝션 방어를 설명한다. |
| 5 | <code>export function csvCell(value: unknown): strin…</code> | CSV 한 칸을 안전하게 만든다. |
| 6 | <code>let text = value == null ? "" : String(value);</code> | `null`은 빈 칸, 나머지는 문자열로. |
| 7 | <code>if (/^[=+\-@\t\r]/.test(text)) text = `'${text…</code> | **`=`, `+`, `-`, `@`로 시작하면 앞에 `'`를 붙인다.** 엑셀은 이런 칸을 **수식으로 실행**한다. 글 제목에 `=cmd\|' /C calc'!A0`을 쓴 공격자가 내려받는 사람의 PC에서 명령을 실행시킬 수 있다(CSV 인젝션). |
| 8–9 | <code>return /[",\r\n]/.test(text) ? `"${text.replac…</code> | **쉼표·큰따옴표·줄바꿈**이 있으면 큰따옴표로 감싸고 안의 `"`는 `""`로. 안 하면 칸이 쪼개지거나 행이 어긋난다. |
| 11 | <code>export const toCsvRow = (cells: unknown[]) =&gt; …</code> | 한 행 = 칸들을 쉼표로 잇고 `\r\n`(CSV 표준 줄바꿈)으로 끝낸다. |

**`project/app/routes/api/export-posts-csv.ts`** — 실제 파일 6–38줄 · [파일 열기](project/app/routes/api/export-posts-csv.ts#L6-L38)

```ts
const PAGE = 100;

// 한 번에 전부 메모리에 올리지 않고, 100건씩 읽는 대로 흘려 보낸다(백프레셔가 걸리면 읽기도 멈춘다).
async function* rows(): AsyncGenerator<string> {
  const repo = getRepo();
  yield "﻿" + toCsvRow(["id", "title", "author", "commentCount", "createdAt"]); // BOM: 엑셀에서 한글이 깨지지 않게
  for (let page = 1; ; page++) {
    const { items } = await repo.posts.list({ q: "", page, limit: PAGE, sort: "createdAt" });
    for (const post of items) yield toCsvRow([post.id, post.title, post.author.nickname, post.commentCount, post.createdAt]);
    if (items.length < PAGE) return;
  }
}

// GET /api/export/posts.csv
export const loader = api((_args: Route.LoaderArgs) => {
  const encoder = new TextEncoder();
  const iterator = rows();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(value));
    },
    cancel: () => void iterator.return(undefined),
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="posts.csv"',
      "Cache-Control": "no-store",
    },
  });
});
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>const PAGE = 100;</code> | 한 번에 읽을 글 수. |
| 3 | <code>// 한 번에 전부 메모리에 올리지 않고, 100건씩 읽는 대로 흘려 보낸다(백프레…</code> | 주석: 핵심 아이디어. |
| 4 | <code>async function* rows(): AsyncGenerator&lt;string&gt;…</code> | **비동기 제너레이터**: `yield`할 때마다 한 줄을 내보내고, 다음 줄이 필요할 때까지 **멈춘다**. |
| 5 | <code>const repo = getRepo();</code> | 저장소. |
| 6 | <code>yield "﻿" + toCsvRow(["id", "title", "author",…</code> | 첫 줄은 **BOM + 헤더**. BOM(`EF BB BF`)이 있어야 엑셀이 UTF-8 한글을 깨뜨리지 않고 연다. |
| 7 | <code>for (let page = 1; ; page++) {</code> | 100건씩 페이지를 넘기며 |
| 8 | <code>const { items } = await repo.posts.list({ q: "…</code> | 한 페이지를 읽는다. 전체를 한 번에 메모리에 올리지 않는다. |
| 9 | <code>for (const post of items) yield toCsvRow([post…</code> | 한 행씩 내보낸다. |
| 10–12 | <code>if (items.length &lt; PAGE) return;</code> | 마지막 페이지(100건 미만)면 끝. |
| 14 | <code>// GET /api/export/posts.csv</code> | 주석. |
| 15 | <code>export const loader = api((_args: Route.Loader…</code> | GET. |
| 16 | <code>const encoder = new TextEncoder();</code> | 글자 → 바이트. |
| 17 | <code>const iterator = rows();</code> | 제너레이터 시작. |
| 18 | <code>const stream = new ReadableStream&lt;Uint8Array&gt;(…</code> | 응답 본문 스트림. |
| 19 | <code>async pull(controller) {</code> | **소비자(브라우저/네트워크)가 더 받을 준비가 됐을 때만** 호출된다. 이것이 **백프레셔**: 느린 클라이언트에게 서버가 계속 밀어 넣어 메모리가 터지는 것을 막는다. |
| 20 | <code>const { value, done } = await iterator.next();</code> | 다음 줄. |
| 21–23 | <code>if (done) controller.close();</code> | 끝나면 스트림을 닫는다. |
| 24–25 | <code>cancel: () =&gt; void iterator.return(undefined),</code> | 사용자가 다운로드를 취소하면 제너레이터도 멈춰 DB 읽기를 그만둔다. |
| 26–27 | <code>return new Response(stream, {</code> | 스트림 응답. |
| 28 | <code>"Content-Type": "text/csv; charset=utf-8",</code> | CSV. |
| 29 | <code>"Content-Disposition": 'attachment; filename="…</code> | `attachment`: 브라우저가 화면에 표시하지 않고 **파일로 저장**한다. |
| 30–33 | <code>"Cache-Control": "no-store",</code> | 캐시하지 않는다(내보내기는 매번 최신). |

## ④ 🔗 연동 포인트

### 이 단계의 기능이 다른 부분과 만나는 곳

| 연결 | 방법 |
| --- | --- |
| **인증(study7)** | SSE는 같은 `authMiddleware`(쿠키·Bearer), WebSocket은 **티켓**. 둘 다 한 곳(JWT)의 서명·만료 규칙을 쓴다 |
| **서비스** | 이벤트는 **서비스**가 발생시킨다(`createComment`·`createPost`). 화면이든 API든 같은 알림이 나간다 |
| **화면** | `root.tsx`의 `NotificationsListener` → 스토어(토스트·안 읽은 수) + `revalidate()`로 `loader` 재실행 |
| **운영(study16)** | `/metrics`의 `realtime_subscribers`, 프록시의 버퍼링 끄기(`flush_interval -1`), 종료 시 WebSocket에 1001을 보내 재연결 유도 |
| **파일(study13)** | 업로드(들어오는 파일)와 내보내기(나가는 파일)는 같은 원칙: 크기 제한·형식 검증·스트리밍 |
| **확장(여러 서버)** | `publish()`의 구현을 Redis pub/sub로 바꾸면 **서비스 코드는 그대로** — 허브의 내부만 교체 |

### 시험으로 확인한 것 (모두 통과)

- SSE: 응답 헤더(`text/event-stream`·`no-transform`), 내 글에 **다른 사용자가** 댓글 → 글쓴이에게만 `comment.created`, 비로그인 구독자에겐 안 감, 새 글 → **모든 구독자**에게 `post.created`, 내 댓글은 나에게 알리지 않음.
- WebSocket: 잘못된 티켓 **401**, 낯선 Origin **403**, 정상 연결 **101**과 접속자 수 방송, 채팅이 모든 연결에 방송(닉네임은 토큰에서), JSON 아닌 메시지는 오류 응답 후 연결 유지, **2KB 초과 → 연결 종료(1009) 후에도 서버는 계속 동작**.
- CSV: BOM 바이트(`EF BB BF`), 인젝션 방어(`'=cmd…`), 쉼표·따옴표 이스케이프, **100건 페이지를 넘어도** 모든 행 포함.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| **서버 프로세스가 갑자기 종료**(WebSocket에 큰 메시지) | `ws` 인스턴스에 `error` 리스너가 없어 처리되지 않은 예외 | `ws.on("error", …)` — 이 저장소의 요청 테스트가 실제로 잡았다 |
| SSE가 한꺼번에 모여서 도착 | 압축·프록시가 응답을 버퍼링 | `Cache-Control: no-transform`, `X-Accel-Buffering: no`, 프록시 `flush_interval -1` |
| SSE가 1분쯤 뒤 끊김 | 중간 장비의 유휴 타임아웃 | 25초 `: ping` 심장박동, `retry:`로 자동 재연결 |
| 탭을 닫았는데 서버의 구독자 수가 줄지 않음 | 해제(`unsubscribe`)·`abort` 처리 누락 | `request.signal`의 `abort`와 `cancel`에서 반드시 정리 |
| `WebSocket connection failed` | `react-router dev`에는 `/ws`가 없다 | `npm run build && npm start`(`server.ts`)로 시험 |
| HTTPS 페이지에서 `ws://`로 연결해 차단 | 혼합 콘텐츠 | `location.protocol`에 맞춰 `wss://` |
| WebSocket이 401로 거절 | 티켓 만료(60초)·다른 키 | 연결 직전에 티켓을 받는다. 서버·티켓 발급 서버의 `JWT_SECRET`이 같아야 한다 |
| 알림이 두 서버 중 한쪽 사용자에게만 감 | 허브가 프로세스 메모리 | Redis pub/sub 등으로 이벤트를 모든 서버에 전파 |
| 모바일에서 채팅이 조용히 죽음 | `close` 이벤트 없이 연결이 끊김(터널·절전) | 서버가 30초마다 `ping`→`pong` 확인 후 응답 없으면 `terminate`(이 서버의 정리 타이머), 클라이언트는 재연결 |
| 엑셀에서 한글이 깨짐 | BOM이 없음 | 첫 바이트에 `﻿` |
| 엑셀에서 열자마자 경고·수식 실행 | CSV 인젝션 | `=+-@` 시작 칸에 `'` |
| 내보내기가 메모리를 많이 씀 | 전체를 배열에 모았다가 한 번에 응답 | `ReadableStream`의 `pull`로 100건씩 |

## ⑥ 직접 해보기

1. 터미널 A에서 `curl.exe -N`으로 `/api/events`를 열고(토큰 필요), 브라우저에서 다른 계정으로 댓글을 달아 알림이 즉시 흐르는 것을 본다. 25초 뒤 `: ping` 줄이 오는지 기다려 본다. 이어서 `Ctrl+C`로 끊고 `/metrics`의 `realtime_subscribers`가 줄어드는지 확인한다.
2. `npm run build && npm start`로 서버를 띄우고 브라우저 두 개(로그인 두 계정)에서 `/lab`의 **채팅 연결**을 눌러 서로 메시지를 보낸다. 한쪽 탭을 닫으면 상대의 접속자 수가 줄어드는 것을 본다. 개발자도구 Network → WS에서 프레임을 확인한다.
3. 글 제목에 `=1+1`을 넣은 글을 하나 만들고 `/api/export/posts.csv`를 받아 엑셀(또는 메모장)로 열어 `'=1+1`로 보이는지 확인한다. 그다음 `lib/csv.ts`에서 `'` 보호 줄을 임시로 지우고 달라지는 점을 본다(되돌린다).

## ⑦ ☐ 체크리스트

- [ ] 폴링·SSE·WebSocket을 상황별로 고르는 기준을 말할 수 있다.
- [ ] SSE 응답의 헤더(`text/event-stream`, `no-transform`)와 심장박동·`retry`의 이유를 설명할 수 있다.
- [ ] 연결을 열고 반드시 **닫는 쪽**(`unsubscribe`, `abort`, `source.close()`)을 코드에서 가리킬 수 있다.
- [ ] WebSocket이 헤더 인증을 못 쓰는 이유와 티켓·Origin 검사·메시지 크기·속도 제한을 설명할 수 있다.
- [ ] `ws.on("error")`가 없으면 왜 서버가 죽는지 안다.
- [ ] CSV를 BOM·이스케이프·인젝션 방어·스트리밍(백프레셔)으로 만든 이유를 설명할 수 있다.
- [ ] 허브가 한 프로세스 메모리라는 한계와, 여러 서버에서의 해결(Redis pub/sub)을 말할 수 있다.

## ⑧ 다음 단계 연결

서버가 먼저 말하고 큰 데이터를 흘려 보낼 수 있게 됐으니 [study18.md](study18.md)에서 가장 느리고 가장 흥미로운 일, **AI 모델 호출**을 붙입니다: 프롬프트, 스트리밍 응답 표시, 근거 기반 답변, 그리고 MCP.
