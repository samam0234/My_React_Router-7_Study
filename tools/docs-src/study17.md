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

@@code project/app/realtime/hub.server.ts
`export type HubEvent` | 이벤트의 종류(`post.created`, `comment.created`)와 데이터. 종류를 **문자열 리터럴 타입**으로 제한해 오타를 컴파일러가 잡는다.
`type Subscriber` | 구독자 하나: 어느 사용자(`null`=비로그인)의 연결이고, 이벤트를 어떻게 전달하는지(`send`).
`// HMR이나` | 주석: 이유.
`const globalForHub` | 개발 중 파일을 고치면 모듈이 다시 로드된다. 구독자 목록을 `globalThis`에 두어 **연결이 끊기지 않게** 한다.
`const subscribers` | 모든 연결의 집합.
`/** 연결 하나를` | 주석.
`export function subscribe` | 연결을 등록한다.
`const subscriber =` | 연결 정보를 만들고
`subscribers.add(` | 집합에 넣는다.
`return () =>` | **해제 함수**를 돌려준다. 연결이 끊길 때 반드시 호출해야 한다(안 하면 메모리가 새고 죽은 연결에 계속 보낸다).
`/** toUserId가` | 주석.
`export function publish` | 이벤트를 보낸다.
`for (const subscriber of subscribers)` | 모든 연결을 돌며
`if (toUserId !== undefined` | **특정 사용자에게만** 보낼 때는 다른 사람의 연결을 건너뛴다(댓글 알림은 글쓴이에게만).
`try {` | 전달을 시도하고
`subscriber.send(event)` | 연결에 쓴다.
`} catch {` | 이미 닫힌 연결이라 실패하면
`// 이미 닫힌 연결` | 목록에서 지운다. 한 연결의 실패가 다른 연결에 퍼지지 않는다.
`export const subscriberCount` | 현재 연결 수(`/metrics`의 `realtime_subscribers`).
@@end

이벤트를 **발생시키는 쪽**은 서비스입니다(화면·API 어느 쪽에서 댓글을 달아도 알림이 나가도록).

@@code project/app/services/comments.server.ts from=/^  \/\/ 내 글에 내가 단 댓글은/ to=/^  \}$/
`// 내 글에 내가` | 주석.
`if (post.author.id !== user.id) {` | **자기 글에 자기가 단 댓글은 알리지 않는다.**
`publish(` | 이벤트를 만든다.
`type: "comment.created"` | 종류.
`data: { postId,` | 알림 문구를 만드는 데 필요한 값만(글 제목, 댓글 번호, 작성자 닉네임). **댓글 본문 전체는 싣지 않는다**(알림은 가볍게, 내용은 눌러서 본다).
`post.author.id,` | 두 번째 인자: **받을 사람**(글쓴이)만.
@@end

### 2. SSE: 서버 → 브라우저 한 방향 스트림

