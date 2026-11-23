# study3 — 데이터 다루기

> 기준: [노션 · React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06). 코드: [midpoint/app/db/](midpoint/app/db/), [midpoint/app/routes/posts/list.tsx](midpoint/app/routes/posts/list.tsx), [midpoint/app/lib/use-local-storage.ts](midpoint/app/lib/use-local-storage.ts).

## ① 목표 한 줄

상태·모델 같은 데이터를 다루는 방법을 익히고, `loader`로 서버 데이터를 화면에 묶으며(바인딩), 브라우저 로컬 저장소와 서버 파일(DB)에 저장한다.

## ② 📖 이론

### 데이터는 "어디에 사는가"가 먼저다

같은 "데이터"라도 사는 곳에 따라 다루는 법이 완전히 다릅니다. React Router 7에서는 먼저 **어디에 둘지**를 정합니다.

| 사는 곳 | 수명 | 누가 바꾸나 | 쓰는 도구 |
| --- | --- | --- | --- |
| **서버(DB·파일)** | 영구 | 서버의 `action`·서비스 | `loader`로 읽고 `action`으로 쓴다 |
| **URL(쿼리·경로)** | 주소가 있는 동안 | 링크·폼 | `url.searchParams`, `useSearchParams` |
| **컴포넌트 상태** | 화면이 떠 있는 동안 | 이벤트 | `useState` |
| **브라우저 저장소** | 브라우저 안에서 영구 | 브라우저 코드 | `localStorage` |
| **쿠키 세션** | 로그인 기간 | 서버 | `createCookieSessionStorage`(study7) |

### 핵심 개념

- **모델**: 데이터의 "모양". 이 과정에서는 TypeScript 타입이 모델이다(`PostSummary`, `UserRecord` …). 모양을 한 곳(`db/types.ts`)에 두면 서버와 화면이 같은 약속을 쓴다.
- **loader로 불러오기**: 화면이 필요한 데이터를 **그 화면의 `loader`가** 서버에서 읽어 `loaderData`로 준다. 컴포넌트 안에서 `fetch`를 부르고 로딩 상태를 직접 관리하지 않는다.
- **바인딩**: 데이터와 화면을 묶는 것. React는 **단방향**이다: 데이터가 바뀌면 화면이 다시 그려진다. 입력칸은 `defaultValue`(제출 때 읽는 **비제어**) 또는 `value`+`onChange`(글자마다 상태에 담는 **제어**)로 묶는다.
- **재검증**: `action`이 끝나면 화면의 `loader`가 자동으로 다시 실행되어 **저장한 결과가 화면에 바로 반영**된다. 상태를 손으로 동기화하지 않는다.

### 비유

DB는 **창고**, `loader`는 **창고에서 물건을 꺼내 오는 배달원**, `loaderData`는 배달된 **상자**, `useState`는 **책상 위 메모지**(지금 작업 중인 것), `localStorage`는 **내 서랍**(이 브라우저에서만 열린다)입니다. 책상 위 메모지는 퇴근(새로고침)하면 사라지지만 창고와 서랍은 남습니다.

## ③ 🛠️ 실기 — 전체 코드와 줄별 설명

### 1. 모델: 데이터의 모양을 타입으로

@@code midpoint/app/db/types.ts from=/^export type Author/ to=/^export type SortKey/
`export type Author` | 작성자 요약. 글·댓글 응답에 들어가는 `{ id, nickname }`.
`export type PublicUser` | **밖으로 내보내도 되는** 사용자 정보. 비밀번호 해시가 없다.
`export type UserRecord` | DB에 저장된 모양. `PublicUser`에 `passwordHash`가 더해진다. 서버 안에서만 쓰고 응답에는 절대 싣지 않는다.
`export type PostSummary` | 목록용 글. 본문(`body`)이 없어 목록 응답이 가볍다.
`export type PostDetail` | 상세용 글 = 요약 + 본문. `&`는 두 타입을 합친다.
`export type CommentView` | 댓글. 어느 글(`postId`)의 누가 쓴 것인지 포함한다.
`export type SortKey` | 정렬 키 3가지만 허용한다. 문자열을 아무거나 받지 않는다.
@@end

