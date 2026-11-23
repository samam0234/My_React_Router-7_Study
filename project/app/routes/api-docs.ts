// GET /api-docs — Swagger UI(사람이 읽고 직접 호출해 보는 화면). 스펙은 /api/openapi.json 을 읽는다.
// 화면 자원은 CDN에서 가져온다. 사내망처럼 외부 접속이 막힌 곳에서는 swagger-ui-dist를 직접 호스팅한다.
const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>RR7 게시판 API 문서</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>SwaggerUIBundle({ url: "/api/openapi.json", dom_id: "#ui", persistAuthorization: true });</script>
</body>
</html>`;

export function loader() {
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
