# studyCoverage — 노션 요구사항 대응

원문: [React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06), [HTTP · REST · API 설계](https://app.notion.com/p/3d6d7dec5e2e8139adbfd36dd506c65e)(공통 API 스펙 v1), [풀스택](https://app.notion.com/p/3d6d7dec5e2e815184c9d07c20fecb91), [각 프레임워크 응용하기](https://app.notion.com/p/3d6d7dec5e2e81c78362ca02fac33abc), [미니 프로젝트 명단](https://app.notion.com/p/40bd7dec5e2e81dab88fda4b558aa498), [DocuForge](https://app.notion.com/p/40bd7dec5e2e818d9c91c6fb26dccc4c). 본문과 참조 페이지를 읽고 작성했습니다. **React Router 7 하나**만 다루며 다른 프레임워크의 비교·통합은 사용자 지시로 제외했습니다. 원문 전문은 [docs/notion-source.md](docs/notion-source.md).

## 노션 학습 목표 → 문서·코드

| 노션 항목 | 반영 문서 | 코드·확인 |
| --- | --- | --- |
| `[ ] React Router 7 프로젝트 생성 (framework mode)` | study0 | `create-react-router@7.18.6`, `react-router.config.ts`, 버전 확인 명령. latest가 8.x임을 명시 |
| `[ ] 파일 또는 설정 기반 라우팅, 중첩 레이아웃` | study2, study4 | `app/routes.ts`(`layout`·`route`·`prefix`·`index`·`*`), 파일 기반(`flatRoutes`)과 대응표 |
| `[ ] loader로 데이터 불러오기 (… 같은 자리)` | study3, study6 | `routes/posts/list.tsx`, `routes/home.tsx`, `services/` |
| `[ ] action + Form 컴포넌트로 글쓰기 (… 비교)` | study5 | `routes/posts/new.tsx`, `components/post-form.tsx`, `lib/form.server.ts` — **비교는 제외** |
| `[ ] 쿠키 세션 로그인과 보호된 라우트` | study7 | `session.server.ts`, `middleware/auth.server.ts`(`requireUserMiddleware`), 요청 테스트에서 302·세션 쿠키 확인 |
| `[ ] SSR과 로딩·에러 경계` | study4, study15 | `ErrorBoundary`(root·posts·documents), `useNavigation`, `Suspense`/`Await` 스트리밍 SSR(실측) |
| `# 예제`: 게시판을 React Router 7로 만들기 | studyMidpoint, studyFinal | `midpoint/`, `project/`(게시판은 구현, "나란히 비교"는 제외) |
| `## 정리 영역 › 라우팅 / loader / action` | study2~7 | 노션 페이지의 정리 영역을 채움([docs/notion-update.md](docs/notion-update.md)) |
| `## 정리 영역 › 오류 노트` | 각 문서 ⑤ | 실제로 겪은 오류를 표로 |

## 참조 페이지 → 문서·코드

| 노션 항목 | 반영 문서 | 코드·확인 |
| --- | --- | --- |
| 공통 API 스펙 v1: 경로·`data/meta`·오류·쿼리·인증·헤더 | study6, study14 | `routes/api/*`, `lib/http.server.ts`, 요청 테스트로 상태 코드·`Location`·204·`X-Request-Id`·`CORS` 확인 |
| 스펙 v1 7절 `/api-docs`(OpenAPI 3) | study14 | `project/app/openapi.ts`, `/api/openapi.json`, `/api-docs`, 검증기(swagger-parser) 시험 |
| 스펙 v1 6절 인증(Bearer, 같은 도메인은 httpOnly 쿠키) | study7 | `authMiddleware`(Bearer 우선, 쿠키 대체) |
| 조합 코스 "게시판으로 통일", 공통 서비스(가입·로그인·CRUD·검색·페이지·댓글) | studyMidpoint | `midpoint/` |
| 대표 조합 체크: SQLite가 아닌 실제 DB, 남의 글 403·비로그인 401을 테스트로, 새로고침해도 로그인 유지 | study11, study9, study7 | PostgreSQL·MariaDB·MongoDB 86개 요청 테스트, 403·401 항목, 세션 쿠키 |
| 미니 프로젝트 18+5의 "인증이 약하다" 지적 | study7, study18 | 문서 AI에 로그인·소유자 검사 추가 |
| DB 페이지의 PostgreSQL·MongoDB 실습 | study11 | 4종 드라이버, 계약 테스트, compose |
| DocuForge: 업로드 → 요약 → 근거 질문 → `(발췌 N)` | study18, studyFinal | `services/documents.server.ts`, `ai/*`, 실제 `gemma4:12b` 검증 |
| DocuForge: 형식(TXT·MD·**PDF·DOCX·PPTX**), 질문 히스토리 DB 저장, 청크 인덱스 파일 저장 | study18 | **TXT·MD만, 히스토리·인덱스 영속화는 미구현**으로 표에 명시 |
| DocuForge와의 통합 | — | **통합하지 않음**(제품 흐름만 RR7 안에서 재구성, 사용자 지시) |

## 번호별 파일

기초 study0~10, [studyMidpoint](studyMidpoint.md), 심화 study11~18, [studyFinal](studyFinal.md)의 총 21개입니다. 루트 md 이름은 `README.md`를 제외하고 모두 `study`로 시작합니다. 각 파일에 8개 공통 구성과 2~3개 직접 해보기가 있고(`node tools/verify-course.mjs`가 검사), 학습자 실행 체크는 ☐ 상태로 남겨 자동 검증 기록과 구분했습니다.

노션 학습 목표 6개가 ☐ 체크리스트에 **원문 그대로** 들어간 위치는 [README의 표](README.md)에, 자동 검사 규칙은 [tools/verify-course.mjs](tools/verify-course.mjs)에 있습니다.

## 마지막 — 번호별 체크리스트에 넣지 못한 항목

요청의 "다른 프레임워크와 비교하거나 통합하지 마"와 충돌해 다음 노션 원문 항목은 번호별 실습 체크리스트에 **넣지 않았고 수행하지 않았습니다.** 원문은 수정하지 않고 그대로 보존합니다.

- [ ] (`# Next.js와 비교할 점`) 데이터 로딩 위치가 컴포넌트 안이 아니라 라우트 단위(loader)인 차이
- [ ] (`# Next.js와 비교할 점`) 배포 플랫폼 종속성
- [ ] (`# 예제`) 게시판을 React Router 7로 만들어 Next.js 학습 노트 사이트와 같은 기능을 나란히 비교
- [ ] (`## 정리 영역 › Next.js와 차이`) — 노션에서 비어 있던 비교 정리 절

부분 반영:

- 학습 목표 3번(`loader`…**(Next의 서버 컴포넌트 fetch, SvelteKit load와 같은 자리)**)과 4번(`action` + `Form`…**(Next Server Action, SvelteKit form action과 비교)**)은 항목을 **원문 그대로** 체크리스트(study3·6, study5)에 넣었습니다. 괄호 안의 **비교는 수행하지 않았고**, 각 문서에 그 사실을 적었습니다. `loader`·`action`+`Form`의 구현과 확인은 완료했습니다.
- `# 예제`는 "게시판을 React Router 7로 만들기"까지 구현했고 "나란히 비교"만 제외했습니다.

**노션의 AI 미니 프로젝트(DocuForge) 연결**은 요청대로 study18·studyFinal에서 제품 흐름을 RR7 안에서 재구성하고 같은 점·다른 점을 표로 정리했으며, 원본 프로젝트와 통합하거나 호출하지 않았습니다.
