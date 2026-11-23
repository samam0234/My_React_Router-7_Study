type Entry<T> = { value: T; expiresAt: number };

/** 만료 시간이 있는 작은 메모리 캐시. 키 접두어로 한꺼번에 지울 수 있다. */
export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  hits = 0;
  misses = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
  ) {}

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= now) {
      if (entry) this.entries.delete(key);
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    return entry.value;
  }

  set(key: string, value: T, now = Date.now()) {
    // 가득 차면 가장 오래전에 넣은 항목부터 버린다(Map은 삽입 순서를 기억한다).
    if (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
  }

  invalidate(prefix = "") {
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
  }
}