### 2. `loader`로 데이터 불러오기

@@code midpoint/app/routes/posts/list.tsx from=/^\/\/ URL의 쿼리/ to=/^\}$/
`// URL의 쿼리` | 검색 상태의 **원본은 URL**이다. 새로고침·공유·뒤로 가기에서도 같은 화면이 나온다.
`export async function loader` | 서버에서 실행. 인자의 `url`은 정규화된 주소다(7.18의 `v8_passThroughRequests`를 켰을 때는 `request.url` 대신 이것을 쓴다).
`const params = parseListQuery` | `?q=&page=&sort=`를 **검증·보정**한다(없거나 이상한 값은 기본값으로).
`const { data, meta }` | 서비스를 호출해 글 목록과 쪽 정보를 받는다.
`return { posts: data, meta, params }` | 화면이 쓸 것만 담아 반환한다. 이 객체의 타입이 `loaderData`의 타입이 된다.
@@end

### 3. 화면과 묶기(바인딩)

@@code midpoint/app/routes/posts/list.tsx from=/^export default function PostList/ to=/^  const hrefFor/
`export default function PostList` | 컴포넌트. `loaderData`는 위 `loader` 반환 타입이다.
`const { posts, meta, params }` | 구조 분해로 필요한 값만 꺼낸다.
`const navigation = useNavigation()` | 지금 이동·제출이 진행 중인지 알려 주는 훅.
`const loading = navigation.state === "loading"` | 다음 화면의 데이터를 불러오는 중이면 `true`. 목록을 흐리게 할 때 쓴다.
`// 브라우저 localStorage에` | 아래 훅으로 이 브라우저만의 상태를 쓴다.
`const [recent, setRecent, recentReady]` | `useState`처럼 쓰지만 값이 `localStorage`에도 저장된다.
`useEffect(() => {` | 검색어(`params.q`)가 바뀔 때마다 실행되는 부수 효과.
`if (!params.q) return;` | 검색어가 없으면 아무것도 저장하지 않는다.
`setRecent((previous)` | 함수형 갱신: 이전 값을 받아 새 목록을 만든다. 같은 검색어는 앞으로 올리고(`filter`) 5개까지만 남긴다(`slice`).
@@end

입력칸을 URL과 묶는 부분입니다(검색 폼은 `method="get"`이라 제출하면 주소의 쿼리가 바뀌고 `loader`가 다시 실행됩니다).

@@code midpoint/app/routes/posts/list.tsx from=/<Form method="get"/ to=/<\/Form>/
`<Form method="get"` | **GET 폼**: 제출하면 `/posts?q=…&sort=…`로 이동한다. 서버 코드 없이 URL과 `loader`만으로 검색이 된다.
`<input` | 검색어 입력칸. `name="q"`가 쿼리 이름이 된다.
`defaultValue={params.q}` | **비제어 입력**: 처음 값만 `loader`의 값으로 채우고, 이후 입력은 브라우저가 관리한다. 새로고침해도 검색어가 남는다.
`<select name="sort"` | 정렬 선택. `defaultValue`가 현재 정렬로 선택돼 있다.
`<option value="-createdAt">` | `-`가 앞에 붙으면 내림차순(스펙 v1의 규칙).
`<button type="submit"` | 제출 버튼. 자바스크립트가 아직 로드되지 않았어도 동작한다(진짜 `<form>`이므로).
@@end

### 4. 브라우저 로컬 저장소

