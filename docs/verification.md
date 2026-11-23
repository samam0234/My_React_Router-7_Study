# 검증 기록

이 저장소의 코드·문서를 **실제로 실행해** 확인한 결과입니다. 확인하지 않은 것은 마지막 절에 따로 적었고, 확인하지 못한 것을 완료로 표시하지 않았습니다.

## 환경

| 항목 | 값 |
| --- | --- |
| OS | Windows 11 Home (10.0.26200) |
| Node / npm | 24.14.0 / 11.9.0 |
| React Router | **7.18.6**(`react-router`, `@react-router/{dev,serve,express}`) — npm `latest`는 8.5.2 |
| 주요 패키지 | react 19.3.1 · vite 8.3.8 · vitest 5.1.1 · typescript 5.9.3 · zod 4.6.7 · tailwindcss 4.3.5 · express 5.3.0 · ws 8.23.0 · zustand 5.1.0 · react-hook-form 7.92.0 · `@modelcontextprotocol/sdk` 1.32.2 |
| DB 드라이버 | pg 8.23.1 · mariadb 3.5.5 · mongodb 7.9.1 · `node:sqlite`(SQLite 3.51.2) |
| Docker | 28.3.2. 이미지: `postgres:17-alpine`(17.12) · `mariadb:11`(11.8.9) · `mongo:8`(8.3.17) · `node:24-alpine` |
| AI | Ollama(로컬), 모델 `gemma4:12b` |
| git | 2.47.1 |

## 결과 요약

| # | 대상 | 명령 | 결과 |
| --- | --- | --- | --- |
| 1 | midpoint 타입 | `npm run typecheck` | 통과 |
| 2 | midpoint 단위·컴포넌트 | `npm test` | **29 통과**(7개 파일) |
| 3 | midpoint 요청(HTTP) | `npm run build && npm run test:requests` | **74/74** |
| 4 | midpoint Docker | `docker build` → `run` → `restart` | 빌드 성공, `/health` 200, 가입 201·재가입 409, **재시작 후 409(데이터 유지)**, `healthy`, 사용자 `node`, 이미지 307MB, 정지 0.5초 |
| 5 | project 타입 | `npm run typecheck` | 통과 |
| 6 | project 단위·컴포넌트 | `npm test` | **68 통과**, 15 건너뜀(DB 주소가 없을 때의 계약 테스트) |
| 7 | project 요청(HTTP, SQLite) | `npm run build && npm run test:requests` | **86/86** |
| 8 | DB 계약 4종 | `TEST_*_URL=… vitest run tests/repo-contract.test.ts` | **20/20**(5개 시험 × SQLite·PostgreSQL·MariaDB·MongoDB) |
| 9 | DB 교체 E2E | `node tools/db-e2e.mjs` | 요청 테스트 **86/86를 PostgreSQL 17·MariaDB 11·MongoDB 8 각각** 새 데이터베이스로 통과 |
| 10 | MCP | `npm run mcp:test` | **11/11** |
| 11 | 백업·복구 | `node tools/backup-test.mjs` | **5/5** |
| 12 | 실제 AI 모델 | `node tools/ai-live-test.mjs` | **6/6**(`gemma4:12b`: 요약 15.1초, 첫 토큰 190ms, 16토큰, 인용 `[1]`) |
| 13 | compose(앱+PostgreSQL) | `docker compose up -d --build` | 둘 다 `healthy`, `/ready`→`{"status":"ready","db":"postgres"}`, 가입 201·409·글쓰기 201, **앱 재시작 후 데이터 유지**, SIGTERM 로그 `shutting down`, 이미지 363MB |
| 14 | 준비 상태 | DB 컨테이너만 정지/시작 | `/health` 200 유지, `/ready` **503** → 시작 후 자동 **200** |
| 15 | 성능 측정 | `node tools/bench.mjs`(글 5000개) | 서버 안 p50: 캐시 미스 0.80ms → 적중 0.20ms, 304 본문 0바이트(200은 9,069바이트), 검색 p50 9.61ms |
| 16 | 스트리밍 SSR | 브라우저 UA vs 봇 UA | 브라우저: 첫 조각 5ms, 느린 데이터(0.8초) 같은 응답에 도착(gzip 포함). 봇: 모든 조각 약 800ms에 한꺼번에 |
| 17 | 운영 compose·Caddyfile | `docker compose -f compose.production.yaml config`, `caddy validate` | **문법만** 통과 |
| 18 | GitHub Actions 워크플로 | Python `yaml.safe_load` | **YAML 문법만** 통과 |
| 19 | 문서 | `node tools/verify-course.mjs` | 21개 문서 형식·링크·노션 원문 반영·코드 인용 일치 통과 |
| 20 | 참고 링크 | `curl`로 28개 확인 | 27개 200, 1개(404)는 제외 |

