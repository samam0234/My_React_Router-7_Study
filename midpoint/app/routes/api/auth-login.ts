import { getConfig } from "~/config.server";
import { api } from "~/lib/api.server";
import { ok, readJson } from "~/lib/http.server";
import { signAccessToken } from "~/lib/token.server";
import { login } from "~/services/auth.server";
import type { Route } from "./+types/auth-login";

// POST /api/auth/login → 200 { data: { user, accessToken } }
export const action = api(async ({ request }: Route.ActionArgs) => {
  const user = await login(await readJson(request));
  const config = getConfig();
  const accessToken = signAccessToken(user, config.JWT_SECRET, config.ACCESS_TOKEN_TTL_SECONDS);
  return ok({ user, accessToken });
});
