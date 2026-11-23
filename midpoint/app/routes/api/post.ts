import { api, methodNotAllowed } from "~/lib/api.server";
import { noContent, ok, readJson } from "~/lib/http.server";
import { parseId } from "~/lib/validate";
import { requireApiUser } from "~/middleware/auth.server";
import { deletePost, getPost, updatePost } from "~/services/posts.server";
import type { Route } from "./+types/post";

// GET /api/posts/:postId → 200
export const loader = api(async ({ params }: Route.LoaderArgs) => {
  return ok(await getPost(parseId(params.postId)));
});

// 한 파일의 action이 PATCH와 DELETE를 모두 받는다. request.method로 나눈다.
export const action = api(async ({ request, params, context }: Route.ActionArgs) => {
  const user = requireApiUser(context);
  const id = parseId(params.postId);
  switch (request.method) {
    case "PATCH":
      return ok(await updatePost(user, id, await readJson(request)));
    case "DELETE":
      await deletePost(user, id);
      return noContent();
    default:
      throw methodNotAllowed(request.method);
  }
});
