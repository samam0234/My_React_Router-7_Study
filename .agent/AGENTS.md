# 에이전트 공통 가이드라인 (인수인계 문서)

## 현재 기준 (2026-11-23)

- 이 저장소는 **React Router 7 단독** 과정이다. 다른 프레임워크와 비교하거나 통합하지 않는다(노션의 Next.js 비교 항목은 의도적으로 제외, `studyCoverage.md` 참고).
- React Router는 **7.18.6**으로 고정한다. npm `latest`는 8.x이므로 새 설치는 `@7.18.6`처럼 버전을 명시한다.
- 진도: `study0~10` → `studyMidpoint` → `study11~18` → `studyFinal`. **루트의 md는 `README.md`를 빼고 모두 `study`로 시작한다.**
- 코드는 TypeScript 단일본이다. `midpoint/`(기초, study0~10·Midpoint)와 `project/`(심화, study11~18·Final)는 **서로 독립된 npm 프로젝트**다.
- 노션은 코드·MD·검증이 모두 끝난 **뒤에** 갱신한다. 반영 내용은 `docs/notion-update.md`, 원문은 `docs/notion-source.md`.

## 문서는 생성물이다

- 루트의 `study*.md`는 `tools/docs-src/*.md`를 `node tools/build-docs.mjs`가 변환한 결과다. **루트 파일을 직접 고치지 말고 원본을 고친 뒤 다시 생성한다.**
- 원본의 `@@code <경로> from=/정규식/ to=/정규식/` 블록은 **실제 파일을 읽어** 코드와 줄별 설명 표를 만든다. 설명 줄은 `` `앵커 문자열` | 설명 `` 형식이며, 코드의 비어 있지 않은 모든 줄이 어떤 설명의 범위에 들어가야 빌드가 통과한다.
- 코드를 고치면 `node tools/build-docs.mjs`(앵커가 어긋나면 실패)와 `node tools/verify-course.mjs`(8개 구성·직접 해보기 2~3개·☐ 체크리스트·링크·노션 원문 반영)를 실행한다.
- 학습자 체크리스트(☐)는 `[x]`로 채우지 않는다. 작성자의 자동 검증은 `docs/verification.md`에 따로 적는다.

## 작업 전 확인

- 코드를 고쳤으면 두 앱에서 `npm run typecheck`, `npm test`, `npm run build`, `npm run test:requests`를 실행한다(project는 `mcp:test`·`test:backup`도). DB를 건드렸다면 `docker compose --profile databases up -d` 후 계약 테스트와 `node tools/db-e2e.mjs`.
- **확인하지 않은 것을 완료로 쓰지 않는다.** 실제 외부 서비스·도메인·GitHub Actions 실행은 이 환경에서 검증하지 못했다(`docs/verification.md`의 "검증하지 못한 것").
- 문서의 PowerShell 명령을 바꿀 때는 **Windows PowerShell 5.1**에서 실제로 실행해 본다: 공백이 든 JSON 인자·한글 인자·큰따옴표 포함 헤더가 깨진다(표준 입력 `--data-binary "@-"`, ASCII 예시, 이스케이프).
- Git Bash에서 `docker run -e X=/경로`는 경로가 변환된다 → `MSYS_NO_PATHCONV=1`.
- `.env`·`data/`·`build/`·`node_modules/`는 커밋하지 않는다(`.gitignore`). 비밀값을 문서·로그·이미지에 넣지 않는다.

## 구조 규칙

- 의존성 방향: `routes → services → db(repo)`, `routes/components → lib`. 서비스가 라우트를 import하지 않는다.
- `*.server.ts`는 서버 번들 전용(비밀·DB·파일). 브라우저가 쓰는 코드(`lib/schemas.ts`, `lib/format.ts`)에는 비밀·DB를 넣지 않는다.
- 환경변수는 `app/config.server.ts` 한 곳에서만 읽는다. 새 변수는 스키마와 `.env.example`을 함께 고친다.
- API 응답 모양은 노션의 **공통 API 스펙 v1**(`data`/`meta`/`error`, 7절 `Content-Type: application/json; charset=utf-8`)을 따른다. JSON 응답은 `jsonResponse`/`ok`/`errorResponse`만 쓴다(`Response.json` 직접 사용 금지).
- 서비스 함수는 `repo`를 마지막 인자로 받아 테스트에서 가짜를 주입할 수 있게 한다.

## 커밋 규칙

[COMMIT_GUIDE.md](./COMMIT_GUIDE.md)를 따른다. 문서·커밋 설명은 한글, 커밋 타입·코드·식별자·파일명은 영어.

## 인수인계

- 작업을 마치면 변경 내용, 검증 결과, **검증하지 못한 것**, 다음 후보를 남긴다.
- 불확실한 결정은 추측하지 말고 노션 [React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06)과 `studyCoverage.md`를 근거로 삼는다.
