import { getRepo } from "~/db/index.server";
import { api } from "~/lib/api.server";
import { noContent, ok } from "~/lib/http.server";
import { parseId } from "~/lib/validate";
import { requireApiUser } from "~/middleware/auth.server";
import { getOwnedDocument, toDocumentJson } from "~/services/documents.server";
import type { Route } from "./+types/document";

// GET /api/documents/:documentId
export const loader = api(async ({ params, context }: Route.LoaderArgs) => {
  const user = requireApiUser(context);
  return ok(toDocumentJson(await getOwnedDocument(user, parseId(params.documentId))));
});

// DELETE /api/documents/:documentId → 204
export const action = api(async ({ params, context }: Route.ActionArgs) => {
  const user = requireApiUser(context);
  const id = parseId(params.documentId);
  await getOwnedDocument(user, id); // 404·403 확인
  await getRepo().documents.remove(id);
  return noContent();
});
