import { useEffect } from "react";
import { Form, redirect, useRevalidator } from "react-router";
import { AskPanel } from "~/components/ask-panel";
import { getRepo } from "~/db/index.server";
import { routeError } from "~/lib/route-error.server";
import { parseId } from "~/lib/validate";
import { requireUser } from "~/middleware/auth.server";
import { getOwnedDocument, requestSummary } from "~/services/documents.server";
import type { Route } from "./+types/detail";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.doc.title} · 문서 AI` : "문서 AI" }];
}

export async function loader({ params, context, url }: Route.LoaderArgs) {
  const user = requireUser(context, url);
  try {
    const { content, ...doc } = await getOwnedDocument(user, parseId(params.documentId));
    return { doc, preview: content.slice(0, 600), truncated: content.length > 600 };
  } catch (error) {
    return routeError(error); // 403·404(주소의 id가 숫자가 아닌 경우 포함)를 오류 화면으로
  }
}

export async function action({ request, params, context, url }: Route.ActionArgs) {
  const user = requireUser(context, url);
  try {
    const id = parseId(params.documentId);
    await getOwnedDocument(user, id);
    const intent = (await request.formData()).get("intent");
    if (intent === "delete") {
      await getRepo().documents.remove(id);
      return redirect("/documents");
    }
    if (intent === "resummarize") requestSummary(id);
    return null;
  } catch (error) {
    return routeError(error);
  }
}

export default function DocumentDetail({ loaderData }: Route.ComponentProps) {
  const { doc, preview, truncated } = loaderData;
  const revalidator = useRevalidator();

  // 요약은 뒤에서 만들어지므로, 끝날 때까지 2초마다 loader를 다시 불러 상태를 갱신한다(폴링).
  useEffect(() => {
    if (doc.summaryStatus !== "pending") return;
    const timer = setInterval(() => void revalidator.revalidate(), 2000);
    return () => clearInterval(timer);
  }, [doc.summaryStatus, revalidator]);

  return (
    <article className="space-y-4">
      <h2 className="text-xl font-semibold">{doc.title}</h2>

      <section aria-labelledby="summary-title" className="rounded-lg border p-4">
        <h3 id="summary-title" className="font-medium">요약</h3>
        {doc.summaryStatus === "pending" ? <p role="status" className="text-sm text-gray-500">모델이 요약하는 중입니다…</p> : null}
        {doc.summaryStatus === "failed" ? <p role="alert" className="text-sm text-red-600">요약하지 못했습니다. AI 서버 상태를 확인한 뒤 다시 시도하세요.</p> : null}
        {doc.summary ? <p className="mt-1 whitespace-pre-wrap">{doc.summary}</p> : null}
        <div className="mt-2 flex gap-2">
          <Form method="post"><input type="hidden" name="intent" value="resummarize" /><button className="rounded border px-3 py-1 text-sm">요약 다시 만들기</button></Form>
          <Form method="post" onSubmit={(e) => { if (!confirm("문서를 삭제할까요?")) e.preventDefault(); }}>
            <input type="hidden" name="intent" value="delete" /><button className="rounded border border-red-400 px-3 py-1 text-sm text-red-600">삭제</button>
          </Form>
        </div>
      </section>

      <section aria-labelledby="ask-title" className="rounded-lg border p-4">
        <h3 id="ask-title" className="mb-2 font-medium">문서에 질문하기</h3>
        <AskPanel documentId={doc.id} />
      </section>

      <details className="text-sm">
        <summary className="cursor-pointer">본문 미리보기</summary>
        <pre className="mt-2 whitespace-pre-wrap rounded bg-gray-50 p-3 dark:bg-gray-900">{preview}{truncated ? "\n…" : ""}</pre>
      </details>
    </article>
  );
}
