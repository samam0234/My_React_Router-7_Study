import { useRef, useState } from "react";

type Source = { index: number; text: string; score: number };
type StreamEvent =
  | { type: "sources"; sources: Source[] }
  | { type: "token"; text: string }
  | { type: "done"; citations: number[] }
  | { type: "error"; code: string; message: string };

/** NDJSON 스트림(줄마다 JSON)을 읽어 토큰이 도착하는 대로 화면에 이어 붙인다. */
export function AskPanel({ documentId }: { documentId: number }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [citations, setCitations] = useState<number[]>([]);
  const [status, setStatus] = useState<"idle" | "streaming" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    controller.current?.abort(); // 이전 질문이 아직 흐르고 있으면 끊는다
    const mine = (controller.current = new AbortController());
    setAnswer("");
    setSources([]);
    setCitations([]);
    setError("");
    setStatus("streaming");

    try {
      const response = await fetch(`/api/documents/${documentId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: mine.signal,
      });
      if (!response.ok || !response.body) {
        // 스트림이 시작되기 전의 실패는 평범한 JSON 오류다.
        const body = (await response.json().catch(() => null)) as { error?: { message?: string; fields?: Record<string, string[]> } } | null;
        throw new Error(body?.error?.fields?.question?.[0] ?? body?.error?.message ?? `요청 실패(${response.status})`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // 네트워크 조각은 줄 중간에서 끊길 수 있다. 줄바꿈이 나올 때까지 모았다가 한 줄씩 해석한다.
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          const message = JSON.parse(line) as StreamEvent;
          if (message.type === "sources") setSources(message.sources);
          else if (message.type === "token") setAnswer((prev) => prev + message.text);
          else if (message.type === "done") setCitations(message.citations);
          else if (message.type === "error") throw new Error(message.message);
        }
      }
      setStatus("done");
    } catch (caught) {
      if (mine.signal.aborted) return setStatus("idle"); // 사용자가 직접 멈춤
      setError(caught instanceof Error ? caught.message : "알 수 없는 오류");
      setStatus("error");
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={ask} className="flex gap-2">
        <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500}
          placeholder="문서 내용에 대해 질문하세요" aria-label="질문"
          className="flex-1 rounded border px-3 py-2 dark:bg-gray-900" />
        <button type="submit" disabled={status === "streaming" || !question.trim()} className="rounded bg-blue-600 px-4 text-white disabled:opacity-50">
          질문
        </button>
        {status === "streaming" ? (
          <button type="button" onClick={() => controller.current?.abort()} className="rounded border px-3">중지</button>
        ) : null}
      </form>

      {status !== "idle" ? (
        <div aria-live="polite" className="rounded bg-gray-50 p-3 dark:bg-gray-900">
          <p className="whitespace-pre-wrap">{answer}{status === "streaming" ? "▍" : ""}</p>
          {error ? <p role="alert" className="mt-2 text-sm text-red-600">{error}</p> : null}
        </div>
      ) : null}

      {sources.length > 0 ? (
        <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
          {sources.map((source) => (
            <li key={source.index} className={citations.includes(source.index) ? "font-medium text-gray-900 dark:text-gray-100" : ""}>
              [발췌 {source.index}] {source.text.slice(0, 120)}{source.text.length > 120 ? "…" : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
