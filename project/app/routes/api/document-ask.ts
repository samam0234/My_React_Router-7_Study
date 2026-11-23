import { api } from "~/lib/api.server";
import { AppError } from "~/lib/errors";
import { readJson } from "~/lib/http.server";
import { parseOrThrow, parseId } from "~/lib/validate";
import { requireApiUser } from "~/middleware/auth.server";
import { askDocument, getOwnedDocument, questionSchema, type AskEvent } from "~/services/documents.server";
import type { Route } from "./+types/document-ask";

const encoder = new TextEncoder();
const line = (event: AskEvent | { type: "error"; code: string; message: string }) => encoder.encode(JSON.stringify(event) + "\n");

// 스트림이 시작되면 상태 코드(200)는 이미 나갔다. 그래서 중간 오류는 상태 코드가 아니라 {type:"error"} 줄로 알린다.
async function* ndjson(events: AsyncGenerator<AskEvent>): AsyncGenerator<Uint8Array> {
  try {
    for await (const event of events) yield line(event);
  } catch (error) {
    const known = error instanceof AppError;
    yield line({ type: "error", code: known ? error.code : "INTERNAL", message: known ? error.message : "답변을 만들지 못했습니다." });
  }
}

// POST /api/documents/:documentId/ask → application/x-ndjson 스트림
export const action = api(async ({ request, params, context }: Route.ActionArgs) => {
  const user = requireApiUser(context);
  const id = parseId(params.documentId);
  const input = await readJson(request);
  // 스트림을 열기 "전에" 검증·권한을 끝낸다. 그래야 실패가 평범한 400·403·404 JSON으로 나간다.
  parseOrThrow(questionSchema, input);
  await getOwnedDocument(user, id);

  const iterator = ndjson(askDocument(user, id, input, request.signal));
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel: () => void iterator.return(undefined), // 브라우저가 끊으면 모델 호출도 멈춘다
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
  });
});
