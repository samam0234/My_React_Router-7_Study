# study12 — 프론트·UI 연동

> 기준: [노션 · React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06). 코드: [project/app/stores/ui.ts](project/app/stores/ui.ts), [project/app/components/lab/ui-demos.tsx](project/app/components/lab/ui-demos.tsx), [project/app/routes/lab.tsx](project/app/routes/lab.tsx).

## ① 목표 한 줄

React Router 7과 UI 라이브러리(Tailwind·Radix), 상태 관리(zustand), 폼 라이브러리(react-hook-form + zod)를 **서버 렌더링 환경에서 안전하게** 연동하는 법을 익힌다.

## ② 📖 이론

### React Router 7에서 "프런트 도구"를 고르는 기준

React Router 7은 **서버 데이터와 폼**(`loader`·`action`·`Form`)을 이미 가지고 있습니다. 그래서 다른 도구를 붙이기 전에 질문합니다.

| 필요한 것 | 먼저 RR7으로 | 따로 도구가 필요한 때 |
| --- | --- | --- |
| 서버 데이터 읽기·갱신 | `loader`·`action`·재검증 | 클라이언트에서 계속 갱신(실시간 대시보드)·복잡한 캐시 → TanStack Query 검토 |
| 폼 | `<Form>` + 서버 검증 | **입력하는 동안** 실시간 검증, 동적 필드, 복잡한 폼 → react-hook-form |
| 화면 상태 | `useState`, URL 쿼리 | 여러 컴포넌트가 공유하는 **순수 화면 상태**(테마·토스트·열린 패널) → zustand 등 |
| 모양 | Tailwind | 접근성이 어려운 위젯(대화상자·드롭다운·툴팁) → Radix 같은 **headless** 라이브러리 |

원칙: **서버가 아는 데이터는 `loader`로, 브라우저만 아는 상태는 상태 도구로.** 둘을 섞어 서버 데이터를 zustand에 복사해 두면 "어느 쪽이 최신인가"라는 문제가 생깁니다.

### SSR 환경에서 조심할 세 가지

1. **모듈 전역 객체는 서버에서 "모든 요청이 공유"한다.** zustand 스토어를 모듈 최상단에 만들면 서버 프로세스 하나에 하나뿐이다 → 사용자별 데이터를 넣으면 **다른 사용자에게 보인다.** 화면 상태만 두고 브라우저에서만 바꾼다.
2. **서버에는 `window`·`localStorage`·`matchMedia`가 없다.** 렌더링 중에 읽지 말고 `useEffect`나 이벤트에서 읽는다.
3. **하이드레이션 불일치.** 서버 HTML과 브라우저 첫 렌더가 달라지면 경고가 난다. 테마처럼 "브라우저가 정하는 값"은 페이지가 그려지기 전에 **인라인 스크립트**로 먼저 적용한다(깜빡임 방지).

### 비유

옷 가게에서 **마네킹(서버 렌더링)**은 모두에게 같은 옷을 입고 서 있습니다. 손님이 입어 보고 골라서 바꾸는 것(테마·토스트)은 **탈의실(브라우저)**에서만 일어나야 합니다. 마네킹이 사용자마다 다른 옷을 입기 시작하면(공유 스토어에 사용자 데이터) 큰일이죠. Radix 같은 headless 라이브러리는 **옷걸이와 뼈대**(동작·접근성)만 주고, 색과 모양(Tailwind)은 우리가 입힙니다.

## ③ 🛠️ 실기 — 전체 코드와 줄별 설명

### 1. Tailwind 어두운 테마를 "사용자가 고르게"

@@code project/app/app.css from=/^\/\* 시스템 설정이 아니라/ to=/^\}$/
`/* 시스템 설정이 아니라` | 주석: Tailwind 4의 기본 `dark:`는 OS 설정(`prefers-color-scheme`)만 따른다.
`@custom-variant dark` | `dark:` 접두사가 **`html`에 `.dark` 클래스가 있을 때** 적용되도록 바꾼다. 사용자가 버튼으로 고를 수 있게 된다.
`html,` | 전체 배경·글자색.
`@apply bg-white text-gray-900` | 밝은 기본값. `dark:`가 붙은 것은 어두울 때 덮어쓴다.
@@end

