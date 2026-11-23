import { useEffect } from "react";
import { useRevalidator } from "react-router";
import { useUiStore } from "~/stores/ui";

/** 로그인한 동안 /api/events(SSE)에 연결해 알림이 오면 토스트를 띄우고 안 읽은 수를 올린다. */
export function NotificationsListener({ enabled }: { enabled: boolean }) {
  const pushToast = useUiStore((s) => s.pushToast);
  const bump = useUiStore((s) => s.bump);
  const revalidator = useRevalidator();

  useEffect(() => {
    if (!enabled) return;
    // EventSource는 끊기면 서버가 알려 준 retry(3초) 뒤에 알아서 다시 연결한다.
    const source = new EventSource("/api/events");
    source.addEventListener("comment.created", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { from: string; postTitle: string };
      pushToast(`${data.from}님이 "${data.postTitle}"에 댓글을 남겼습니다.`);
      bump();
      void revalidator.revalidate(); // 화면의 댓글 수도 새로 읽는다
    });
    source.addEventListener("post.created", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { title: string; author: string };
      pushToast(`새 글: ${data.title} (${data.author})`);
    });
    return () => source.close();
    // revalidator 객체는 매 렌더 바뀌므로 의존성에서 뺀다. 연결은 enabled가 바뀔 때만 다시 만든다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pushToast, bump]);

  return null;
}

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => dismiss(toasts[0].id), 5000);
    return () => clearTimeout(timer);
  }, [toasts, dismiss]);

  return (
    <div aria-live="polite" className="fixed bottom-4 right-4 z-50 flex w-72 flex-col gap-2">
      {toasts.map((toast) => (
        <div key={toast.id} role="status" className="rounded border bg-white p-3 text-sm shadow dark:bg-gray-900">
          {toast.message}
          <button type="button" onClick={() => dismiss(toast.id)} className="ml-2 text-gray-400" aria-label="닫기">×</button>
        </div>
      ))}
    </div>
  );
}
