import { index, layout, prefix, route, type RouteConfig } from "@react-router/dev/routes";

// 설정 기반 라우팅: URL과 파일의 대응을 이 한 파일에서 읽을 수 있다.
export default [
  route("health", "routes/health.ts"),

  // 리소스 라우트: default export가 없는 파일은 HTML 대신 JSON을 돌려준다.
  ...prefix("api", [
    route("auth/signup", "routes/api/auth-signup.ts"),
    route("auth/login", "routes/api/auth-login.ts"),
    route("auth/logout", "routes/api/auth-logout.ts"),
    route("auth/me", "routes/api/auth-me.ts"),
    route("posts", "routes/api/posts.ts"),
    route("posts/:postId", "routes/api/post.ts"),
    route("posts/:postId/comments", "routes/api/post-comments.ts"),
    route("comments/:commentId", "routes/api/comment.ts"),
    route("*", "routes/api/not-found.ts"),
  ]),

  index("routes/home.tsx"),

  // 경로가 없는 레이아웃: URL은 그대로 /login, /signup인데 같은 카드 틀을 공유한다.
  layout("routes/auth-layout.tsx", [
    route("login", "routes/login.tsx"),
    route("signup", "routes/signup.tsx"),
  ]),
  route("logout", "routes/logout.ts"),

  // 경로가 있는 레이아웃: /posts 아래 모든 화면이 같은 제목과 오류 경계를 쓴다.
  route("posts", "routes/posts/layout.tsx", [
    index("routes/posts/list.tsx"),
    route("new", "routes/posts/new.tsx"),
    route(":postId", "routes/posts/detail.tsx"),
    route(":postId/edit", "routes/posts/edit.tsx"),
  ]),

  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
