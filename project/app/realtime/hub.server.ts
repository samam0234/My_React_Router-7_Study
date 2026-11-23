export type HubEvent = {
  type: "post.created" | "comment.created";
  data: Record<string, unknown>;
};

type Subscriber = { userId: number | null; send: (event: HubEvent) => void };

// HMR이나 번들 분리로 모듈이 두 번 로드돼도 구독자 목록은 하나여야 한다.
const globalForHub = globalThis as unknown as { __rr7Hub?: Set<Subscriber> };
const subscribers = (globalForHub.__rr7Hub ??= new Set<Subscriber>());

/** 연결 하나를 등록한다. 돌려받은 함수를 호출하면 등록이 해제된다. */
export function subscribe(userId: number | null, send: Subscriber["send"]): () => void {
  const subscriber = { userId, send };
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

/** toUserId가 있으면 그 사용자의 연결에만, 없으면 모두에게 보낸다. */
export function publish(event: HubEvent, toUserId?: number) {
  for (const subscriber of subscribers) {
    if (toUserId !== undefined && subscriber.userId !== toUserId) continue;
    try {
      subscriber.send(event);
    } catch {
      subscribers.delete(subscriber); // 이미 닫힌 연결
    }
  }
}

export const subscriberCount = () => subscribers.size;
