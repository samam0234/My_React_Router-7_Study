import { api } from "~/lib/api.server";
import { parseId } from "~/lib/validate";
import { requireApiUser } from "~/middleware/auth.server";
import { getOwnedDocument, requestSummary } from "~/services/documents.server";
import type { Route } from "./+types/document-summarize";

// POST /api/documents/:documentId/summarize → 202 (접수만 하고 끝나기를 기다리지 않는다)
export const action = api(async ({ params, context }: Route.ActionArgs) => {
  const user = requireApiUser(context);
  const id = parseId(params.documentId);
  await getOwnedDocument(user, id);
  requestSummary(id);
  return new Response(null, { status: 202 });
});
