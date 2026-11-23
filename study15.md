# study15 — 성능·캐시

> 기준: [노션 · React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06). 코드: [project/app/lib/cache.server.ts](project/app/lib/cache.server.ts), [project/app/lib/jobs.server.ts](project/app/lib/jobs.server.ts), [project/app/routes/lab.tsx](project/app/routes/lab.tsx), [project/tools/bench.mjs](project/tools/bench.mjs).

## ① 목표 한 줄

캐시, 비동기·스트리밍 처리, 백그라운드 작업을 적용하고, **측정**(Server-Timing·벤치마크·메트릭)으로 최적화의 효과를 확인하는 방법을 익힌다.

## ② 📖 이론

### 최적화의 첫 규칙: 측정하고, 그다음에 고친다

"느린 것 같다"는 느낌으로 고치면 대개 엉뚱한 곳을 고칩니다. 순서는 항상 **① 측정 → ② 병목 찾기 → ③ 고치기 → ④ 다시 측정**입니다. 그리고 "고쳐서 얼마나 빨라졌나"를 숫자로 남깁니다.

### 속도를 올리는 다섯 가지 도구

| 도구 | 무엇을 줄이나 | 이 앱에서 |
| --- | --- | --- |
| **메모리 캐시** | DB 조회 시간 | 목록 결과를 10초간 보관(`TtlCache`) |
| **HTTP 캐시** (`ETag`/304, `Cache-Control`) | **전송량**·클라이언트 대기 | 목록 `ETag`, 정적 파일 1년 `immutable` |
| **스트리밍 SSR** (`Suspense`/`Await`) | **체감 속도**(첫 화면까지 시간) | `/lab`: 빠른 부분 먼저, 느린 부분은 뒤에서 |
| **백그라운드 작업** | **응답 시간**(오래 걸리는 일을 응답 밖으로) | 메일 발송·AI 요약을 `enqueue()` |
| **미리 가져오기**(prefetch) | 클릭 후 대기 | `<Link prefetch="intent">` |

### 캐시의 가장 어려운 문제: 언제 버리나

> "컴퓨터 과학에서 어려운 것은 두 가지: 캐시 무효화와 이름 짓기."

- **TTL(만료 시간)**: 10초 후엔 무조건 새로 읽는다. 단순하지만 그 사이엔 낡은 값이 보일 수 있다.
- **쓰기 시 무효화**: 글·댓글이 바뀌면 목록 캐시를 **즉시 비운다**(이 앱). 둘을 함께 쓰면 "대개 즉시, 최악이어도 10초".
- **서버가 여러 대면?** 메모리 캐시는 서버마다 따로라 서로의 무효화를 모른다 → Redis 같은 **공유 캐시**가 필요하다. 이 구현의 한계다.

### React Router 7에서의 성능 포인트

- **`loader`는 병렬**: 중첩 라우트의 `loader`들이 동시에 실행된다(`root` + 화면). 한 `loader` 안에서도 `Promise.all`로 병렬로(상세 화면의 글+댓글).
- **재검증**: `action` 뒤·쿼리 변경 뒤에 화면의 모든 `loader`를 다시 실행한다. 비싼 `loader`는 서버 캐시로, 불필요한 재실행은 `shouldRevalidate`로 줄인다.
- **스트리밍**: `loader`가 `Promise`를 **기다리지 않고** 돌려주면 그 부분은 나중에 같은 응답 스트림으로 도착한다.
- **코드 분할**: 라우트마다 JS가 따로 번들된다(`detail-….js`, `list-….js`). `v8_splitRouteModules`는 한 라우트 모듈 안의 `clientLoader` 등도 쪼갠다.

### 비유

식당입니다. **캐시**는 인기 메뉴를 **미리 만들어 보온해 둔 것**(빠르지만 식을 수 있다), **ETag/304**는 "어제와 같은 메뉴판이면 새로 안 주셔도 돼요", **스트리밍**은 **에피타이저부터 내고 메인은 조리되는 대로**(손님은 기다리는 동안 먹는다), **백그라운드 작업**은 "포장 주문은 접수만 하고 **주방 뒤편에서** 만들겠습니다", **prefetch**는 손님이 메뉴를 만지작거리는 순간 **미리 재료를 꺼내는 것**입니다.

## ③ 🛠️ 실기 — 전체 코드와 줄별 설명

### 1. 메모리 캐시: `TtlCache`

