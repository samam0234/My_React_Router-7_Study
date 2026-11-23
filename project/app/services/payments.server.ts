import { createHmac, timingSafeEqual } from "node:crypto";
import { getConfig } from "~/config.server";
import type { PublicUser } from "~/db/types";
import { AppError } from "~/lib/errors";
import { enqueue } from "~/lib/jobs.server";
import { sendMail } from "./mail.server";

/** Stripe Checkout 세션을 만든다. 결제 화면 주소(url)를 돌려주면 브라우저가 그곳으로 이동한다. */
export async function createCheckoutSession(user: PublicUser): Promise<{ id: string; url: string }> {
  const config = getConfig();
  if (!config.STRIPE_SECRET_KEY || !config.STRIPE_PRICE_ID) {
    throw new AppError(503, "PAYMENTS_NOT_CONFIGURED", "결제가 설정되지 않았습니다.");
  }
  // Stripe API는 JSON이 아니라 form-urlencoded를 받는다. 중첩 키는 대괄호로 쓴다.
  const body = new URLSearchParams({
    mode: "payment",
    "line_items[0][price]": config.STRIPE_PRICE_ID,
    "line_items[0][quantity]": "1",
    success_url: `${config.APP_ORIGIN}/lab?paid=1`,
    cancel_url: `${config.APP_ORIGIN}/lab?paid=0`,
    client_reference_id: String(user.id),
    customer_email: user.email,
  });
  const response = await fetch(`${config.STRIPE_BASE_URL}/v1/checkout/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new AppError(502, "PAYMENT_PROVIDER_ERROR", "결제 서비스 오류입니다.");
  const session = (await response.json()) as { id: string; url: string };
  return { id: session.id, url: session.url };
}

/**
 * Stripe-Signature 헤더("t=타임스탬프,v1=서명")를 검증한다.
 * 서명 = HMAC-SHA256(웹훅 비밀키, `${t}.${원본 본문}`). 본문을 JSON으로 파싱한 뒤가 아니라 "원본 그대로" 써야 한다.
 */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, now = Date.now(), toleranceSeconds = 300): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const timestamp = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(timestamp)) return false;
  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) return false; // 오래된 요청 재전송(replay) 차단
  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex"));
  const actual = Buffer.from(parts.v1);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

/** 검증된 이벤트만 처리한다. 결제 완료면 영수증 안내 메일을 큐에 넣는다. */
export function handleStripeEvent(event: StripeEvent) {
  if (event.type !== "checkout.session.completed") return { handled: false };
  const object = event.data.object as { customer_email?: string; customer_details?: { email?: string } };
  const email = object.customer_email ?? object.customer_details?.email;
  if (email) {
    enqueue("payment-mail", () => sendMail({ to: email, subject: "결제가 완료되었습니다", text: "감사합니다. 결제가 정상 처리되었습니다." }));
  }
  console.log(JSON.stringify({ level: "info", msg: "stripe event", id: event.id, type: event.type }));
  return { handled: true };
}
