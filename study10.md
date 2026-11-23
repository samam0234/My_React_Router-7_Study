# study10 — 배포·정리

> 기준: [노션 · React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06). 코드: [midpoint/Dockerfile](midpoint/Dockerfile), [midpoint/package.json](midpoint/package.json), [midpoint/.dockerignore](midpoint/.dockerignore).

## ① 목표 한 줄

앱을 빌드해 배포(Node 서버·Docker 컨테이너)하고, 도메인·HTTPS 개념을 이해하며, 배포 환경에서 환경변수·DB를 잇고 배포 후 점검표로 확인하며, 기초 구간(study0~10)을 정리한다.

## ② 📖 이론

### 빌드가 만드는 것

`npm run build`는 `build/` 폴더를 만듭니다.

```text
build/
├─ client/             브라우저가 받는 파일(해시 이름이 붙은 JS·CSS) → 정적 서버가 그대로 제공
│  └─ assets/            이름에 내용 해시가 있어 1년 캐시해도 안전
└─ server/
   └─ index.js         서버 코드(모든 loader·action·미들웨어가 번들됨) → react-router-serve가 실행
```

개발 서버(`npm run dev`)는 편의 기능(HMR·타입 생성)이 가득한 **작업용**이고, 운영은 **빌드 결과만** 실행합니다. 빌드가 끝나면 소스 파일이 없어도 `build/`와 `node_modules`(운영 의존성)만으로 돕니다.

### 배포 방식 한눈에

| 방식 | 설명 | 장점 | 주의 |
| --- | --- | --- | --- |
| **Node 서버 직접 실행** | 서버(VM)에 Node를 깔고 `npm start` | 단순 | 서버 설정·재시작·업데이트를 직접 관리 |
| **Docker 컨테이너**(이 과정) | 앱+런타임을 이미지로 묶어 어디서나 같게 실행 | 환경 차이 제거, 롤백 쉬움 | 이미지·볼륨·비밀 관리 이해 필요 |
| **PaaS**(Render·Fly·Railway 등) | Git 푸시 → 자동 빌드·실행 | 서버 관리 없음 | 플랫폼 설정, 영구 저장소(SQLite 파일)가 사라질 수 있음 |
| **서버리스·엣지** | 요청마다 함수 실행(Vercel, Cloudflare 등) | 확장 자동 | 어댑터(`@react-router/cloudflare` 등)와 런타임 제약(`node:sqlite`·파일 접근 불가 등) |

이 저장소는 `node:sqlite`(파일)와 `server.ts`를 쓰므로 **Node 서버 + 컨테이너**가 맞습니다. 서버리스로 가려면 DB를 PostgreSQL 같은 **외부 DB**로 바꿔야 합니다(study11).

### 도메인과 HTTPS 개념

```text
사용자 브라우저 ── board.example.com ──▶ ① DNS가 IP로 바꿔 줌(A 레코드: board.example.com → 203.0.113.10)
                                   ──▶ ② 서버의 443 포트 → 리버스 프록시(Caddy/nginx)가 HTTPS 처리(TLS 종료)
                                   ──▶ ③ 프록시가 http://app:3000 으로 전달 → 우리 앱
```

- **도메인**: 사람이 읽는 주소. **DNS**가 IP로 바꿔 준다. 도메인은 등록 업체에서 사고, DNS 설정에서 서버 IP를 가리킨다.
- **HTTPS**: HTTP를 **TLS로 암호화**한 것. 비밀번호·쿠키가 중간에서 읽히지 않게 한다. **인증서**가 "이 서버가 진짜 이 도메인"임을 증명하며, Let's Encrypt가 **무료로 자동 발급·갱신**한다(Caddy는 이를 자동으로 한다).
- **TLS 종료(termination)**: 암호화는 **프록시**가 풀고, 앱은 평범한 HTTP만 다룬다. 그래서 앱은 "지금 HTTPS 뒤에 있다"고 **설정으로 알려 줘야** 한다(`COOKIE_SECURE=true`, 프록시 헤더 신뢰).
- **HSTS**: "앞으로 이 도메인은 HTTPS로만 접속하라"고 브라우저에 기억시키는 헤더.

