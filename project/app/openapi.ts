// OpenAPI 3.1 문서. 코드와 문서가 어긋나지 않게 테스트가 이 객체를 검증기에 넣어 본다.
type Json = Record<string, unknown>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const body = (schema: Json, required = true) => ({ required, content: { "application/json": { schema } } });
const okJson = (description: string, schema: Json) => ({ description, content: { "application/json": { schema } } });
const data = (schema: Json) => ({ type: "object", required: ["data"], properties: { data: schema } });
const problem = (description: string) => ({ description, content: { "application/json": { schema: ref("Error") } } });

const ERRORS = {
  "400": problem("검증 실패(VALIDATION_ERROR) 또는 잘못된 요청(BAD_REQUEST)"),
  "401": problem("인증 필요(UNAUTHORIZED) 또는 로그인 실패(INVALID_CREDENTIALS)"),
  "403": problem("권한 없음(FORBIDDEN)"),
  "404": problem("없는 자원(NOT_FOUND)"),
  "409": problem("중복(EMAIL_TAKEN)"),
  "429": problem("호출 제한 초과(RATE_LIMITED). Retry-After 헤더 참고"),
} as const;
const errors = (...codes: (keyof typeof ERRORS)[]) => Object.fromEntries(codes.map((c) => [c, ERRORS[c]]));

