import { api } from "~/lib/api.server";
import { ok } from "~/lib/http.server";
import { requireApiUser } from "~/middleware/auth.server";
import { createCheckoutSession } from "~/services/payments.server";
import type { Route } from "./+types/payments-checkout";

// POST /api/payments/checkout → 201 { data: { id, url } }. 클라이언트는 url로 이동해 결제한다.
export const action = api(async ({ context }: Route.ActionArgs) => {
  const user = requireApiUser(context);
  return ok(await createCheckoutSession(user), { status: 201 });
});
