import { getRepo } from "~/db/index.server";
import type { ListParams, PostDetail, PostSummary, PublicUser, Repo, SortKey } from "~/db/types";
import { TtlCache } from "~/lib/cache.server";
import { forbidden, notFound } from "~/lib/errors";
import { postCreateSchema, postPatchSchema } from "~/lib/schemas";
import { parseOrThrow } from "~/lib/validate";
import { publish } from "~/realtime/hub.server";

export const SORT_KEYS: readonly SortKey[] = ["createdAt", "-createdAt", "-commentCount"];

type ListResult = { items: PostSummary[]; total: number };

// 저장소마다 캐시를 따로 둔다(테스트에서 서로 다른 저장소의 결과가 섞이지 않게).
const caches = new WeakMap<Repo, TtlCache<ListResult>>();
const cacheFor = (repo: Repo) => {
  let cache = caches.get(repo);
  if (!cache) caches.set(repo, (cache = new TtlCache<ListResult>(10_000)));
  return cache;
};

/** 글·댓글이 바뀌면 목록 캐시를 비운다. 목록에는 댓글 수도 들어 있기 때문이다. */
export function invalidatePostCache(repo: Repo = getRepo()) {
  cacheFor(repo).invalidate();
}

export function postCacheStats(repo: Repo = getRepo()) {
  const { hits, misses } = cacheFor(repo);
  return { hits, misses };
}

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
  const cache = cacheFor(repo);
  const key = JSON.stringify(params);
  let result = cache.get(key);
  if (!result) {
    result = await repo.posts.list(params);
    cache.set(key, result);
  }
  return {
    data: result.items,
    meta: {
      page: params.page,
      limit: params.limit,
      total: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / params.limit)),
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
  const post = await repo.posts.create({ authorId: user.id, ...data });
  invalidatePostCache(repo);
  publish({ type: "post.created", data: { id: post.id, title: post.title, author: post.author.nickname } });
  return post;
}

export async function updatePost(user: PublicUser, id: number, input: unknown, repo: Repo = getRepo()) {
  const patch = parseOrThrow(postPatchSchema, input);
  const post = await getPost(id, repo);
  if (post.author.id !== user.id) throw forbidden("내 글만 수정할 수 있습니다.");
  const updated = (await repo.posts.update(id, patch))!;
  invalidatePostCache(repo);
  return updated;
}

export async function deletePost(user: PublicUser, id: number, repo: Repo = getRepo()) {
  const post = await getPost(id, repo);
  if (post.author.id !== user.id) throw forbidden("내 글만 삭제할 수 있습니다.");
  await repo.posts.remove(id);
  invalidatePostCache(repo);
}