### 비유

배포는 **식당 개업**입니다. 빌드는 **메뉴판·조리법 인쇄**(소스를 실행 가능한 형태로), 서버는 **임대한 가게**, 도메인은 **간판과 주소**, HTTPS는 **문에 단 자물쇠와 신분 확인**, 리버스 프록시는 **입구 안내원**(손님을 맞아 주방으로 전달), 환경변수는 **금고 번호**(가게 밖에 적어 두지 않고 점장만 안다)입니다.

## ③ 🛠️ 실기 — 전체 코드와 줄별 설명

### 1. 빌드하고 실행해 보기

```powershell
cd midpoint
npm ci                         # lockfile대로 정확히 설치(CI·배포에서는 install 대신 ci)
npm run build                  # → build/client, build/server
$env:NODE_ENV = "production"
$env:COOKIE_SECURE = "false"   # 로컬은 HTTP라서. 실제 HTTPS 운영에서는 설정하지 않는다(production이면 true)
npm start                      # http://localhost:3000
```

빌드 로그의 끝부분은 이런 모양입니다(숫자는 환경마다 다릅니다).

```text
build/client/assets/detail-DCgKiJVH.js     3.59 kB │ gzip:  1.50 kB
build/client/assets/entry.client-BhTUU1RT.js   214.88 kB │ gzip: 67.27 kB
✓ built in 248ms
build/server/index.js                      81.39 kB │ gzip: 18.48 kB
✓ built in 142ms
```

### 2. 컨테이너 이미지: Dockerfile

