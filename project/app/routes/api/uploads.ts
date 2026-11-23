import { api } from "~/lib/api.server";
import { ok } from "~/lib/http.server";
import { requireApiUser } from "~/middleware/auth.server";
import { saveUpload } from "~/services/uploads.server";
import type { Route } from "./+types/uploads";

// POST /api/uploads (multipart/form-data, 필드 이름 file) → 201
export const action = api(async ({ request, context }: Route.ActionArgs) => {
  requireApiUser(context);
  return ok(await saveUpload(request), { status: 201 });
});
