import { getRepo } from "~/db/index.server";
import { api } from "~/lib/api.server";
import { toCsvRow } from "~/lib/csv";
import type { Route } from "./+types/export-posts-csv";

const PAGE = 100;

// 한 번에 전부 메모리에 올리지 않고, 100건씩 읽는 대로 흘려 보낸다(백프레셔가 걸리면 읽기도 멈춘다).
async function* rows(): AsyncGenerator<string> {
  const repo = getRepo();
  yield "﻿" + toCsvRow(["id", "title", "author", "commentCount", "createdAt"]); // BOM: 엑셀에서 한글이 깨지지 않게
  for (let page = 1; ; page++) {
    const { items } = await repo.posts.list({ q: "", page, limit: PAGE, sort: "createdAt" });
    for (const post of items) yield toCsvRow([post.id, post.title, post.author.nickname, post.commentCount, post.createdAt]);
    if (items.length < PAGE) return;
  }
}

// GET /api/export/posts.csv
export const loader = api((_args: Route.LoaderArgs) => {
  const encoder = new TextEncoder();
  const iterator = rows();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(value));
    },
    cancel: () => void iterator.return(undefined),
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="posts.csv"',
      "Cache-Control": "no-store",
    },
  });
});
