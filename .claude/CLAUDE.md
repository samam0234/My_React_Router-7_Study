# Claude 작업 가이드

이 저장소의 공통 규칙은 [.agent/AGENTS.md](../.agent/AGENTS.md)와 [.agent/COMMIT_GUIDE.md](../.agent/COMMIT_GUIDE.md)에 있다. 먼저 읽는다.

핵심만 다시 적는다.

- **React Router 7(7.18.6) 단독 과정**이다. 다른 프레임워크와 비교·통합하지 않는다.
- 루트 `study*.md`는 `tools/docs-src/`에서 생성된다. 직접 고치지 말고 원본을 고친 뒤 `node tools/build-docs.mjs` → `node tools/verify-course.mjs`.
- 코드를 바꾸면 `midpoint/`·`project/`의 `typecheck`·`test`·`build`·`test:requests`로 확인하고, 확인하지 못한 것은 완료로 쓰지 않는다.
- 문서의 PowerShell 명령은 Windows PowerShell 5.1에서 실제로 실행해 본다.
- 커밋 메시지는 `type: 한글설명`.