@@code midpoint/app/lib/use-local-storage.ts from=/^export function useLocalStorage/ to=/^\}/
`export function useLocalStorage` | 제네릭 `T`로 어떤 JSON 값이든 저장한다.
`const [value, setValue] = useState<T>(initial)` | 서버 렌더링과 브라우저의 **첫 렌더링은 항상 `initial`**. 서버에는 `localStorage`가 없고, 첫 렌더가 서버 HTML과 달라지면 hydration 오류가 난다.
`const [ready, setReady]` | 저장값을 읽는 작업이 끝났는지. 끝나기 전에는 "최근 검색어" 영역을 그리지 않아 깜빡임을 막는다.
`useEffect(() => {` | **브라우저에서만** 실행되는 자리(서버 렌더링 중에는 실행되지 않는다).
`const raw = localStorage.getItem(key)` | 문자열로 꺼낸다. `localStorage`는 문자열만 저장한다.
`setValue(JSON.parse(raw)` | 마운트된 뒤 저장값으로 교체한다.
`} catch {` | 깨진 JSON이나 사생활 보호 모드의 접근 오류는 무시하고 `initial`을 쓴다.
`setReady(true)` | 읽기 끝.
`const update = useCallback` | 값을 바꾸는 함수. `useCallback`으로 매 렌더 새 함수가 만들어지지 않게 해 `useEffect` 의존성에 안전하게 넣는다.
`const resolved = typeof next === "function"` | `setX(prev => …)` 형태와 `setX(값)` 형태를 모두 받는다.
`localStorage.setItem(key, JSON.stringify(resolved))` | 바뀔 때마다 JSON으로 저장한다.
`return [value, update, ready] as const` | 튜플로 돌려준다(`as const`로 길이·타입을 고정).
@@end

### 5. 서버 파일에 저장: SQLite

`node:sqlite`로 **파일 하나(`data/board.db`)**에 저장합니다. 서버를 껐다 켜도, 브라우저를 바꿔도 남습니다. 연결과 스키마는 study6에서 자세히 보고, 여기서는 "저장하고 읽는 한 쌍"만 봅니다.

@@code midpoint/app/db/sqlite.server.ts from=/^      async create\(\{ authorId, title, body, tags \}\)/ to=/^      async remove/
`async create({ authorId` | 글을 저장한다. 입력은 서비스가 이미 검증한 값이다.
`const result = run(` | `INSERT`를 실행한다. `?`는 값 자리표시자로, 값이 SQL 문장에 **끼워지지 않고 따로 전달**된다(SQL 주입 방어).
`JSON.stringify(tags)` | 배열은 SQLite 칸에 못 넣으므로 JSON 문자열로 바꿔 저장한다.
`return findPost(Number(result.lastInsertRowid))!` | 방금 만든 행의 id로 다시 읽어 완성된 모양으로 돌려준다.
`async update(id, patch)` | 부분 수정. 현재 값을 읽고 바뀐 필드만 덮어쓴다.
`const current = findPost(id)` | 없는 글이면 `null`을 돌려주고(서비스가 404로 바꾼다).
`run(` | `UPDATE`. `updated_at`은 DB의 `strftime`으로 현재 시각(UTC ISO)을 넣는다.
`patch.title ?? current.title` | 보낸 필드는 새 값, 안 보낸 필드는 기존 값. `??`는 `undefined`일 때만 대체한다(빈 문자열은 그대로 새 값).
@@end

## ④ 🔗 연동 포인트

### 데이터를 화면과 묶는 전체 흐름

```text
브라우저: 링크/폼 제출 ──▶ 서버: loader(url) ──▶ 서비스 ──▶ 저장소 ──▶ DB 파일
                                                                  │
브라우저: 화면 갱신 ◀── loaderData(JSON) ◀──────────────────────────┘
      │
      └─ localStorage(이 브라우저만): "최근 검색어" 5개
```

