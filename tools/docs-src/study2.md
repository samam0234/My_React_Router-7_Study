# study2 — 핵심 구조

> 기준: [노션 · React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06). 코드: [midpoint/app/](midpoint/app/).

## ① 목표 한 줄

React Router 7의 기본 단위(라우트 모듈 · 레이아웃 · 컴포넌트 · 서비스)가 각각 무엇이고 어떻게 나누며, 서로 어떻게 부르고 데이터를 주고받는지 직접 만들며 익힌다.

## ② 📖 이론

### 왜 나누는가

파일 하나에 화면·서버 규칙·DB를 모두 쓰면 처음엔 빠르지만, 글이 늘수록 "어디를 고쳐야 하는지" 알 수 없게 됩니다. 단위를 나누면 **바뀌는 이유가 같은 것끼리** 모이고, 한 곳을 고쳐도 다른 곳이 덜 흔들립니다.

### 핵심 단위

| 단위 | 하는 일 | 이 저장소의 예 |
| --- | --- | --- |
| **라우트 모듈** | 주소 하나의 화면 + `loader`(읽기) + `action`(쓰기) + `ErrorBoundary` | `routes/posts/detail.tsx` |
| **레이아웃 라우트** | 여러 자식 화면을 공통 틀로 감싼다. 자식 자리에 `<Outlet />`을 둔다 | `routes/posts/layout.tsx`, `routes/auth-layout.tsx` |
| **컴포넌트** | 주소와 상관없는 재사용 UI 조각. props로 데이터를 받는다 | `components/header.tsx`, `pagination.tsx` |
| **서비스** | 화면과 무관한 업무 규칙(가입, 글 쓰기). 서버에서만 실행 | `services/posts.server.ts` |
| **저장소(repo)** | DB와 대화하는 유일한 창구 | `db/sqlite.server.ts` |

### 서로 부르는 길

- **부모 → 자식**: props (`<Header user={user} />`)
- **자식 → 부모**: 함수 props / 이벤트 (`onClick`, `onSubmit`)
- **loader → 컴포넌트**: `loaderData`(자기 라우트의 데이터)
- **먼 조상 → 후손**: `useRouteLoaderData("root")`(특정 조상 라우트의 loader 데이터)
- **미들웨어 → loader·action**: `context.get(userContext)`(요청 한 번 동안만 사는 저장소)
- **화면 사이**: 주소(URL)와 쿼리 문자열, 쿠키 세션의 flash 메시지

### 비유

**건물**을 떠올리세요. `root.tsx`는 골조와 현관(모든 층 공통), 레이아웃은 **층**(복도와 안내판), 라우트는 **방**, 컴포넌트는 **가구**(어느 방에나 옮겨 놓는다), 서비스는 **사무실 직원**(방이 어디든 같은 업무를 한다)입니다. 손님(요청)은 현관 → 층 → 방 순서로 들어갑니다.

## ③ 🛠️ 실기 — 전체 코드와 줄별 설명

### 1. 설정 기반 라우팅과 중첩 레이아웃 (`routes.ts`)

URL과 파일의 대응을 **한 파일**에서 읽을 수 있습니다. 라우트 안에 라우트를 넣으면 중첩입니다.

@@code midpoint/app/routes.ts from=/^  index\("routes\/home.tsx"\)/ to=/^\] satisfies/
`index("routes/home.tsx")` | `index`는 부모 주소 자체("/")에 대응한다.
`// 경로가 없는 레이아웃` | 주석. 레이아웃에는 두 종류가 있다.
`layout("routes/auth-layout.tsx"` | **경로 없는 레이아웃**: URL에는 아무것도 더하지 않고 자식들을 같은 틀로 감싼다. `/login`, `/signup`이 같은 카드 안에 그려진다.
`route("login"` | 자식 라우트. 주소는 `/login`.
`route("signup"` | 자식 라우트. 주소는 `/signup`.
`route("logout"` | 화면 없이 `action`만 있는 라우트(로그아웃 버튼의 POST를 받는다).
`// 경로가 있는 레이아웃` | 주석.
`route("posts", "routes/posts/layout.tsx"` | **경로 있는 부모**: `/posts`로 시작하는 모든 화면이 이 파일의 틀 안에 들어온다.
`index("routes/posts/list.tsx")` | `/posts` 자체(글 목록).
`route("new"` | 부모 경로에 이어 붙어 `/posts/new`.
`route(":postId"` | **동적 세그먼트**: `/posts/12`의 `12`가 `params.postId`로 들어온다.
`route(":postId/edit"` | `/posts/12/edit`.
`route("*"` | **splat**: 위 어디에도 맞지 않는 모든 주소(404 처리, study4).
@@end

