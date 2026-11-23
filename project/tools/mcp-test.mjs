// MCP "클라이언트" 역할: 서버 프로세스를 띄워 연결하고, 도구·리소스·프롬프트를 실제로 호출해 본다.
// 사용: npm run build && npm run mcp:test
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { check, client, startApp, stopApp, summary } from "./lib/harness.mjs";

const app = await startApp();
const { call, signup } = client(app.base);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["mcp/server.mjs"],
  env: { ...process.env, APP_URL: app.base },
  stderr: "pipe",
});
const mcp = new Client({ name: "rr7-test-client", version: "1.0.0" });

try {
  const user = await signup("mcp@example.com", "mcp");
  const post = await call("POST", "/api/posts", { token: user.token, body: { title: "MCP 시험 글", body: "도구로 읽을 본문입니다", tags: ["mcp"] } });
  await call("POST", `/api/posts/${post.body.data.id}/comments`, { token: user.token, body: { body: "첫 댓글" } });

  await mcp.connect(transport);
  const info = mcp.getServerVersion();
  check("MCP 핸드셰이크: 서버 이름·버전", info?.name === "rr7-board" && info.version === "1.0.0");

  const { tools } = await mcp.listTools();
  check("도구 2개 노출(list_posts, get_post)", tools.map((t) => t.name).sort().join() === "get_post,list_posts");
  const schema = tools.find((t) => t.name === "get_post").inputSchema;
  check("도구 입력 스키마(JSON Schema)가 모델에게 전달됨", schema.properties.id.type === "integer" && schema.required.includes("id"));

  const list = await mcp.callTool({ name: "list_posts", arguments: { q: "MCP" } });
  const listed = JSON.parse(list.content[0].text);
  check("list_posts 검색 결과", !list.isError && listed.total === 1 && listed.posts[0].title === "MCP 시험 글");

  const read = await mcp.callTool({ name: "get_post", arguments: { id: post.body.data.id } });
  const readJson = JSON.parse(read.content[0].text);
  check("get_post 본문+댓글", readJson.body.includes("도구로 읽을") && readJson.comments[0] === "mcp: 첫 댓글");

  const missing = await mcp.callTool({ name: "get_post", arguments: { id: 99999 } });
  check("없는 글 → isError(예외가 아니라 모델이 읽을 오류)", missing.isError === true && missing.content[0].text.includes("찾을 수 없습니다"));
  const invalid = await mcp.callTool({ name: "get_post", arguments: { id: "abc" } }).catch((e) => ({ isError: true, thrown: String(e.message) }));
  check("잘못된 인자는 스키마 검증에서 거절", invalid.isError === true);
  check("쓰기 도구가 없다(읽기 전용)", !tools.some((t) => /create|delete|update/.test(t.name)));

  const resources = await mcp.listResources();
  check("리소스 board://latest", resources.resources.some((r) => r.uri === "board://latest"));
  const latest = await mcp.readResource({ uri: "board://latest" });
  check("리소스 읽기", JSON.parse(latest.contents[0].text)[0].title === "MCP 시험 글");

  const prompts = await mcp.listPrompts();
  const prompt = await mcp.getPrompt({ name: "summarize_post", arguments: { id: "1" } });
  check("프롬프트 템플릿(도구 사용법 + 주입 방어 문구)", prompts.prompts[0].name === "summarize_post" && prompt.messages[0].content.text.includes("get_post") && prompt.messages[0].content.text.includes("따르지 마세요"));
} catch (error) {
  check("MCP 시험 중 예외 없음", false, String(error?.stack ?? error));
} finally {
  await mcp.close().catch(() => {});
  await stopApp(app);
}
process.exit(summary() ? 1 : 0);