- **쓰기 후 읽기**: 글을 등록하는 `action`이 끝나면 React Router가 화면의 `loader`를 **자동으로 다시 실행**합니다(재검증). 그래서 목록에 새 글이 따로 코드 없이 나타납니다.
- **로컬 저장소 ↔ 서버**: 최근 검색어는 `localStorage`에만 있고 서버는 모릅니다. 기기를 바꾸면 사라지므로 "중요하지 않은 편의 정보"에만 씁니다. 로그인 상태나 글 같은 **중요한 데이터는 서버**에 둡니다.
- **파일(DB) 백업**: SQLite는 파일이라 복사하면 되지만, 서비스가 쓰는 도중 복사하면 깨질 수 있습니다. 안전한 백업은 study16의 `VACUUM INTO`를 씁니다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `Hydration failed` (최근 검색어 영역) | 첫 렌더에서 곧바로 `localStorage`를 읽어 서버 HTML과 달라짐 | 초기값으로 렌더하고 `useEffect`에서 읽는다(이 훅의 방식) |
| `ReferenceError: localStorage is not defined` | 서버(loader·모듈 최상단)에서 `localStorage`를 호출 | 브라우저 전용 코드는 `useEffect`나 이벤트 핸들러 안에서만 |
| 입력칸에 쓴 값이 새로고침 후 사라짐 | 비제어 입력의 값은 상태가 아님 | 남겨야 하면 URL(GET 폼)이나 서버에 저장 |
| 저장했는데 목록이 그대로 | `action` 대신 `fetch`를 직접 호출해 재검증이 안 일어남 | `<Form>`/`fetcher`를 쓰거나 `useRevalidator().revalidate()` 호출 |
| 입력칸이 제어↔비제어 경고 | `value`가 `undefined`였다가 값이 생김 | `value={x ?? ""}`로 항상 문자열을 준다 |
| `SQLITE_CONSTRAINT: FOREIGN KEY` | 없는 사용자 id로 글 저장 | 서비스에서 먼저 사용자·글 존재를 확인한다 |
| `tags`가 `"[object Object]"`로 저장 | 배열을 JSON 변환 없이 저장 | `JSON.stringify`/`JSON.parse`로 왕복한다 |

## ⑥ 직접 해보기

1. `/posts`에서 검색어를 세 번 입력해 "최근 검색어"가 쌓이는지 보고, 개발자도구 Application → Local Storage에서 `recent-searches` 값을 직접 지워 본 뒤 새로고침한다.
2. `loader`에 `console.log("posts loader", params)`를 넣고, 검색어를 바꿀 때·글을 등록한 뒤 목록으로 돌아올 때 터미널에 몇 번 찍히는지 센다(재검증이 언제 일어나는지 확인).
3. 같은 검색 상태를 `useState`로만 관리하도록 바꿔 본 뒤, 새로고침·뒤로 가기·주소 복사에서 URL 방식과 무엇이 다른지 표로 적는다(원래대로 되돌린다).

## ⑦ ☐ 체크리스트

- [ ] `loader`로 데이터 불러오기 (Next의 서버 컴포넌트 fetch, SvelteKit load와 같은 자리)
- [ ] 데이터가 사는 곳(서버·URL·컴포넌트 상태·브라우저 저장소) 네 가지를 구분해 예를 들 수 있다.
- [ ] 제어 입력과 비제어 입력의 차이를 설명하고, 이 저장소가 어느 쪽을 왜 쓰는지 안다.
- [ ] `action` 뒤에 `loader`가 자동으로 다시 실행되는 것을 로그로 확인했다.
- [ ] `localStorage` 값이 서버 HTML에 없는 이유와 `useEffect`에서 읽는 이유를 설명할 수 있다.

> 원문 항목 안의 괄호(Next·SvelteKit과 같은 자리)는 노션 표기를 그대로 둔 것입니다. 이 과정은 React Router 7만 다루므로 다른 프레임워크와 비교하지 않고, **RR7의 `loader`가 하는 일**만 확인합니다.

## ⑧ 다음 단계 연결

데이터가 어디에 사는지 알았으니 [study4.md](study4.md)에서 그 데이터를 **어느 주소로 요청하고 어떻게 응답받는지**(라우팅·요청 흐름·오류 페이지)를 익힙니다.