> 파일 이름으로 주소를 정하는 **파일 기반 라우팅**도 있습니다(`@react-router/fs-routes`의 `flatRoutes()`). `posts.$postId.tsx`처럼 이름에 점(`.`)과 `$`로 주소를 적습니다. 이 과정은 설정 기반을 쓰고, 두 방식 모두 결과는 같은 라우트 트리입니다(study4에서 비교).

### 2. 레이아웃: `<Outlet />`이 "자식 자리"

@@code midpoint/app/routes/auth-layout.tsx
`import { Outlet }` | 자식 라우트가 그려질 자리를 표시하는 컴포넌트.
`export default function AuthLayout` | 레이아웃도 평범한 컴포넌트다. 주소가 없으니 `loader`도 필요 없다.
`<div className="mx-auto mt-8` | 로그인·가입이 공유하는 카드 틀(가운데 정렬, 테두리, 그림자).
`<Outlet />` | 현재 주소가 `/login`이면 여기에 `login.tsx`가, `/signup`이면 `signup.tsx`가 들어온다.
@@end

@@code midpoint/app/routes/posts/layout.tsx from=/^export default function PostsLayout/ to=/^\}/
`export default function PostsLayout` | `/posts` 아래 모든 화면의 공통 틀.
`<section>` | 틀의 바깥 요소.
`<h1 className="mb-4` | 모든 게시판 화면 위에 같은 제목이 보인다.
`<Outlet />` | 자식(목록·글쓰기·상세·수정)이 이 자리에 들어온다.
@@end

### 3. 컴포넌트: props로 데이터를 받는다

@@code midpoint/app/components/pagination.tsx
`import { Link }` | 쪽 이동을 링크로 만든다.
`type Props` | 컴포넌트가 받을 입력의 모양. TypeScript가 잘못된 사용을 에디터에서 알려 준다.
`page: number` | 현재 쪽.
`totalPages` | 전체 쪽 수.
`hrefFor` | **함수를 props로** 받는다. 컴포넌트는 "주소를 어떻게 만드는지" 몰라도 된다. 검색어 같은 조건은 부모가 알고 있다.
`export function Pagination` | 구조 분해로 props를 바로 꺼낸다.
`if (totalPages <= 1) return null;` | 쪽이 하나뿐이면 아무것도 그리지 않는다. `null`을 반환하면 "그릴 것 없음"이다.
`<nav aria-label` | 스크린 리더가 "페이지 이동 영역"임을 알 수 있게 하는 접근성 속성.
`{page > 1 ?` | 첫 쪽에서는 "이전"이 링크가 아니라 회색 글자.
`<span aria-current` | 현재 위치 표시.
`{page < totalPages ?` | 마지막 쪽에서는 "다음"이 회색 글자.
@@end

@@code midpoint/app/components/header.tsx from=/^const linkClass/ to=/^\}/
`const linkClass` | `NavLink`가 "지금 보고 있는 메뉴"인지(`isActive`)를 알려 주면 그에 맞는 클래스를 돌려주는 함수.
`export function Header` | 사용자 정보를 props로 받는다. 헤더는 로그인 상태를 **스스로 찾지 않는다**(부모가 알려 준다).
`<header className=` | 바깥 요소.
`<nav className=` | 메뉴 영역.
`<Link to="/"` | 로고 링크.
`<NavLink to="/posts" end` | `end`는 `/posts`일 때만 활성으로 본다(`/posts/new`에서는 비활성).
`{user ? <NavLink to="/posts/new"` | 로그인했을 때만 "글쓰기"가 보인다.
`<span className="flex-1" />` | 남은 공간을 밀어내 오른쪽 메뉴를 끝으로 보낸다.
`{user ? (` | 로그인 상태에 따라 오른쪽 영역이 완전히 달라진다.
`<Form method="post" action="/logout">` | 로그아웃은 상태를 바꾸므로 링크(GET)가 아니라 **POST 폼**이다. 링크는 미리 불러오기(prefetch)나 검색 봇이 눌러 버릴 수 있다.
`) : (` | 비로그인일 때.
@@end

