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

@@code project/Dockerfile from=/^# 3단계/ to=/^CMD/
`# 3단계` | 주석: 최종 실행 이미지.
`FROM node:24-alpine` | 깨끗한 새 이미지에서 시작(앞 단계의 도구가 들어오지 않는다).
`ENV NODE_ENV=production` | 운영 모드와 기본 포트. `WORKDIR`·`COPY package.json`이 이어진다.
`COPY --from=prod-deps` | **운영 의존성만**(개발 도구 없음).
`COPY --from=build` | 빌드 결과만.
`# server.ts가` | 주석: 이 앱은 `server.ts`(WebSocket 포함)를 직접 실행한다.
`COPY server.ts` | 서버 진입 파일.
`COPY app/context.ts` | `server.ts`가 직접 import하는 두 소스 중 하나(접속자 주소 키).
`COPY app/lib/token.server.ts` | 둘째(WebSocket 티켓 검증). **둘 다 없으면 컨테이너가 시작하지 못한다.**
`COPY mcp` | MCP 서버(study18).
`RUN mkdir -p /app/data` | 데이터·업로드 폴더를 만들고 `node` 소유로.
`USER node` | **root 포기.**
`EXPOSE 3000` | 문서용 포트 표시.
`VOLUME ["/app/data"]` | 데이터 볼륨.
`HEALTHCHECK` | 15초마다 `/health`.
`# SIGTERM을` | 주석: `npm start`를 거치지 않는 이유.
`CMD ["node",` | 종료 신호를 앱이 **직접** 받는다.
@@end

### B. compose: 앱 + PostgreSQL

- ✔ 앱이 DB가 **준비된 뒤** 시작(`depends_on: condition: service_healthy`)
- ✔ 필수 비밀이 없으면 **시작 거부**(`${VAR:?메시지}`)
- ✔ `restart: unless-stopped`
- ✔ DB 접속 주소에 **서비스 이름**(`postgres`)을 호스트로 사용

@@code project/compose.yaml from=/^  app:/ to=/^    restart: unless-stopped/
`app:` | 앱 서비스.
`build: .` | 이 폴더의 `Dockerfile`로 이미지를 만든다.
`ports:` | `호스트:컨테이너`. `${APP_PORT:-3000}`: 환경변수가 없으면 3000.
`environment:` | 컨테이너 안의 환경변수들.
`COOKIE_SECURE:` | 로컬 시험에서는 `false`(HTTP), 운영(HTTPS)은 `true`.
`SESSION_SECRET:` | `${…:?메시지}`는 **값이 없으면 compose가 시작을 거부**하고 메시지를 보여 준다. 비밀 없이 뜨는 사고를 막는다.
`DB_DRIVER: postgres` | 앱의 DB를 PostgreSQL로(study11).
`DATABASE_URL:` | 호스트가 `postgres`(서비스 이름). 컨테이너 안에서 `localhost`는 자기 자신이라 안 된다.
`OLLAMA_BASE_URL:` | AI 서버는 컨테이너 밖(호스트의 Ollama)을 가리킨다.
`UPLOAD_DIR:` | 업로드 폴더를 볼륨 안으로.
`extra_hosts:` | `host.docker.internal`을 호스트 주소로 풀어 준다(리눅스에서도 동작하게).
`depends_on:` | DB가 **`healthy`**가 된 뒤에 앱을 시작한다(단순히 "컨테이너가 떴다"가 아니라).
`volumes:` | 데이터 볼륨.
`restart: unless-stopped` | 죽으면 자동 재시작(사람이 멈춘 경우 제외).
@@end

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

@@code .github/workflows/course.yml from=/^on:/ to=/^  contents: read/
`on:` | 언제 실행하나.
`push:` | 푸시할 때
`branches: [master, main]` | `master`·`main` 브랜치에.
`pull_request:` | 그리고 PR이 열리거나 갱신될 때.
`concurrency:` | 같은 그룹의 실행은 겹치지 않게 한다.
`group: course-` | 그룹 = 브랜치별.
`cancel-in-progress: true` | **새 푸시가 오면 이전 실행을 취소**한다(낡은 커밋 검증에 자원을 쓰지 않는다).
`permissions:` | 이 워크플로가 가질 토큰 권한.
`contents: read` | **읽기만**. 필요한 작업에만 따로 더 준다(최소 권한).
@@end