const secured = [{ bearerAuth: [] }, { cookieAuth: [] }];
const idParam = (name: string) => ({ name, in: "path", required: true, schema: { type: "integer", minimum: 1 } });

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "RR7 게시판 API",
    version: "1.0.0",
    description:
      "게시판 공통 API 스펙 v1. 경로는 `/api`(별칭 `/api/v1`)로 접근한다. 성공은 `{data, meta?}`, 오류는 `{error:{code,message,fields?,requestId}}`.",
  },
  servers: [{ url: "/api", description: "같은 출처" }],
  tags: [{ name: "auth" }, { name: "posts" }, { name: "comments" }, { name: "documents" }, { name: "extras" }],
  paths: {
    "/auth/signup": {
      post: {
        tags: ["auth"], summary: "회원가입", operationId: "signup",
        requestBody: body(ref("SignupInput")),
        responses: { "201": okJson("가입 완료", data(ref("User"))), ...errors("400", "409", "429") },
      },
    },
    "/auth/login": {
      post: {
        tags: ["auth"], summary: "로그인(액세스 토큰 발급)", operationId: "login",
        requestBody: body(ref("LoginInput")),
        responses: {
          "200": okJson("로그인 성공", data({ type: "object", required: ["user", "accessToken"], properties: { user: ref("User"), accessToken: { type: "string" } } })),
          ...errors("400", "401", "429"),
        },
      },
    },
    "/auth/logout": {
      post: { tags: ["auth"], summary: "로그아웃(쿠키 삭제)", operationId: "logout", security: secured, responses: { "204": { description: "완료" }, ...errors("401") } },
    },
    "/auth/me": {
      get: { tags: ["auth"], summary: "내 정보", operationId: "me", security: secured, responses: { "200": okJson("내 정보", data(ref("User"))), ...errors("401") } },
    },
    "/posts": {
      get: {
        tags: ["posts"], summary: "글 목록(검색·정렬·페이지)", operationId: "listPosts",
        parameters: [
          { name: "q", in: "query", schema: { type: "string", maxLength: 100 }, description: "제목·본문 부분 일치(대소문자 무시)" },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 10 }, description: "50 초과는 50으로 보정" },
          { name: "sort", in: "query", schema: { type: "string", enum: ["createdAt", "-createdAt", "-commentCount"], default: "-createdAt" } },
        ],
        responses: {
          "200": {
            description: "목록. `ETag`와 `Link`(first/prev/next/last), `X-Total-Count` 헤더를 함께 준다. `If-None-Match`가 같으면 304.",
            content: { "application/json": { schema: { type: "object", required: ["data", "meta"], properties: { data: { type: "array", items: ref("PostSummary") }, meta: ref("Meta") } } } },
          },
          "304": { description: "바뀌지 않음" },
        },
      },
      post: {
        tags: ["posts"], summary: "글 작성", operationId: "createPost", security: secured,
        requestBody: body(ref("PostInput")),
        responses: {
          "201": { description: "작성됨. `Location: /api/posts/{id}`", content: { "application/json": { schema: data(ref("Post")) } } },
          ...errors("400", "401"),
        },
      },
    },
    "/posts/{postId}": {
      parameters: [idParam("postId")],
      get: { tags: ["posts"], summary: "글 상세", operationId: "getPost", responses: { "200": okJson("상세", data(ref("Post"))), ...errors("400", "404") } },
      patch: {
        tags: ["posts"], summary: "글 부분 수정(작성자만)", operationId: "patchPost", security: secured,
        requestBody: body(ref("PostPatch")),
        responses: { "200": okJson("수정됨", data(ref("Post"))), ...errors("400", "401", "403", "404") },
      },
      delete: { tags: ["posts"], summary: "글 삭제(작성자만)", operationId: "deletePost", security: secured, responses: { "204": { description: "삭제됨" }, ...errors("401", "403", "404") } },
    },
    "/posts/{postId}/comments": {
      parameters: [idParam("postId")],
      get: { tags: ["comments"], summary: "댓글 목록", operationId: "listComments", responses: { "200": okJson("목록", data({ type: "array", items: ref("Comment") })), ...errors("404") } },
      post: {
        tags: ["comments"], summary: "댓글 작성", operationId: "createComment", security: secured,
        requestBody: body(ref("CommentInput")),
        responses: { "201": okJson("작성됨", data(ref("Comment"))), ...errors("400", "401", "404") },
      },
    },
    "/comments/{commentId}": {
      parameters: [idParam("commentId")],
      delete: { tags: ["comments"], summary: "댓글 삭제(작성자만)", operationId: "deleteComment", security: secured, responses: { "204": { description: "삭제됨" }, ...errors("401", "403", "404") } },
    },
    "/documents": {
      get: { tags: ["documents"], summary: "내 문서 목록", operationId: "listDocuments", security: secured, responses: { "200": okJson("목록", data({ type: "array", items: ref("Document") })), ...errors("401") } },
      post: {
        tags: ["documents"], summary: "문서 올리기(요약은 뒤에서 자동 시작)", operationId: "createDocument", security: secured,
        requestBody: body(ref("DocumentInput")),
        responses: { "201": okJson("생성됨. summaryStatus는 pending", data(ref("Document"))), ...errors("400", "401") },
      },
    },
    "/documents/{documentId}": {
      parameters: [idParam("documentId")],
      get: { tags: ["documents"], summary: "문서 상세(요약 포함)", operationId: "getDocument", security: secured, responses: { "200": okJson("상세", data(ref("Document"))), ...errors("401", "403", "404") } },
      delete: { tags: ["documents"], summary: "문서 삭제", operationId: "deleteDocument", security: secured, responses: { "204": { description: "삭제됨" }, ...errors("401", "403", "404") } },
    },
    "/documents/{documentId}/summarize": {
      parameters: [idParam("documentId")],
      post: { tags: ["documents"], summary: "요약 다시 만들기", operationId: "summarizeDocument", security: secured, responses: { "202": { description: "작업을 접수함(완료 여부는 문서의 summaryStatus로 확인)" }, ...errors("401", "403", "404") } },
    },
    "/documents/{documentId}/ask": {
      parameters: [idParam("documentId")],
      post: {
        tags: ["documents"], summary: "문서 근거 질의응답(NDJSON 스트림)", operationId: "askDocument", security: secured,
        requestBody: body({ type: "object", required: ["question"], properties: { question: { type: "string", minLength: 1, maxLength: 500 } } }),
        responses: {
          "200": { description: "줄마다 JSON: `{type:'sources'|'token'|'done'|'error', ...}`", content: { "application/x-ndjson": { schema: { type: "string" } } } },
          ...errors("400", "401", "403", "404"),
        },
      },
    },
    "/uploads": {
      post: {
        tags: ["extras"], summary: "파일 업로드(PNG·JPEG·WEBP·PDF)", operationId: "upload", security: secured,
        requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" } } } } } },
        responses: {
          "201": okJson("저장됨", data({ type: "object", properties: { name: { type: "string" }, url: { type: "string" }, size: { type: "integer" }, contentType: { type: "string" } } })),
          "413": problem("크기 초과(PAYLOAD_TOO_LARGE)"),
          ...errors("400", "401"),
        },
      },
    },
    "/contact": {
      post: {
        tags: ["extras"], summary: "문의 보내기", operationId: "contact",
        requestBody: body({ type: "object", required: ["name", "email", "message"], properties: { name: { type: "string" }, email: { type: "string", format: "email" }, message: { type: "string" } } }),
        responses: { "202": okJson("접수됨", data({ type: "object", properties: { received: { type: "boolean" } } })), ...errors("400", "429") },
      },
    },
    "/events": {
      get: { tags: ["extras"], summary: "실시간 알림(Server-Sent Events)", operationId: "events", responses: { "200": { description: "text/event-stream", content: { "text/event-stream": { schema: { type: "string" } } } } } },
    },
    "/export/posts.csv": {
      get: { tags: ["extras"], summary: "글 전체 CSV 내려받기(스트리밍)", operationId: "exportPosts", responses: { "200": { description: "text/csv", content: { "text/csv": { schema: { type: "string" } } } } } },
    },
    "/payments/checkout": {
      post: { tags: ["extras"], summary: "Stripe 결제 세션 만들기", operationId: "checkout", security: secured, responses: { "201": okJson("세션", data({ type: "object", properties: { id: { type: "string" }, url: { type: "string" } } })), "503": problem("결제 미설정"), ...errors("401") } },
    },
    "/payments/webhook": {
      post: { tags: ["extras"], summary: "Stripe 웹훅(서명 검증)", operationId: "stripeWebhook", responses: { "200": { description: "처리함" }, "400": problem("서명이 올바르지 않음") } },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      cookieAuth: { type: "apiKey", in: "cookie", name: "__rr7_board" },
    },
    schemas: {
      Error: {
        type: "object", required: ["error"],
        properties: {
          error: {
            type: "object", required: ["code", "message", "requestId"],
            properties: {
              code: { type: "string", examples: ["VALIDATION_ERROR"] },
              message: { type: "string" },
              fields: { type: "object", additionalProperties: { type: "array", items: { type: "string" } } },
              requestId: { type: "string", description: "응답 헤더 X-Request-Id와 같은 값" },
            },
          },
        },
      },
      User: { type: "object", required: ["id", "email", "nickname"], properties: { id: { type: "integer" }, email: { type: "string", format: "email" }, nickname: { type: "string" } } },
      Author: { type: "object", required: ["id", "nickname"], properties: { id: { type: "integer" }, nickname: { type: "string" } } },
      SignupInput: { type: "object", required: ["email", "password", "nickname"], properties: { email: { type: "string", format: "email" }, password: { type: "string", minLength: 8, maxLength: 72 }, nickname: { type: "string", minLength: 2, maxLength: 20 } } },
      LoginInput: { type: "object", required: ["email", "password"], properties: { email: { type: "string", format: "email" }, password: { type: "string" } } },
      PostInput: { type: "object", required: ["title", "body"], properties: { title: { type: "string", minLength: 1, maxLength: 200 }, body: { type: "string", minLength: 1, maxLength: 10000 }, tags: { type: "array", maxItems: 5, items: { type: "string", maxLength: 30 } } } },
      PostPatch: { type: "object", minProperties: 1, properties: { title: { type: "string" }, body: { type: "string" }, tags: { type: "array", items: { type: "string" } } } },
      PostSummary: {
        type: "object", required: ["id", "title", "tags", "author", "commentCount", "createdAt", "updatedAt"],
        properties: { id: { type: "integer" }, title: { type: "string" }, tags: { type: "array", items: { type: "string" } }, author: ref("Author"), commentCount: { type: "integer" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } },
      },
      Post: { allOf: [ref("PostSummary"), { type: "object", required: ["body"], properties: { body: { type: "string" } } }] },
      Meta: { type: "object", required: ["page", "limit", "total", "totalPages"], properties: { page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" }, totalPages: { type: "integer" }, q: { type: "string" } } },
      CommentInput: { type: "object", required: ["body"], properties: { body: { type: "string", minLength: 1, maxLength: 1000 } } },
      Comment: { type: "object", required: ["id", "postId", "body", "author", "createdAt"], properties: { id: { type: "integer" }, postId: { type: "integer" }, body: { type: "string" }, author: ref("Author"), createdAt: { type: "string", format: "date-time" } } },
      DocumentInput: { type: "object", required: ["title", "content"], properties: { title: { type: "string", maxLength: 200 }, content: { type: "string", maxLength: 200000 } } },
      Document: {
        type: "object", required: ["id", "title", "summaryStatus", "createdAt"],
        properties: { id: { type: "integer" }, title: { type: "string" }, summary: { type: ["string", "null"] }, summaryStatus: { type: "string", enum: ["pending", "ready", "failed"] }, byteSize: { type: "integer" }, createdAt: { type: "string", format: "date-time" } },
      },
    },
  },
} as const;
