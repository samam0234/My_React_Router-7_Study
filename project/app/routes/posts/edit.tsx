import { data } from "react-router";
import { PostForm } from "~/components/post-form";
import { userContext } from "~/context";
import { AppError } from "~/lib/errors";
import { failure, readFields, type FormFailure } from "~/lib/form.server";
import { parseTags } from "~/lib/schemas";
import { routeError } from "~/lib/route-error.server";
import { parseId } from "~/lib/validate";
import { requireUser, requireUserMiddleware } from "~/middleware/auth.server";
import { getPost, updatePost } from "~/services/posts.server";
import { redirectWithFlash } from "~/session.server";
import type { Route } from "./+types/edit";

export const middleware: Route.MiddlewareFunction[] = [requireUserMiddleware];

export async function loader({ params, context }: Route.LoaderArgs) {
  try {
    const post = await getPost(parseId(params.postId));
    // 남의 글 수정 화면은 열어 주지 않는다. 403은 위의 posts 레이아웃 ErrorBoundary가 그린다.
    if (post.author.id !== context.get(userContext)?.id) {
      throw data("내 글만 수정할 수 있습니다.", { status: 403 });
    }
    return { post };
  } catch (error) {
    return routeError(error); // data()로 던진 403은 AppError가 아니므로 그대로 통과한다
  }
}

export async function action({ request, params, context, url }: Route.ActionArgs) {
  const user = requireUser(context, url);
  const form = await request.formData();
  const values = readFields(form, ["title", "body", "tags"]);
  try {
    const id = parseId(params.postId);
    // PATCH 의미: 폼이 보낸 세 필드를 모두 담아 부분 수정 서비스에 넘긴다.
    await updatePost(user, id, { ...values, tags: parseTags(values.tags) });
    return await redirectWithFlash(request, `/posts/${id}`, "글을 수정했습니다.");
  } catch (error) {
    // 입력 오류는 폼에 보여 주고, 권한·존재 오류는 오류 화면으로 보낸다.
    if (error instanceof AppError && error.fields) return failure(error, values);
    return routeError(error);
  }
}

export default function EditPost({ loaderData, actionData }: Route.ComponentProps) {
  const { post } = loaderData;
  return (
    <>
      <h2 className="mb-4 text-xl font-semibold">글 수정</h2>
      <PostForm
        submitLabel="저장"
        defaults={{ title: post.title, body: post.body, tags: post.tags.join(", ") }}
        failure={actionData as FormFailure | undefined}
      />
    </>
  );
}