**`project/app/lib/cache.server.ts`** — 실제 파일 1–34줄 · [파일 열기](project/app/lib/cache.server.ts#L1-L34)

```ts
type Entry<T> = { value: T; expiresAt: number };

/** 만료 시간이 있는 작은 메모리 캐시. 키 접두어로 한꺼번에 지울 수 있다. */
export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  hits = 0;
  misses = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
  ) {}

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= now) {
      if (entry) this.entries.delete(key);
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    return entry.value;
  }

  set(key: string, value: T, now = Date.now()) {
    // 가득 차면 가장 오래전에 넣은 항목부터 버린다(Map은 삽입 순서를 기억한다).
    if (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
  }

  invalidate(prefix = "") {
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
  }
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>type Entry&lt;T&gt; = { value: T; expiresAt: number …</code> | 보관하는 한 칸: 값과 **만료 시각**. |
| 3 | <code>/** 만료 시간이 있는 작은 메모리 캐시. 키 접두어로 한꺼번에 지울 수 있다. …</code> | 주석. |
| 4 | <code>export class TtlCache&lt;T&gt; {</code> | 제네릭 캐시. 어떤 값이든 담는다. |
| 5 | <code>private readonly entries = new Map&lt;string, Ent…</code> | 실제 저장소. `Map`은 **삽입 순서를 기억**한다(오래된 것부터 버리는 데 쓴다). |
| 6–7 | <code>hits = 0;</code> | 적중 횟수. **캐시가 일하는지** 숫자로 본다. |
| 9–12 | <code>constructor(</code> | 만료 시간(`ttlMs`)과 최대 개수(`maxEntries`, 기본 500)를 받는다. |
| 14 | <code>get(key: string, now = Date.now()): T &#124; undefi…</code> | 읽기. `now`를 인자로 받아 **테스트에서 시간을 고정**한다. |
| 15 | <code>const entry = this.entries.get(key);</code> | 찾는다. |
| 16 | <code>if (!entry &#124;&#124; entry.expiresAt &lt;= now) {</code> | 없거나 **만료됐으면** |
| 17 | <code>if (entry) this.entries.delete(key);</code> | 만료된 것은 지우고 |
| 18 | <code>this.misses += 1;</code> | 실패로 센다. |
| 19–20 | <code>return undefined;</code> | "없음"을 알린다(호출한 쪽이 DB에서 읽는다). |
| 21–23 | <code>this.hits += 1;</code> | 있으면 적중. |
| 25 | <code>set(key: string, value: T, now = Date.now()) {</code> | 저장. |
| 26 | <code>// 가득 차면 가장 오래전에 넣은 항목부터 버린다(Map은 삽입 순서를 기억한다)…</code> | 주석: 메모리가 무한히 늘지 않게. |
| 27 | <code>if (this.entries.size &gt;= this.maxEntries) this…</code> | **한도에 닿으면 가장 오래전에 넣은 항목을 지운다**(`keys().next()`가 맨 처음 키). |
| 28–29 | <code>this.entries.set(key, { value, expiresAt: now …</code> | 값과 만료 시각(`now + ttl`)을 저장한다. |
| 31–34 | <code>invalidate(prefix = "") {</code> | 키가 접두어로 시작하는 항목을 **한꺼번에** 지운다. 접두어를 안 주면 전부. |

### 2. 서비스에 적용: 읽을 땐 캐시, 쓸 땐 무효화

**`project/app/services/posts.server.ts`** — 실제 파일 13–24줄 · [파일 열기](project/app/services/posts.server.ts#L13-L24)

```ts
// 저장소마다 캐시를 따로 둔다(테스트에서 서로 다른 저장소의 결과가 섞이지 않게).
const caches = new WeakMap<Repo, TtlCache<ListResult>>();
const cacheFor = (repo: Repo) => {
  let cache = caches.get(repo);
  if (!cache) caches.set(repo, (cache = new TtlCache<ListResult>(10_000)));
  return cache;
};

/** 글·댓글이 바뀌면 목록 캐시를 비운다. 목록에는 댓글 수도 들어 있기 때문이다. */
export function invalidatePostCache(repo: Repo = getRepo()) {
  cacheFor(repo).invalidate();
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>// 저장소마다 캐시를 따로 둔다(테스트에서 서로 다른 저장소의 결과가 섞이지 않게…</code> | 주석: 테스트에서 저장소를 갈아 끼워도 결과가 **섞이지 않게**. |
| 2 | <code>const caches = new WeakMap&lt;Repo, TtlCache&lt;List…</code> | 저장소 객체를 열쇠로 캐시를 보관한다. 저장소가 사라지면 캐시도 알아서 정리된다(`WeakMap`). |
| 3–7 | <code>const cacheFor = (repo: Repo) =&gt; {</code> | 그 저장소의 캐시를 꺼내거나 처음이면 만든다(10초). |
| 9 | <code>/** 글·댓글이 바뀌면 목록 캐시를 비운다. 목록에는 댓글 수도 들어 있기 때문이…</code> | 주석: 목록에는 **댓글 수**도 들어 있어 댓글이 바뀌어도 낡아진다. |
| 10–12 | <code>export function invalidatePostCache(repo: Repo…</code> | 글·댓글을 만들거나 고치거나 지울 때 호출한다. |

**`project/app/services/posts.server.ts`** — 실제 파일 41–59줄 · [파일 열기](project/app/services/posts.server.ts#L41-L59)

```ts
export async function listPosts(params: ListParams, repo: Repo = getRepo()) {
  const cache = cacheFor(repo);
  const key = JSON.stringify(params);
  let result = cache.get(key);
  if (!result) {
    result = await repo.posts.list(params);
    cache.set(key, result);
  }
  return {
    data: result.items,
    meta: {
      page: params.page,
      limit: params.limit,
      total: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / params.limit)),
      ...(params.q ? { q: params.q } : {}),
    },
  };
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export async function listPosts(params: ListPa…</code> | 목록 조회(캐시 적용). |
| 2 | <code>const cache = cacheFor(repo);</code> | 이 저장소의 캐시. |
| 3 | <code>const key = JSON.stringify(params);</code> | **조회 조건 전체**가 열쇠다(`q`·`page`·`limit`·`sort`). 조건이 하나라도 다르면 다른 칸이다. |
| 4 | <code>let result = cache.get(key);</code> | 먼저 캐시에서. |
| 5 | <code>if (!result) {</code> | 없으면(미스) |
| 6 | <code>result = await repo.posts.list(params);</code> | DB에서 읽고 |
| 7–8 | <code>cache.set(key, result);</code> | 저장한다. |
| 9–19 | <code>return {</code> | 이후는 캐시든 DB든 **같은 방식으로** 응답을 만든다. 캐시가 호출하는 쪽에는 보이지 않는다. |

테스트가 이 약속(적중 시 DB 미호출, 쓰면 무효화)을 고정합니다(`tests/advanced.test.ts`): 같은 조건 두 번째 조회는 `repo.posts.list` 호출이 1번뿐이고, `createPost` 뒤에는 다시 2번이 됩니다.

### 3. HTTP 캐시와 미리 가져오기

- **ETag / 304**는 study14의 `okConditional`입니다. 본문이 같으면 304로 **전송량**을 없앱니다.
- **정적 파일**: `server.ts`가 `build/client/assets`를 `immutable, maxAge: "1y"`로 서빙합니다. 파일 이름에 **내용 해시**가 있어(`detail-DCgKiJVH.js`) 내용이 바뀌면 이름이 바뀌므로 1년 캐시가 안전합니다.
- **미리 가져오기**:

**`project/app/routes/posts/list.tsx`** — 실제 파일 84–84줄 · [파일 열기](project/app/routes/posts/list.tsx#L84-L84)

```tsx
<Link to={`/posts/${post.id}`} prefetch="intent" className="font-medium text-blue-600 hover:underline">
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>&lt;Link to={`/posts/${post.id}`} prefetch="inten…</code> | 마우스를 올리거나 키보드 포커스가 갈 때 그 링크의 **`loader` 데이터와 코드**를 미리 받는다. 클릭하면 이미 받아 둔 것으로 즉시 이동한다. 값: `none`(기본)·`intent`(의도 감지)·`render`(그려지면 바로)·`viewport`(화면에 보이면). 모든 링크에 `render`를 쓰면 쓸데없는 요청이 폭주한다. |

### 4. 스트리밍 SSR: 느린 데이터가 첫 화면을 막지 않게

**`project/app/routes/lab.tsx`** — 실제 파일 14–20줄 · [파일 열기](project/app/routes/lab.tsx#L14-L20)

```tsx
// loader가 Promise를 "기다리지 않고" 그대로 돌려주면, 빠른 데이터는 먼저 HTML로 나가고
// 느린 데이터는 준비되는 대로 같은 응답 스트림에 이어서 도착한다(스트리밍 SSR).
export async function loader({ context, url }: Route.LoaderArgs) {
  const fast = { renderedAt: new Date().toISOString() };
  const slow = sleep(800).then(() => ({ message: "느린 데이터(0.8초)가 도착했습니다." }));
  return { fast, slow, loggedIn: Boolean(context.get(userContext)), paid: url.searchParams.get("paid") };
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1–2 | <code>// loader가 Promise를 "기다리지 않고" 그대로 돌려주면, 빠른 데이터…</code> | 주석: 핵심 한 문장. |
| 3 | <code>export async function loader({ context, url }:…</code> | `/lab`의 `loader`. |
| 4 | <code>const fast = { renderedAt: new Date().toISOStr…</code> | **즉시 있는** 데이터. |
| 5 | <code>const slow = sleep(800).then(() =&gt; ({ message:…</code> | **0.8초 걸리는** 데이터. 여기에 **`await`를 쓰지 않았다**는 점이 전부다. `Promise` 자체를 들고 있다. |
| 6–7 | <code>return { fast, slow, loggedIn: Boolean(context…</code> | 빠른 값과 아직 끝나지 않은 `Promise`를 함께 돌려준다. 서버는 `fast`가 들어간 HTML을 **먼저 보내고**, `slow`가 끝나면 같은 연결로 나머지를 이어 보낸다. |

**`project/app/routes/lab.tsx`** — 실제 파일 33–37줄 · [파일 열기](project/app/routes/lab.tsx#L33-L37)

```tsx
<Suspense fallback={<p role="status" className="text-sm">느린 데이터를 불러오는 중…</p>}>
  <Await resolve={slow} errorElement={<p role="alert" className="text-sm text-red-600">불러오지 못했습니다.</p>}>
    {(value) => <p className="text-sm">{value.message}</p>}
  </Await>
</Suspense>
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>&lt;Suspense fallback={&lt;p role="status" className…</code> | **로딩 경계**. 안쪽이 준비되기 전까지 `fallback`("불러오는 중…")을 대신 보여 준다. 첫 HTML에 이 문구가 들어 있다. |
| 2 | <code>&lt;Await resolve={slow} errorElement={&lt;p role="a…</code> | `Promise`가 끝나길 기다리는 컴포넌트. `errorElement`는 `Promise`가 **실패했을 때**의 **에러 경계**다(화면 전체가 아니라 이 칸만 오류 표시). |
| 3–5 | <code>{(value) =&gt; &lt;p className="text-sm"&gt;{value.mess…</code> | 끝나면 값이 `value`로 들어와 이 함수가 그린다. 서버에서 끝났다면 HTML이 교체되고, 브라우저 이동이라면 도착하는 즉시 바뀐다. |

**`project/app/entry.server.tsx`** — 실제 파일 29–31줄 · [파일 열기](project/app/entry.server.tsx#L29-L31)

```tsx
// 검색 봇·SPA 모드는 모든 내용이 준비된 뒤 응답한다. 일반 브라우저는 껍데기부터 스트리밍한다.
const readyOption: keyof RenderToPipeableStreamOptions =
  (userAgent && isbot(userAgent)) || routerContext.isSpaMode ? "onAllReady" : "onShellReady";
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>// 검색 봇·SPA 모드는 모든 내용이 준비된 뒤 응답한다. 일반 브라우저는 껍데…</code> | 주석. |
| 2–3 | <code>const readyOption: keyof RenderToPipeableStrea…</code> | 응답을 **언제 시작할지**를 정한다. 봇·SPA(`isbot(userAgent)`)는 `onAllReady`, 일반 브라우저는 `onShellReady`. |

> **봇은 스트리밍을 받지 못합니다.** 검색 엔진 봇은 **완성된 HTML**이 필요하므로 `isbot`이 봇으로 판정하면 모든 내용이 준비된 뒤에 한꺼번에 응답합니다. 그래서 Node의 기본 `fetch`(User-Agent가 `node`)로 `/lab`을 호출하면 0.8초 뒤에 통째로 옵니다. 스트리밍을 시험하려면 **브라우저 User-Agent**를 보내야 합니다(`tools/request-test.mjs`가 그렇게 합니다). 직접 보려면:
>
> ```powershell
> $ua = "Mozilla/5.0 Chrome/120 Safari/537.36"
> curl.exe -s -N -o NUL -A $ua -w "browser: first byte %{time_starttransfer}s, total %{time_total}s`n" http://localhost:5173/lab
> curl.exe -s -N -o NUL -A "node" -w "bot(node UA): first byte %{time_starttransfer}s, total %{time_total}s`n" http://localhost:5173/lab
> ```
>
> 이 저장소의 검증에서 브라우저 UA는 첫 조각이 **약 5ms**에, 느린 데이터가 **약 800ms**에 같은 응답 안에서 도착했고(gzip 압축을 켜도 동일), 봇 UA는 모든 조각이 800ms 뒤에 한꺼번에 왔습니다.

### 5. 백그라운드 작업 큐

**`project/app/lib/jobs.server.ts`** — 실제 파일 17–21줄 · [파일 열기](project/app/lib/jobs.server.ts#L17-L21)

```ts
export function enqueue(name: string, run: () => Promise<void>, options: { retries?: number; backoffMs?: number } = {}) {
  jobStats.enqueued += 1;
  queue.push({ name, run, retries: options.retries ?? 2, backoffMs: options.backoffMs ?? 500, attempt: 0 });
  pump();
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export function enqueue(name: string, run: () …</code> | **응답을 막지 않고** 뒤에서 처리할 일을 접수한다(메일 발송, AI 요약). |
| 2 | <code>jobStats.enqueued += 1;</code> | 통계(메트릭에 노출). |
| 3 | <code>queue.push({ name, run, retries: options.retri…</code> | 일감: 이름, 실행 함수, **재시도 횟수(기본 2)**, **대기 시간(기본 0.5초)**. |
| 4–5 | <code>pump();</code> | 일꾼을 깨운다. |

**`project/app/lib/jobs.server.ts`** — 실제 파일 23–58줄 · [파일 열기](project/app/lib/jobs.server.ts#L23-L58)

```ts
function pump() {
  while (running < CONCURRENCY && queue.length > 0) {
    const job = queue.shift()!;
    running += 1;
    job.attempt += 1;
    job
      .run()
      .then(() => {
        jobStats.succeeded += 1;
        log("info", "job ok", { job: job.name, attempt: job.attempt });
      })
      .catch((error) => {
        if (job.attempt <= job.retries) {
          jobStats.retried += 1;
          log("warn", "job retry", { job: job.name, attempt: job.attempt, error: String(error) });
          // 실패할수록 더 오래 기다렸다 다시 시도한다(지수 백오프).
          setTimeout(() => {
            queue.push(job);
            pump();
          }, job.backoffMs * 2 ** (job.attempt - 1)).unref();
        } else {
          jobStats.failed += 1;
          log("error", "job failed", { job: job.name, attempts: job.attempt, error: String(error) });
        }
      })
      .finally(() => {
        running -= 1;
        pump();
        if (running === 0 && queue.length === 0) {
          const waiters = idleWaiters;
          idleWaiters = [];
          waiters.forEach((resolve) => resolve());
        }
      });
  }
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>function pump() {</code> | 대기열에서 일을 꺼내 실행하는 일꾼. |
| 2 | <code>while (running &lt; CONCURRENCY &amp;&amp; queue.length &gt;…</code> | **동시에 최대 2개**까지만 실행한다. 서버가 일감에 파묻히지 않게 한다. |
| 3 | <code>const job = queue.shift()!;</code> | 가장 오래 기다린 일. |
| 4 | <code>running += 1;</code> | 실행 중 개수. |
| 5–6 | <code>job.attempt += 1;</code> | 몇 번째 시도인지. |
| 7 | <code>.run()</code> | 일을 실행한다(`Promise`). |
| 8 | <code>.then(() =&gt; {</code> | 성공하면 |
| 9–11 | <code>jobStats.succeeded += 1;</code> | 성공으로 센다. |
| 12 | <code>.catch((error) =&gt; {</code> | 실패하면 |
| 13 | <code>if (job.attempt &lt;= job.retries) {</code> | **아직 재시도할 기회가 남았으면** |
| 14–15 | <code>jobStats.retried += 1;</code> | 재시도로 센다. |
| 16 | <code>// 실패할수록 더 오래 기다렸다 다시 시도한다(지수 백오프).</code> | 주석: 지수 백오프. |
| 17–20 | <code>setTimeout(() =&gt; {</code> | `backoffMs × 2^(시도-1)`(0.5초 → 1초 → 2초 …) 뒤에 대기열에 **다시 넣는다**. 상대 서버가 아파서 실패했는데 바로 재요청하면 더 아프게 한다. |
| 21 | <code>} else {</code> | 기회를 다 썼으면 |
| 22–25 | <code>jobStats.failed += 1;</code> | 실패로 확정하고 로그(`level:"error"`)를 남긴다. |
| 26 | <code>.finally(() =&gt; {</code> | 성공이든 실패든 |
| 27–28 | <code>running -= 1;</code> | 일꾼 자리를 비우고 다음 일을 집는다. |
| 29–36 | <code>if (running === 0 &amp;&amp; queue.length === 0) {</code> | 모든 일이 끝났으면 `whenIdle()`을 기다리던 테스트에게 알린다. |

> ⚠ **이 큐는 프로세스 메모리에만 있습니다.** 서버가 꺼지면 대기 중인 일은 **사라집니다.** 가입 환영 메일 같은 일은 괜찮지만 **결제 기록·환불처럼 잃으면 안 되는 일**은 DB 테이블(상태 컬럼)이나 외부 큐(BullMQ, SQS 등)에 저장해야 합니다.

### 6. 측정: Server-Timing · 메트릭 · 벤치마크

**`project/app/middleware/request.server.ts`** — 실제 파일 51–59줄 · [파일 열기](project/app/middleware/request.server.ts#L51-L59)

```ts
const ms = performance.now() - started;
response.headers.set("X-Request-Id", requestId);
response.headers.set("Server-Timing", `total;dur=${ms.toFixed(1)}`);
for (const [name, value] of Object.entries(securityHeaders())) response.headers.set(name, value);
if (isApi) {
  response.headers.set("X-API-Version", "1");
  for (const [name, value] of corsHeaders(request)) response.headers.set(name, value);
}
observeRequest(request.method, response.status, ms);
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>const ms = performance.now() - started;</code> | 이 요청이 서버 안에서 걸린 시간. |
| 2 | <code>response.headers.set("X-Request-Id", requestId…</code> | 요청 번호. |
| 3 | <code>response.headers.set("Server-Timing", `total;d…</code> | **브라우저 개발자도구 Network → Timing에 표시**되는 표준 헤더. 서버 안의 시간과 네트워크 시간을 구분해 볼 수 있다. |
| 4 | <code>for (const [name, value] of Object.entries(sec…</code> | 보안 헤더(study7). |
| 5 | <code>if (isApi) {</code> | API 응답에만 |
| 6 | <code>response.headers.set("X-API-Version", "1");</code> | 버전 표시와 |
| 7–8 | <code>for (const [name, value] of corsHeaders(reques…</code> | CORS 헤더. |
| 9 | <code>observeRequest(request.method, response.status…</code> | **메트릭에 기록**: 메서드·상태 계열·시간을 히스토그램(분포)으로 센다 → `/metrics`(Prometheus 형식). |

**`project/tools/bench.mjs`** — 실제 파일 30–38줄 · [파일 열기](project/tools/bench.mjs#L30-L38)

```js
const PAGES = 80; // limit=50 이면 5000건 = 100쪽. 앞 80쪽을 쓴다.
const miss = [], hit = [], missServer = [], hitServer = [];
for (let page = 1; page <= PAGES; page++) { const r = await timed(`/api/posts?limit=50&page=${page}`); miss.push(r.ms); missServer.push(r.serverMs); }
for (let page = 1; page <= PAGES; page++) { const r = await timed(`/api/posts?limit=50&page=${page}`); hit.push(r.ms); hitServer.push(r.serverMs); }

const first = await timed("/api/posts?limit=50&page=1");
const revalidate = [];
let bytes304 = 0;
for (let i = 0; i < PAGES; i++) { const r = await timed("/api/posts?limit=50&page=1", { "If-None-Match": first.etag }); revalidate.push(r.ms); bytes304 = r.bytes; }
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>const PAGES = 80; // limit=50 이면 5000건 = 100쪽.…</code> | 5000건을 `limit=50`으로 나눈 앞 80쪽을 쓴다. |
| 2 | <code>const miss = [], hit = [], missServer = [], hi…</code> | 측정값 배열들: 클라이언트(왕복)와 서버 안(`Server-Timing`) 시간. |
| 3 | <code>for (let page = 1; page &lt;= PAGES; page++) { co…</code> | **첫 번째 순회 = 캐시 미스**(처음 보는 조건 80개). |
| 4 | <code>for (let page = 1; page &lt;= PAGES; page++) { co…</code> | **두 번째 순회 = 캐시 적중**(같은 80개를 10초 안에). |
| 6 | <code>const first = await timed("/api/posts?limit=50…</code> | 한 번 읽어 `ETag`와 본문 크기를 얻는다. |
| 7 | <code>const revalidate = [];</code> | `If-None-Match`를 붙인 요청 결과. |
| 8 | <code>let bytes304 = 0;</code> | 304 응답의 본문 크기(0이어야 한다). |
| 9 | <code>for (let i = 0; i &lt; PAGES; i++) { const r = aw…</code> | 같은 요청을 80번 보내 304 시간을 잰다. |

**측정 결과**(글 5000개, `limit=50`, 로컬 SQLite·내 PC에서의 실측이며 환경마다 다릅니다):

| 상황 | 클라이언트(왕복) | 서버 안 |
| --- | --- | --- |
| 캐시 미스(처음 조회) | p50 **2.30ms** · p95 4.34ms | p50 0.80ms |
| 캐시 적중(10초 이내) | p50 **1.06ms** · p95 1.95ms | p50 **0.20ms** |
| 304(ETag 일치) | p50 **0.60ms** | — · 본문 **0바이트**(200이면 9,069바이트) |
| 검색 `LIKE '%…%'` | p50 9.61ms · p95 10.54ms | 인덱스를 못 탄다 |

**읽는 법**: ① 캐시는 서버 안 시간을 0.80 → 0.20ms로 줄였다(약 4배). ② 304는 **서버 계산을 줄이지 않고 전송량을 줄인다**(서버는 어차피 본문을 만들어 해시를 구한다). ③ 로컬 SQLite라 숫자가 모두 작다. **PostgreSQL을 네트워크로 부르는 운영에서는 캐시의 이득이 더 크다.** ④ 검색은 글이 훨씬 늘면 전문 검색(SQLite FTS5, PostgreSQL `pg_trgm`)이 필요하다.

```powershell
npm run build
npm run bench        # 위 표를 직접 만든다(글 5000개를 DB에 직접 넣고 측정)
curl.exe -s -H "Authorization: Bearer $env:METRICS_TOKEN" http://localhost:3000/metrics | Select-String "http_requests_total|http_request_duration_ms_count|jobs_total"
```

### 7. 불필요한 재검증 줄이기 (참고)

`action`이 끝나거나 쿼리가 바뀔 때 React Router는 화면의 모든 `loader`를 다시 실행합니다. 어떤 `loader`가 **그 변화와 무관**하면 건너뛰게 할 수 있습니다. 이 앱에는 측정상 필요가 없어 **적용하지 않았습니다**(참고 코드).

```tsx
// root.tsx — 같은 경로에서 쿼리만 바뀌는 GET 이동에서는 사용자·flash를 다시 읽지 않는다
import type { ShouldRevalidateFunctionArgs } from "react-router";
export function shouldRevalidate({ formMethod, currentUrl, nextUrl, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (!formMethod && currentUrl.pathname === nextUrl.pathname) return false;
  return defaultShouldRevalidate;
}
```

## ④ 🔗 연동 포인트

| 연결 | 방법 |
| --- | --- |
| **DB(study11)** | 캐시 키에 저장소 객체를 쓰므로 DB를 바꿔도 동작. 서버 여러 대 + 외부 DB가 되면 캐시를 Redis로 |
| **외부 서비스(study13)** | 메일·결제 알림은 `enqueue()`로. 실패 시 백오프 재시도 |
| **AI(study18)** | 요약처럼 느린 일은 큐로 보내고 화면은 상태(`pending`)를 폴링 |
| **실시간(study17)** | SSE 연결이 많아지면 `/metrics`의 `realtime_subscribers`로 감시 |
| **운영(study16)** | `/metrics`를 Prometheus가 긁어 가고, 지연 분포(`http_request_duration_ms`)에 경보를 건다 |
| **CDN** | `immutable` 정적 파일은 CDN에 올리기 좋다. HTML은 사용자별이라 캐시하지 않는다 |

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 글을 썼는데 목록에 안 보임(10초) | 캐시를 무효화하지 않음 | 쓰는 모든 경로에서 `invalidatePostCache` 호출(글·댓글 생성·수정·삭제) |
| 서버가 둘인데 한쪽 목록이 낡음 | 프로세스별 메모리 캐시 | 공유 캐시(Redis) 또는 TTL을 짧게 |
| 캐시 때문에 **다른 사용자의 데이터**가 보임 | 사용자별 데이터를 공용 키로 캐시 | 키에 사용자 id를 포함하거나 개인화된 응답은 캐시하지 않는다(목록은 공개 데이터라 안전) |
| 메모리가 계속 늘어남 | 최대 개수 없는 캐시 | `maxEntries` 상한(이 코드는 500) |
| 스트리밍이 안 되고 한꺼번에 도착 | 봇 User-Agent로 시험 / 프록시·압축이 응답을 모음 | 브라우저 UA로 시험, 프록시 버퍼링 끄기(`flush_interval -1`, `X-Accel-Buffering: no`) |
| `Await`가 영원히 로딩 | `Promise`가 끝나지 않음(타임아웃 없음) | 느린 호출에 타임아웃, `streamTimeout`(5초)이 서버 렌더링을 끊는다 |
| `Await` 안 오류로 화면 전체가 깨짐 | `errorElement` 없음 | `<Await errorElement={…}>`로 칸 단위 처리 |
| 재시도가 상대 서버를 더 괴롭힘 | 즉시·무제한 재시도 | 지수 백오프 + 최대 횟수(이 큐) |
| 서버 재시작 후 대기 중이던 메일이 사라짐 | 메모리 큐 | 중요한 일은 DB·외부 큐에 |
| `prefetch="render"`를 모든 링크에 → 요청 폭주 | 과한 미리 가져오기 | `intent` 사용 |
| 벤치마크 결과가 들쭉날쭉 | 첫 요청의 JIT·캐시 워밍업, 다른 프로그램의 부하 | 워밍업 후 여러 번 측정, p50·p95로 본다(평균은 이상치에 약하다) |

## ⑥ 직접 해보기

1. `npm run build && npm run bench`를 실행해 위 표와 **내 PC의 숫자**를 비교한다. `TtlCache`의 TTL을 `10_000` → `0`으로 바꾸면(캐시 끔) "적중" 행이 어떻게 되는지 보고 되돌린다.
2. `/lab`을 브라우저로 열고 개발자도구 Network에서 문서 요청의 **Timing(Server-Timing 포함)**을 본다. 이어서 `lab.tsx`의 `loader`에서 `slow`를 `await slow`로 바꾸면 첫 화면이 얼마나 늦어지는지(Waiting for server response) 비교하고 되돌린다.
3. 큐를 시험한다: `MAIL_DRIVER=resend`에 존재하지 않는 `RESEND_BASE_URL`을 주고 가입해 서버 로그에 `job retry`(0.5초·1초 간격)와 마지막 `job failed`가 찍히는지 본다. 가입 응답은 그동안 지연되지 않았는지 확인한다.

## ⑦ ☐ 체크리스트

- [ ] SSR과 로딩·에러 경계
- [ ] 최적화는 "측정 → 고치기 → 재측정" 순서이며, 이 앱의 측정값(미스/적중/304)을 해석할 수 있다.
- [ ] 메모리 캐시(TTL + 쓰기 시 무효화)와 HTTP 캐시(`ETag`/304, `immutable`)가 각각 줄이는 것(서버 시간 / 전송량)을 구분한다.
- [ ] `loader`가 `Promise`를 기다리지 않고 돌려주면 스트리밍되고, `Suspense`의 `fallback`이 로딩 경계, `Await`의 `errorElement`가 칸 단위 에러 경계임을 확인했다.
- [ ] 봇 User-Agent는 스트리밍을 받지 못하는 이유를 설명할 수 있다.
- [ ] 백그라운드 작업 큐의 재시도·지수 백오프·"메모리 큐의 한계"를 설명할 수 있다.

## ⑧ 다음 단계 연결

빠르게 만들었으니 [study16.md](study16.md)에서 **안정적으로 운영**합니다: Docker, GitHub Actions 자동 배포, 로그·모니터링, 백업을 체크리스트 중심으로 정리합니다.
