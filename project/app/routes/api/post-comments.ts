import { api } from "~/lib/api.server";
import { ok, readJson } from "~/lib/http.server";
import { parseId } from "~/lib/validate";
import { requireApiUser } from "~/middleware/auth.server";
import { createComment, listComments } from "~/services/comments.server";
import type { Route } from "./+types/post-comments";

// GET /api/posts/:postId/comments → 200
export const loader = api(async ({ params }: Route.LoaderArgs) => {
  return ok(await listComments(parseId(params.postId)));
});

// POST /api/posts/:postId/comments → 201
export const action = api(async ({ request, params, context }: Route.ActionArgs) => {
  const user = requireApiUser(context);
  const comment = await createComment(user, parseId(params.postId), await readJson(request));
  return ok(comment, { status: 201 });
});