@@code project/app/app.css from=/^html\.dark/ to=/^\}$/
`html.dark {` | `.dark` 클래스가 붙었을 때
`color-scheme: dark` | 브라우저 기본 위젯(스크롤바, 입력칸)도 어두운 모양이 되게 한다.
@@end

### 2. 상태 관리: zustand 스토어

@@code project/app/stores/ui.ts from=/^\/\*\* 문서에 theme 클래스를/ to=/^\}/
`/** 문서에 theme` | 주석: **브라우저에서만** 호출한다.
`export function applyTheme` | 선택한 테마를 문서에 적용하고 저장한다.
`const dark = theme === "dark"` | `system`이면 OS 설정(`matchMedia`)을 따른다. 서버에는 `matchMedia`가 없으므로 이 함수는 서버에서 부르면 안 된다.
`document.documentElement.classList.toggle("dark", dark)` | `<html class="dark">`를 켜고 끈다. 위의 CSS가 이것을 보고 색을 바꾼다.
`localStorage.setItem("theme", theme)` | 다음 방문에도 기억한다.
@@end

@@code project/app/stores/ui.ts from=/^let nextToastId/ to=/^\}\)\);/
`let nextToastId = 1` | 토스트 번호표.
`/**` | 주석: 서버 공유 스토어 경고(가장 중요한 한 단락).
`export const useUiStore = create<UiState>((set) => ({` | 스토어를 만든다. `set`으로 상태를 바꾼다. **훅**(`useUiStore`)이라 컴포넌트에서 `useUiStore((s) => s.theme)`처럼 필요한 조각만 구독한다(그 조각이 바뀔 때만 다시 그려진다).
`theme: "system"` | 서버에서도 같은 초기값이라 **하이드레이션이 어긋나지 않는다.**
`toasts: []` | 화면에 떠 있는 알림들.
`unread: 0` | 헤더 종 모양의 안 읽은 수.
`setTheme: (theme) => {` | 적용 + 상태 갱신.
`pushToast:` | 새 토스트를 맨 뒤에 추가하고 `slice(-4)`로 **최대 4개만** 남긴다.
`dismissToast:` | 번호로 지운다.
`bump:` | 안 읽은 수 +1(study17 알림이 부른다).
`clearUnread:` | 0으로.
@@end

@@code project/app/stores/ui.ts from=/^\/\*\* 페이지가 그려지기 전에/ to=/^export const THEME_INIT_SCRIPT/
`/** 페이지가 그려지기 전에` | 주석: 이 스크립트의 존재 이유.
`export const THEME_INIT_SCRIPT` | 아주 작은 즉시 실행 스크립트 문자열. `localStorage`의 테마를 읽어 `<html>`에 `dark`를 **페이지가 그려지기 전에** 붙인다. 없으면 흰 화면이 번쩍인 뒤 어두워진다(FOUC).
@@end

@@code project/app/root.tsx from=/^    \/\/ suppressHydrationWarning/ to=/<Links \/>/
`// suppressHydrationWarning` | 주석.
`<html lang="ko" suppressHydrationWarning>` | 위 스크립트가 브라우저에서 `class="dark"`를 붙이므로 서버 HTML과 달라도 **정상**이다. 이 한 요소에만 경고를 끈다(자식은 그대로 검사한다).
`<head>` | 머리.
`<meta charSet="utf-8" />` | 인코딩.
`<meta name="viewport"` | 모바일 화면 크기.
`<script dangerouslySetInnerHTML=` | 우리가 쓴 **고정된 문자열**을 그대로 넣는다. 사용자 입력이 아니므로 XSS 위험이 없다(사용자 값을 이렇게 넣으면 안 된다).
`<Meta />` | 라우트의 `meta`.
`<Links />` | 라우트의 `links`.
@@end

### 3. UI 라이브러리: Radix 대화상자

