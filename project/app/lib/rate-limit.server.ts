type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateResult = { allowed: boolean; limit: number; remaining: number; retryAfterSeconds: number };

/**
 * 고정 창(fixed window) 방식 제한. 한 창 안에서 limit번까지 허용한다.
 * 메모리 안에서만 세므로 서버가 여러 대면 합계가 아니라 대수만큼 허용된다 → 운영에서는 Redis 등을 쓴다.
 */
export function hit(key: string, limit: number, windowMs = 60_000, now = Date.now()): RateResult {
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function resetRateLimits() {
  buckets.clear();
}
