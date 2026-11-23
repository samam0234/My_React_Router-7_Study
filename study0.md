# study0 — 환경 설정

> 기준: [노션 · React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06) · 공통 API 스펙은 [HTTP · REST · API 설계](https://app.notion.com/p/3d6d7dec5e2e8139adbfd36dd506c65e). 이 과정은 **React Router 7 하나**만 다룹니다. 코드는 [midpoint/](midpoint/)(기초)와 [project/](project/)(심화)에 있습니다.

## ① 목표 한 줄

Node 24와 React Router **7.18** 환경을 만들어 프로젝트를 생성하고, 개발 서버를 띄우고, 비밀값(`.env`)을 Git에서 분리한다.

## ② 📖 이론

### 왜 쓰는가

React 자체는 "화면을 그리는 라이브러리"라서 주소(URL) 처리, 서버에서 데이터 읽기, 폼 저장, 로그인 같은 **풀스택에 필요한 것**이 없습니다. React Router 7의 **framework mode**는 여기에 라우팅 · 서버 렌더링(SSR) · 데이터 읽기(`loader`) · 데이터 쓰기(`action`) · 빌드를 붙여 줍니다. 예전에 Remix였던 것이 React Router 7로 합쳐졌습니다(노션 callout, 2차 자료 기준).

- **library mode**: 브라우저에서만 라우팅한다(SPA). 서버는 따로 만든다.
- **framework mode**: Vite 위에서 라우트 파일 하나가 `loader`(읽기) · `action`(쓰기) · 화면을 함께 가진다. 이 과정은 framework mode입니다.

### 핵심 개념

| 용어 | 뜻 |
| --- | --- |
| route module | 주소 하나에 대응하는 파일. `loader`, `action`, 기본 컴포넌트, `ErrorBoundary`를 export한다 |
| loader / action | 서버에서 실행되는 "읽기"(GET) / "쓰기"(POST·PATCH·DELETE) 함수 |
| SSR · hydration | 서버가 HTML을 먼저 만들어 보내고(SSR), 브라우저가 그 HTML에 JavaScript를 붙여 살아 움직이게 한다(hydration) |
| Vite | 개발 서버와 번들러. 파일을 고치면 화면이 바로 바뀐다(HMR) |
| typegen | 라우트마다 `loader`·`params` 타입을 자동 생성하는 기능(`+types/…`) |
| `.server` | 파일 이름이 `.server.ts`로 끝나면 브라우저 번들에서 제외된다. 비밀값·DB 코드를 여기에 둔다 |
| lockfile | `package-lock.json`. 모든 사람이 **똑같은 버전**을 설치하게 하는 영수증 |

### 비유

설치는 **주방을 차리는 일**입니다. Node.js는 가스레인지(코드를 실제로 돌리는 엔진), npm은 식재료 도매상(패키지를 가져다 줌), `package-lock.json`은 "어느 도매상에서 몇 년 몇 월산을 샀는지" 적힌 영수증입니다. React Router는 **메뉴판과 주문서**입니다: "이 주소로 오면(주문) 이 요리 파일(route module)이 나간다".

> ⚠️ **버전 주의**: 지금 `npm`의 `latest` 태그는 React Router **8.x**입니다. 노션 주제인 7을 쓰려면 반드시 **7.18.6으로 고정**해야 합니다. 7.x 계열은 `version-7` 태그로 따로 관리됩니다.

## ③ 🛠️ 실기 — 전체 코드와 줄별 설명

### 1. 설치와 버전 확인

1. [nodejs.org](https://nodejs.org)에서 **Node.js 24 LTS**를 설치하고 VS Code로 이 폴더를 엽니다.
2. 터미널을 새로 열어 아래를 실행합니다(PowerShell과 bash 모두 같습니다).

```powershell
node --version        # v24.x  (이 저장소 검증 환경: v24.14.0)
npm --version         # 11.x   (검증 환경: 11.9.0)
git --version         # 2.4x
npm view react-router dist-tags --json   # latest = 8.x, version-7 = 7.18.x 인 것을 눈으로 확인
```

### 2. 프로젝트 생성 (framework mode)

```powershell
npx create-react-router@7.18.6 my-board --no-git-init --no-install --yes
cd my-board
npm install
npx react-router --version     # 7.18.6
```

`@7.18.6`이 핵심입니다(`@latest`면 8.x가 설치됩니다). `--no-git-init`은 Git 저장소를 만들지 않고, `--no-install`은 설치를 따로 하게 합니다. 이 저장소의 [midpoint/](midpoint/)는 이 템플릿에서 출발해 게시판으로 키운 것입니다.

### 3. 폴더 구조

```text
midpoint/
├─ app/                      ← 우리가 쓰는 코드
│  ├─ root.tsx               가장 바깥 화면(<html>), 공통 헤더, 전역 ErrorBoundary
│  ├─ routes.ts              주소 → 파일 대응표(설정 기반 라우팅)
│  ├─ routes/                라우트 모듈(화면·API)
│  ├─ components/            재사용 컴포넌트
│  ├─ services/              업무 규칙(가입, 글 쓰기 …) — 서버 전용
│  ├─ db/                    DB 연결과 저장소 — 서버 전용
│  ├─ lib/                   작은 공통 함수(검증, 오류, 토큰 …)
│  └─ middleware/            요청마다 먼저 실행되는 함수(로그인 확인 등)
├─ public/                   그대로 내려주는 정적 파일(favicon …)
├─ tests/                    Vitest 테스트
├─ tools/                    실제 서버를 띄워 HTTP로 검증하는 스크립트
├─ react-router.config.ts    프레임워크 설정
├─ vite.config.ts            Vite 설정
├─ tsconfig.json             TypeScript 설정
└─ .env.example              환경변수 견본(실제 .env는 Git 제외)
```

생성되는 폴더(`build/`, `.react-router/`, `node_modules/`, `data/`)는 Git에 올리지 않습니다.

### 4. 개발 서버 실행과 스크립트

```powershell
cd midpoint
npm install
Copy-Item .env.example .env          # bash: cp .env.example .env
npm run dev                          # → http://localhost:5173
```

**`midpoint/package.json`** — 실제 파일 8–15줄 · [파일 열기](midpoint/package.json#L8-L15)

```json
"scripts": {
  "dev": "node --env-file-if-exists=.env node_modules/@react-router/dev/bin.js dev",
  "build": "react-router build",
  "start": "node --env-file-if-exists=.env node_modules/@react-router/serve/bin.js build/server/index.js",
  "typecheck": "react-router typegen && tsc",
  "test": "vitest run",
  "test:requests": "node tools/request-test.mjs"
},
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>"scripts": {</code> | npm이 실행할 명령 모음. `npm run <이름>`으로 부른다(`start`·`test`는 `npm start`·`npm test`로도 가능). |
| 2 | <code>"dev": "node --env-file-if-exists=.env node_mo…</code> | 개발 서버. `--env-file-if-exists=.env`는 Node가 `.env`를 읽어 `process.env`에 넣게 한다. Vite는 `VITE_`로 시작하지 않는 값을 서버 코드에 넣어 주지 않기 때문이다. |
| 3 | <code>"build": "react-router build",</code> | 운영용 빌드. `build/client`(브라우저 파일)와 `build/server`(서버 파일)가 생긴다. |
| 4 | <code>"start": "node --env-file-if-exists=.env node_…</code> | 빌드 결과를 `react-router-serve`로 실행한다. 개발 서버와 달리 코드가 최적화돼 있다. |
| 5 | <code>"typecheck": "react-router typegen &amp;&amp; tsc",</code> | `typegen`으로 라우트 타입을 만들고 `tsc`로 검사한다. |
| 6 | <code>"test": "vitest run",</code> | Vitest로 단위·컴포넌트 테스트를 한 번 실행한다. |
| 7–8 | <code>"test:requests": "node tools/request-test.mjs"</code> | 빌드된 서버를 실제로 띄워 HTTP로 검증하는 스크립트(study9). |

**`midpoint/react-router.config.ts`** — 전체 · [파일 열기](midpoint/react-router.config.ts#L1-L14)

```ts
import type { Config } from "@react-router/dev/config";

export default {
  // 서버에서 HTML을 먼저 만든다(SSR). false로 바꾸면 SPA 모드가 된다.
  ssr: true,
  // 7.18에서 켤 수 있는 v8 동작. 지금 켜 두면 v8로 올릴 때 코드를 고칠 일이 줄어든다.
  future: {
    v8_middleware: true,
    v8_splitRouteModules: true,
    v8_viteEnvironmentApi: true,
    v8_passThroughRequests: true,
    v8_trailingSlashAwareDataRequests: true,
  },
} satisfies Config;
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>import type { Config } from "@react-router/dev…</code> | 설정 객체의 타입. 오타를 에디터가 잡아 준다. |
| 3–4 | <code>export default {</code> | 프레임워크 설정을 내보낸다. `react-router dev`와 `build`가 이 파일을 읽는다. |
| 5–6 | <code>ssr: true,</code> | 서버에서 HTML을 만든다(SSR). `false`로 바꾸면 빈 껍데기만 주는 SPA 모드가 된다. |
| 7 | <code>future: {</code> | 7.18에서 미리 켤 수 있는 v8 동작 모음. 켜 두면 v8로 올릴 때 고칠 코드가 줄어든다. 끄면 개발 서버가 "곧 바뀝니다" 경고를 낸다. |
| 8–10 | <code>v8_middleware: true,</code> | 라우트 `middleware`(요청마다 먼저 실행되는 함수)를 쓸 수 있게 한다. 이 과정의 로그인 확인이 이것으로 동작한다. |
| 11–13 | <code>v8_passThroughRequests: true,</code> | `request.url`을 가공하지 않고 그대로 넘긴다. 정규화된 주소가 필요하면 loader 인자의 `url`을 쓴다(study4). |
| 14 | <code>} satisfies Config;</code> | 타입은 검사하되 객체의 구체적인 모양은 잃지 않는다. |

**`midpoint/vite.config.ts`** — 전체 · [파일 열기](midpoint/vite.config.ts#L1-L10)

```ts
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
});
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>import { reactRouter } from "@react-router/dev…</code> | React Router의 Vite 플러그인. 라우트 모듈을 변환하고 서버·클라이언트 번들을 따로 만든다. |
| 2–5 | <code>import tailwindcss from "@tailwindcss/vite";</code> | Tailwind CSS 4의 Vite 플러그인. |
| 6–7 | <code>plugins: [tailwindcss(), reactRouter()],</code> | 플러그인 순서대로 적용된다. |
| 8–10 | <code>tsconfigPaths: true,</code> | `tsconfig.json`의 `paths`(`~/…` → `app/…`)를 Vite가 그대로 이해하게 한다. |

### 5. 에디터 확장 프로그램

저장소에 권장 목록이 있어 VS Code가 설치를 제안합니다.

**`.vscode/extensions.json`** — 전체 · [파일 열기](.vscode/extensions.json#L1-L9)

```json
{
  "recommendations": [
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "vitest.explorer",
    "ms-azuretools.vscode-docker",
    "redhat.vscode-yaml"
  ]
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1–2 | <code>{</code> | VS Code가 "이 확장을 설치할까요?"라고 묻는 목록. |
| 3 | <code>"bradlc.vscode-tailwindcss",</code> | Tailwind 클래스 자동완성과 미리보기. |
| 4 | <code>"esbenp.prettier-vscode",</code> | 저장할 때 코드 모양을 통일한다. |
| 5 | <code>"vitest.explorer",</code> | 사이드바에서 테스트를 실행하고 실패한 줄로 이동한다. |
| 6 | <code>"ms-azuretools.vscode-docker",</code> | Dockerfile·compose 문법 검사와 컨테이너 관리(study10·16). |
| 7–9 | <code>"redhat.vscode-yaml"</code> | GitHub Actions·compose YAML 검사. |

### 6. 환경변수 견본

**`midpoint/.env.example`** — 전체 · [파일 열기](midpoint/.env.example#L1-L16)

```dotenv
# 복사해서 .env를 만든 뒤 값을 채운다. .env는 Git에 올리지 않는다.
NODE_ENV=development

# 쿠키 서명 키. 32자 이상. 생성: node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=
# API 액세스 토큰(JWT) 서명 키. 세션 키와 다른 값을 쓴다.
JWT_SECRET=

# SQLite 파일 경로. 테스트는 :memory:를 쓴다.
DATABASE_PATH=./data/board.db

# 브라우저에서 이 API를 직접 부를 다른 출처. 쉼표로 여러 개. 비우면 같은 출처만 허용.
CORS_ORIGIN=http://localhost:5173

# 요청 로그(JSON 한 줄). 0이면 끈다.
LOG_REQUESTS=1
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code># 복사해서 .env를 만든 뒤 값을 채운다. .env는 Git에 올리지 않는다.</code> | 이 파일은 **견본**이다. 복사해서 `.env`를 만들고 값을 채운다. |
| 2–4 | <code>NODE_ENV=development</code> | `development`(개발) · `production`(운영) · `test`. 쿠키의 Secure 같은 기본값이 이것에 따라 바뀐다. |
| 5–6 | <code>SESSION_SECRET=</code> | 로그인 쿠키에 "서명"하는 비밀키. 32자 이상. 이 값을 아는 사람은 로그인 쿠키를 위조할 수 있다. |
| 7–9 | <code>JWT_SECRET=</code> | API 액세스 토큰(JWT)을 서명하는 키. 세션 키와 **다른 값**을 쓴다. 한쪽이 새도 다른 쪽은 안전하게. |
| 10–12 | <code>DATABASE_PATH=./data/board.db</code> | SQLite 파일 위치. 테스트는 `:memory:`(메모리)를 쓴다. |
| 13–15 | <code>CORS_ORIGIN=http://localhost:5173</code> | 다른 출처의 프런트엔드(예: Vite 5173번)가 이 API를 호출해도 되도록 허용할 주소. |
| 16 | <code>LOG_REQUESTS=1</code> | 요청 로그(JSON 한 줄)를 켜고 끈다. |

## ④ 🔗 연동 포인트

### Git 저장소 초기화와 `.gitignore`

```powershell
git init -b master
git add .gitignore            # 맨 처음에는 .gitignore부터 올린다
git status                    # 올라갈 파일 목록을 눈으로 확인한다
git check-ignore -v midpoint/.env      # 어느 규칙 때문에 제외되는지 출력(출력이 있으면 제외된 것)
```

**`.gitignore`** — 실제 파일 8–11줄 · [파일 열기](.gitignore#L8-L11)

```text
# 환경변수: 실제 값은 올리지 않고 .env.example만 올린다
**/.env
**/.env.*
!**/.env.example
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code># 환경변수: 실제 값은 올리지 않고 .env.example만 올린다</code> | 주석. 실제 값은 올리지 않고 견본만 올린다는 원칙. |
| 2 | <code>**/.env</code> | 어느 폴더의 `.env`든 제외한다. |
| 3 | <code>**/.env.*</code> | `.env.production` 같은 변형도 제외한다. |
| 4 | <code>!**/.env.example</code> | **예외**: 견본만은 올린다. 새로 받은 사람이 어떤 변수가 필요한지 알 수 있다. |

### `.env` 만들기

```powershell
Copy-Item midpoint/.env.example midpoint/.env
# 32바이트 무작위 키 생성(두 번 실행해 SESSION_SECRET, JWT_SECRET에 각각 넣는다)
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

- `.env`는 **내 컴퓨터에만** 있습니다. 배포 서버에서는 같은 이름의 환경변수를 서버 설정 화면이나 compose의 `environment`로 넣습니다(study10).
- 브라우저에 노출되면 안 되는 값에는 `VITE_` 접두사를 **절대 붙이지 않습니다**. `VITE_`로 시작하는 값은 번들에 포함돼 누구나 읽을 수 있습니다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 설치된 `react-router`가 8.x | `npx create-react-router@latest`의 `latest` 태그가 8 | `create-react-router@7.18.6`처럼 버전을 고정하고 `package.json`은 `^7.18.6` 유지 |
| `환경변수 오류 — SESSION_SECRET: …32자 이상` | `.env`가 없거나 키가 짧음 | `.env.example`을 복사하고 위 명령으로 만든 키를 넣는다 |
| `npm warn EBADENGINE … jsdom … ^24.15` | 설치된 Node가 24.14라 jsdom 31이 요구하는 24.15보다 낮음 | 경고일 뿐 테스트는 통과한다. 가능하면 최신 24.x로 올린다 |
| `The envFile option is deprecated` | React Router의 Vite 플러그인이 Vite 8과 만나며 나는 경고 | 동작에 영향 없음. 무시해도 된다 |
| `ExperimentalWarning: SQLite is an experimental feature` | `node:sqlite`가 아직 "실험" 단계 | 정상. 숨기려면 `node --disable-warning=ExperimentalWarning` |
| `Cannot find module './+types/…'` | 라우트 타입을 아직 생성하지 않음 | `npm run typecheck` 또는 `npx react-router typegen`. `npm run dev`도 자동 생성한다 |
| `Port 5173 is already in use` | 다른 Vite가 같은 포트를 쓰는 중 | `npm run dev -- --port 5180` |
| `curl.exe`의 한글 인자·출력이 깨짐(Windows PowerShell 5.1) | 5.1이 인자와 출력을 CP949로 다룸 | 이 과정의 명령 예시는 ASCII만 쓴다. 한글이 필요하면 JSON을 파일로 저장해 `-d "@body.json"`, 또는 PowerShell 7(`pwsh`) |
| `curl.exe -d '{"title":"a b"}'`가 400(JSON 값에 공백이 있을 때, 5.1) | 5.1이 `"`와 공백이 섞인 인자를 잘못 쪼갬 | JSON을 표준 입력으로 보낸다: `'{"title":"a b"}' \| curl.exe … --data-binary "@-"` (또는 `@body.json`) |
| Git Bash에서 `docker run -e PATH=/app/x`가 `C:/Program Files/Git/app/x`로 바뀜 | Git Bash가 `/`로 시작하는 문자열을 윈도우 경로로 자동 변환 | `MSYS_NO_PATHCONV=1`을 앞에 붙이거나 PowerShell을 쓴다 |

## ⑥ 직접 해보기

1. 빈 폴더에서 `npx create-react-router@7.18.6 my-first --no-git-init --yes`로 템플릿을 만들고 `npm run dev`로 띄운 뒤, `app/routes.ts`와 `app/routes/home.tsx`를 열어 어떤 주소가 어떤 파일에 연결되는지 말로 설명해 본다.
2. `midpoint/.env`를 만들고 `SESSION_SECRET`을 일부러 짧게 바꿔 서버를 시작해 본다. 오류 메시지가 어떤 변수를 탓하는지 읽고, 원래대로 고친다.
3. `git check-ignore -v midpoint/.env`와 `git check-ignore -v midpoint/.env.example`을 실행해 하나는 제외되고 하나는 제외되지 않는 이유를 `.gitignore`의 줄 번호로 설명한다.

## ⑦ ☐ 체크리스트

- [ ] React Router 7 프로젝트 생성 (framework mode)
- [ ] `node --version`이 24.x이고 `npx react-router --version`이 7.18.x(8.x가 아님)임을 확인했다.
- [ ] `npm run dev`로 개발 서버를 띄우고 브라우저에서 화면을 열었다.
- [ ] `.env`를 `.env.example`에서 만들고 32자 이상의 키를 넣었으며, Git에 올라가지 않음을 `git check-ignore`로 확인했다.
- [ ] `app/`, `routes.ts`, `react-router.config.ts`, `vite.config.ts`가 각각 무슨 일을 하는지 말할 수 있다.

## ⑧ 다음 단계 연결

환경이 갖춰졌으니 [study1.md](study1.md)에서 첫 화면(Hello World)을 띄우고, JSX 문법과 개발 서버의 자동 새로고침으로 결과를 눈으로 확인합니다.
