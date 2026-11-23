import { api } from "~/lib/api.server";
import { ok, readJson } from "~/lib/http.server";
import { requireApiUser } from "~/middleware/auth.server";
import { createPost, listPosts, parseListQuery } from "~/services/posts.server";
import type { Route } from "./+types/posts";

// GET /api/posts?q=&page=&limit=&sort= → 200 { data: [...], meta }
export const loader = api(async ({ url }: Route.LoaderArgs) => {
  const { data, meta } = await listPosts(parseListQuery(url.searchParams));
  return ok(data, { meta });
});

// POST /api/posts → 201 + Location
export const action = api(async ({ request, context }: Route.ActionArgs) => {
  const user = requireApiUser(context);
  const post = await createPost(user, await readJson(request));
  return ok(post, { status: 201, headers: { Location: `/api/posts/${post.id}` } });
});