@@code project/app/components/lab/ui-demos.tsx from=/^export function ConfirmDemo/ to=/^\}/
`export function ConfirmDemo` | "삭제할까요?" 확인창.
`const [open, setOpen]` | 열림 상태를 우리가 들고 있다(제어 컴포넌트).
`const [result, setResult]` | 결과 메시지.
`<Dialog.Root` | Radix의 루트. `open`/`onOpenChange`로 상태를 맡긴다.
`<Dialog.Trigger` | 누르면 여는 버튼. 접근성 속성(`aria-haspopup`, `aria-expanded`)을 **자동으로** 붙인다.
`<Dialog.Portal>` | 대화상자를 `<body>` 끝으로 옮겨 그린다. 부모의 `overflow`·`z-index`에 잘리지 않는다.
`<Dialog.Overlay` | 뒷배경 어둡게. 클릭하면 닫힌다.
`<Dialog.Content` | 본문. **포커스를 안에 가두고**, `Esc`로 닫고, 닫으면 눌렀던 버튼으로 포커스를 돌려준다 — 직접 만들면 가장 놓치기 쉬운 것들이다. 모양은 Tailwind 클래스로 우리가 입힌다.
`<Dialog.Title` | 제목. 스크린 리더가 대화상자 이름으로 읽는다.
`<Dialog.Description` | 설명.
`<Dialog.Close` | "취소": 닫는 버튼.
`onClick={() => { setResult(` | "삭제" 동작을 실행하고 닫는다. 실제 삭제라면 여기서 `fetcher.submit`으로 `action`을 부른다.
`{result ?` | 결과 안내(`role="status"`로 스크린 리더에도 전달).
@@end

### 4. 폼 라이브러리: react-hook-form + zod

서버에서 쓰는 **같은 zod 스키마**(`contactSchema`)를 브라우저에서도 씁니다(`lib/schemas.ts`가 서버·브라우저 공용이라서 가능합니다). 브라우저에서 먼저 막고, 통과한 값만 서버로 보냅니다.

@@code project/app/components/lab/ui-demos.tsx from=/^export function ContactForm/ to=/^  const \[message/
`export function ContactForm` | 문의 폼.
`const { register, handleSubmit,` | RHF의 도구: `register`(입력칸 연결), `handleSubmit`(검증 후 제출), `setError`(서버 오류를 필드에 표시), `reset`(비우기), `formState`(오류·제출 중).
`resolver: zodResolver(contactSchema)` | **검증 규칙을 zod 스키마에서 가져온다.** 규칙을 한 번만 쓴다. 서버도 같은 스키마로 다시 검증한다(브라우저 검증은 편의일 뿐).
`const [message, setMessage]` | 폼 전체 메시지(성공·제한 안내).
@@end

@@code project/app/components/lab/ui-demos.tsx from=/^  const onSubmit = handleSubmit/ to=/^  \}\);/
`const onSubmit = handleSubmit(` | 검증을 **통과했을 때만** 이 함수가 실행된다. `values`는 스키마가 정제한 값이다.
`setMessage("")` | 이전 메시지를 지운다.
`const response = await fetch("/api/contact"` | 서버 API로 JSON 전송. 이 폼은 화면 라우트의 `action`이 아니라 **JSON API**를 직접 부른다.
`// 응답 코드에 따라` | 주석: study5의 응답 코드 갈래.
`if (response.status === 202) {` | 성공(접수): 입력을 비우고 안내.
`} else if (response.status === 400 || response.status === 422) {` | 서버가 검증에 실패시킴: 400(이 스펙)과 422(다른 서버의 관례)를 **같은 갈래**로.
`const body = (await response.json())` | 서버의 오류 본문.
`for (const [field, messages] of Object.entries(` | 서버가 준 필드별 메시지를
`setError(field as keyof ContactValues` | **해당 입력칸 아래에** 붙인다. 서버 규칙이 브라우저보다 엄격할 때(예: 이메일 중복)도 사용자는 같은 자리에서 오류를 본다.
`} else if (response.status === 429) {` | 호출 제한: `Retry-After` 헤더 값을 사람에게 알려 준다.
`} else {` | 그 밖(5xx 등): 일반 안내. 서버 내부 정보를 그대로 보여 주지 않는다.
@@end

### 5. 이 연동을 테스트로 고정