## 요청 테스트가 포함하는 것(project, 86개)

헬스·준비·메트릭(토큰)·OpenAPI·`/api-docs`, 보안 헤더·`Server-Timing`·`X-Request-Id`, 가입·로그인·중복·검증·토큰 위조, 글 CRUD·권한·보정·`ETag`/304·`Link`·`X-Total-Count`·`/api/v1` 별칭, 업로드(PNG·가짜 파일·한도·경로 조작), CSV(BOM·인젝션·이스케이프·100건 넘김), 문의→메일 큐, 결제 세션·웹훅 서명 4가지, GitHub OAuth(`state`·코드·세션), 문서 AI(생성·요약 큐·스트림·인용·근거 없음·중단 전파·MD 업로드·UTF-8 검증), SSE(자기 글 알림·브로드캐스트·자기 댓글 미알림), WebSocket(티켓·Origin·접속자 수·채팅·오류·2KB 초과), 스트리밍 SSR, 레이트리밋(429·`Retry-After`·화면 폼).

## 검증 중 발견해 고친 문제

| 문제 | 발견 경로 | 조치 |
| --- | --- | --- |
| WebSocket 큰 메시지에 **서버 프로세스가 종료** | project 요청 테스트(처음 75/78) | `ws.on("error")` 추가 |
| 문서 질문이 "찾을 수 없습니다"만 | 중단 전파 시험을 진단하다 | 토크나이저가 영문+한글 조사를 한 덩어리로 봄 → 문자 종류(스크립트)에서 먼저 끊도록 수정, 단위 테스트 추가 |
| `/posts/abc`가 500 | study4 작성 중 | `routeError`로 404 변환, 요청 테스트 고정(midpoint 74·project 86) |
| 백업 CLI에서 `--keep`만 주면 실패 | 백업 테스트 | 옵션으로 시작하면 `backup`으로 해석 |
| 스트리밍 시험이 한꺼번에 도착 | 스트리밍 시험 | 원인: Node 기본 UA를 `isbot`이 봇으로 분류(설계대로). 시험에 브라우저 UA 사용, 문서에 기록 |
| 컨테이너 가입 500 | midpoint Docker 시험 | 원인: Git Bash의 경로 자동 변환(`MSYS_NO_PATHCONV=1`). 앱 버그 아님 |
| 검증 테스트의 BOM 검사 | CSV 시험 | `Response.text()`가 BOM을 제거 → 원시 바이트로 검사 |
| 백업 테스트의 임시 폴더 삭제 `EPERM`(Windows) | 백업 테스트 | 열린 DB를 먼저 닫고 지우기 |
| 워크플로의 GHCR 이미지 이름 대문자 | 워크플로 검토 | 소문자 변환 단계 추가 |
| JSON 응답에 `charset=utf-8`이 없어 한글이 `ì²« ê¸`로 보임(스펙 v1 7절 위반) | 문서의 명령을 PowerShell로 직접 실행해 보다가 | 모든 JSON 응답이 거치는 `jsonResponse`로 통일, 요청 테스트에 헤더 검사 추가(midpoint 74·project 86) |
| 문서의 `curl.exe` 예제가 PowerShell 5.1에서 400 | 문서 속 명령을 실제로 실행(스모크 테스트) | **공백이 든 JSON 인자**는 5.1이 `\"`를 잘못 전달 → 표준 입력(`--data-binary "@-"`)·파일(`@body.json`)로 변경, 한글 인자는 ASCII 예시로 |
| 문서의 ETag/304 예제가 항상 200 | 같은 스모크 테스트 | ETag 값의 큰따옴표가 인자 전달 중 사라짐 → `Replace('"','\"')`로 이스케이프 |
| 문서의 스트리밍 확인 명령이 HTML 전체를 출력 | 같은 스모크 테스트 | `-o NUL -w`로 시간만 출력(브라우저 UA 첫 바이트 38ms vs 봇 UA 848ms) |
| 검증기가 코드 블록 안의 `](...args)`를 깨진 링크로 오탐 | 문서 검증 | 코드 블록·인라인 코드를 제외하고 링크 검사 |

