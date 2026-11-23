import { getRepo } from "~/db/index.server";
import { api } from "~/lib/api.server";
import { ok } from "~/lib/http.server";
import { requireApiUser } from "~/middleware/auth.server";
import { createDocument, readDocumentInput, toDocumentJson } from "~/services/documents.server";
import type { Route } from "./+types/documents";

// GET /api/documents → 내 문서 목록(본문 제외)
export const loader = api(async ({ context }: Route.LoaderArgs) => {
  const user = requireApiUser(context);
  return ok(await getRepo().documents.listByOwner(user.id));
});

// POST /api/documents → 201. JSON 또는 multipart(file=.txt/.md). 요약은 뒤에서 시작되므로 summaryStatus는 "pending".
export const action = api(async ({ request, context }: Route.ActionArgs) => {
  const user = requireApiUser(context);
  const doc = await createDocument(user, await readDocumentInput(request));
  return ok(toDocumentJson(doc), { status: 201 });
});