### 4. 먼 조상의 데이터: `root`의 `loader` → `Header`

헤더는 모든 화면에 있으니 `root.tsx`에서 한 번만 그립니다. 사용자 정보는 `root`의 `loader`가 만들고, `Layout`에서 `useRouteLoaderData("root")`로 꺼내 `Header`에 props로 넘깁니다.

@@code midpoint/app/root.tsx from=/^export async function loader/ to=/^\}/
`export async function loader` | `root`의 `loader`는 가장 바깥 라우트라 **모든 문서 요청에서 실행된다**(브라우저 안의 링크 이동에서는 필요할 때만 다시 실행된다).
`const user = context.get(userContext)` | 인증 미들웨어(study7)가 요청마다 넣어 둔 사용자. DB를 다시 조회하지 않는다.
`const session` | 세션 쿠키를 읽어 flash 메시지를 꺼내려는 준비.
`const flash` | flash는 "한 번 보여 주고 사라지는" 메시지(예: "글을 등록했습니다").
`return data(` | `data()`는 값과 함께 **헤더·상태 코드**를 줄 수 있다.
`flash ? { headers` | 읽은 flash를 지운 쿠키를 다시 내려보내야 다음 화면에 또 나오지 않는다.
@@end

@@code midpoint/app/root.tsx from=/^export function Layout/ to=/^\}/
`export function Layout` | `root`의 `Layout`은 `<html>` 전체 틀이다. **정상 화면과 오류 화면 둘 다** 이것으로 감싼다.
`const root = useRouteLoaderData` | `"root"`라는 id의 라우트가 가진 loader 데이터를 읽는다. 오류 화면에서는 데이터가 없을 수 있어 `undefined`를 허용한다.
`<html lang="ko">` | 언어 표시(스크린 리더·번역 도구가 쓴다).
`<Meta />` | 각 라우트의 `meta`가 만든 `<title>` 등이 들어간다.
`<Links />` | 각 라우트의 `links`(스타일시트 등)가 들어간다.
`<Header user=` | **props로 자식에게** 사용자 정보를 내려 준다.
`{root?.flash ?` | flash가 있으면 알림 줄을 보여 준다.
`<main className=` | 라우트 화면(`children`)이 들어갈 자리.
`<ScrollRestoration />` | 뒤로 가기 때 스크롤 위치를 복원한다.
`<Scripts />` | 브라우저용 자바스크립트를 넣는다. 이것이 있어야 hydration이 일어난다.
@@end

### 5. 요청 한 번 동안만 사는 저장소: `context`

@@code midpoint/app/context.ts
`import { createContext }` | 미들웨어와 loader·action이 값을 주고받는 **열쇠**를 만드는 함수.
`import type { PublicUser }` | 사용자 타입만 가져온다(실행 코드에는 안 남는다).
`export type AuthSource` | 인증이 쿠키로 됐는지 토큰으로 됐는지 구분하는 값의 종류.
`export const userContext` | 현재 사용자. 기본값 `null`(로그인하지 않음). 이 열쇠로 `set`하고 `get`한다.
`authSourceContext` | 인증 수단. CSRF 방어 등에서 쓴다(study7).
`requestIdContext` | 요청마다 붙는 번호. 로그와 오류 응답을 연결한다(study9).
@@end

## ④ 🔗 연동 포인트

### 단위끼리 데이터를 주고받는 방법