## 검증하지 못한 것

다음은 이 환경에서 **실행하지 않았거나 할 수 없어** 완료로 표시하지 않았습니다.

- **실제 외부 서비스**: Resend·Stripe·GitHub와의 실제 통신(자격증명 필요). 호출 형식·재시도·서명·`state` 로직은 **로컬 모의 서버**로만 확인했습니다.
- **실제 도메인·HTTPS**: Caddy 인증서 발급, HSTS 동작, 프록시 뒤 `TRUST_PROXY` 동작.
- **GitHub Actions 실제 실행**과 GHCR 푸시, SSH 배포. 워크플로가 실행하는 각 명령은 로컬에서 직접 실행해 통과했습니다.
- **다른 DB로의 데이터 이전**, 대용량·복제·운영 튜닝, 동시 마이그레이션.
- **여러 서버**에서의 캐시·실시간 허브 일관성(구현은 단일 프로세스).
- **부하 시험**, 침투 시험·보안 감사, 접근성 전수 검사, 브라우저 화면의 **시각 검수**(자동화된 DOM·요청 확인만 했습니다).
- **PDF·DOCX·PPTX** 문서 추출, 질문 히스토리 저장(구현하지 않음).
- 실제 모델의 **답변 품질**(통과 기준은 구조·스트리밍·인용 형식이며, 모델 출력은 비결정적이라 문장 일치로 검증하지 않았습니다).
- 학습자 체크리스트(☐)는 **학습자가 직접 재현**해 체크합니다. 위 결과는 작성자의 자동 검증입니다.
- **Git Bash에서의 `npm test`(project)**: 이 검증 세션의 Git Bash에서는 project의 vitest가 전 파일 `Vitest failed to find the current suite`로 실패했고(같은 명령이 PowerShell에서는 11개 파일 68개 통과·15개 건너뜀), `--pool=vmForks`에서는 통과했습니다. 원인은 규명하지 못했고(코드·의존성 문제는 아님), 이 문서의 결과는 **PowerShell 기준**입니다. midpoint는 두 셸 모두 통과했습니다.

## 재현

```powershell
# midpoint
cd midpoint; npm ci; npm run typecheck; npm test; npm run build; npm run test:requests
# project
cd ../project; npm ci; npm run typecheck; npm test; npm run build; npm run test:requests; npm run mcp:test; npm run test:backup
# DB 3종(Docker 필요)
$env:SESSION_SECRET="x"; $env:JWT_SECRET="y"
docker compose --profile databases up -d postgres mariadb mongo
$env:TEST_POSTGRES_URL="postgres://rr7:rr7pass@localhost:15432/board"; $env:TEST_MARIADB_URL="mariadb://root:rr7pass@localhost:13306/board"; $env:TEST_MONGO_URL="mongodb://localhost:27018/board_test"
npx vitest run tests/repo-contract.test.ts; npm run test:db
# 실제 AI(Ollama + gemma4:12b)
npm run test:ai-live
# 문서
cd ..; node tools/build-docs.mjs --check; node tools/verify-course.mjs
```
