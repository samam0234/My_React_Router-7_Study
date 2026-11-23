import { api } from "~/lib/api.server";
import { ok } from "~/lib/http.server";
import { requireApiUser } from "~/middleware/auth.server";
import type { Route } from "./+types/auth-me";

// GET /api/auth/me → 200 { data: user }
export const loader = api(({ context }: Route.LoaderArgs) => ok(requireApiUser(context)));
