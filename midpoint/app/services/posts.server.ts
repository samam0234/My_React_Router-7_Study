import { getRepo } from "~/db/index.server";
import type { ListParams, PostDetail, PublicUser, Repo, SortKey } from "~/db/types";
import { forbidden, notFound } from "~/lib/errors";
import { postCreateSchema, postPatchSchema } from "~/lib/schemas";
import { parseOrThrow } from "~/lib/validate";

export const SORT_KEYS: readonly SortKey[] = ["createdAt", "-createdAt", "-commentCount"];

/** 공통 스펙 v1: page는 1부터, limit 기본 10(1~50), sort 기본 -createdAt. 잘못된 값은 기본값으로 보정한다. */
export function parseListQuery(params: URLSearchParams): ListParams {
  const page = Math.max(1, Math.trunc(Number(params.get("page"))) || 1);
  const limit = Math.min(50, Math.max(1, Math.trunc(Number(params.get("limit"))) || 10));
  const requested = params.get("sort") ?? "";
  const sort = SORT_KEYS.find((key) => key === requested) ?? "-createdAt";
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  return { q, page, limit, sort };
}

export async function listPosts(params: ListParams, repo: Repo = getRepo()) {
  const { items, total } = await repo.posts.list(params);
  return {
    data: items,
    meta: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / params.limit)),
      ...(params.q ? { q: params.q } : {}),
    },
  };
}

export async function getPost(id: number, repo: Repo = getRepo()): Promise<PostDetail> {
  const post = await repo.posts.find(id);
  if (!post) throw notFound("글을 찾을 수 없습니다.");
  return post;
}

export async function createPost(user: PublicUser, input: unknown, repo: Repo = getRepo()) {
  const data = parseOrThrow(postCreateSchema, input);
  return repo.posts.create({ authorId: user.id, ...data });
}

export async function updatePost(
  user: PublicUser,
  id: number,
  input: unknown,
  repo: Repo = getRepo(),
) {
  const patch = parseOrThrow(postPatchSchema, input);
  const post = await getPost(id, repo);
  if (post.author.id !== user.id) throw forbidden("내 글만 수정할 수 있습니다.");
  return (await repo.posts.update(id, patch))!;
}

export async function deletePost(user: PublicUser, id: number, repo: Repo = getRepo()) {
  const post = await getPost(id, repo);
  if (post.author.id !== user.id) throw forbidden("내 글만 삭제할 수 있습니다.");
  await repo.posts.remove(id);
}
