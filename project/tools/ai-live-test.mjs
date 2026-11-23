// 실제 Ollama 모델로 요약·질의응답 스트림을 확인한다(모의 서버 아님). 모델이 내려받아져 있고 Ollama가 실행 중이어야 한다.
// 사용: npm run build && npm run test:ai-live      (모델은 AI_MODEL, 주소는 OLLAMA_BASE_URL로 바꾼다)
import { check, client, startApp, stopApp, summary, waitFor } from "./lib/harness.mjs";

const base = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const model = process.env.AI_MODEL ?? "gemma4:12b";
try {
  const tags = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) }).then((r) => r.json());
  if (!tags.models.some((m) => m.name === model)) throw new Error(`모델 ${model}이(가) 없습니다. ollama pull ${model}`);
} catch (error) {
  console.log(`SKIP  Ollama를 사용할 수 없어 건너뜁니다: ${error.message ?? error}`);
  process.exit(0);
}

const app = await startApp({ OLLAMA_BASE_URL: base, AI_MODEL: model });
const { call, signup } = client(app.base);
try {
  const user = await signup("live@example.com", "live");
  const content =
    "React Router 7의 loader는 서버에서 실행되어 화면에 필요한 데이터를 미리 읽어 옵니다.\n\n" +
    "action은 폼이 제출될 때 실행되어 데이터를 저장하거나 바꿉니다. 처리가 끝나면 loader가 자동으로 다시 실행됩니다.\n\n" +
    "로그인 상태는 서명된 쿠키 세션에 담아 유지하며, 보호된 라우트는 middleware에서 확인합니다.";
  const doc = await call("POST", "/api/documents", { token: user.token, body: { title: "RR7 요약 노트", content } });
  const started = Date.now();
  const ready = await waitFor(async () => (await call("GET", `/api/documents/${doc.body.data.id}`, { token: user.token })).body.data.summaryStatus !== "pending", { timeout: 120_000, interval: 1000 });
  const done = (await call("GET", `/api/documents/${doc.body.data.id}`, { token: user.token })).body.data;
  console.log(`      요약(${((Date.now() - started) / 1000).toFixed(1)}초): ${done.summary}`);
  check(`실제 모델(${model}) 요약 생성`, ready && done.summaryStatus === "ready" && done.summary.length > 20);
  check("요약이 한국어", /[가-힣]/.test(done.summary));

  const ask = async (question) => {
    const t0 = Date.now();
    const res = await fetch(`${app.base}/api/documents/${doc.body.data.id}/ask`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${user.token}` }, body: JSON.stringify({ question }) });
    const events = [];
    let buffer = "";
    const decoder = new TextDecoder();
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) events.push({ ms: Date.now() - t0, ...JSON.parse(line) });
      }
    }
    return events;
  };

  const events = await ask("action은 언제 실행되나요?");
  const tokens = events.filter((e) => e.type === "token");
  const answer = tokens.map((t) => t.text).join("");
  console.log(`      답변: ${answer}`);
  console.log(`      첫 토큰 ${tokens[0]?.ms}ms, 마지막 ${tokens.at(-1)?.ms}ms, 토큰 ${tokens.length}개, 인용 ${JSON.stringify(events.at(-1)?.citations)}`);
  check("실제 모델 스트리밍: 토큰이 여러 번에 걸쳐 도착", tokens.length >= 5 && tokens.at(-1).ms > tokens[0].ms);
  check("답변이 문서 근거를 반영(폼 제출/저장)", /폼|제출|저장|바꿉/.test(answer));
  check("done 이벤트와 인용 번호 목록", events.at(-1)?.type === "done" && Array.isArray(events.at(-1).citations));

  const none = await ask("zzzqqq 전혀무관한 질문");
  check("근거 없는 질문은 모델 없이 즉시 '찾을 수 없습니다'", none.some((e) => e.type === "token" && e.text.includes("찾을 수 없습니다")) && none.at(-1).ms < 500);
} catch (error) {
  check("라이브 시험 중 예외 없음", false, String(error?.stack ?? error));
} finally {
  await stopApp(app);
}
process.exit(summary() ? 1 : 0);
