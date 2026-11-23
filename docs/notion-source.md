# 노션 원문 (작업 기준)

작업 시작 시 [🔁 React Router 7](https://app.notion.com/p/40bd7dec5e2e81448f49d0bbc16afe06) 페이지를 가져온 본문입니다(노션 기준 마지막 편집 2026-11-01). **이 작업에서 노션을 갱신하기 전의 모습**이며, 갱신 내용은 [notion-update.md](notion-update.md)에 있습니다.

경로: `웹 기반 개인 풀스텍 공부 / 풀스택 / React Router 7`

---

> 🔁 React 풀스택 프레임워크 모드. Remix가 React Router 7로 합쳐졌다([출처](https://www.pkgpulse.com/guides/what-happened-javascript-framework-wars-2026), 2차 자료). Next.js와 목적이 같은 자리에 있다.

## 학습 목표

- [ ] React Router 7 프로젝트 생성 (framework mode)
- [ ] 파일 또는 설정 기반 라우팅, 중첩 레이아웃
- [ ] `loader`로 데이터 불러오기 (Next의 서버 컴포넌트 fetch, SvelteKit load와 같은 자리)
- [ ] `action` + `Form` 컴포넌트로 글쓰기 (Next Server Action, SvelteKit form action과 비교)
- [ ] 쿠키 세션 로그인과 보호된 라우트
- [ ] SSR과 로딩·에러 경계

## Next.js와 비교할 점

- 데이터 로딩 위치가 컴포넌트 안이 아니라 라우트 단위(loader)인 차이
- 배포 플랫폼 종속성

## 예제

게시판을 React Router 7로 만들어 Next.js 학습 노트 사이트와 같은 기능을 나란히 비교.

## 정리 영역

### 라우팅 / loader / action

### Next.js와 차이

### 오류 노트

---

## 함께 읽은 노션 페이지

| 페이지 | 쓴 곳 |
| --- | --- |
| [🧱 풀스택](https://app.notion.com/p/3d6d7dec5e2e815184c9d07c20fecb91) | 이 프레임워크의 위치("6 · React Router 7 · 노트 정리됨, 실습 전"), 권장 순서 |
| [🔧 각 프레임워크 응용하기](https://app.notion.com/p/3d6d7dec5e2e81c78362ca02fac33abc) | "같은 서비스(게시판)로 통일", 기본 서비스(가입·로그인·CRUD·검색·페이지·댓글), 조합마다 체크할 것, AI 미니 프로젝트 표 |
| [📋 미니 프로젝트 명단](https://app.notion.com/p/40bd7dec5e2e81dab88fda4b558aa498) | AI 미니 프로젝트 5개(3계층 조합), "인증이 약하다" 지적 |
| [📄 DocuForge](https://app.notion.com/p/40bd7dec5e2e818d9c91c6fb26dccc4c) | study18의 문서 요약·근거 질의응답 흐름 |
| [📡 HTTP · REST · API 설계](https://app.notion.com/p/3d6d7dec5e2e8139adbfd36dd506c65e) | **게시판 공통 API 스펙 v1**(경로·응답·오류·쿼리·인증·헤더) |
| [🟢 Nuxt.js](https://app.notion.com/p/3d6d7dec5e2e819c9d9deb98015e94b9) · [📚 Nuxt 단독 학습](https://app.notion.com/p/421d7dec5e2e817aaae5c7e9f0a057e5) | 같은 작업을 이미 마친 프레임워크의 문서 구성·노션 갱신 방식(구조만 참고, 내용은 비교·통합하지 않음) |
| [⚙️ 백엔드](https://app.notion.com/p/3d6d7dec5e2e81c39a4ac2b10dc463ca) | 공통 실습 스펙 |

## 원문 분석: 해야 할 일

| 원문 | 성격 | 처리 |
| --- | --- | --- |
| 학습 목표 6개(체크 항목) | **추가 체크 항목** | 해당 번호의 ☐ 체크리스트에 **원문 그대로**(study0 · 2·4 · 3·6 · 5 · 7 · 4·15) |
| 학습 목표 3·4번의 괄호(Next·SvelteKit) | 비교 표기 | 원문대로 넣되 **비교는 수행하지 않음** |
| `# Next.js와 비교할 점` 2개 | 비교 요구 | 요청과 충돌 → **넣지 못한 항목**으로 보고 |
| `# 예제` 게시판 + 나란히 비교 | 구현 + 비교 | 게시판 구현 ✓, 비교 제외 |
| `# 정리 영역`(라우팅/loader/action · Next.js와 차이 · 오류 노트) | 비어 있음 | 노션 갱신 시 채움(Next.js와 차이는 제외) |
