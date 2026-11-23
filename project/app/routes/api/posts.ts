import { api } from "~/lib/api.server";
import { ok, okConditional, paginationLinks, readJson } from "~/lib/http.server";
import { requireApiUser } from "~/middleware/auth.server";
import { createPost, listPosts, parseListQuery } from "~/services/posts.server";
import type { Route } from "./+types/posts";

// GET /api/posts?q=&page=&limit=&sort= → 200 { data: [...], meta } + ETag·Link·X-Total-Count (같으면 304)
export const loader = api(async ({ request, url }: Route.LoaderArgs) => {
  const { data, meta } = await listPosts(parseListQuery(url.searchParams));
  return okConditional(request, data, {
    meta,
    headers: { Link: paginationLinks(url, meta), "X-Total-Count": String(meta.total) },
  });
});

// POST /api/posts → 201 + Location
export const action = api(async ({ request, context }: Route.ActionArgs) => {
  const user = requireApiUser(context);
  const post = await createPost(user, await readJson(request));
  return ok(post, { status: 201, headers: { Location: `/api/posts/${post.id}` } });
});
