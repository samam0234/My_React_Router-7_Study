# study16 — 운영·CI/CD

> 기준: [노션 · React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06). 코드: [project/Dockerfile](project/Dockerfile), [project/compose.yaml](project/compose.yaml), [project/compose.production.yaml](project/compose.production.yaml), [.github/workflows/course.yml](.github/workflows/course.yml), [project/tools/backup.mjs](project/tools/backup.mjs).

## ① 목표 한 줄

Docker 이미지·compose, GitHub Actions 자동 검증·배포, 로그·모니터링, 백업·복구를 **체크리스트 중심**으로 갖춰 "내 PC에서만 되는 앱"을 "누가 배포해도 같은 앱"으로 만든다.

## ② 📖 이론

### 운영이란

개발은 "돌아가게 만드는 것", 운영은 **"계속 돌아가게 하고, 고장 나면 빨리 알아채고, 되돌리고, 복구하는 것"**입니다. 네 가지를 갖추면 됩니다.

| 영역 | 질문 | 도구 |
| --- | --- | --- |
| **재현 가능한 실행** | 누가 어디서 띄워도 같은가? | Docker 이미지 + compose |
| **자동화된 검증·배포** | 사람이 빼먹는 단계는 없는가? | GitHub Actions |
| **관찰** | 지금 괜찮은가? 어디가 느린가? | JSON 로그, `/health`·`/ready`·`/metrics` |
| **복구** | 데이터가 날아가도 되살릴 수 있는가? | 백업 + **복구 연습** |

### CI/CD

- **CI**(지속적 통합): 푸시할 때마다 타입 검사 → 테스트 → 빌드 → 요청 테스트를 **자동으로** 돌려 깨진 코드를 빨리 잡는다.
- **CD**(지속적 배포): 검증을 통과한 것을 **자동으로** 이미지로 만들어 서버에 올린다. 사고를 줄이려고 **사람의 승인**이나 **스위치(변수)**를 둘 수도 있다.

### 비유

운영은 **공장 라인**입니다. 이미지는 **표준 포장 상자**(어디서 열어도 같은 물건), CI는 **출고 검수 라인**(불량이면 라인 정지), CD는 **트럭 배차**, 로그·메트릭은 **계기판과 CCTV**, 백업은 **금고 속 사본**입니다. 사본은 **한 번 꺼내 써 본 것만** 믿을 수 있습니다(복구 연습).

## ③ 🛠️ 실기 — 체크리스트와 코드

### A. Docker 이미지

- ✔ 3단계 빌드(빌드 → 운영 의존성 → 최종 이미지)로 이미지를 작게 · 소스·개발 도구 제외
- ✔ `node` **비root** 사용자로 실행
- ✔ `HEALTHCHECK`(`/health`)
- ✔ `CMD`가 `node`를 **직접** 실행 → SIGTERM을 앱이 받아 우아하게 종료
- ✔ 비밀값을 이미지에 넣지 않음(`.dockerignore`에 `.env`)
- ✔ 데이터는 **볼륨**(`/app/data`)

