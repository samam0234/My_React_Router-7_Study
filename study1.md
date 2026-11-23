# study1 — Hello World와 기본 문법

> 기준: [노션 · React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06). 코드: [midpoint/app/routes/home.tsx](midpoint/app/routes/home.tsx).

## ① 목표 한 줄

첫 화면을 띄우고, JSX 문법으로 데이터를 화면에 표현하며, 개발 서버의 자동 새로고침과 브라우저 개발자도구로 결과를 확인한다.

## ② 📖 이론

### 왜 쓰는가

화면은 결국 "데이터를 넣으면 HTML이 나오는 함수"입니다. React는 이 함수를 **컴포넌트**로 만들고, HTML과 비슷하게 생긴 **JSX**로 씁니다. React Router 7은 여기에 "이 주소로 오면 이 컴포넌트를 보여 준다"와 "그 전에 서버에서 데이터를 읽어 온다(`loader`)"를 붙입니다.

### 핵심 개념

- **컴포넌트**: 첫 글자가 **대문자**인 함수. JSX를 `return`한다. `Home`은 컴포넌트, `home`은 일반 함수로 취급된다.
- **JSX 규칙**: ① 최상위 요소는 하나(여러 개면 `<>…</>`로 감싼다) ② 모든 태그를 닫는다(`<input />`) ③ `class` 대신 `className` ④ 자바스크립트 값은 `{ }`로 끼워 넣는다.
- **조건·반복**: `{조건 ? <A/> : <B/>}`, `{목록.map((x) => <li key={x.id}>…</li>)}`. 반복에는 항목을 구분하는 **`key`**가 필요하다.
- **라우트 모듈의 export**: `default`(화면), `loader`(서버에서 먼저 실행), `meta`(제목·설명). 파일마다 이름이 정해져 있어 프레임워크가 알아서 찾아 쓴다.
- **`Route.ComponentProps`**: `react-router typegen`이 만든 타입. `loaderData`가 `loader`의 반환 타입과 자동으로 맞춰진다.

### 비유

컴포넌트는 **붕어빵 틀**, 데이터는 **반죽**입니다. 틀(`Home`)은 하나인데 반죽(`loaderData`)이 바뀌면 다른 붕어빵(화면)이 나옵니다. `loader`는 "틀에 붓기 전에 주방(서버)에서 반죽을 준비해 오는 사람"입니다.

## ③ 🛠️ 실기 — 전체 코드와 줄별 설명

### 1. 가장 작은 Hello World

두 파일이면 됩니다(`midpoint`는 이미 더 큰 모양이라, 새 템플릿에서 해 보세요).

```ts
// app/routes.ts — 주소 "/" 는 routes/home.tsx 로 보낸다
import { index, type RouteConfig } from "@react-router/dev/routes";
export default [index("routes/home.tsx")] satisfies RouteConfig;
```

```tsx
// app/routes/home.tsx — 컴포넌트를 default로 export 하면 그것이 화면이다
export default function Home() {
  return <h1>Hello, React Router 7!</h1>;
}
```

`npm run dev` 후 http://localhost:5173 을 열면 제목이 보입니다. 이제 이것을 `loader`와 JSX 문법으로 키운 실제 홈 화면을 읽어 봅니다.

### 2. 실제 홈 화면 `home.tsx`

