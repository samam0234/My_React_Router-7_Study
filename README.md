# React Router 7 단독 풀스택 학습

React Router **7.18**(framework mode)의 라우팅·`loader`/`action`·SSR·세션 인증·DB·외부 서비스·실시간·AI·MCP·운영까지를 **한 프레임워크만으로** 학습하는 저장소입니다. 노션 [React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06) 페이지의 학습 목표를 기준으로 하며, 다른 프레임워크와 비교하거나 통합하지 않습니다.

> ⚠ npm의 `latest`는 지금 React Router **8.x**입니다. 이 과정은 **7.18.6**으로 고정되어 있습니다(`package.json`의 `^7.18.6`). 새로 만들 때는 `npx create-react-router@7.18.6`을 쓰세요.

## 학습 문서 21개

기초 11개 → 중간 응용 → 심화 8개 → 심화 응용 순서입니다. 각 문서는 **① 목표 ② 📖 이론 ③ 🛠️ 실기(전체 코드와 줄별 설명) ④ 🔗 연동 포인트 ⑤ 오류 노트 ⑥ 직접 해보기 ⑦ ☐ 체크리스트 ⑧ 다음 단계 연결**의 8개 구성입니다.

| 문서 | 내용 | 코드 |
| --- | --- | --- |
| [study0](study0.md) | 환경 설정 | `midpoint/` |
| [study1](study1.md) | Hello World와 기본 문법 | `midpoint/` |
| [study2](study2.md) | 핵심 구조 | `midpoint/` |
| [study3](study3.md) | 데이터 다루기 | `midpoint/` |
| [study4](study4.md) | 라우팅과 요청 처리 | `midpoint/` |
| [study5](study5.md) | 폼·입력·검증 | `midpoint/` |
| [study6](study6.md) | DB·API 연동 | `midpoint/` |
| [study7](study7.md) | 인증·보안 기초 | `midpoint/` |
| [study8](study8.md) | 구조화·재사용 | `midpoint/` |
| [study9](study9.md) | 테스트·디버깅 | `midpoint/` |
| [study10](study10.md) | 배포·정리 | `midpoint/` |
| [studyMidpoint](studyMidpoint.md) | **기초 응용**: 게시판 서비스 | `midpoint/` |
| [study11](study11.md) | DB 확장(MariaDB·PostgreSQL·MongoDB) | `project/` |
| [study12](study12.md) | 프론트·UI 연동 | `project/` |
| [study13](study13.md) | 외부 서비스 연동 | `project/` |
| [study14](study14.md) | API 설계 | `project/` |
| [study15](study15.md) | 성능·캐시 | `project/` |
| [study16](study16.md) | 운영·CI/CD | `project/` |
| [study17](study17.md) | 실시간·확장 | `project/` |
| [study18](study18.md) | AI 연동·MCP | `project/` |
| [studyFinal](studyFinal.md) | **심화 응용**: 서비스 완성 | `project/` |

부록: [studyCoverage](studyCoverage.md)(노션 요구사항 대응표와 **반영하지 못한 항목**) · [docs/verification.md](docs/verification.md)(실행 검증 기록, **검증하지 못한 것 포함**) · [docs/references.md](docs/references.md)(공식 문서) · [docs/notion-source.md](docs/notion-source.md)(작업 기준이 된 노션 원문) · [docs/notion-update.md](docs/notion-update.md)(노션에 반영한 내용)

## 폴더

| 폴더 | 용도 |
| --- | --- |
| `midpoint/` | **기초 앱**(study0~10, studyMidpoint): 가입·로그인·글 CRUD·댓글·검색, 스펙 v1 API, Dockerfile. 의존성이 적다 |
| `project/` | **심화 앱**(study11~18, studyFinal): midpoint + 4종 DB, 외부 서비스, 문서 AI, SSE·WebSocket, MCP, OpenAPI, compose·Actions·백업 |
| `tools/` | 문서 빌더(`build-docs.mjs`)와 검증기(`verify-course.mjs`), 문서 원본(`docs-src/`) |
| `docs/` | 검증 기록·참고 링크·노션 원문 |
| `.github/workflows/` | CI(`course.yml`) |

> 루트의 `study*.md`는 **생성물**입니다. 코드를 문서에 복사해 붙이지 않고 `tools/docs-src/`의 원본이 **실제 파일을 읽어** 코드 블록과 줄별 설명 표를 만듭니다(설명이 코드의 모든 줄을 덮지 않으면 빌드가 실패합니다). 문서를 고칠 때는 원본을 고치고 `node tools/build-docs.mjs`를 실행하세요.

## 빠른 시작

