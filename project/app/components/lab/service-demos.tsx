import { useRef, useState } from "react";

/** 파일 업로드: FormData로 보내면 브라우저가 multipart 경계(boundary)가 포함된 Content-Type을 알아서 붙인다. */
export function UploadDemo({ loggedIn }: { loggedIn: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ url?: string; error?: string }>({});
  const [busy, setBusy] = useState(false);

  async function upload() {
    const file = input.current?.files?.[0];
    if (!file) return setResult({ error: "파일을 고르세요." });
    setBusy(true);
    const body = new FormData();
    body.set("file", file);
    // Content-Type을 직접 쓰지 않는다. 직접 쓰면 boundary가 빠져 서버가 본문을 읽지 못한다.
    const response = await fetch("/api/uploads", { method: "POST", body });
    const json = (await response.json()) as { data?: { url: string }; error?: { message: string; fields?: Record<string, string[]> } };
    setResult(response.ok ? { url: json.data!.url } : { error: json.error?.fields?.file?.[0] ?? json.error?.message });
    setBusy(false);
  }

  if (!loggedIn) return <p className="text-sm text-gray-500">로그인하면 파일을 올릴 수 있습니다.</p>;
  return (
    <div className="space-y-2">
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" aria-label="업로드할 파일" />
      <button type="button" onClick={upload} disabled={busy} className="rounded border px-3 py-1 disabled:opacity-50">
        {busy ? "올리는 중…" : "올리기"}
      </button>
      {result.error ? <p role="alert" className="text-sm text-red-600">{result.error}</p> : null}
      {result.url ? (
        <p role="status" className="text-sm">
          저장됨: <a className="text-blue-600 underline" href={result.url} target="_blank" rel="noreferrer">{result.url}</a>
        </p>
      ) : null}
    </div>
  );
}

/** 결제: 서버가 만든 Stripe 결제 화면 주소로 브라우저를 이동시킨다. 카드 정보는 우리 서버를 거치지 않는다. */
export function CheckoutDemo({ loggedIn, paid }: { loggedIn: boolean; paid: string | null }) {
  const [error, setError] = useState("");
  async function pay() {
    setError("");
    const response = await fetch("/api/payments/checkout", { method: "POST" });
    const json = (await response.json()) as { data?: { url: string }; error?: { message: string } };
    if (response.ok) window.location.assign(json.data!.url);
    else setError(json.error?.message ?? "결제를 시작하지 못했습니다.");
  }
  return (
    <div className="space-y-2">
      {paid === "1" ? <p role="status" className="text-sm text-green-700">결제 화면에서 돌아왔습니다(완료 확정은 웹훅이 합니다).</p> : null}
      {paid === "0" ? <p role="status" className="text-sm">결제를 취소했습니다.</p> : null}
      <button type="button" disabled={!loggedIn} onClick={pay} className="rounded border px-3 py-1 disabled:opacity-50">
        테스트 결제 시작
      </button>
      {!loggedIn ? <span className="ml-2 text-sm text-gray-500">로그인 필요</span> : null}
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

/** 실시간: 로그인 사용자에게 1회용 "티켓"을 받아 WebSocket에 연결한다. 연결 요청에는 헤더를 붙일 수 없기 때문이다. */
export function ChatDemo({ loggedIn }: { loggedIn: boolean }) {
  const socket = useRef<WebSocket | null>(null);
  const [state, setState] = useState<"closed" | "connecting" | "open">("closed");
  const [lines, setLines] = useState<string[]>([]);
  const [text, setText] = useState("");
  const push = (line: string) => setLines((prev) => [...prev.slice(-19), line]);

  async function connect() {
    setState("connecting");
    const response = await fetch("/api/auth/ws-ticket", { method: "POST" });
    if (!response.ok) return setState("closed");
    const { data } = (await response.json()) as { data: { ticket: string } };
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${scheme}://${location.host}/ws?ticket=${encodeURIComponent(data.ticket)}`);
    socket.current = ws;
    ws.onopen = () => setState("open");
    ws.onclose = () => {
      setState("closed");
      push("— 연결이 끊겼습니다 —");
    };
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as { type: string; from?: string; text?: string; count?: number };
      if (message.type === "chat") push(`${message.from}: ${message.text}`);
      if (message.type === "presence") push(`· 접속자 ${message.count}명`);
    };
  }

  function send(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim() || socket.current?.readyState !== WebSocket.OPEN) return;
    socket.current.send(JSON.stringify({ type: "chat", text }));
    setText("");
  }

  if (!loggedIn) return <p className="text-sm text-gray-500">로그인하면 채팅에 참여할 수 있습니다.</p>;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button type="button" onClick={connect} disabled={state !== "closed"} className="rounded border px-3 py-1 disabled:opacity-50">
          {state === "open" ? "연결됨" : state === "connecting" ? "연결 중…" : "채팅 연결"}
        </button>
        <button type="button" onClick={() => socket.current?.close()} disabled={state !== "open"} className="rounded border px-3 py-1 disabled:opacity-50">
          끊기
        </button>
      </div>
      <ul aria-label="채팅 기록" className="h-28 overflow-y-auto rounded border p-2 text-sm">
        {lines.map((line, i) => <li key={i}>{line}</li>)}
      </ul>
      <form onSubmit={send} className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} aria-label="메시지" maxLength={500} className="flex-1 rounded border px-2 py-1 dark:bg-gray-900" />
        <button type="submit" disabled={state !== "open"} className="rounded border px-3 py-1 disabled:opacity-50">보내기</button>
      </form>
    </div>
  );
}