@@code project/tests/contact-form.test.tsx from=/  it\("400\/422면/ to=/^  \}\);/
`it("400/422면` | 시험: 서버가 필드 오류를 주면 그 자리에 표시한다.
`for (const status of [400, 422])` | 두 코드를 **같은 시험으로** 확인한다.
`vi.stubGlobal("fetch", vi.fn(async () =>` | **`fetch`를 가짜로 교체**: 진짜 서버 없이 원하는 응답(`{ error: { fields: { email: [...] } } }`, 상태 400 또는 422)을 만든다(study9).
`const view = render(<ContactForm />)` | 그린다.
`await fillValid()` | 브라우저 검증은 통과하는 값을 채운다.
`await userEvent.click(` | 제출.
`expect(await screen.findByText(` | 서버가 준 메시지가 화면에 나타나는지 기다려서 확인한다.
`view.unmount()` | 반복 사이에 화면을 정리한다.
@@end

### 6. 화면에 붙이기

@@code project/app/routes/lab.tsx from=/^export default function Lab/ to=/^\}/
`export default function Lab` | `/lab`: UI 연동을 한곳에서 확인하는 화면.
`const { fast, slow, loggedIn, paid } = loaderData` | `loader`가 준 값. 로그인 여부(`loggedIn`)는 **서버가 판단한 값**이다. 브라우저의 스토어에 복사하지 않는다.
`const navigating = useNavigation().state !== "idle"` | 이동 중 표시(`aria-busy`).
`const section = "rounded-lg border p-4"` | 반복되는 클래스를 변수로(Tailwind 중복 줄이기).
`<section className={section}>` | 첫 칸: 스트리밍 SSR(study15에서 자세히). 이후 칸들도 같은 `section` 클래스를 재사용한다.
`상태 관리 (zustand)` | `<StateDemo />`: 테마 버튼과 토스트 — 스토어를 거쳐 다른 컴포넌트에 반영된다.
`UI 라이브러리` | `<ConfirmDemo />`: Radix 대화상자.
`폼 라이브러리` | `<ContactForm />`: react-hook-form + zod.
`파일 업로드` | study13에서 다루는 업로드 칸.
`결제 (Stripe` | study13의 결제 칸. `loggedIn`이 `false`면 버튼이 막힌다.
`실시간 (WebSocket` | study17의 채팅 칸.
`API 문서` | study14의 API 문서와 study17의 CSV 내려받기 링크.
@@end

## ④ 🔗 연동 포인트

### 어떤 도구가 어느 층을 맡나

```text
서버(loader·action)  ──  데이터·검증·권한      ← 진짜 원본
        │ loaderData
        ▼
화면(React)          ──  표시(Tailwind) + 동작·접근성(Radix)
        │
        ├─ 입력 편의: react-hook-form + zod(브라우저 검증) ──▶ 서버가 다시 검증
        └─ 화면 상태: zustand(테마·토스트·알림 수)           ← 서버 데이터는 넣지 않는다
```

### 다른 라이브러리를 붙일 때 확인표

| 질문 | 확인 | 이유 |
| --- | --- | --- |
| 서버에서 렌더링해도 되는가? | 문서의 "SSR 지원" 항목, 렌더링 중 `window`·`document` 사용 여부 | 서버에는 브라우저 객체가 없다 |
| 전역 상태를 쓰는가? | 모듈 최상단 싱글턴·`Context`에 사용자 데이터를 넣지 않는지 | 서버에서 요청 간 공유됨 |
| 스타일이 클라이언트에서만 주입되는가? | CSS-in-JS는 SSR 설정이 필요하다 | 서버 HTML에 스타일이 없으면 깜빡인다 |
| 번들이 큰가? | `npm run build`의 크기 로그 | 첫 화면이 느려진다 |
| 접근성은? | 키보드·스크린 리더 | headless 라이브러리를 고르는 이유 |

### 이미 있는 것과 겹치지 않기