**`midpoint/app/routes/home.tsx`** — 전체 · [파일 열기](midpoint/app/routes/home.tsx#L1-L41)

```tsx
import { Link } from "react-router";
import { listPosts } from "~/services/posts.server";
import type { Route } from "./+types/home";

export function meta() {
  return [{ title: "RR7 게시판" }, { name: "description", content: "React Router 7 프레임워크 모드로 만든 게시판" }];
}

// loader는 서버에서 실행된다. 반환값이 곧 컴포넌트의 loaderData다.
export async function loader() {
  const { data } = await listPosts({ q: "", page: 1, limit: 5, sort: "-createdAt" });
  return { latest: data };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <section>
      <h1 className="text-3xl font-bold">React Router 7 게시판</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">
        loader로 읽고 action으로 쓰는 풀스택 게시판입니다.
      </p>
      <h2 className="mt-8 text-xl font-semibold">최근 글</h2>
      {loaderData.latest.length === 0 ? (
        <p className="mt-2 text-gray-500">아직 글이 없습니다. 첫 글을 써 보세요.</p>
      ) : (
        <ul className="mt-2 divide-y">
          {loaderData.latest.map((post) => (
            <li key={post.id} className="py-2">
              <Link to={`/posts/${post.id}`} className="text-blue-600 hover:underline">
                {post.title}
              </Link>
              <span className="ml-2 text-sm text-gray-500">
                {post.author.nickname} · 댓글 {post.commentCount}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>import { Link } from "react-router";</code> | `Link`는 `<a>`와 비슷하지만 **페이지 전체를 다시 받지 않고** 필요한 데이터만 가져와 화면을 바꾼다(클라이언트 이동). |
| 2 | <code>import { listPosts } from "~/services/posts.se…</code> | 글 목록을 가져오는 서비스 함수. `.server` 폴더 규칙은 아니지만 파일 이름이 `posts.server`라 서버에서만 쓰인다. |
| 3 | <code>import type { Route } from "./+types/home";</code> | typegen이 만든 타입. `import type`이라 실행 코드에는 남지 않는다. |
| 5–9 | <code>export function meta() {</code> | 브라우저 탭 제목(`<title>`)과 검색용 설명을 정한다. 배열의 객체가 `<meta>` 태그가 된다. |
| 10 | <code>export async function loader() {</code> | 이 화면이 그려지기 **전에 서버에서** 실행된다. 브라우저로 이동할 때도 서버에 요청해 실행한다. |
| 11 | <code>const { data } = await listPosts({ q: "", page…</code> | 최신 글 5개를 읽는다. `limit: 5`와 `sort: "-createdAt"`(최신순)는 API 스펙 v1의 쿼리와 같은 이름이다. |
| 12–13 | <code>return { latest: data };</code> | 반환한 객체가 그대로 컴포넌트의 `loaderData`가 된다. JSON으로 직렬화되어 전달된다. |
| 15–16 | <code>export default function Home({ loaderData }: R…</code> | 컴포넌트. `loaderData`에는 위 `loader`의 반환 타입이 자동으로 붙는다. |
| 17 | <code>&lt;section&gt;</code> | JSX의 최상위 요소 하나. 안쪽에 나머지를 모두 넣는다. |
| 18 | <code>&lt;h1 className="text-3xl font-bold"&gt;React Route…</code> | `class`가 아니라 `className`. 뒤의 문자열은 Tailwind 클래스다. |
| 19–21 | <code>&lt;p className="mt-2 text-gray-600 dark:text-gra…</code> | 정적인 문장. 중괄호가 없으면 그냥 글자다. |
| 22 | <code>&lt;h2 className="mt-8 text-xl font-semibold"&gt;최근 …</code> | 소제목. |
| 23 | <code>{loaderData.latest.length === 0 ? (</code> | `{ }` 안은 자바스크립트다. 삼항 연산자로 "글이 없을 때"와 "있을 때"를 나눈다. |
| 24–25 | <code>&lt;p className="mt-2 text-gray-500"&gt;아직 글이 없습니다. …</code> | 빈 상태(empty state) 안내. 데이터가 없을 때 화면이 비어 보이지 않게 한다. |
| 26 | <code>&lt;ul className="mt-2 divide-y"&gt;</code> | 글이 있을 때의 목록. |
| 27 | <code>{loaderData.latest.map((post) =&gt; (</code> | 배열을 JSX 배열로 바꾼다. 글 하나마다 `<li>` 하나를 만든다. |
| 28 | <code>&lt;li key={post.id} className="py-2"&gt;</code> | **`key`**: 항목을 구분하는 고유값. 없으면 React가 경고하고 갱신이 비효율적이다. 배열 순서(index)가 아니라 데이터의 고유 id를 쓴다. |
| 29 | <code>&lt;Link to={`/posts/${post.id}`} className="text…</code> | 템플릿 문자열 `` `/posts/${post.id}` ``로 글마다 다른 주소를 만든다. |
| 30–31 | <code>{post.title}</code> | 글 제목을 글자로 끼워 넣는다. React가 특수문자를 자동으로 이스케이프한다. |
| 32–41 | <code>&lt;span className="ml-2 text-sm text-gray-500"&gt;</code> | 보조 정보(작성자, 댓글 수). `{ }`를 글자 사이에 여러 번 쓸 수 있다. |

### 3. 가운데 점(`·`)과 공백 같은 "글자" 다루기

JSX에서 줄바꿈과 들여쓰기는 화면의 공백이 되지 않습니다. 글자를 붙이고 싶으면 `{post.author.nickname} · 댓글 {post.commentCount}`처럼 **한 줄에** 쓰거나 `{" "}`를 넣습니다.

### 4. 템플릿 표현 한눈에 보기

| 하고 싶은 일 | JSX 표현 | 이 저장소의 예 |
| --- | --- | --- |
| 값 출력 | `{post.title}` | `home.tsx` 제목 |
| 속성에 값 | ``<Link to={`/posts/${id}`}>`` | `home.tsx` 링크 |
| 조건 | `{ok ? <A/> : <B/>}` / `{ok ? <A/> : null}` | 빈 상태 / `header.tsx`의 글쓰기 링크 |
| 반복 | `{items.map((x) => <li key={x.id}>…</li>)}` | `home.tsx` 목록 |
| 여러 줄 묶기 | `<>…</>` (Fragment) | `header.tsx` 로그인 후 영역 |
| 인라인 스타일 클래스 | `className={a ? "x" : "y"}` | `header.tsx` NavLink |

## ④ 🔗 연동 포인트

### 개발 서버 자동 새로고침(HMR)

1. `npm run dev`를 켜 둔 채 `home.tsx`의 `<h1>` 글자를 바꾸고 저장합니다.
2. 브라우저를 **새로고침하지 않아도** 글자가 바뀝니다. Vite가 바뀐 모듈만 교체하기 때문입니다(HMR).
3. 터미널에 `hmr update /app/routes/home.tsx` 같은 줄이 찍힙니다.

### 브라우저 개발자도구로 확인하기 (F12)

| 도구 | 무엇을 보나 | 이 단계의 확인 |
| --- | --- | --- |
| **페이지 소스 보기**(`Ctrl+U`) | 서버가 보낸 **원본 HTML** | 글 제목이 소스에 이미 들어 있으면 SSR이 동작하는 것이다 |
| **Elements** | 자바스크립트가 만든 **현재 DOM** | 소스 보기와 비교해 hydration 이후 달라진 점을 본다 |
| **Network** | 요청·응답 | 첫 이동은 `document`, 이후 링크 이동은 `….data` 요청이 보인다 |
| **Console** | 오류·경고 | `Hydration failed`, `key` 경고가 없어야 한다 |

터미널에서도 같은 것을 확인할 수 있습니다.

```powershell
curl.exe -s http://localhost:5173/ | Select-String "React Router 7"
# SSR이면 자바스크립트 없이도 제목이 들어 있는 HTML이 그대로 보인다
```

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `Adjacent JSX elements must be wrapped in an enclosing tag` | 최상위 요소가 둘 이상 | `<section>` 또는 `<>…</>`로 감싼다 |
| 스타일이 안 먹고 콘솔에 경고 | `class`를 썼다 | `className`으로 바꾼다 |
| `Each child in a list should have a unique "key" prop` | `map`의 항목에 `key`가 없음 | 데이터의 고유 id를 `key`로 준다 |
| `Objects are not valid as a React child` | `{post}`처럼 **객체**를 그대로 출력 | `{post.title}`처럼 글자·숫자로 꺼내 쓴다 |
| `Cannot read properties of undefined (reading 'latest')` | `loader`가 반환하지 않은 키를 읽음 | `loader`의 `return`과 컴포넌트의 `loaderData.…`를 맞춘다 |
| `Hydration failed because the server rendered HTML didn't match` | 서버와 브라우저가 다른 글자를 만듦(시간대·`Date.now()`·`Math.random()`) | 날짜는 시간대를 고정한 포매터를 쓴다([midpoint/app/lib/format.ts](midpoint/app/lib/format.ts)) |
| 저장해도 화면이 안 바뀜 | 파일을 다른 폴더에서 편집했거나 파일 이름 대소문자 불일치 | 열린 폴더가 실행 중인 폴더인지, `routes.ts`의 경로를 확인 |

## ⑥ 직접 해보기

1. `home.tsx`의 `<h1>` 문구를 바꾸고 저장해 새로고침 없이 반영되는지, Network 탭에 전체 문서 요청이 새로 생기지 않는지 확인한다.
2. `loader`의 `limit: 5`를 `2`로 바꿔 보고, 글이 3개 이상일 때 목록이 2개로 줄어드는지 본다. 그다음 `limit: 0`을 넣어 서비스가 어떤 값으로 보정하는지 `parseListQuery`(study6)와 비교해 설명한다.
3. 같은 주소를 `Ctrl+U`(페이지 소스)와 Elements 탭에서 각각 열어 **제목이 어느 쪽에 먼저 있는지** 말로 정리하고, SSR이 왜 검색 엔진에 유리한지 한 문장으로 적는다.

## ⑦ ☐ 체크리스트

- [ ] 두 파일(`routes.ts`, `home.tsx`)만으로 Hello World를 띄웠다.
- [ ] JSX의 네 가지 규칙(최상위 하나, 닫는 태그, `className`, `{ }`)을 예제로 설명할 수 있다.
- [ ] `loader`의 반환값이 `loaderData`로 컴포넌트에 전달되는 흐름을 그림 없이 말할 수 있다.
- [ ] HMR로 새로고침 없이 반영됨을 직접 보았고, 페이지 소스 보기로 SSR HTML을 확인했다.

## ⑧ 다음 단계 연결

화면 하나를 그렸으니 [study2.md](study2.md)에서 화면을 **여러 조각(컴포넌트·레이아웃·서비스)으로 나누고 서로 부르는 법**을 익힙니다.