@@code .github/workflows/course.yml from=/^  verify:/ to=/node tools\/backup-test.mjs/
`verify:` | 첫 작업: 검증.
`runs-on: ubuntu-latest` | 깨끗한 리눅스 가상 머신에서 실행한다(내 PC의 우연한 상태가 없다).
`strategy:` | 여러 조건으로 반복.
`fail-fast: false` | 하나가 실패해도 **다른 것은 끝까지** 돌려 전체 상황을 본다.
`matrix:` | 아래 값마다 같은 단계를 한 번씩.
`app: [midpoint, project]` | 두 앱을 각각 검증한다.
`defaults:` | 모든 단계의 기본 설정.
`working-directory:` | 그 앱의 폴더에서 실행.
`steps:` | 단계들.
`actions/checkout` | 저장소 코드를 받는다.
`actions/setup-node` | Node 24를 설치하고
`node-version: 24` | 버전 고정.
`cache: npm` | `npm` 캐시를 저장해 다음 실행을 빠르게.
`cache-dependency-path` | 어느 lockfile이 바뀌면 캐시를 새로 만들지.
`run: npm ci` | `package-lock.json` 그대로 설치(재현 가능).
`npm run typecheck` | 타입 검사.
`run: npm test` | 단위·컴포넌트 테스트.
`run: npm run build` | 빌드.
`npm run test:requests` | **서버를 띄워 HTTP 전체 시험.**
`MCP·백업` | project에서만 추가 시험.
`if: matrix.app == 'project'` | 조건.
`npm run mcp:test` | MCP 서버·클라이언트.
@@end

@@code .github/workflows/course.yml from=/^  deploy:/ to=/^    environment: production/
`deploy:` | 마지막 작업: 배포.
`needs:` | `databases`·`image`가 **모두 성공해야** 시작한다.
`# 저장소 변수` | 주석.
`if: github.event_name == 'push'` | **세 조건이 모두** 맞을 때만: 푸시이고, `master`이고, 저장소 변수 `DEPLOY_ENABLED`가 `'true'`. 설정 전에는 절대 실행되지 않는다(실수로 배포되는 사고 방지).
`environment: production` | GitHub의 "환경"에 묶는다. 환경 설정에서 **승인자**를 지정하면 사람이 승인해야 이 작업이 진행된다.
@@end

> ⚠ **검증하지 못한 것**: 이 환경에서는 GitHub Actions를 실제로 실행하지 못했습니다. 워크플로 파일의 **YAML 문법**은 파서로 확인했고, 각 단계가 실행하는 명령(`typecheck`·`test`·`build`·`test:requests`·`mcp:test`·`backup-test`·`db-e2e`·`docker build`)은 **로컬에서 모두 직접 실행해 통과**했습니다. 푸시 후 Actions 탭의 결과를 확인하세요. 배포(SSH) 작업은 서버·시크릿이 있어야 하므로 시험하지 않았습니다.