**`project/Dockerfile`** — 실제 파일 15–34줄 · [파일 열기](project/Dockerfile#L15-L34)

```dockerfile
# 3단계: 실행 이미지. 빌드 결과와 운영 의존성만 담고, root가 아닌 사용자로 실행한다.
FROM node:24-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
# server.ts가 실행 시점에 직접 읽는 소스(접속자 주소 키, 웹소켓 티켓 검증)와 MCP 서버
COPY server.ts ./server.ts
COPY app/context.ts ./app/context.ts
COPY app/lib/token.server.ts ./app/lib/token.server.ts
COPY mcp ./mcp
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# SIGTERM을 서버가 직접 받도록 npm을 거치지 않고 node를 바로 실행한다(우아한 종료).
CMD ["node", "--disable-warning=ExperimentalWarning", "server.ts"]
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code># 3단계: 실행 이미지. 빌드 결과와 운영 의존성만 담고, root가 아닌 사용자…</code> | 주석: 최종 실행 이미지. |
| 2 | <code>FROM node:24-alpine</code> | 깨끗한 새 이미지에서 시작(앞 단계의 도구가 들어오지 않는다). |
| 3–5 | <code>ENV NODE_ENV=production PORT=3000</code> | 운영 모드와 기본 포트. `WORKDIR`·`COPY package.json`이 이어진다. |
| 6 | <code>COPY --from=prod-deps /app/node_modules ./node…</code> | **운영 의존성만**(개발 도구 없음). |
| 7 | <code>COPY --from=build /app/build ./build</code> | 빌드 결과만. |
| 8 | <code># server.ts가 실행 시점에 직접 읽는 소스(접속자 주소 키, 웹소켓 티켓 …</code> | 주석: 이 앱은 `server.ts`(WebSocket 포함)를 직접 실행한다. |
| 9 | <code>COPY server.ts ./server.ts</code> | 서버 진입 파일. |
| 10 | <code>COPY app/context.ts ./app/context.ts</code> | `server.ts`가 직접 import하는 두 소스 중 하나(접속자 주소 키). |
| 11 | <code>COPY app/lib/token.server.ts ./app/lib/token.s…</code> | 둘째(WebSocket 티켓 검증). **둘 다 없으면 컨테이너가 시작하지 못한다.** |
| 12 | <code>COPY mcp ./mcp</code> | MCP 서버(study18). |
| 13 | <code>RUN mkdir -p /app/data &amp;&amp; chown -R node:node /…</code> | 데이터·업로드 폴더를 만들고 `node` 소유로. |
| 14 | <code>USER node</code> | **root 포기.** |
| 15 | <code>EXPOSE 3000</code> | 문서용 포트 표시. |
| 16 | <code>VOLUME ["/app/data"]</code> | 데이터 볼륨. |
| 17–18 | <code>HEALTHCHECK --interval=15s --timeout=3s --star…</code> | 15초마다 `/health`. |
| 19 | <code># SIGTERM을 서버가 직접 받도록 npm을 거치지 않고 node를 바로 실행한…</code> | 주석: `npm start`를 거치지 않는 이유. |
| 20 | <code>CMD ["node", "--disable-warning=ExperimentalWa…</code> | 종료 신호를 앱이 **직접** 받는다. |

### B. compose: 앱 + PostgreSQL

- ✔ 앱이 DB가 **준비된 뒤** 시작(`depends_on: condition: service_healthy`)
- ✔ 필수 비밀이 없으면 **시작 거부**(`${VAR:?메시지}`)
- ✔ `restart: unless-stopped`
- ✔ DB 접속 주소에 **서비스 이름**(`postgres`)을 호스트로 사용

**`project/compose.yaml`** — 실제 파일 7–28줄 · [파일 열기](project/compose.yaml#L7-L28)

```yaml
app:
  build: .
  ports:
    - "${APP_PORT:-3000}:3000"
  environment:
    NODE_ENV: production
    COOKIE_SECURE: "${COOKIE_SECURE:-false}" # HTTPS 뒤에서는 true
    APP_ORIGIN: "${APP_ORIGIN:-http://localhost:3000}"
    SESSION_SECRET: "${SESSION_SECRET:?SESSION_SECRET 환경변수가 필요합니다}"
    JWT_SECRET: "${JWT_SECRET:?JWT_SECRET 환경변수가 필요합니다}"
    DB_DRIVER: postgres
    DATABASE_URL: "postgres://rr7:${POSTGRES_PASSWORD:-rr7pass}@postgres:5432/board"
    OLLAMA_BASE_URL: "${OLLAMA_BASE_URL:-http://host.docker.internal:11434}"
    UPLOAD_DIR: /app/data/uploads
  extra_hosts:
    - "host.docker.internal:host-gateway"
  depends_on:
    postgres:
      condition: service_healthy
  volumes:
    - uploads:/app/data
  restart: unless-stopped
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>app:</code> | 앱 서비스. |
| 2 | <code>build: .</code> | 이 폴더의 `Dockerfile`로 이미지를 만든다. |
| 3–4 | <code>ports:</code> | `호스트:컨테이너`. `${APP_PORT:-3000}`: 환경변수가 없으면 3000. |
| 5–6 | <code>environment:</code> | 컨테이너 안의 환경변수들. |
| 7–8 | <code>COOKIE_SECURE: "${COOKIE_SECURE:-false}" # HTT…</code> | 로컬 시험에서는 `false`(HTTP), 운영(HTTPS)은 `true`. |
| 9–10 | <code>SESSION_SECRET: "${SESSION_SECRET:?SESSION_SEC…</code> | `${…:?메시지}`는 **값이 없으면 compose가 시작을 거부**하고 메시지를 보여 준다. 비밀 없이 뜨는 사고를 막는다. |
| 11 | <code>DB_DRIVER: postgres</code> | 앱의 DB를 PostgreSQL로(study11). |
| 12 | <code>DATABASE_URL: "postgres://rr7:${POSTGRES_PASSW…</code> | 호스트가 `postgres`(서비스 이름). 컨테이너 안에서 `localhost`는 자기 자신이라 안 된다. |
| 13 | <code>OLLAMA_BASE_URL: "${OLLAMA_BASE_URL:-http://ho…</code> | AI 서버는 컨테이너 밖(호스트의 Ollama)을 가리킨다. |
| 14 | <code>UPLOAD_DIR: /app/data/uploads</code> | 업로드 폴더를 볼륨 안으로. |
| 15–16 | <code>extra_hosts:</code> | `host.docker.internal`을 호스트 주소로 풀어 준다(리눅스에서도 동작하게). |
| 17–19 | <code>depends_on:</code> | DB가 **`healthy`**가 된 뒤에 앱을 시작한다(단순히 "컨테이너가 떴다"가 아니라). |
| 20–21 | <code>volumes:</code> | 데이터 볼륨. |
| 22 | <code>restart: unless-stopped</code> | 죽으면 자동 재시작(사람이 멈춘 경우 제외). |

```powershell
$env:SESSION_SECRET = (node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")
$env:JWT_SECRET     = (node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")
docker compose up -d --build                  # app + postgres
docker compose ps                             # 둘 다 (healthy)
curl.exe -s http://localhost:3000/ready       # {"status":"ready","db":"postgres"}
docker compose logs -f app                    # JSON 로그
docker compose down                           # 정지(데이터 볼륨은 유지) / 데이터까지 지우려면 down -v
```

> **이 저장소 검증 결과**: 위 명령으로 올린 컨테이너에서 `/ready` → `{"status":"ready","db":"postgres"}`, 가입 201·중복 409·글쓰기 201, 앱 재시작(`docker compose restart app`) 뒤에도 데이터 유지, 정지 시 로그에 `shutting down`(SIGTERM) 확인, 이미지 약 363MB, 실행 사용자 `node`.

### C. GitHub Actions: 자동 검증과 (조건부) 배포

- ✔ 푸시·PR마다 `midpoint`·`project` **둘 다** 타입 검사 → 테스트 → 빌드 → 요청 테스트
- ✔ **실제 DB 3종**을 서비스 컨테이너로 띄워 계약 테스트·요청 테스트
- ✔ 도커 이미지 빌드 + 컨테이너가 `/health`에 응답하는지
- ✔ 같은 브랜치에 새 푸시가 오면 이전 실행 **취소**(`concurrency`)
- ✔ 권한은 **최소**(`contents: read`), 배포 작업에만 `packages: write`
- ✔ 배포는 `DEPLOY_ENABLED=true` + `master` 푸시일 때만, `production` 환경(승인자 지정 가능)

**`.github/workflows/course.yml`** — 실제 파일 5–15줄 · [파일 열기](.github/workflows/course.yml#L5-L15)

```yaml
on:
  push:
    branches: [master, main]
  pull_request:

concurrency:
  group: course-${{ github.ref }}
  cancel-in-progress: true # 같은 브랜치에 새 푸시가 오면 이전 실행을 취소한다

permissions:
  contents: read
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>on:</code> | 언제 실행하나. |
| 2 | <code>push:</code> | 푸시할 때 |
| 3 | <code>branches: [master, main]</code> | `master`·`main` 브랜치에. |
| 4 | <code>pull_request:</code> | 그리고 PR이 열리거나 갱신될 때. |
| 6 | <code>concurrency:</code> | 같은 그룹의 실행은 겹치지 않게 한다. |
| 7 | <code>group: course-${{ github.ref }}</code> | 그룹 = 브랜치별. |
| 8 | <code>cancel-in-progress: true # 같은 브랜치에 새 푸시가 오면 이전…</code> | **새 푸시가 오면 이전 실행을 취소**한다(낡은 커밋 검증에 자원을 쓰지 않는다). |
| 10 | <code>permissions:</code> | 이 워크플로가 가질 토큰 권한. |
| 11 | <code>contents: read</code> | **읽기만**. 필요한 작업에만 따로 더 준다(최소 권한). |

**`.github/workflows/course.yml`** — 실제 파일 18–44줄 · [파일 열기](.github/workflows/course.yml#L18-L44)

```yaml
verify:
  name: ${{ matrix.app }} 검증
  runs-on: ubuntu-latest
  strategy:
    fail-fast: false
    matrix:
      app: [midpoint, project]
  defaults:
    run:
      working-directory: ${{ matrix.app }}
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 24
        cache: npm
        cache-dependency-path: ${{ matrix.app }}/package-lock.json
    - run: npm ci
    - run: npm run typecheck
    - run: npm test
    - run: npm run build
    - run: npm run test:requests
    - name: MCP·백업 시험 (project만)
      if: matrix.app == 'project'
      run: |
        npm run mcp:test
        node tools/backup-test.mjs
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1–2 | <code>verify:</code> | 첫 작업: 검증. |
| 3 | <code>runs-on: ubuntu-latest</code> | 깨끗한 리눅스 가상 머신에서 실행한다(내 PC의 우연한 상태가 없다). |
| 4 | <code>strategy:</code> | 여러 조건으로 반복. |
| 5 | <code>fail-fast: false</code> | 하나가 실패해도 **다른 것은 끝까지** 돌려 전체 상황을 본다. |
| 6 | <code>matrix:</code> | 아래 값마다 같은 단계를 한 번씩. |
| 7 | <code>app: [midpoint, project]</code> | 두 앱을 각각 검증한다. |
| 8–9 | <code>defaults:</code> | 모든 단계의 기본 설정. |
| 10 | <code>working-directory: ${{ matrix.app }}</code> | 그 앱의 폴더에서 실행. |
| 11 | <code>steps:</code> | 단계들. |
| 12 | <code>- uses: actions/checkout@v4</code> | 저장소 코드를 받는다. |
| 13–14 | <code>- uses: actions/setup-node@v4</code> | Node 24를 설치하고 |
| 15 | <code>node-version: 24</code> | 버전 고정. |
| 16 | <code>cache: npm</code> | `npm` 캐시를 저장해 다음 실행을 빠르게. |
| 17 | <code>cache-dependency-path: ${{ matrix.app }}/packa…</code> | 어느 lockfile이 바뀌면 캐시를 새로 만들지. |
| 18 | <code>- run: npm ci</code> | `package-lock.json` 그대로 설치(재현 가능). |
| 19 | <code>- run: npm run typecheck</code> | 타입 검사. |
| 20 | <code>- run: npm test</code> | 단위·컴포넌트 테스트. |
| 21 | <code>- run: npm run build</code> | 빌드. |
| 22 | <code>- run: npm run test:requests</code> | **서버를 띄워 HTTP 전체 시험.** |
| 23 | <code>- name: MCP·백업 시험 (project만)</code> | project에서만 추가 시험. |
| 24–25 | <code>if: matrix.app == 'project'</code> | 조건. |
| 26–27 | <code>npm run mcp:test</code> | MCP 서버·클라이언트. |

**`.github/workflows/course.yml`** — 실제 파일 115–121줄 · [파일 열기](.github/workflows/course.yml#L115-L121)

```yaml
deploy:
  name: 배포 (설정했을 때만)
  runs-on: ubuntu-latest
  needs: [databases, image]
  # 저장소 변수 DEPLOY_ENABLED=true 이고 master 푸시일 때만 실행한다. 설정 전에는 건너뛴다.
  if: github.event_name == 'push' && github.ref == 'refs/heads/master' && vars.DEPLOY_ENABLED == 'true'
  environment: production # 필요하면 GitHub 환경에 "승인자"를 지정해 사람이 승인해야 배포되게 한다
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1–3 | <code>deploy:</code> | 마지막 작업: 배포. |
| 4 | <code>needs: [databases, image]</code> | `databases`·`image`가 **모두 성공해야** 시작한다. |
| 5 | <code># 저장소 변수 DEPLOY_ENABLED=true 이고 master 푸시일 때만 …</code> | 주석. |
| 6 | <code>if: github.event_name == 'push' &amp;&amp; github.ref …</code> | **세 조건이 모두** 맞을 때만: 푸시이고, `master`이고, 저장소 변수 `DEPLOY_ENABLED`가 `'true'`. 설정 전에는 절대 실행되지 않는다(실수로 배포되는 사고 방지). |
| 7 | <code>environment: production # 필요하면 GitHub 환경에 "승인자…</code> | GitHub의 "환경"에 묶는다. 환경 설정에서 **승인자**를 지정하면 사람이 승인해야 이 작업이 진행된다. |

> ⚠ **검증하지 못한 것**: 이 환경에서는 GitHub Actions를 실제로 실행하지 못했습니다. 워크플로 파일의 **YAML 문법**은 파서로 확인했고, 각 단계가 실행하는 명령(`typecheck`·`test`·`build`·`test:requests`·`mcp:test`·`backup-test`·`db-e2e`·`docker build`)은 **로컬에서 모두 직접 실행해 통과**했습니다. 푸시 후 Actions 탭의 결과를 확인하세요. 배포(SSH) 작업은 서버·시크릿이 있어야 하므로 시험하지 않았습니다.

**배포를 켜는 순서**: ① 서버에 Docker 설치, `/srv/rr7`에 `compose.production.yaml`·`Caddyfile`·`.env` 준비 ② GitHub → Settings → Secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`(SSH 개인키) ③ Variables: `DEPLOY_ENABLED=true` ④ (권장) Environments → `production` → Required reviewers.

### D. 로그·모니터링

- ✔ **JSON 로그 한 줄**(요청번호·상태·시간) → 도구가 필드로 검색
- ✔ `X-Request-Id`로 한 요청을 로그·오류 응답·브라우저에서 추적
- ✔ `/health`(살아 있나) · `/ready`(손님 받을 준비: **DB 확인**) · `/metrics`(수치)
- ✔ `/metrics`는 **토큰이 있을 때만** 열림(없으면 404)
- ✔ 예상 밖 오류는 `level:"error"`로 스택과 함께 한 곳에 남음, 사용자에게는 내부 정보 없음

**`project/app/routes/ready.ts`** — 실제 파일 6–15줄 · [파일 열기](project/app/routes/ready.ts#L6-L15)

```ts
export async function loader() {
  const repo = getRepo();
  try {
    await repo.ping();
    return jsonResponse({ status: "ready", db: repo.driver });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: "readiness failed", error: String(error) }));
    return jsonResponse({ status: "unavailable", db: repo.driver }, { status: 503 });
  }
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export async function loader() {</code> | `GET /ready`. |
| 2 | <code>const repo = getRepo();</code> | 현재 저장소. |
| 3 | <code>try {</code> | DB에 물어본다. |
| 4 | <code>await repo.ping();</code> | `SELECT 1`(PostgreSQL·MariaDB), `ping` 명령(MongoDB). **연결이 끊겼으면 여기서 예외.** |
| 5 | <code>return jsonResponse({ status: "ready", db: rep…</code> | 준비됨: 200과 DB 종류. |
| 6 | <code>} catch (error) {</code> | DB를 못 부르면 |
| 7 | <code>console.error(JSON.stringify({ level: "error",…</code> | 원인을 서버 로그에(응답에는 넣지 않는다). |
| 8–10 | <code>return jsonResponse({ status: "unavailable", d…</code> | **503**. 로드밸런서·쿠버네티스는 이 인스턴스로 **트래픽을 보내지 않는다.** 죽은 것은 아니므로 재시작하지 않고 회복을 기다린다(그래서 `/health`와 분리). |

**`project/app/routes/metrics.ts`** — 실제 파일 9–24줄 · [파일 열기](project/app/routes/metrics.ts#L9-L24)

```ts
export function loader({ request }: Route.LoaderArgs) {
  const token = getConfig().METRICS_TOKEN;
  if (!token) return new Response("Not Found", { status: 404 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  }
  const extra = [
    "# TYPE jobs_total counter",
    ...Object.entries(jobStats).map(([state, n]) => `jobs_total{state="${state}"} ${n}`),
    "# TYPE realtime_subscribers gauge",
    `realtime_subscribers ${subscriberCount()}`,
  ].join("\n");
  return new Response(`${renderMetrics()}${extra}\n`, { headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" } });
}
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>export function loader({ request }: Route.Load…</code> | `GET /metrics`. |
| 2 | <code>const token = getConfig().METRICS_TOKEN;</code> | 설정된 토큰. |
| 3 | <code>if (!token) return new Response("Not Found", {…</code> | **토큰이 없으면 엔드포인트가 없는 것처럼 404.** 실수로 공개되는 것을 막는 기본값. |
| 4 | <code>const given = Buffer.from(request.headers.get(…</code> | 요청의 `Authorization` 값. |
| 5 | <code>const expected = Buffer.from(`Bearer ${token}`…</code> | 기대하는 값(`Bearer 토큰`). |
| 6–8 | <code>if (given.length !== expected.length &#124;&#124; !timin…</code> | **상수 시간 비교**로 확인하고 틀리면 401. |
| 9–14 | <code>const extra = [</code> | 작업 큐·실시간 연결 수 같은 앱 전용 수치를 더한다. |
| 15–16 | <code>return new Response(`${renderMetrics()}${extra…</code> | Prometheus 텍스트 형식으로 응답. |

```powershell
$h = @{ Authorization = "Bearer $env:METRICS_TOKEN" }
Invoke-RestMethod http://localhost:3000/metrics -Headers $h | Select-String "http_requests_total|jobs_total|realtime_subscribers"
```

**무엇에 경보를 걸까(최소 세트)**

| 신호 | 기준 예 | 뜻 |
| --- | --- | --- |
| `/ready`가 503 | 1분 이상 | DB 문제 |
| 5xx 비율 | 5분간 1% 초과 | 앱 오류 |
| `http_request_duration_ms` p95 | 평소의 3배 | 느려짐 |
| `jobs_total{state="failed"}` 증가 | 연속 | 메일·요약이 계속 실패 |
| 디스크·메모리(`process_resident_memory_bytes`) | 80% | 자원 고갈 |
| 인증서 만료 | 14일 전 | HTTPS 끊김 |

**`project/server.ts`** — 실제 파일 120–128줄 · [파일 열기](project/server.ts#L120-L128)

```ts
// ── 우아한 종료: 배포 시 SIGTERM을 받으면 새 연결을 막고 진행 중인 요청을 마친 뒤 끝낸다 ──
function shutdown(signal: string) {
  console.log(JSON.stringify({ level: "info", msg: "shutting down", signal }));
  server.close(() => process.exit(0));
  for (const ws of members.keys()) ws.close(1001, "server shutting down");
  setTimeout(() => process.exit(1), 10_000).unref(); // 10초 안에 안 끝나면 강제 종료
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>// ── 우아한 종료: 배포 시 SIGTERM을 받으면 새 연결을 막고 진행 중인…</code> | 주석: 배포 시 컨테이너 교체가 **요청을 끊지 않게** 한다. |
| 2 | <code>function shutdown(signal: string) {</code> | 종료 신호를 받으면 |
| 3 | <code>console.log(JSON.stringify({ level: "info", ms…</code> | 로그를 남기고 |
| 4 | <code>server.close(() =&gt; process.exit(0));</code> | **새 연결을 받지 않고** 진행 중인 요청이 끝나면 종료한다. |
| 5 | <code>for (const ws of members.keys()) ws.close(1001…</code> | WebSocket 연결에는 "서버가 종료 중"(1001)을 알려 클라이언트가 재연결하게 한다. |
| 6–7 | <code>setTimeout(() =&gt; process.exit(1), 10_000).unre…</code> | 10초 안에 안 끝나면 강제 종료(무한 대기 방지). `.unref()`로 이 타이머가 프로세스를 붙잡지 않는다. |
| 8 | <code>process.on("SIGTERM", () =&gt; shutdown("SIGTERM"…</code> | `docker stop`·쿠버네티스 종료가 보내는 신호. |
| 9 | <code>process.on("SIGINT", () =&gt; shutdown("SIGINT"))…</code> | 터미널의 `Ctrl+C`. |

### E. 백업과 복구

- ✔ **일관된 스냅샷**(`VACUUM INTO`)으로 백업, 파일을 그냥 복사하지 않음(WAL 때문)
- ✔ 백업 직후 **무결성 검사**(`PRAGMA integrity_check`)와 행 수 기록
- ✔ 보관 개수 정리(`--keep`)
- ✔ **복구를 실제로 해 본다**: 새 경로로 복원 → 데이터 읽기 → 덮어쓰기는 거부
- ➕ (운영) 백업을 **다른 장소**(다른 서버·객체 저장소)에도 복제
- ➕ (운영) 백업 실패 시 알림

**`project/tools/backup.mjs`** — 실제 파일 28–45줄 · [파일 열기](project/tools/backup.mjs#L28-L45)

```js
if (command === "backup") {
  if (!existsSync(dbPath)) throw new Error(`DB 파일이 없습니다: ${dbPath}`);
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = join(backupDir, `board-${stamp}.db`);
  // VACUUM INTO: 서비스가 쓰는 중에도 일관된 스냅샷 한 장을 새 파일로 만든다(파일 복사는 WAL 때문에 위험하다).
  const db = new DatabaseSync(dbPath);
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  db.close();
  const result = verify(target);
  if (!result.ok) throw new Error(`백업 검증 실패: ${result.integrity}`);
  console.log(JSON.stringify({ msg: "backup ok", file: target, bytes: statSync(target).size, ...result.rows }));

  const keep = Number(args[args.indexOf("--keep") + 1]) || 7;
  const old = readdirSync(backupDir).filter((f) => /^board-.*\.db$/.test(f)).sort().slice(0, -keep);
  for (const file of old) unlinkSync(join(backupDir, file));
  if (old.length) console.log(JSON.stringify({ msg: "pruned", removed: old.length, keep }));
} else if (command === "verify") {
```

줄 번호는 위 코드의 첫 줄을 1로 셉니다.

| 줄 | 코드 | 설명 |
| --- | --- | --- |
| 1 | <code>if (command === "backup") {</code> | `node tools/backup.mjs` — 백업 만들기. |
| 2 | <code>if (!existsSync(dbPath)) throw new Error(`DB 파…</code> | DB가 없으면 분명한 오류. |
| 3 | <code>mkdirSync(backupDir, { recursive: true });</code> | 백업 폴더. |
| 4 | <code>const stamp = new Date().toISOString().replace…</code> | 시각을 파일 이름에 넣는다(`:`와 `.`는 Windows에서 못 쓰므로 `-`로). |
| 5 | <code>const target = join(backupDir, `board-${stamp}…</code> | `board-2026-11-23T….db`. |
| 6 | <code>// VACUUM INTO: 서비스가 쓰는 중에도 일관된 스냅샷 한 장을 새 파일로…</code> | 주석: 파일 복사가 위험한 이유. |
| 7 | <code>const db = new DatabaseSync(dbPath);</code> | 원본을 연다. |
| 8 | <code>db.exec(`VACUUM INTO '${target.replace(/'/g, "…</code> | **서비스가 쓰는 도중에도 일관된 스냅샷 한 장**을 새 파일로 만든다. 경로의 `'`는 `''`로 이스케이프한다. |
| 9 | <code>db.close();</code> | 닫는다(안 닫으면 Windows에서 삭제가 막힌다). |
| 10 | <code>const result = verify(target);</code> | **만든 백업을 다시 열어** 무결성과 행 수를 확인한다. |
| 11 | <code>if (!result.ok) throw new Error(`백업 검증 실패: ${r…</code> | 깨진 백업이면 실패로 끝낸다("성공한 척"하지 않는다). |
| 12 | <code>console.log(JSON.stringify({ msg: "backup ok",…</code> | 결과를 JSON 한 줄로(로그 수집기가 읽는다). |
| 14 | <code>const keep = Number(args[args.indexOf("--keep"…</code> | 보관 개수(기본 7). |
| 15 | <code>const old = readdirSync(backupDir).filter((f) …</code> | 이름순(= 시간순)으로 오래된 것들. |
| 16 | <code>for (const file of old) unlinkSync(join(backup…</code> | 지운다. |
| 17 | <code>if (old.length) console.log(JSON.stringify({ m…</code> | 지웠으면 기록. |
| 18 | <code>} else if (command === "verify") {</code> | 이어서 `verify`·`restore` 명령. |

```powershell
cd project
$env:DATABASE_PATH = "./data/board.db"
node tools/backup.mjs --keep 7                                   # {"msg":"backup ok","file":"data/backups/board-….db","users":2,"posts":3,…}
node tools/backup.mjs verify data/backups/board-….db             # 무결성 확인
node tools/backup.mjs restore data/backups/board-….db ./data/restored/board.db   # 새 경로로 복구(덮어쓰기 거부)
node tools/backup-test.mjs                                        # 위 흐름 전체를 자동으로 시험(5개 통과)
```

PostgreSQL·MariaDB·MongoDB의 백업은 각 도구를 씁니다.

```powershell
docker compose exec -T postgres pg_dump -U rr7 -Fc board > backup.dump          # PostgreSQL
docker compose exec -T postgres pg_restore -U rr7 -d board_restore --clean backup.dump   # 복구(새 DB에)
# MariaDB: mariadb-dump / MongoDB: mongodump — 복구도 같은 도구(mariadb < dump.sql / mongorestore)
```

## ④ 🔗 연동 포인트

| 연결 | 방법 |
| --- | --- |
| **코드 → 이미지** | CI의 `image` 작업이 `Dockerfile`로 빌드해 컨테이너가 `/health`에 응답하는지까지 확인 |
| **이미지 → 서버** | `deploy` 작업이 GHCR에 `:<커밋해시>`와 `:latest`로 올리고 서버에서 `IMAGE_TAG=<해시>`로 교체 → **문제가 생기면 이전 해시로 되돌린다** |
| **서버 → HTTPS** | `compose.production.yaml`의 Caddy가 도메인 인증서를 자동 발급·갱신하고 `app:3000`으로 전달. 앱은 `TRUST_PROXY=1`, `COOKIE_SECURE=true` |
| **앱 → 모니터링** | JSON 로그(`docker logs`) · `/ready`(로드밸런서) · `/metrics`(Prometheus) |
| **DB → 백업** | SQLite는 `backup.mjs`, 서버 DB는 `pg_dump` 등을 **cron/예약 작업**으로. 결과 파일을 다른 곳에 복제 |
| **환경변수** | `.env.example`(목록) ↔ compose `environment` ↔ GitHub Secrets/Variables(값). 같은 이름을 쓴다 |

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `docker compose up`이 `SESSION_SECRET 환경변수가 필요합니다`로 거부 | 일부러 만든 **필수 변수 검사**가 작동 | 환경변수를 주고 다시(오류가 아니라 안전장치) |
| 앱이 `ECONNREFUSED postgres:5432`로 재시작 반복 | DB가 아직 준비 안 됨 | `depends_on: condition: service_healthy`와 DB 헬스체크 |
| 컨테이너 시작 직후 `Cannot find module './app/context.ts'` | Dockerfile에서 `server.ts`가 읽는 소스를 `COPY`하지 않음 | `COPY app/context.ts`·`app/lib/token.server.ts` |
| Actions의 `npm ci` 실패 `lock file out of sync` | `package.json`만 고치고 lock을 안 올림 | 로컬 `npm install` 후 lock도 커밋 |
| Actions에서만 요청 테스트 실패 | 포트·경로·환경변수가 로컬과 다름(윈도우 경로 등) | 로그의 `serverLog`를 읽고 로컬과 같은 Node 버전(24)으로 재현 |
| GHCR 푸시 `repository name must be lowercase` | 저장소 이름에 **대문자**(`My_React_Router-7_Study`) | 소문자로 바꾼 이미지 이름을 쓴다(이 워크플로의 "이미지 이름 만들기" 단계) |
| 배포 후 모든 사용자가 로그아웃 | 새 서버의 `SESSION_SECRET`이 다름 | 시크릿을 환경 간에 일관되게 관리 |
| `/metrics`가 404 | `METRICS_TOKEN` 미설정(의도) | 토큰을 설정하고 `Authorization: Bearer …` |
| 백업은 있는데 복구가 안 됨 | 복구를 한 번도 안 해 봄, 백업이 깨져 있었음 | 정기 **복구 훈련**, 백업 직후 검증(이 도구가 한다) |
| 디스크가 가득 참 | 백업·로그·이미지 누적 | `--keep`, 로그 회전(`docker` `max-size`), `docker image prune` |
| Caddy 인증서 발급 실패 | DNS 미반영, 80/443 막힘, 발급 횟수 제한 | `nslookup`, 방화벽, `caddy_data` 볼륨을 지우지 않는다 |

## ⑥ 직접 해보기

1. `docker compose up -d --build`로 앱+PostgreSQL을 올리고 `docker compose ps`가 둘 다 `healthy`가 되는 것을 본다. `docker compose stop postgres`로 DB만 멈춰 `/ready`가 **503**이 되고 `/health`는 **200**인 것을 확인한 뒤 다시 켜 회복되는 것을 본다.
2. `docker compose stop app`을 실행하며 `docker compose logs app`에 `shutting down`이 찍히고 몇 초 만에 끝나는지 잰다. 이어서 `CMD`를 `npm start`로 바꿔 보면(되돌린다) 신호가 어떻게 달라질 수 있는지 생각을 적는다.
3. 백업 → 글 몇 개 삭제 → 복구 훈련을 해 본다: `node tools/backup.mjs` 후 DB의 글을 지우고, `restore`로 **새 경로**에 복원해 앱을 그 파일로 띄워(`DATABASE_PATH` 변경) 지운 글이 되살아난 것을 확인한다.

## ⑦ ☐ 체크리스트

**Docker·compose**
- [ ] `docker compose up -d --build` 후 앱·DB가 모두 `healthy`이고 `/ready`가 `db: postgres`를 보고한다.
- [ ] 컨테이너가 `node` 사용자로 실행되고 `.env`가 이미지에 없음을 `docker history`·`docker exec … id`로 확인했다.
- [ ] 앱을 재시작해도 데이터가 남고, 정지 시 `shutting down` 로그가 찍힌다.

**CI/CD**
- [ ] 푸시 후 Actions에서 `verify`(2개 앱)·`databases`·`image`가 모두 초록이다(또는 실패 원인을 읽고 고쳤다).
- [ ] `deploy`가 `DEPLOY_ENABLED` 없이는 실행되지 않음을 이해했고, 시크릿·승인자 설정 순서를 안다.
- [ ] 이미지 태그가 커밋 해시라서 이전 버전으로 되돌릴 수 있다.

**로그·모니터링**
- [ ] JSON 로그에서 `requestId`로 한 요청을 추적했다.
- [ ] `/health`와 `/ready`의 차이, `/metrics`가 토큰 없이 닫혀 있음을 확인했다.
- [ ] 경보 최소 세트(ready 503, 5xx 비율, p95, 실패 작업, 자원, 인증서)를 말할 수 있다.

**백업**
- [ ] 백업 → 검증 → **복구 훈련**을 직접 해 봤고, 덮어쓰기를 거부함을 확인했다.
- [ ] 서버 DB용 백업 명령(`pg_dump` 등)과 "다른 장소에도 복제"가 필요한 이유를 안다.

## ⑧ 다음 단계 연결

운영 기반이 생겼으니 [study17.md](study17.md)에서 사용자 경험을 넓히는 **확장 기능**을 붙입니다: 실시간(SSE 알림, WebSocket 채팅)과 파일 처리(CSV 내보내기).