요구 환경: **Node 24**, npm, Git. (심화에서는 Docker, 로컬 AI는 [Ollama](https://ollama.com)와 `gemma4:12b`)

```powershell
cd midpoint                       # 또는 project
npm ci
Copy-Item .env.example .env       # bash: cp .env.example .env
# 32자 이상 무작위 키 두 개를 만들어 SESSION_SECRET, JWT_SECRET에 넣는다
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npm run dev                       # 개발 서버 http://localhost:5173
```

```powershell
npm run typecheck                 # 타입
npm test                          # 단위·컴포넌트 테스트
npm run build
npm run test:requests             # 서버를 띄워 실제 HTTP로 검증
npm start                         # 운영 실행 (midpoint: :3000 / project: server.ts, WebSocket 포함)
```

`project/`의 추가 명령:

```powershell
docker compose up -d --build                   # 앱 + PostgreSQL
docker compose --profile databases up -d       # + MariaDB + MongoDB (DB 교체 실험)
npm run test:db                                 # 같은 요청 테스트를 DB 3종 각각에
npm run mcp:test                                # MCP 서버·클라이언트
npm run test:backup                             # 백업·복구 연습
npm run test:ai-live                            # 실제 Ollama 모델로 요약·질의응답
npm run bench                                   # 캐시·ETag 지연 측정
```

문서가 최신인지, 형식이 맞는지:

```powershell
node tools/build-docs.mjs          # tools/docs-src → study*.md 생성
node tools/verify-course.mjs       # 8개 구성·직접 해보기 2~3개·☐ 체크리스트·링크·노션 원문 반영 확인
```

## 검증 요약

실제로 실행해 확인한 결과입니다(자세한 명령과 환경은 [docs/verification.md](docs/verification.md)). Node 24.14.0, Windows 11, Docker 28.3.2 기준입니다.

| 대상 | 결과 |
| --- | --- |
| midpoint | 타입 통과 · 단위 29 · 요청(HTTP) 74 · Docker 이미지 실행·`healthy`·재시작 후 데이터 유지 |
| project | 타입 통과 · 단위 68 · 요청 86(SQLite) · **PostgreSQL 17 · MariaDB 11 · MongoDB 8에서도 각각 86** · DB 계약 20 · MCP 11 · 백업 5 · 실제 모델(`gemma4:12b`) 6 |
| 컨테이너 | compose(앱+PostgreSQL) 기동·`/ready`→`postgres`·DB 정지 시 `/ready` 503 후 자동 복구·SIGTERM 우아한 종료 |
| 문서 | 21개 모두 8개 구성·링크·코드 인용(실제 파일과 동일) 검사 통과 |

**검증하지 못한 것**: 실제 Resend·Stripe·GitHub 서버와의 통신(모의 서버로 대체), 실제 도메인·HTTPS·인증서 발급, GitHub Actions 실제 실행과 SSH 배포, 부하·보안 감사, 브라우저 화면의 시각 검수.

## 노션 원문 반영

노션 [React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06)의 **학습 목표 체크 항목 6개**는 해당 번호의 ☐ 체크리스트에 **원문 그대로** 넣었습니다.

| 노션 학습 목표(원문) | 들어간 문서 |
| --- | --- |
| React Router 7 프로젝트 생성 (framework mode) | [study0](study0.md) |
| 파일 또는 설정 기반 라우팅, 중첩 레이아웃 | [study2](study2.md), [study4](study4.md) |
| `loader`로 데이터 불러오기 (Next의 서버 컴포넌트 fetch, SvelteKit load와 같은 자리) | [study3](study3.md), [study6](study6.md) |
| `action` + `Form` 컴포넌트로 글쓰기 (Next Server Action, SvelteKit form action과 비교) | [study5](study5.md) |
| 쿠키 세션 로그인과 보호된 라우트 | [study7](study7.md) |
| SSR과 로딩·에러 경계 | [study4](study4.md), [study15](study15.md) |

### 번호별 체크리스트에 넣지 못한 노션 원문 항목

요청의 "다른 프레임워크와 비교하거나 통합하지 마"와 충돌해 **수행하지 않은** 원문 항목입니다. 원문은 수정하지 않고 그대로 보존합니다.

- [ ] (`# Next.js와 비교할 점`) 데이터 로딩 위치가 컴포넌트 안이 아니라 라우트 단위(loader)인 차이
- [ ] (`# Next.js와 비교할 점`) 배포 플랫폼 종속성
- [ ] (`# 예제`) 게시판을 React Router 7로 만들어 Next.js 학습 노트 사이트와 같은 기능을 나란히 비교
- [ ] (`## 정리 영역 › Next.js와 차이`) 비교 정리 — 노션에서 비어 있던 절이며 작성하지 않았습니다

또한 위 표의 3번·4번 항목 **끝의 괄호**(Next·SvelteKit과 같은 자리/비교)는 노션 표기 그대로 체크리스트에 넣었으나, 그 **비교 자체는 수행하지 않았습니다.** `loader`와 `action`+`Form`의 구현·확인은 했습니다. `# 예제`의 **"게시판을 React Router 7로 만들기"**는 [midpoint](studyMidpoint.md)와 [project](studyFinal.md)로 구현했고, "Next.js 학습 노트 사이트와 나란히 비교"만 제외했습니다.

학습자 체크리스트(☐)는 **직접 재현한 뒤** 체크하도록 비워 두었습니다. 위 "검증 요약"은 작성자가 실행한 자동 검증의 기록이며, 학습자의 체크를 대신하지 않습니다.