@@code project/app/routes/api/events.ts from=/^export const loader = api/ to=/^\}\);$/
`export const loader = api(` | `GET /api/events`.
`const userId =` | 로그인했으면 사용자 번호, 아니면 `null`. 인증 미들웨어가 이미 판단해 둔 값이다(쿠키 또는 Bearer).
`const encoder = new TextEncoder()` | 글자를 바이트로.
`let cleanup = () => {}` | 연결이 끝날 때 정리할 함수(아래에서 채운다).
`const stream = new ReadableStream` | **끝나지 않는 응답 본문.** 우리가 원할 때마다 조각을 밀어 넣는다.
`start(controller) {` | 스트림이 열릴 때 한 번.
`const write =` | 조각을 쓴다.
`const send =` | SSE 형식: `event: 이름\ndata: JSON\n\n`. **빈 줄이 메시지의 끝**이다.
`write("retry: 3000` | `retry: 3000`: 연결이 끊기면 브라우저가 **3초 뒤 자동으로 다시 연결**한다. `: connected`는 주석 줄(브라우저가 무시) — 연결이 열렸음을 즉시 흘려 프록시가 응답을 붙잡지 않게 한다.
`const unsubscribe = subscribe(` | 허브에 이 연결을 등록한다.
`// 프록시가` | 주석.
`const heartbeat =` | **25초마다 주석 줄(`: ping`)**을 보낸다. 일정 시간 아무것도 안 흐르면 중간 장비(프록시·로드밸런서)가 연결을 끊는다.
`cleanup = () => {` | 정리: 심장박동 정지, 허브 등록 해제.
`request.signal.addEventListener("abort"` | **브라우저가 탭을 닫거나 끊으면** 정리하고 스트림을 닫는다.
`cancel: () => cleanup()` | 스트림이 취소돼도 정리한다(이중 안전).
`return new Response(stream, {` | 스트림을 응답으로.
`"Content-Type": "text/event-stream` | **SSE의 표시.** 브라우저의 `EventSource`가 이것을 본다.
`// no-transform` | 주석: 압축 미들웨어가 스트림을 모아서 버퍼링하지 못하게.
`"Cache-Control": "no-cache, no-transform"` | 캐시 금지 + 변환 금지.
`"X-Accel-Buffering": "no"` | nginx에게 버퍼링을 끄라고 알린다.
@@end

@@code project/app/components/notifications.tsx from=/^export function NotificationsListener/ to=/^\}/
`export function NotificationsListener` | 화면에 아무것도 그리지 않는 컴포넌트(`return null`). **연결만** 관리한다. `root.tsx`에 한 번 넣는다.
`const pushToast =` | 스토어(study12)의 토스트 추가 함수.
`const bump =` | 안 읽은 수 +1.
`const revalidator = useRevalidator()` | 화면의 `loader`를 **수동으로 다시 실행**하는 도구.
`useEffect(() => {` | 브라우저에서만 실행되는 자리(서버 렌더링에는 `EventSource`가 없다).
`if (!enabled) return` | 로그인하지 않았으면 연결하지 않는다.
`// EventSource는` | 주석.
`const source = new EventSource("/api/events")` | 연결을 연다. 쿠키가 자동으로 붙어 로그인 사용자를 알아본다. 끊기면 **자동으로 다시 연결**한다.
`source.addEventListener("comment.created"` | 서버가 보낸 `event:` 이름으로 듣는다.
`const data = JSON.parse(` | `data:` 줄의 JSON.
`pushToast(` | 토스트로 알린다.
`bump()` | 종 모양의 숫자 +1.
`void revalidator.revalidate()` | **화면의 `loader`를 다시 실행**해 글 목록의 댓글 수·상세 화면의 댓글이 새로 보이게 한다. 서버 상태가 바뀌었다고 알려 주면 재검증으로 화면을 맞추는 방식이다.
`source.addEventListener("post.created"` | 새 글 알림(모든 구독자에게).
`return () => source.close()` | **정리 함수**: 컴포넌트가 사라지거나 `enabled`가 바뀌면 연결을 닫는다. 안 하면 연결이 쌓인다.
`// revalidator 객체는` | 주석: 의존성 배열에서 `revalidator`를 뺀 이유(매 렌더 바뀌어 연결을 계속 다시 만들게 되므로).
`}, [enabled, pushToast, bump]);` | 이 값이 바뀔 때만 연결을 새로 만든다.
`return null` | 그리는 것은 없다.
@@end

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

@@code project/app/routes/api/auth-ws-ticket.ts from=/^\/\/ POST \/api\/auth\/ws-ticket/ to=/^\}\);/
`// POST /api/auth/ws-ticket` | 주석.
`export const action = api(` | `POST`만 받는다.
`const user = requireApiUser(context)` | **로그인한 사용자만** 티켓을 받는다.
`signAccessToken(user, getConfig().JWT_SECRET, 60)` | 같은 JWT를 **수명 60초**로 만든다. 주소에 실려 로그에 남을 수 있으므로 **금방 만료**되게 한다.
@@end

