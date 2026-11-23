import { jsonResponse } from "~/lib/http.server";
import { getConfig } from "~/config.server";
import { api } from "~/lib/api.server";
import { AppError } from "~/lib/errors";
import { handleStripeEvent, verifyStripeSignature, type StripeEvent } from "~/services/payments.server";
import type { Route } from "./+types/payments-webhook";

// POST /api/payments/webhook — Stripe 서버가 부른다. 로그인도 CORS도 없으므로 "서명"이 유일한 신원 증명이다.
export const action = api(async ({ request }: Route.ActionArgs) => {
  // 서명은 원본 바이트로 계산된다. request.json()으로 먼저 읽으면 공백·순서가 달라져 검증이 깨진다.
  const raw = await request.text();
  if (!verifyStripeSignature(raw, request.headers.get("stripe-signature"), getConfig().STRIPE_WEBHOOK_SECRET)) {
    throw new AppError(400, "BAD_SIGNATURE", "웹훅 서명이 올바르지 않습니다.");
  }
  const result = handleStripeEvent(JSON.parse(raw) as StripeEvent);
  return jsonResponse({ received: true, ...result });
});
