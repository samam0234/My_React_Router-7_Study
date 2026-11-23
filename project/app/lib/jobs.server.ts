type Job = { name: string; run: () => Promise<void>; retries: number; backoffMs: number; attempt: number };

const CONCURRENCY = 2;
const queue: Job[] = [];
let running = 0;
let idleWaiters: (() => void)[] = [];
export const jobStats = { enqueued: 0, succeeded: 0, failed: 0, retried: 0 };

const log = (level: string, msg: string, extra: Record<string, unknown>) =>
  console.log(JSON.stringify({ level, msg, ...extra }));

/**
 * 응답을 막지 않고 뒤에서 처리할 일을 줄 세운다(메일 발송, AI 요약 등).
 * 이 큐는 프로세스 메모리에만 있다: 서버가 꺼지면 대기 중인 일은 사라진다.
 * 잃으면 안 되는 일은 DB 테이블이나 외부 큐(BullMQ, SQS 등)에 저장해야 한다.
 */
export function enqueue(name: string, run: () => Promise<void>, options: { retries?: number; backoffMs?: number } = {}) {
  jobStats.enqueued += 1;
  queue.push({ name, run, retries: options.retries ?? 2, backoffMs: options.backoffMs ?? 500, attempt: 0 });
  pump();
}

function pump() {
  while (running < CONCURRENCY && queue.length > 0) {
    const job = queue.shift()!;
    running += 1;
    job.attempt += 1;
    job
      .run()
      .then(() => {
        jobStats.succeeded += 1;
        log("info", "job ok", { job: job.name, attempt: job.attempt });
      })
      .catch((error) => {
        if (job.attempt <= job.retries) {
          jobStats.retried += 1;
          log("warn", "job retry", { job: job.name, attempt: job.attempt, error: String(error) });
          // 실패할수록 더 오래 기다렸다 다시 시도한다(지수 백오프).
          setTimeout(() => {
            queue.push(job);
            pump();
          }, job.backoffMs * 2 ** (job.attempt - 1)).unref();
        } else {
          jobStats.failed += 1;
          log("error", "job failed", { job: job.name, attempts: job.attempt, error: String(error) });
        }
      })
      .finally(() => {
        running -= 1;
        pump();
        if (running === 0 && queue.length === 0) {
          const waiters = idleWaiters;
          idleWaiters = [];
          waiters.forEach((resolve) => resolve());
        }
      });
  }
}

/** 테스트에서 "대기 중인 일이 모두 끝날 때까지" 기다린다. */
export function whenIdle(): Promise<void> {
  if (running === 0 && queue.length === 0) return Promise.resolve();
  return new Promise((resolve) => idleWaiters.push(resolve));
}
