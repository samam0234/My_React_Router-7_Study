import { getConfig } from "~/config.server";
import { AppError } from "~/lib/errors";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const unavailable = (cause?: unknown) =>
  new AppError(503, "AI_UNAVAILABLE", `AI 모델에 연결할 수 없습니다. Ollama가 실행 중인지 확인하세요.${cause ? ` (${String(cause)})` : ""}`);

/**
 * Ollama /api/chat 을 스트리밍으로 호출하고 조각(token)을 하나씩 내보낸다.
 * 응답은 줄마다 JSON인 NDJSON이다: {"message":{"content":"안"},"done":false} …
 * signal을 넘기면 사용자가 요청을 끊을 때 모델 생성도 멈춘다.
 */
export async function* chatStream(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
  const config = getConfig();
  let response: Response;
  try {
    response = await fetch(`${config.OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.AI_MODEL,
        messages,
        stream: true,
        think: false, // 추론 과정(thinking)만 생성되고 본문이 비는 일을 막는다.
        options: { temperature: 0.2, num_predict: 700 },
      }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
    });
  } catch (error) {
    if (signal?.aborted) return;
    throw unavailable(error);
  }
  if (!response.ok || !response.body) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new AppError(502, "AI_ERROR", `AI 모델 오류(${response.status}) ${detail}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // 한 줄이 완성될 때까지 모아 둔다. 네트워크 조각이 줄 중간에서 끊길 수 있다.
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const chunk = JSON.parse(line) as { message?: { content?: string }; error?: string; done?: boolean };
        if (chunk.error) throw new AppError(502, "AI_ERROR", chunk.error);
        if (chunk.message?.content) yield chunk.message.content;
        if (chunk.done) return;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

/** 스트림을 끝까지 모아 한 문자열로 돌려준다(요약처럼 한꺼번에 필요할 때). */
export async function chat(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
  let text = "";
  for await (const piece of chatStream(messages, signal)) text += piece;
  return text.trim();
}
