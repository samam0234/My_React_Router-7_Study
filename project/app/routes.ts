import { index, layout, prefix, route, type RouteConfig } from "@react-router/dev/routes";

/**
 * API 라우트 묶음. 같은 파일을 /api 와 /api/v1 두 곳에 마운트한다.
 * 같은 파일을 두 번 쓰면 라우트 id가 겹치므로, 버전 쪽에는 id를 직접 붙인다.
 */
const apiRoutes = (idPrefix: string) => {
  const r = (path: string, file: string) =>
    idPrefix ? route(path, `routes/api/${file}`, { id: `${idPrefix}${file}` }) : route(path, `routes/api/${file}`);
  return [
    r("auth/signup", "auth-signup.ts"),
    r("auth/login", "auth-login.ts"),
    r("auth/logout", "auth-logout.ts"),
    r("auth/me", "auth-me.ts"),
    r("auth/ws-ticket", "auth-ws-ticket.ts"),
    r("posts", "posts.ts"),
    r("posts/:postId", "post.ts"),
    r("posts/:postId/comments", "post-comments.ts"),
    r("comments/:commentId", "comment.ts"),
    r("documents", "documents.ts"),
    r("documents/:documentId", "document.ts"),
    r("documents/:documentId/summarize", "document-summarize.ts"),
    r("documents/:documentId/ask", "document-ask.ts"),
    r("uploads", "uploads.ts"),
    r("contact", "contact.ts"),
    r("events", "events.ts"),
    r("export/posts.csv", "export-posts-csv.ts"),
    r("payments/checkout", "payments-checkout.ts"),
    r("payments/webhook", "payments-webhook.ts"),
    r("openapi.json", "openapi.ts"),
    r("*", "not-found.ts"), // 맨 마지막: 어떤 라우트와도 맞지 않는 /api 주소는 JSON 404
  ];
};

export default [
  // 운영용 리소스 라우트
  route("health", "routes/health.ts"),
  route("ready", "routes/ready.ts"),
  route("metrics", "routes/metrics.ts"),
  route("api-docs", "routes/api-docs.ts"),
  route("uploads/:name", "routes/uploads-file.ts"),

  // 소셜 로그인(GitHub OAuth)
  route("auth/github", "routes/auth-github.ts"),
  route("auth/github/callback", "routes/auth-github-callback.ts"),

  // 공통 API 스펙 v1: /api (최신 별칭)와 /api/v1 (버전 고정)
  ...prefix("api", apiRoutes("")),
  ...prefix("api/v1", apiRoutes("v1-")),

  index("routes/home.tsx"),
  route("lab", "routes/lab.tsx"),

  layout("routes/auth-layout.tsx", [route("login", "routes/login.tsx"), route("signup", "routes/signup.tsx")]),
  route("logout", "routes/logout.ts"),

  route("posts", "routes/posts/layout.tsx", [
    index("routes/posts/list.tsx"),
    route("new", "routes/posts/new.tsx"),
    route(":postId", "routes/posts/detail.tsx"),
    route(":postId/edit", "routes/posts/edit.tsx"),
  ]),

  route("documents", "routes/documents/layout.tsx", [
    index("routes/documents/list.tsx"),
    route(":documentId", "routes/documents/detail.tsx"),
  ]),

  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