@@code project/server.ts from=/^server\.on\("upgrade"/ to=/^\}\);/
`server.on("upgrade"` | HTTP 서버가 "WebSocket으로 바꿔 달라"(`Upgrade`) 요청을 받을 때.
`const url = new URL(` | 요청 주소 분해.
`if (url.pathname !== "/ws")` | `/ws`가 아니면 연결을 끊는다.
`// 다른 사이트의` | 주석.
`const origin = request.headers.origin` | **WebSocket에는 CORS가 없다.** 아무 사이트의 페이지나 사용자의 브라우저로 우리 서버에 연결할 수 있다(CSWSH).
`if (origin &&` | 그래서 **`Origin`이 우리 호스트와 다르면 403**으로 직접 막는다.
`const payload = verifyAccessToken(` | 티켓(JWT)을 검증한다. 서명·만료·알고리즘을 확인.
`if (!payload) {` | 틀리면 **401**을 쓰고 끊는다.
`wss.handleUpgrade(` | 통과하면 연결을 WebSocket으로 전환한다.
`members.set(ws,` | 연결과 사용자 정보(번호·**닉네임은 토큰에서**)를 기억한다. 클라이언트가 보내는 "내 이름"을 믿지 않는다.
@@end

@@code project/server.ts from=/^wss\.on\("connection"/ to=/^\}\);/
`wss.on("connection"` | 연결이 성립했을 때.
`ws.alive = true` | **살아 있음 표시**.
`ws.on("pong"` | 상대가 `ping`에 답하면 다시 표시한다(아래 정리 타이머가 쓴다).
`// 반드시 필요하다` | 주석: **이 핸들러가 없으면 서버 전체가 죽는다**(이 저장소의 테스트가 실제로 잡은 버그).
`ws.on("error"` | 비정상 프레임(너무 큰 메시지 등)에서 `ws`가 `error` 이벤트를 낸다. **리스너가 없으면 Node가 처리되지 않은 예외로 프로세스를 종료**한다. 기록만 하고 넘어가면 `ws`가 알맞은 코드(1009)로 연결만 닫는다.
`broadcast({ type: "presence"` | 접속자 수를 모두에게 알린다.
`ws.on("message"` | 메시지를 받을 때.
`const member = members.get(ws)!` | 이 연결의 사용자.
`// 연결마다` | 주석.
`const now = Date.now()` | 지금.
`member.recent = member.recent.filter(` | 최근 10초 안의 메시지 시각만 남긴다.
`if (member.recent.length >= 10)` | **10초에 10개를 넘으면** 거절한다(도배 방지).
`member.recent.push(now)` | 이번 메시지를 기록.
`let message:` | 파싱할 메시지.
`try {` | 안전하게
`message = JSON.parse(` | JSON으로 읽고
`} catch {` | 아니면 **오류 메시지만 돌려주고 연결은 유지**한다.
`if (message.type === "ping")` | 앱 수준의 `ping`에 `pong`.
`if (message.type === "chat"` | 채팅: 문자열이고 비어 있지 않을 때만. 닉네임은 **토큰의 값**, 본문은 500자로 자르고, 시각은 **서버가** 붙인다.
`ws.on("close"` | 연결이 끝나면 목록에서 지우고 접속자 수를 다시 알린다.
@@end

`new WebSocketServer({ noServer: true, maxPayload: 2048 })`의 `maxPayload`는 **2KB를 넘는 메시지가 오면 연결을 끊습니다**(메모리 공격 방지).

