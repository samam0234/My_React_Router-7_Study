import { getRepo } from "~/db/index.server";
import type { CommentView, PostDetail, PublicUser, Repo } from "~/db/types";
import { forbidden, notFound } from "~/lib/errors";
import { commentSchema } from "~/lib/schemas";
import { parseOrThrow } from "~/lib/validate";
import { publish } from "~/realtime/hub.server";
import { invalidatePostCache } from "./posts.server";

async function requirePost(postId: number, repo: Repo): Promise<PostDetail> {
  const post = await repo.posts.find(postId);
  if (!post) throw notFound("글을 찾을 수 없습니다.");
  return post;
}

export async function listComments(postId: number, repo: Repo = getRepo()): Promise<CommentView[]> {
  await requirePost(postId, repo);
  return repo.comments.listByPost(postId);
}

export async function createComment(user: PublicUser, postId: number, input: unknown, repo: Repo = getRepo()) {
  const data = parseOrThrow(commentSchema, input);
  const post = await requirePost(postId, repo);
  const comment = await repo.comments.create({ postId, authorId: user.id, body: data.body });
  invalidatePostCache(repo);
  // 내 글에 내가 단 댓글은 알리지 않는다. 글쓴이에게만 보낸다.
  if (post.author.id !== user.id) {
    publish(
      {
        type: "comment.created",
        data: { postId, postTitle: post.title, commentId: comment.id, from: user.nickname },
      },
      post.author.id,
    );
  }
  return comment;
}

export async function deleteComment(user: PublicUser, commentId: number, repo: Repo = getRepo()) {
  const comment = await repo.comments.find(commentId);
  if (!comment) throw notFound("댓글을 찾을 수 없습니다.");
  if (comment.author.id !== user.id) throw forbidden("내 댓글만 삭제할 수 있습니다.");
  await repo.comments.remove(commentId);
  invalidatePostCache(repo);
}
