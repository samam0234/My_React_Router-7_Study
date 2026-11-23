import { api } from "~/lib/api.server";
import { ok, readJson } from "~/lib/http.server";
import { signup } from "~/services/auth.server";
import type { Route } from "./+types/auth-signup";

// POST /api/auth/signup → 201
export const action = api(async ({ request }: Route.ActionArgs) => {
  const user = await signup(await readJson(request));
  return ok(user, { status: 201 });
});
