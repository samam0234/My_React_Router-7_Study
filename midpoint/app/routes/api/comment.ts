import { api } from "~/lib/api.server";
import { noContent } from "~/lib/http.server";
import { parseId } from "~/lib/validate";
import { requireApiUser } from "~/middleware/auth.server";
import { deleteComment } from "~/services/comments.server";
import type { Route } from "./+types/comment";

// DELETE /api/comments/:commentId → 204
export const action = api(async ({ params, context }: Route.ActionArgs) => {
  const user = requireApiUser(context);
  await deleteComment(user, parseId(params.commentId));
  return noContent();
});
