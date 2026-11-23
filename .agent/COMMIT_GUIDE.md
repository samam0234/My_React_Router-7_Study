# 커밋 가이드라인

study 문서 기반 학습 진행 내용을 커밋할 때 지켜야 할 규칙이다.

## 1. 커밋 단위

- 하나의 커밋 = 하나의 학습 진도 파트.
- **서로 다른 study 번호의 내용을 한 커밋에 섞지 않는다.** study 번호가 낮은 것부터 커밋한다(`study0` → … → `studyMidpoint` → `study11` → … → `studyFinal`).
- 문서가 생성물이므로 한 커밋에는 `tools/docs-src/studyN.md`(원본)와 그것이 만든 `studyN.md`를 **함께** 넣는다.
- 코드와 그 코드를 설명하는 문서는 같은 진도라면 같은 커밋에 넣는다.

## 2. 메시지 형식

```
<type>: <한글 설명>
```

| type | 용도 |
| --- | --- |
| feat | 새로운 기능/코드 추가 |
| fix | 버그 수정 |
| docs | study*.md 등 문서만 변경 |
| refactor | 동작 변화 없는 구조 개선 |
| chore | 설정, 의존성, 저장소 초기화 |
| test | 테스트 추가/수정 |
| style | 포맷팅 |

예: `docs: study4 라우팅과 요청 처리 학습 문서 작성`, `feat: studyMidpoint 기초 게시판 구현과 요청 시험`

## 3. 커밋 전 체크

- [ ] `node tools/build-docs.mjs --check`와 `node tools/verify-course.mjs`가 통과한다.
- [ ] 코드를 바꿨다면 해당 앱의 `typecheck`·`test`·`build`·`test:requests`가 통과한다.
- [ ] `.env`, `data/`, `build/`, `node_modules/`가 스테이징에 섞이지 않았다.
- [ ] 메시지가 `type: 한글설명` 형식이다.