| 방법 | 방향 | 언제 쓰나 | 예 |
| --- | --- | --- | --- |
| props | 부모 → 자식 | 바로 아래 컴포넌트에 값을 줄 때 | `<Header user={…}/>`, `<Pagination page={…}/>` |
| 함수 props·이벤트 | 자식 → 부모 | 자식이 "무슨 일이 있었다"고 알릴 때 | `onSubmit`, `onClick`, `hrefFor` |
| `loaderData` | 서버 → 자기 화면 | 화면이 쓸 데이터를 서버에서 읽을 때 | `home.tsx`의 `latest` |
| `useRouteLoaderData(id)` | 조상 → 후손 | 먼 조상의 데이터가 필요할 때 | `Layout`의 `"root"` |
| `context` | 미들웨어 → loader·action | 요청 안에서 값을 공유할 때 | `userContext` |
| URL(쿼리·경로) | 화면 ↔ 화면 | 새로고침·공유해도 유지돼야 할 때 | `?q=…&page=2` |
| flash(쿠키 세션) | 이번 요청 → 다음 요청 | "한 번만 보여 줄" 메시지 | "글을 등록했습니다" |

**원칙**: 서버에서 알아야 하는 값은 `context`·`loader`로, 브라우저에서만 의미 있는 값은 `useState`로, **새로고침해도 남아야 하는 값은 URL로** 둡니다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 레이아웃은 보이는데 자식 화면이 안 나옴 | 레이아웃에 `<Outlet />`이 없음 | 자식이 들어올 자리에 `<Outlet />`을 둔다 |
| `Cannot read properties of undefined` (`useRouteLoaderData`) | 오류 화면 등 해당 라우트가 로드되지 않은 상황 | `root?.user`처럼 옵셔널 체이닝으로 방어한다 |
| `Server-only module referenced by client` | 컴포넌트가 `.server` 파일을 값으로 import | `.server`는 `loader`·`action` 안에서만 쓰고, 컴포넌트는 `loaderData`로 받는다. 타입만 필요하면 `import type` |
| 컴포넌트가 아무것도 안 그림 | 이름이 소문자로 시작(`header`) | 컴포넌트 이름은 대문자(`Header`) |
| 검색어만 바꿨는데 `root`의 `loader`도 다시 실행됨 | 쿼리 문자열이 바뀌거나 `action`이 끝나면 **화면에 떠 있는 모든 loader를 재검증**하는 것이 기본 동작 | 정상이다. 비싼 loader는 study15의 `shouldRevalidate`·캐시로 줄인다 |
| props를 여러 단계로 내려보내다 코드가 지저분함 | props drilling | 서버 데이터면 `useRouteLoaderData`, 화면 상태면 상태 관리 도구(study12) |

## ⑥ 직접 해보기

1. `components/`에 `Tag`(props: `name`) 컴포넌트를 만들고, `routes/posts/list.tsx`의 `#{tag}` 부분을 이것으로 바꾼다. 같은 컴포넌트를 `routes/posts/detail.tsx`에서도 재사용해 본다.
2. `routes/posts/layout.tsx`에 "목록 / 글쓰기" 링크 두 개(`NavLink`)를 추가해, `/posts` 아래 모든 화면에서 같은 하위 메뉴가 보이게 한다.
3. `routes/posts/new.tsx` 안에서 `useRouteLoaderData<typeof rootLoader>("root")`로 닉네임을 읽어 "○○님, 새 글을 써 보세요"라는 문구를 표시한다(타입은 `import type { loader as rootLoader } from "~/root"`).

## ⑦ ☐ 체크리스트

- [ ] 파일 또는 설정 기반 라우팅, 중첩 레이아웃
- [ ] 라우트 모듈 · 레이아웃 · 컴포넌트 · 서비스가 각각 무엇을 맡는지 한 문장씩 말할 수 있다.
- [ ] 경로 없는 레이아웃(`layout()`)과 경로 있는 부모(`route("posts", …, [children])`)의 차이를 URL로 설명할 수 있다.
- [ ] props, 함수 props, `loaderData`, `useRouteLoaderData`, `context` 중 상황에 맞는 길을 고를 수 있다.
- [ ] `<Outlet />`을 빼면 무슨 일이 생기는지 직접 확인했다.

## ⑧ 다음 단계 연결

단위를 나눴으니 [study3.md](study3.md)에서 그 단위들이 다루는 **데이터(상태·모델)**를 화면에 묶는 방법과, 브라우저 로컬 저장소·파일(DB)에 저장하는 방법을 익힙니다.
