import { getRepo } from "~/db/index.server";
import type { CommentView, PublicUser, Repo } from "~/db/types";
import { forbidden, notFound } from "~/lib/errors";
import { commentSchema } from "~/lib/schemas";
import { parseOrThrow } from "~/lib/validate";

async function assertPostExists(postId: number, repo: Repo) {
  if (!(await repo.posts.find(postId))) throw notFound("글을 찾을 수 없습니다.");
}

export async function listComments(postId: number, repo: Repo = getRepo()): Promise<CommentView[]> {
  await assertPostExists(postId, repo);
  return repo.comments.listByPost(postId);
}

export async function createComment(
  user: PublicUser,
  postId: number,
  input: unknown,
  repo: Repo = getRepo(),
) {
  const data = parseOrThrow(commentSchema, input);
  await assertPostExists(postId, repo);
  return repo.comments.create({ postId, authorId: user.id, body: data.body });
}

export async function deleteComment(user: PublicUser, commentId: number, repo: Repo = getRepo()) {
  const comment = await repo.comments.find(commentId);
  if (!comment) throw notFound("댓글을 찾을 수 없습니다.");
  if (comment.author.id !== user.id) throw forbidden("내 댓글만 삭제할 수 있습니다.");
  await repo.comments.remove(commentId);
}
