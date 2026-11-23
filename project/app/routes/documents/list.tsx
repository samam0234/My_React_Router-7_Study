import { Form, Link, redirect, useNavigation } from "react-router";
import { FieldError, FormError } from "~/components/field-error";
import { getRepo } from "~/db/index.server";
import { formatDateTime } from "~/lib/format";
import { failure, type FormFailure } from "~/lib/form.server";
import { requireUser } from "~/middleware/auth.server";
import { createDocument, readDocumentInput } from "~/services/documents.server";
import type { Route } from "./+types/list";

export function meta() {
  return [{ title: "문서 AI · RR7 게시판" }];
}

export async function loader({ context, url }: Route.LoaderArgs) {
  const user = requireUser(context, url);
  return { documents: await getRepo().documents.listByOwner(user.id) };
}

export async function action({ request, context, url }: Route.ActionArgs) {
  const user = requireUser(context, url);
  try {
    const doc = await createDocument(user, await readDocumentInput(request));
    return redirect(`/documents/${doc.id}`);
  } catch (error) {
    return failure(error, {});
  }
}

const STATUS_LABEL = { pending: "요약 중…", ready: "요약 완료", failed: "요약 실패" } as const;

export default function DocumentList({ loaderData, actionData }: Route.ComponentProps) {
  const failed = actionData as FormFailure | undefined;
  const submitting = useNavigation().state !== "idle";
  const input = "mt-1 w-full rounded border px-3 py-2 dark:bg-gray-900";
  return (
    <>
      {/* encType을 multipart로 바꿔야 파일이 전송된다. */}
      <Form method="post" encType="multipart/form-data" className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">문서 올리기</h2>
        <FormError message={failed?.formError} />
        <div>
          <label htmlFor="file" className="text-sm">TXT·MD 파일(200KB 이하)</label>
          <input id="file" name="file" type="file" accept=".txt,.md,text/plain,text/markdown" className="mt-1 block" />
          <FieldError messages={failed?.errors.file} />
        </div>
        <p className="text-sm text-gray-500">파일 대신 직접 붙여 넣어도 됩니다.</p>
        <div>
          <label htmlFor="title" className="text-sm">제목</label>
          <input id="title" name="title" className={input} />
          <FieldError messages={failed?.errors.title} />
        </div>
        <div>
          <label htmlFor="content" className="text-sm">내용</label>
          <textarea id="content" name="content" rows={5} className={input} />
          <FieldError messages={failed?.errors.content} />
        </div>
        <button type="submit" disabled={submitting} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">
          {submitting ? "올리는 중…" : "올리고 요약하기"}
        </button>
      </Form>

      <h2 className="mb-2 mt-6 font-semibold">내 문서 {loaderData.documents.length}개</h2>
      <ul className="divide-y">
        {loaderData.documents.map((doc) => (
          <li key={doc.id} className="py-2">
            <Link to={`/documents/${doc.id}`} className="text-blue-600 hover:underline">{doc.title}</Link>
            <span className="ml-2 text-sm text-gray-500">{STATUS_LABEL[doc.summaryStatus]} · {formatDateTime(doc.createdAt)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
