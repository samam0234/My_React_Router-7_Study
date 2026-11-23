import { z } from "zod";
import { chat, chatStream } from "~/ai/ollama.server";
import { askPrompt, NOT_FOUND_ANSWER, summarizePrompt } from "~/ai/prompts";
import { chunkText, extractCitations, search, type Excerpt } from "~/ai/rag.server";
import { getRepo } from "~/db/index.server";
import type { DocumentRecord, PublicUser, Repo } from "~/db/types";
import { AppError, forbidden, notFound, validationError } from "~/lib/errors";
import { readJson } from "~/lib/http.server";
import { enqueue } from "~/lib/jobs.server";
import { parseOrThrow } from "~/lib/validate";

export const documentSchema = z.object({
  title: z.string().trim().min(1, "1~200자로 입력하세요.").max(200, "1~200자로 입력하세요."),
  content: z.string().trim().min(1, "내용을 입력하세요.").max(200_000, "200,000자 이하만 지원합니다."),
});

export const questionSchema = z.object({
  question: z.string().trim().min(1, "질문을 입력하세요.").max(500, "500자 이하로 입력하세요."),
});

/**
 * 요청 본문에서 {title, content}를 꺼낸다. 세 가지 방식을 모두 받는다.
 *  1) JSON  2) multipart의 file(.txt/.md)  3) multipart의 title·content 텍스트 칸
 */
export async function readDocumentInput(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) return readJson(request);
  const form = await request.formData();
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();
  if (file instanceof File && file.size > 0) {
    if (!/\.(txt|md)$/i.test(file.name)) throw validationError({ file: ["TXT, MD 파일만 지원합니다."] });
    if (file.size > 200_000) throw validationError({ file: ["200KB 이하 파일만 지원합니다."] });
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    } catch {
      throw validationError({ file: ["UTF-8 텍스트 파일이 아닙니다."] });
    }
    return { title: title || file.name.replace(/\.(txt|md)$/i, ""), content };
  }
  return { title, content: String(form.get("content") ?? "") };
}

/** API 응답용: 본문(content)은 빼고 내보낸다. */
export const toDocumentJson = ({ content: _content, ...rest }: DocumentRecord) => rest;

/** 문서는 올린 사람만 본다. 없는 문서는 404, 남의 문서는 403. */
export async function getOwnedDocument(user: PublicUser, id: number, repo: Repo = getRepo()): Promise<DocumentRecord> {
  const doc = await repo.documents.find(id);
  if (!doc) throw notFound("문서를 찾을 수 없습니다.");
  if (doc.ownerId !== user.id) throw forbidden("내 문서만 볼 수 있습니다.");
  return doc;
}

export async function createDocument(user: PublicUser, input: unknown, repo: Repo = getRepo()) {
  const data = parseOrThrow(documentSchema, input);
  const doc = await repo.documents.create({ ownerId: user.id, ...data });
  requestSummary(doc.id, repo);
  return doc;
}

/** 요약은 모델이 느리므로 응답을 막지 않고 작업 큐에서 한다. 화면은 summaryStatus를 보고 기다린다. */
export function requestSummary(id: number, repo: Repo = getRepo()) {
  enqueue(
    `summarize:${id}`,
    async () => {
      const doc = await repo.documents.find(id);
      if (!doc) return; // 그 사이 삭제됨
      await repo.documents.setSummary(id, { summary: null, status: "pending" });
      try {
        const summary = await chat(summarizePrompt(doc.title, doc.content));
        if (!summary) throw new AppError(502, "AI_EMPTY", "모델이 빈 응답을 돌려주었습니다.");
        await repo.documents.setSummary(id, { summary, status: "ready" });
      } catch (error) {
        await repo.documents.setSummary(id, { summary: null, status: "failed" });
        throw error; // 큐가 재시도하도록 다시 던진다.
      }
    },
    { retries: 1, backoffMs: 1000 },
  );
}

export type AskEvent =
  | { type: "sources"; sources: Excerpt[] }
  | { type: "token"; text: string }
  | { type: "done"; citations: number[] };

/** 질문과 관련된 발췌를 찾고(검색), 그 발췌만 근거로 모델이 답하게 한다(생성). 조각을 흘려 보낸다. */
export async function* askDocument(user: PublicUser, id: number, input: unknown, signal?: AbortSignal, repo: Repo = getRepo()): AsyncGenerator<AskEvent> {
  const { question } = parseOrThrow(questionSchema, input);
  const doc = await getOwnedDocument(user, id, repo);
  const sources = search(chunkText(doc.content), question, 3);
  yield { type: "sources", sources };

  // 근거가 하나도 없으면 모델을 부르지 않는다: 비용이 들지 않고, 지어낼 여지도 없다.
  if (sources.length === 0) {
    yield { type: "token", text: NOT_FOUND_ANSWER };
    yield { type: "done", citations: [] };
    return;
  }
  let answer = "";
  for await (const text of chatStream(askPrompt(question, sources), signal)) {
    answer += text;
    yield { type: "token", text };
  }
  yield { type: "done", citations: extractCitations(answer, sources.map((s) => s.index)) };
}