@@code project/app/components/lab/service-demos.tsx from=/^  async function connect\(\)/ to=/^  \}$/
`async function connect()` | "채팅 연결" 버튼.
`setState("connecting")` | 연결 중 표시.
`const response = await fetch("/api/auth/ws-ticket"` | **티켓을 먼저 받는다.**
`if (!response.ok) return` | 로그인이 풀렸으면 중단.
`const { data } = (await response.json())` | 티켓.
`const scheme =` | **HTTPS 페이지는 `wss://`, HTTP 페이지는 `ws://`**를 써야 한다(섞으면 브라우저가 막는다).
`const ws = new WebSocket(` | 티켓을 쿼리에 실어 연결한다. 브라우저가 `Origin` 헤더를 자동으로 붙인다(서버가 검사한다).
`socket.current = ws` | 보낼 때 쓰도록 보관(`useRef`).
`ws.onopen =` | 연결됨.
`ws.onclose = () => {` | 끊김(서버 종료·네트워크·티켓 만료).
`ws.onmessage =` | 메시지 수신: 채팅이면 줄을 추가하고 접속자 수 이벤트면 그 줄을 추가한다. 서버가 보낸 닉네임을 그대로 **글자로** 출력한다(React가 이스케이프 → XSS 안전).
@@end

### 4. 파일 처리: 큰 CSV를 스트리밍으로 내려받기

@@code project/app/lib/csv.ts
`/**` | 주석: CSV 인젝션 방어를 설명한다.
`export function csvCell` | CSV 한 칸을 안전하게 만든다.
`let text =` | `null`은 빈 칸, 나머지는 문자열로.
`if (/^[=+` | **`=`, `+`, `-`, `@`로 시작하면 앞에 `'`를 붙인다.** 엑셀은 이런 칸을 **수식으로 실행**한다. 글 제목에 `=cmd|' /C calc'!A0`을 쓴 공격자가 내려받는 사람의 PC에서 명령을 실행시킬 수 있다(CSV 인젝션).
`return /[",` | **쉼표·큰따옴표·줄바꿈**이 있으면 큰따옴표로 감싸고 안의 `"`는 `""`로. 안 하면 칸이 쪼개지거나 행이 어긋난다.
`export const toCsvRow` | 한 행 = 칸들을 쉼표로 잇고 `\r\n`(CSV 표준 줄바꿈)으로 끝낸다.
@@end

@@code project/app/routes/api/export-posts-csv.ts from=/^const PAGE = 100/ to=/^\}\);$/
`const PAGE = 100` | 한 번에 읽을 글 수.
`// 한 번에 전부` | 주석: 핵심 아이디어.
`async function* rows()` | **비동기 제너레이터**: `yield`할 때마다 한 줄을 내보내고, 다음 줄이 필요할 때까지 **멈춘다**.
`const repo = getRepo()` | 저장소.
`yield "﻿"` | 첫 줄은 **BOM + 헤더**. BOM(`EF BB BF`)이 있어야 엑셀이 UTF-8 한글을 깨뜨리지 않고 연다.
`for (let page = 1; ; page++) {` | 100건씩 페이지를 넘기며
`const { items } =` | 한 페이지를 읽는다. 전체를 한 번에 메모리에 올리지 않는다.
`for (const post of items) yield` | 한 행씩 내보낸다.
`if (items.length < PAGE) return` | 마지막 페이지(100건 미만)면 끝.
`// GET /api/export/posts.csv` | 주석.
`export const loader = api(` | GET.
`const encoder` | 글자 → 바이트.
`const iterator = rows()` | 제너레이터 시작.
`const stream = new ReadableStream` | 응답 본문 스트림.
`async pull(controller) {` | **소비자(브라우저/네트워크)가 더 받을 준비가 됐을 때만** 호출된다. 이것이 **백프레셔**: 느린 클라이언트에게 서버가 계속 밀어 넣어 메모리가 터지는 것을 막는다.
`const { value, done }` | 다음 줄.
`if (done) controller.close()` | 끝나면 스트림을 닫는다.
`cancel:` | 사용자가 다운로드를 취소하면 제너레이터도 멈춰 DB 읽기를 그만둔다.
`return new Response(stream, {` | 스트림 응답.
`"Content-Type": "text/csv` | CSV.
`"Content-Disposition"` | `attachment`: 브라우저가 화면에 표시하지 않고 **파일로 저장**한다.
`"Cache-Control": "no-store"` | 캐시하지 않는다(내보내기는 매번 최신).
@@end

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