**`midpoint/Dockerfile`** — 전체 · [파일 열기](midpoint/Dockerfile#L1-L28)

```dockerfile
# 1단계: 개발 의존성까지 설치하고 빌드한다.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# 2단계: 운영 의존성만 설치한다.
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 3단계: 실행 이미지. 빌드 결과와 운영 의존성만 담고 root가 아닌 사용자로 실행한다.
FROM node:24-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code># 1단계: 개발 의존성까지 설치하고 빌드한다.</code> | 주석: 이 파일은 **3단계(multi-stage)** 빌드다. 앞 단계의 도구는 최종 이미지에 들어가지 않는다. |
| 2 | <code>FROM node:24-alpine AS build</code> | 가벼운(alpine) Node 24 이미지에서 시작. 별명 `build`. |
| 3 | <code>WORKDIR /app</code> | 이후 명령은 `/app`에서 실행된다. |
| 4 | <code>COPY package.json package-lock.json ./</code> | **의존성 파일만 먼저** 복사한다. 소스가 바뀌어도 이 층의 캐시가 유지돼 다음 빌드가 빠르다. |
| 5 | <code>RUN npm ci</code> | 개발 의존성까지 정확히 설치(빌드에 Vite 등이 필요). |
| 6 | <code>COPY . .</code> | 이제 소스 전체를 복사한다(`.dockerignore`가 제외할 것을 거른다). |
| 7 | <code>RUN npm run build</code> | `build/`를 만든다. |
| 9 | <code># 2단계: 운영 의존성만 설치한다.</code> | 주석. |
| 10–12 | <code>FROM node:24-alpine AS prod-deps</code> | 운영 의존성만 설치하는 별도 단계. |
| 13 | <code>RUN npm ci --omit=dev</code> | 개발 도구(Vite, TypeScript, Vitest …)를 뺀다. 이미지가 작아지고 공격 면이 줄어든다. |
| 15 | <code># 3단계: 실행 이미지. 빌드 결과와 운영 의존성만 담고 root가 아닌 사용자로…</code> | 주석. |
| 16 | <code>FROM node:24-alpine</code> | **최종 이미지**는 깨끗한 새 이미지에서 시작한다. |
| 17–18 | <code>ENV NODE_ENV=production PORT=3000</code> | 운영 모드와 기본 포트. |
| 19 | <code>COPY package.json ./</code> | `npm start`가 읽는 스크립트 정의. |
| 20 | <code>COPY --from=prod-deps /app/node_modules ./node…</code> | 2단계에서 만든 **운영 의존성만** 가져온다. |
| 21 | <code>COPY --from=build /app/build ./build</code> | 1단계에서 만든 **빌드 결과만** 가져온다. 소스 코드는 이미지에 없다. |
| 22 | <code>RUN mkdir -p /app/data &amp;&amp; chown -R node:node /…</code> | SQLite 파일이 놓일 폴더를 만들고, **`node` 사용자**가 쓸 수 있게 소유자를 바꾼다. |
| 23 | <code>USER node</code> | **root가 아닌 사용자**로 실행한다. 앱이 뚫려도 컨테이너 안에서 할 수 있는 일이 줄어든다. |
| 24 | <code>EXPOSE 3000</code> | 문서용 표시(실제 포트 공개는 `docker run -p`). |
| 25 | <code>VOLUME ["/app/data"]</code> | 이 폴더를 **볼륨**으로 선언: 컨테이너를 지워도 데이터(SQLite)를 따로 보관할 수 있다. |
| 26–27 | <code>HEALTHCHECK --interval=15s --timeout=3s --star…</code> | 15초마다 `/health`를 호출해 컨테이너가 **살아 있는지** 확인한다. 이 결과가 `healthy`/`unhealthy`로 표시된다. |
| 28 | <code>CMD ["npm", "start"]</code> | 컨테이너가 시작하면 실행할 명령. |

**`midpoint/.dockerignore`** — 전체 · [파일 열기](midpoint/.dockerignore#L1-L10)

```text
.react-router
build
node_modules
data
.env
.env.*
!.env.example
tests
*.log
.git
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>.react-router</code> | 생성된 타입 폴더는 이미지에 필요 없다. |
| 2 | <code>build</code> | 호스트의 예전 빌드를 이미지로 가져오지 않는다(이미지 안에서 새로 빌드). |
| 3 | <code>node_modules</code> | **호스트의 `node_modules`를 복사하지 않는다.** 운영체제가 달라 깨질 수 있다. |
| 4 | <code>data</code> | 로컬 DB 파일이 이미지에 들어가면 안 된다. |
| 5–7 | <code>.env</code> | **비밀값이 이미지에 구워지는 사고를 막는다.** 이미지는 공유·저장되므로 한 번 들어가면 지워도 층에 남는다. |
| 8–10 | <code>tests</code> | 운영에 필요 없다. |

### 3. 이미지 만들고 실행

```powershell
cd midpoint
docker build -t rr7-midpoint .
docker volume create rr7-midpoint-data

# 비밀값은 이미지가 아니라 "실행할 때" 준다
$session = node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
$jwt     = node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
docker run -d --name rr7 -p 3000:3000 `
  -e SESSION_SECRET=$session -e JWT_SECRET=$jwt `
  -e COOKIE_SECURE=false `
  -e DATABASE_PATH=/app/data/board.db `
  -v rr7-midpoint-data:/app/data `
  rr7-midpoint

curl.exe -s http://localhost:3000/health          # {"status":"ok"}
docker ps --format "table {{.Names}}\t{{.Status}}"   # …(healthy)
```

> **Git Bash(MSYS)에서는** `-e DATABASE_PATH=/app/data/board.db`가 `C:/Program Files/Git/app/data/…`로 **자동 변환**됩니다. `MSYS_NO_PATHCONV=1`을 앞에 붙이거나 PowerShell을 쓰세요. 이 저장소를 검증하다 실제로 겪은 오류입니다.

이 이미지로 실행했을 때 확인한 것: `/health` 200, 가입 201, 같은 이메일 재가입 409, **컨테이너를 재시작해도(`docker restart`) 같은 이메일이 409**(DB가 볼륨에 남아 있음), 헬스체크 `healthy`, 실행 사용자 `node`, 이미지 크기 약 307MB.

### 4. 로컬 HTTP와 운영 HTTPS의 차이: 설정으로

| 설정 | 로컬(HTTP) | 운영(HTTPS 뒤) |
| --- | --- | --- |
| `COOKIE_SECURE` | `false` | `true`(기본: `NODE_ENV=production`이면 true) |
| 접속 주소 | `http://localhost:3000` | `https://board.example.com` |
| 브라우저 쿠키 | `Secure` 없음 | `Secure` + `HttpOnly` + `SameSite=Lax` |
| 프록시 | 없음 | Caddy/nginx가 TLS 종료 → 앱은 HTTP |
| `CORS_ORIGIN` | `http://localhost:5173` | 실제 프런트 도메인(`https://…`) |

운영 HTTPS의 실제 구성(Caddy 자동 인증서 + compose)은 project의 [compose.production.yaml](project/compose.production.yaml)과 [Caddyfile](project/Caddyfile)에 있고 study16에서 다룹니다. (설정 문법은 검증했지만, **실제 도메인과 인증서 발급은 이 환경에서 검증하지 못했습니다.**)

## ④ 🔗 연동 포인트

### 배포 환경에서 환경변수·DB 잇기

| 질문 | 답 |
| --- | --- |
| 비밀키는 어디에 두나? | **이미지에 넣지 않는다.** 실행 시 `-e`, `--env-file`, compose의 `environment`, 클라우드의 시크릿 저장소로 준다 |
| `.env` 파일을 서버에 올려도 되나? | 가능하지만 서버에서만 만들고 Git·이미지에는 넣지 않는다. 컨테이너에서는 `--env-file .env`로 읽는다 |
| DB(SQLite)는 어디에? | `/app/data`를 **볼륨**에 둔다. 볼륨이 없으면 컨테이너를 새로 띄울 때마다 DB가 사라진다 |
| 서버를 여러 대 두려면? | SQLite 파일은 한 서버만 쓸 수 있다. **PostgreSQL 같은 외부 DB**로 바꾼다(study11) |
| DB 주소가 바뀌면? | `DATABASE_PATH`(또는 project의 `DATABASE_URL`)만 바꿔 재시작. 코드는 그대로 |
| 환경변수가 빠지면? | 서버가 **시작하자마자** 어떤 변수가 틀렸는지 적어 놓고 종료한다(`getConfig`) → 로그를 보면 바로 안다 |

### 배포 후 점검표

```powershell
$base = "http://localhost:3000"      # 운영이라면 https://board.example.com
curl.exe -s "$base/health"                                          # 1. 살아 있나
curl.exe -s -o NUL -w "%{http_code}`n" "$base/"                     # 2. 화면 200
curl.exe -s -o NUL -w "%{http_code}`n" "$base/api/posts"            # 3. API 200
curl.exe -s -o NUL -w "%{http_code}`n" "$base/no-such-page"         # 4. 404(오류 화면에 스택이 없는지도 눈으로)
curl.exe -s -I "$base/" | Select-String "x-request-id"               # 5. 요청번호 헤더
curl.exe -s -I "$base/" | Select-String "set-cookie"                # 6. (로그인 후) HttpOnly·Secure·SameSite
docker logs rr7 --tail 20                                             # 7. 시작 로그, 오류 없음
```

| # | 점검 | 정상 |
| --- | --- | --- |
| 1 | `/health` | `{"status":"ok"}` |
| 2 | 가입 → 로그인 → 글쓰기 → 로그아웃 | 모두 성공, 새로고침해도 로그인 유지 |
| 3 | 쿠키 속성 | `HttpOnly`, `SameSite=Lax`, (HTTPS면) `Secure` |
| 4 | 존재하지 않는 주소 / 없는 글 | 404 화면, **스택·내부 경로 노출 없음** |
| 5 | 재시작 후 데이터 | 글이 남아 있음(볼륨/외부 DB) |
| 6 | 로그 | JSON 요청 로그가 보이고 `level:"error"`가 없음 |
| 7 | HTTPS(운영) | 주소창 자물쇠, `http://`가 `https://`로 이동, HSTS 헤더 |
| 8 | 비밀값 | 이미지·Git·로그 어디에도 비밀키가 없음(`docker history`, `git log -p`로 점검) |
| 9 | 롤백 방법 | 이전 이미지 태그를 알고 있고 되돌려 봤다 |

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 컨테이너 시작 직후 종료, 로그에 `환경변수 오류` | 필수 변수를 안 줌 | `-e SESSION_SECRET=… -e JWT_SECRET=…` |
| `unable to open database file` / `EACCES` | `/app/data` 권한이 `node`가 아님, 볼륨이 root 소유 | Dockerfile의 `chown node:node /app/data`, 볼륨 소유자 확인 |
| `Cannot find module '…/build/server/index.js'` | `npm run build`를 안 했거나 `COPY --from=build` 누락 | 빌드 단계와 `COPY` 경로 확인 |
| 로그인이 계속 풀림(HTTP 운영) | `COOKIE_SECURE=true`인데 HTTP로 접속 | HTTPS를 쓰거나 로컬만 `COOKIE_SECURE=false` |
| 프록시 뒤에서 POST가 403(`허용되지 않은 출처`) | 프록시가 `Host`를 바꿔 `Origin`과 불일치 | 프록시가 원래 `Host`를 전달(`proxy_set_header Host $host`, Caddy는 기본) |
| `docker run -e X=/app/..`이 `C:/Program Files/Git/…`가 됨 | Git Bash의 경로 자동 변환 | `MSYS_NO_PATHCONV=1` 또는 PowerShell |
| `npm ci`가 `package-lock.json` 불일치로 실패 | `package.json`만 고치고 lock을 갱신 안 함 | 로컬에서 `npm install` 후 lock을 함께 커밋 |
| 컨테이너를 지웠더니 DB 사라짐 | 볼륨 없이 컨테이너 파일시스템에 저장 | `-v 이름:/app/data` |
| 헬스체크가 `unhealthy` | `PORT`와 헬스체크 주소 불일치, 앱이 시작 중 | `start-period`를 늘리고 `PORT`를 맞춘다 |
| 이미지가 너무 큼 | 개발 의존성·소스 포함 | multi-stage와 `--omit=dev`, `.dockerignore` |
| HTTPS 인증서 발급 실패(Caddy) | DNS가 아직 서버를 안 가리킴, 80·443 막힘 | `nslookup`으로 A 레코드, 방화벽·보안그룹 확인 |

## ⑥ 직접 해보기

1. 위 `docker build` → `docker run`을 따라 해서 가입 API가 201을 돌려주는지 확인하고, `docker restart` 후에 같은 가입이 409가 되는지(데이터 유지) 확인한다. 이어서 **볼륨 없이** 다시 실행해 컨테이너를 지우면 데이터가 사라지는 것을 본다.
2. `docker run`에서 `SESSION_SECRET`을 일부러 짧게 줘 컨테이너가 바로 종료되고 `docker logs`에 이유가 남는 것을 확인한다. 같은 방식으로 `.env`를 이미지에 넣지 말아야 하는 이유를 `docker history rr7-midpoint`로 설명해 본다.
3. 위 **배포 후 점검표**의 명령 1~7을 PowerShell 스크립트(`check.ps1`) 하나로 묶어 `$base`만 바꿔 어느 환경이든 실행되게 만든다. 실패하면 `exit 1`로 끝나게 한다.

## ⑦ ☐ 체크리스트

- [ ] `npm run build` 산출물(`build/client`, `build/server`)이 각각 무엇인지 말하고 `npm start`로 빌드 결과를 실행했다.
- [ ] Dockerfile의 3단계 구조(빌드 → 운영 의존성 → 최종), 비root 사용자, 볼륨, 헬스체크의 이유를 설명할 수 있다.
- [ ] 도메인 → DNS → 프록시(TLS 종료) → 앱의 흐름과, 앱이 HTTPS 뒤에 있음을 설정(`COOKIE_SECURE`)으로 알려 줘야 하는 이유를 설명할 수 있다.
- [ ] 비밀키를 이미지에 넣지 않고 실행 시 환경변수로 주었고, 컨테이너를 재시작해도 DB가 남음을 확인했다.
- [ ] 배포 후 점검표 9개를 하나씩 확인해 보았다.
- [ ] study0~10의 핵심을 아래 총정리 표로 스스로 설명할 수 있다.

## 기초 구간 총정리 (study0 ~ study10)

| 번호 | 주제 | 한 줄 요약 | 핵심 파일 | 확인 명령 |
| --- | --- | --- | --- | --- |
| [0](study0.md) | 환경 설정 | Node 24 + RR **7.18** 고정, `.env`는 Git 제외 | `package.json`, `react-router.config.ts`, `.env.example` | `npx react-router --version` |
| [1](study1.md) | Hello World | 컴포넌트·JSX·`loader`→`loaderData`, HMR | `routes/home.tsx` | `curl.exe -s localhost:5173/` |
| [2](study2.md) | 핵심 구조 | 라우트·레이아웃(`Outlet`)·컴포넌트·서비스, props·`context` | `routes.ts`, `components/` | `npm run typecheck` |
| [3](study3.md) | 데이터 | 데이터가 사는 곳 4곳, `loader` 바인딩, localStorage, SQLite | `db/types.ts`, `use-local-storage.ts` | 개발자도구 Local Storage |
| [4](study4.md) | 라우팅·요청 | 동적 경로, 요청 3종, `ErrorBoundary`, 쿼리·이동 | `routes.ts`, `ErrorBoundary` | `curl.exe -i …/api/no-such` |
| [5](study5.md) | 폼·검증 | `action`+`Form`, zod, 오류 표시, PRG, 중복 제출 방지 | `schemas.ts`, `post-form.tsx`, `form.server.ts` | `curl.exe` 400/409 |
| [6](study6.md) | DB·API | route→service→repo, 마이그레이션, 스펙 v1, 환경변수 | `sqlite.server.ts`, `routes/api/` | `npm run test:requests` |
| [7](study7.md) | 인증·보안 | 쿠키 세션+Bearer, scrypt, CORS, XSS, CSRF | `session.server.ts`, `auth.server.ts` | `/posts/new` 가드 확인 |
| [8](study8.md) | 구조화 | 폴더·`.server`·공통 모듈·설정 한 곳 | `config.server.ts`, `lib/` | `process.env` 검색 |
| [9](study9.md) | 테스트 | 단위·가짜 저장소·컴포넌트·요청 테스트, 로그·TOP 10 | `tests/`, `tools/request-test.mjs` | `npm test` |
| 10 | 배포 | 빌드, Docker, 도메인·HTTPS, 점검표 | `Dockerfile` | `docker run` + 점검표 |

## ⑧ 다음 단계 연결

기초 구간(study0~10)이 끝났습니다. [studyMidpoint.md](studyMidpoint.md)에서 **지금까지 배운 것만으로** 로그인·게시글 CRUD·댓글이 있는 게시판 서비스를 처음부터 끝까지 조립하고 1차 배포 체크리스트와 회고까지 정리합니다.