**배포를 켜는 순서**: ① 서버에 Docker 설치, `/srv/rr7`에 `compose.production.yaml`·`Caddyfile`·`.env` 준비 ② GitHub → Settings → Secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`(SSH 개인키) ③ Variables: `DEPLOY_ENABLED=true` ④ (권장) Environments → `production` → Required reviewers.

### D. 로그·모니터링

- ✔ **JSON 로그 한 줄**(요청번호·상태·시간) → 도구가 필드로 검색
- ✔ `X-Request-Id`로 한 요청을 로그·오류 응답·브라우저에서 추적
- ✔ `/health`(살아 있나) · `/ready`(손님 받을 준비: **DB 확인**) · `/metrics`(수치)
- ✔ `/metrics`는 **토큰이 있을 때만** 열림(없으면 404)
- ✔ 예상 밖 오류는 `level:"error"`로 스택과 함께 한 곳에 남음, 사용자에게는 내부 정보 없음

@@code project/app/routes/ready.ts from=/^export async function loader/ to=/^\}/
`export async function loader` | `GET /ready`.
`const repo = getRepo()` | 현재 저장소.
`try {` | DB에 물어본다.
`await repo.ping()` | `SELECT 1`(PostgreSQL·MariaDB), `ping` 명령(MongoDB). **연결이 끊겼으면 여기서 예외.**
`return jsonResponse({ status: "ready"` | 준비됨: 200과 DB 종류.
`} catch (error) {` | DB를 못 부르면
`console.error(` | 원인을 서버 로그에(응답에는 넣지 않는다).
`return jsonResponse({ status: "unavailable"` | **503**. 로드밸런서·쿠버네티스는 이 인스턴스로 **트래픽을 보내지 않는다.** 죽은 것은 아니므로 재시작하지 않고 회복을 기다린다(그래서 `/health`와 분리).
@@end

@@code project/app/routes/metrics.ts from=/^export function loader/ to=/^\}/
`export function loader` | `GET /metrics`.
`const token = getConfig().METRICS_TOKEN` | 설정된 토큰.
`if (!token) return new Response("Not Found"` | **토큰이 없으면 엔드포인트가 없는 것처럼 404.** 실수로 공개되는 것을 막는 기본값.
`const given = Buffer.from(` | 요청의 `Authorization` 값.
`const expected = Buffer.from(` | 기대하는 값(`Bearer 토큰`).
`if (given.length !== expected.length` | **상수 시간 비교**로 확인하고 틀리면 401.
`const extra = [` | 작업 큐·실시간 연결 수 같은 앱 전용 수치를 더한다.
`return new Response(` | Prometheus 텍스트 형식으로 응답.
@@end

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

@@code project/server.ts from=/^\/\/ ── 우아한 종료/ to=/^process\.on\("SIGINT"/
`// ── 우아한 종료` | 주석: 배포 시 컨테이너 교체가 **요청을 끊지 않게** 한다.
`function shutdown` | 종료 신호를 받으면
`console.log(JSON.stringify({ level: "info", msg: "shutting down"` | 로그를 남기고
`server.close(` | **새 연결을 받지 않고** 진행 중인 요청이 끝나면 종료한다.
`for (const ws of members.keys())` | WebSocket 연결에는 "서버가 종료 중"(1001)을 알려 클라이언트가 재연결하게 한다.
`setTimeout(() => process.exit(1), 10_000)` | 10초 안에 안 끝나면 강제 종료(무한 대기 방지). `.unref()`로 이 타이머가 프로세스를 붙잡지 않는다.
`process.on("SIGTERM"` | `docker stop`·쿠버네티스 종료가 보내는 신호.
`process.on("SIGINT"` | 터미널의 `Ctrl+C`.
@@end

### E. 백업과 복구

- ✔ **일관된 스냅샷**(`VACUUM INTO`)으로 백업, 파일을 그냥 복사하지 않음(WAL 때문)
- ✔ 백업 직후 **무결성 검사**(`PRAGMA integrity_check`)와 행 수 기록
- ✔ 보관 개수 정리(`--keep`)
- ✔ **복구를 실제로 해 본다**: 새 경로로 복원 → 데이터 읽기 → 덮어쓰기는 거부
- ➕ (운영) 백업을 **다른 장소**(다른 서버·객체 저장소)에도 복제
- ➕ (운영) 백업 실패 시 알림

@@code project/tools/backup.mjs from=/^if \(command === "backup"\)/ to=/^\} else if \(command === "verify"\)/
`if (command === "backup")` | `node tools/backup.mjs` — 백업 만들기.
`if (!existsSync(dbPath))` | DB가 없으면 분명한 오류.
`mkdirSync(backupDir` | 백업 폴더.
`const stamp =` | 시각을 파일 이름에 넣는다(`:`와 `.`는 Windows에서 못 쓰므로 `-`로).
`const target =` | `board-2026-11-23T….db`.
`// VACUUM INTO` | 주석: 파일 복사가 위험한 이유.
`const db = new DatabaseSync(dbPath)` | 원본을 연다.
`INTO '${target.replace` | **서비스가 쓰는 도중에도 일관된 스냅샷 한 장**을 새 파일로 만든다. 경로의 `'`는 `''`로 이스케이프한다.
`db.close()` | 닫는다(안 닫으면 Windows에서 삭제가 막힌다).
`const result = verify(target)` | **만든 백업을 다시 열어** 무결성과 행 수를 확인한다.
`if (!result.ok) throw` | 깨진 백업이면 실패로 끝낸다("성공한 척"하지 않는다).
`console.log(JSON.stringify({ msg: "backup ok"` | 결과를 JSON 한 줄로(로그 수집기가 읽는다).
`const keep =` | 보관 개수(기본 7).
`const old =` | 이름순(= 시간순)으로 오래된 것들.
`for (const file of old)` | 지운다.
`if (old.length)` | 지웠으면 기록.
`} else if (command === "verify")` | 이어서 `verify`·`restore` 명령.
@@end

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