- **TanStack Query**: RR7의 `loader`+재검증이 같은 문제(서버 데이터 캐시·갱신)를 풀므로, 대부분의 화면에서는 필요 없다. 브라우저에서 계속 폴링·무한 스크롤을 하는 화면에서만 검토한다.
- **react-hook-form**: 간단한 폼은 `<Form>`+서버 검증으로 충분하다(study5). 실시간 검증·동적 필드가 필요할 때만.
- **전역 상태 도구**: 서버 데이터를 옮겨 담으려고 쓰지 않는다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 다른 사용자의 화면에 내 이름이 잠깐 보임 | 모듈 전역 스토어에 사용자 정보를 넣음(서버에서 공유됨) | 사용자 정보는 `loader`로 받아 props로. 스토어에는 화면 상태만 |
| `ReferenceError: window is not defined`(빌드/서버 렌더링) | 렌더링 중 `window`·`localStorage` 사용 | `useEffect`·이벤트 핸들러 안으로, 또는 `typeof window !== "undefined"` 가드 |
| `Hydration failed` / `Text content did not match` (테마) | 렌더링 중에 저장된 테마를 읽어 클래스가 달라짐 | 초기값은 고정(`"system"`), 적용은 인라인 스크립트와 `useEffect` |
| 새로고침마다 흰 화면이 번쩍임(FOUC) | 테마를 하이드레이션 후에 적용 | `THEME_INIT_SCRIPT`를 `<head>`에 둔다 |
| `dark:` 스타일이 안 먹음 | Tailwind 4에서 클래스 기반 `dark`를 선언하지 않음 | `@custom-variant dark (&:where(.dark, .dark *))` |
| Radix 대화상자가 서버 렌더링에서 경고 | 일부 컴포넌트가 브라우저 전용 | 열려 있을 때만 렌더링하거나 `Portal`이 브라우저에서만 그려진다는 점을 확인 |
| RHF가 `register`한 입력칸 값이 안 보임 | 제어 컴포넌트에 `register`를 그대로 씀 | 일반 `<input>`에는 `{...register("x")}`, 제어 컴포넌트는 `Controller` |
| 브라우저 검증을 통과했는데 서버가 400 | 서버 규칙이 더 엄격(중복 이메일 등) | `setError`로 서버 메시지를 필드에 표시(이 코드의 400/422 갈래) |
| `useUiStore`를 쓴 컴포넌트가 계속 다시 그려짐 | 스토어 전체를 구독(`useUiStore()`) | 필요한 조각만 선택자로 구독 `useUiStore((s) => s.theme)` |
| `act(...)` 경고(테스트) | 비동기 상태 변경을 기다리지 않음 | `await screen.findBy…`/`waitFor` |

## ⑥ 직접 해보기

1. `/lab`에서 테마 버튼 세 개를 눌러 보고, 새로고침해도 유지되는지, 개발자도구 Application → Local Storage의 `theme`이 어떻게 바뀌는지 본다. `THEME_INIT_SCRIPT`를 `root.tsx`에서 잠시 지워 새로고침했을 때의 번쩍임을 확인한다(되돌린다).
2. 문의 폼에서 이메일을 `a@b`로 입력해 **브라우저가** 막는 문구를 보고, 네트워크 탭에서 요청이 가지 않은 것을 확인한다. 그다음 `curl.exe`로 같은 값을 `/api/contact`에 직접 보내 **서버가** 막는 문구(400, `fields.email`)를 본다.
3. Radix `Dialog` 대신 직접 만든 `<div>` 모달을 상상하며, **키보드 `Tab`으로 모달 밖으로 포커스가 새는지**, `Esc`로 닫히는지를 Radix 쪽에서 확인한다. 직접 구현하려면 무엇을 더 해야 하는지 세 가지를 적는다.

## ⑦ ☐ 체크리스트

- [ ] 서버 데이터는 `loader`로, 브라우저 전용 화면 상태는 zustand로 두는 기준을 설명할 수 있다.
- [ ] 모듈 전역 스토어가 서버에서 요청 간에 공유되는 위험과 지키는 규칙을 안다.
- [ ] Tailwind의 `@custom-variant dark`와 `THEME_INIT_SCRIPT`로 사용자가 고르는 테마와 FOUC 방지를 구현했다.
- [ ] Radix(headless)가 동작·접근성을, Tailwind가 모양을 맡는 분업을 설명할 수 있다.
- [ ] react-hook-form + zod 폼이 브라우저에서 먼저 검증하고 서버 오류(400/422/429)를 화면에 반영하는 흐름을 확인했다.
- [ ] 새 라이브러리를 붙이기 전의 SSR·하이드레이션·번들 크기 확인표를 사용할 수 있다.

## ⑧ 다음 단계 연결

화면 도구를 갖췄으니 [study13.md](study13.md)에서 **외부 서비스**(메일·파일 업로드·결제·소셜 로그인)를 연결합니다. 이때도 같은 원칙(서버가 비밀을 갖고, 브라우저는 결과만 받는다)을 따릅니다.
