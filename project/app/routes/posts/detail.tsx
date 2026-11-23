import { useEffect, useRef } from "react";
import { data, Form, Link, useFetcher, useNavigation } from "react-router";
import { FieldError } from "~/components/field-error";
import { userContext } from "~/context";
import { AppError } from "~/lib/errors";
import { formatDateTime } from "~/lib/format";
import { failure, readFields, type FormFailure } from "~/lib/form.server";
import { routeError } from "~/lib/route-error.server";
import { parseId } from "~/lib/validate";
import { requireUser } from "~/middleware/auth.server";
import { createComment, deleteComment, listComments } from "~/services/comments.server";
import { deletePost, getPost } from "~/services/posts.server";
import { redirectWithFlash } from "~/session.server";
import type { Route } from "./+types/detail";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.post.title} · RR7 게시판` : "글 · RR7 게시판" }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  try {
    const id = parseId(params.postId);
    const [post, comments] = await Promise.all([getPost(id), listComments(id)]);
    return { post, comments, viewerId: context.get(userContext)?.id ?? null };
  } catch (error) {
    // 서비스의 NOT_FOUND·BAD_REQUEST를 라우트의 404로 바꿔 던지면 ErrorBoundary가 받는다.
    return routeError(error);
  }
}

// 한 라우트에 action이 하나뿐이라 hidden input "intent"로 무엇을 할지 나눈다.
export async function action({ request, params, context, url }: Route.ActionArgs) {
  const user = requireUser(context, url);
  const form = await request.formData();
  const intent = form.get("intent");
  try {
    const postId = parseId(params.postId);
    switch (intent) {
      case "comment": {
        const values = readFields(form, ["body"]);
        await createComment(user, postId, values);
        return { ok: true as const };
      }
      case "delete-comment":
        await deleteComment(user, parseId(String(form.get("commentId") ?? "")));
        return { ok: true as const };
      case "delete-post":
        await deletePost(user, postId);
        return await redirectWithFlash(request, "/posts", "글을 삭제했습니다.");
      default:
        throw data("알 수 없는 요청입니다.", { status: 400 });
    }
  } catch (error) {
    // 입력 오류(400·422)는 폼에 보여 주고, 권한·존재 오류는 오류 화면으로 보낸다.
    if (error instanceof AppError && error.fields) return failure(error, readFields(form, ["body"]));
    return routeError(error);
  }
}

export default function PostDetail({ loaderData }: Route.ComponentProps) {
  const { post, comments, viewerId } = loaderData;
  const isOwner = viewerId === post.author.id;
  const navigation = useNavigation();
  const deleting = navigation.formData?.get("intent") === "delete-post";

  return (
    <article>
      <h2 className="text-2xl font-bold">{post.title}</h2>
      <p className="mt-1 text-sm text-gray-500">
        {post.author.nickname} · {formatDateTime(post.createdAt)}
        {post.updatedAt !== post.createdAt ? " (수정됨)" : ""}
      </p>
      {post.tags.length > 0 ? (
        <p className="mt-2 text-sm">{post.tags.map((tag) => <span key={tag} className="mr-2 rounded bg-gray-100 px-1.5 dark:bg-gray-800">#{tag}</span>)}</p>
      ) : null}
      {/* React가 문자열을 이스케이프하므로 본문을 HTML로 해석하지 않는다(XSS 방어). */}
      <div className="mt-4 whitespace-pre-wrap leading-relaxed">{post.body}</div>

      {isOwner ? (
        <div className="mt-4 flex gap-2">
          <Link to={`/posts/${post.id}/edit`} className="rounded border px-3 py-1 text-sm">수정</Link>
          <Form method="post" onSubmit={(event) => { if (!confirm("정말 삭제할까요?")) event.preventDefault(); }}>
            <input type="hidden" name="intent" value="delete-post" />
            <button type="submit" disabled={deleting} className="rounded border border-red-400 px-3 py-1 text-sm text-red-600 disabled:opacity-50">
              {deleting ? "삭제 중…" : "삭제"}
            </button>
          </Form>
        </div>
      ) : null}

      <section className="mt-8" aria-labelledby="comments-title">
        <h3 id="comments-title" className="text-lg font-semibold">댓글 {comments.length}</h3>
        <ul className="mt-2 divide-y">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} mine={comment.author.id === viewerId} />
          ))}
        </ul>
        {viewerId ? (
          <CommentForm />
        ) : (
          <p className="mt-4 text-sm text-gray-500">
            댓글을 쓰려면 <Link className="text-blue-600 underline" to={`/login?redirectTo=/posts/${post.id}`}>로그인</Link>하세요.
          </p>
        )}
      </section>
    </article>
  );
}

function CommentItem({ comment, mine }: { comment: Route.ComponentProps["loaderData"]["comments"][number]; mine: boolean }) {
  // useFetcher: 페이지 이동 없이 action만 호출한다. 삭제 버튼이 있는 줄만 다시 그려진다.
  const fetcher = useFetcher();
  const removing = fetcher.state !== "idle";
  return (
    <li className={`py-2 ${removing ? "opacity-50" : ""}`}>
      <p className="whitespace-pre-wrap">{comment.body}</p>
      <p className="text-xs text-gray-500">
        {comment.author.nickname} · {formatDateTime(comment.createdAt)}
        {mine ? (
          <fetcher.Form method="post" className="ml-2 inline">
            <input type="hidden" name="intent" value="delete-comment" />
            <input type="hidden" name="commentId" value={comment.id} />
            <button type="submit" className="text-red-600 underline">삭제</button>
          </fetcher.Form>
        ) : null}
      </p>
    </li>
  );
}

function CommentForm() {
  const fetcher = useFetcher<{ ok?: true } | FormFailure>();
  const formRef = useRef<HTMLFormElement>(null);
  const sending = fetcher.state !== "idle";
  const failed = fetcher.data && "errors" in fetcher.data ? fetcher.data : undefined;

  // 성공하면 입력칸을 비운다.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data) formRef.current?.reset();
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form method="post" ref={formRef} className="mt-4 space-y-2">
      <input type="hidden" name="intent" value="comment" />
      <label htmlFor="comment-body" className="sr-only">댓글</label>
      <textarea id="comment-body" name="body" rows={3} placeholder="댓글을 입력하세요"
        defaultValue={failed?.values.body}
        className="w-full rounded border px-3 py-2 dark:bg-gray-900" />
      <FieldError messages={failed?.errors.body} />
      <button type="submit" disabled={sending} className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50">
        {sending ? "등록 중…" : "댓글 등록"}
      </button>
    </fetcher.Form>
  );
}
