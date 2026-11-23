export type Chunk = { index: number; text: string };
export type Excerpt = Chunk & { score: number };

/** 문단 단위로 자르고, 너무 긴 문단은 size 글자로 나눈다. overlap만큼 겹쳐 문맥이 끊기지 않게 한다. */
export function chunkText(text: string, size = 500, overlap = 80): Chunk[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const pieces: string[] = [];
  let current = "";
  const flush = () => {
    if (current) pieces.push(current);
    current = "";
  };
  for (const paragraph of paragraphs) {
    if (paragraph.length > size) {
      flush();
      for (let start = 0; start < paragraph.length; start += size - overlap) {
        pieces.push(paragraph.slice(start, start + size));
      }
    } else if ((current + "\n\n" + paragraph).length > size) {
      flush();
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  flush();
  return pieces.map((piece, i) => ({ index: i + 1, text: piece }));
}

/**
 * 한글은 조사가 붙어 낱말이 어긋나므로 "연속 두 글자"로 쪼개고, 영어·숫자는 단어 단위로 둔다.
 * 문자 종류(스크립트)가 바뀌는 곳에서 먼저 끊는다: "loader는" → "loader" + "는".
 * 끊지 않으면 "loader는"이 한 덩어리가 되어 질문의 "loader"와 영영 맞지 않는다.
 * (정규식의 v 플래그가 집합 빼기 [A--B]를 지원한다)
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const run of text.toLowerCase().match(/\p{Script=Hangul}+|[[\p{L}\p{N}]--\p{Script=Hangul}]+/gv) ?? []) {
    if (/\p{Script=Hangul}/u.test(run)) {
      if (run.length === 1) tokens.push(run);
      for (let i = 0; i < run.length - 1; i++) tokens.push(run.slice(i, i + 2));
    } else {
      tokens.push(run);
    }
  }
  return tokens;
}

/** TF-IDF 점수로 질문과 가장 관련 있는 발췌 topK개를 고른다. 점수 0인 발췌는 버린다. */
export function search(chunks: Chunk[], query: string, topK = 3): Excerpt[] {
  const queryTokens = [...new Set(tokenize(query))];
  const docs = chunks.map((chunk) => {
    const counts = new Map<string, number>();
    for (const token of tokenize(chunk.text)) counts.set(token, (counts.get(token) ?? 0) + 1);
    return { chunk, counts, length: Math.max(1, [...counts.values()].reduce((a, b) => a + b, 0)) };
  });
  const scored = docs.map(({ chunk, counts, length }) => {
    let score = 0;
    for (const token of queryTokens) {
      const tf = (counts.get(token) ?? 0) / length;
      if (!tf) continue;
      const df = docs.filter((d) => d.counts.has(token)).length;
      score += tf * (Math.log((1 + docs.length) / (1 + df)) + 1); // 어느 발췌에나 있는 흔한 말은 가중치를 낮춘다
    }
    return { ...chunk, score: Number(score.toFixed(4)) };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** 답변에서 "(발췌 N)" 인용 번호를 뽑는다. 실제로 제공한 발췌 번호만 인정한다. */
export function extractCitations(answer: string, provided: number[]): number[] {
  const found = [...answer.matchAll(/발췌\s*(\d+)/g)].map((m) => Number(m[1]));
  return [...new Set(found)].filter((n) => provided.includes(n)).sort((a, b) => a - b);
}
