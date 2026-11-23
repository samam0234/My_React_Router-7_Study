import { PostForm } from "~/components/post-form";
import { failure, readFields, type FormFailure } from "~/lib/form.server";
import { parseTags } from "~/lib/schemas";
import { requireUser, requireUserMiddleware } from "~/middleware/auth.server";
import { createPost } from "~/services/posts.server";
import { redirectWithFlash } from "~/session.server";
import type { Route } from "./+types/new";

export function meta() {
  return [{ title: "글쓰기 · RR7 게시판" }];
}

// 이 라우트의 loader·action이 실행되기 전에 로그인 여부를 확인한다. 아니면 /login으로 보낸다.
export const middleware: Route.MiddlewareFunction[] = [requireUserMiddleware];

export async function action({ request, context, url }: Route.ActionArgs) {
  const user = requireUser(context, url); // 화면 보호와 별개로 action도 직접 확인한다.
  const form = await request.formData();
  const values = readFields(form, ["title", "body", "tags"]);
  try {
    const post = await createPost(user, { ...values, tags: parseTags(values.tags) });
    return await redirectWithFlash(request, `/posts/${post.id}`, "글을 등록했습니다.");
  } catch (error) {
    return failure(error, values);
  }
}

export default function NewPost({ actionData }: Route.ComponentProps) {
  return (
    <>
      <h2 className="mb-4 text-xl font-semibold">새 글</h2>
      <PostForm
        submitLabel="등록"
        defaults={{ title: "", body: "", tags: "" }}
        failure={actionData as FormFailure | undefined}
      />
    </>
  );
}
