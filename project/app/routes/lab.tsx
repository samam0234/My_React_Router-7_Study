import { Suspense } from "react";
import { Await, useNavigation } from "react-router";
import { ChatDemo, CheckoutDemo, UploadDemo } from "~/components/lab/service-demos";
import { ConfirmDemo, ContactForm, StateDemo } from "~/components/lab/ui-demos";
import { userContext } from "~/context";
import type { Route } from "./+types/lab";

export function meta() {
  return [{ title: "실험실 · RR7 게시판" }];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// loader가 Promise를 "기다리지 않고" 그대로 돌려주면, 빠른 데이터는 먼저 HTML로 나가고
// 느린 데이터는 준비되는 대로 같은 응답 스트림에 이어서 도착한다(스트리밍 SSR).
export async function loader({ context, url }: Route.LoaderArgs) {
  const fast = { renderedAt: new Date().toISOString() };
  const slow = sleep(800).then(() => ({ message: "느린 데이터(0.8초)가 도착했습니다." }));
  return { fast, slow, loggedIn: Boolean(context.get(userContext)), paid: url.searchParams.get("paid") };
}

export default function Lab({ loaderData }: Route.ComponentProps) {
  const { fast, slow, loggedIn, paid } = loaderData;
  const navigating = useNavigation().state !== "idle";
  const section = "rounded-lg border p-4";
  return (
    <div className="space-y-6" aria-busy={navigating}>
      <h1 className="text-2xl font-bold">실험실</h1>

      <section className={section}>
        <h2 className="mb-2 font-semibold">스트리밍 SSR · 로딩 경계</h2>
        <p className="text-sm text-gray-500">빠른 데이터: {fast.renderedAt}</p>
        <Suspense fallback={<p role="status" className="text-sm">느린 데이터를 불러오는 중…</p>}>
          <Await resolve={slow} errorElement={<p role="alert" className="text-sm text-red-600">불러오지 못했습니다.</p>}>
            {(value) => <p className="text-sm">{value.message}</p>}
          </Await>
        </Suspense>
      </section>

      <section className={section}><h2 className="mb-2 font-semibold">상태 관리 (zustand)</h2><StateDemo /></section>
      <section className={section}><h2 className="mb-2 font-semibold">UI 라이브러리 (Radix Dialog)</h2><ConfirmDemo /></section>
      <section className={section}><h2 className="mb-2 font-semibold">폼 라이브러리 (react-hook-form + zod)</h2><ContactForm /></section>
      <section className={section}><h2 className="mb-2 font-semibold">파일 업로드</h2><UploadDemo loggedIn={loggedIn} /></section>
      <section className={section}><h2 className="mb-2 font-semibold">결제 (Stripe 테스트)</h2><CheckoutDemo loggedIn={loggedIn} paid={paid} /></section>
      <section className={section}><h2 className="mb-2 font-semibold">실시간 (WebSocket 채팅)</h2><ChatDemo loggedIn={loggedIn} /></section>
      <p className="text-sm"><a className="text-blue-600 underline" href="/api-docs">API 문서</a> · <a className="text-blue-600 underline" href="/api/export/posts.csv">글 CSV 내려받기</a></p>
    </div>
  );
}
