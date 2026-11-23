import { describe, expect, it } from "vitest";
import { chunkText, extractCitations, search, tokenize } from "~/ai/rag.server";

describe("tokenize", () => {
  it("영문+한글 조사는 문자 종류가 바뀌는 곳에서 끊는다", () => {
    expect(tokenize("loader는")).toEqual(["loader", "는"]);
    expect(tokenize("React Router 7의")).toEqual(["react", "router", "7", "의"]);
  });

  it("한글은 연속 두 글자로 쪼갠다", () => {
    expect(tokenize("서버에서")).toEqual(["서버", "버에", "에서"]);
  });
});

describe("chunkText", () => {
  it("문단 단위로 묶고 번호는 1부터", () => {
    const chunks = chunkText("가나다\n\n라마바\n\n사아자", 8);
    expect(chunks.map((c) => c.index)).toEqual([1, 2]);
    expect(chunks[0].text).toBe("가나다\n\n라마바");
  });

  it("긴 문단은 size로 자르고 overlap만큼 겹친다", () => {
    const chunks = chunkText("a".repeat(1200), 500, 80);
    expect(chunks.length).toBe(3);
    expect(chunks[0].text.length).toBe(500);
  });
});

describe("search", () => {
  const chunks = chunkText(
    "loader는 서버에서 실행되어 데이터를 읽습니다.\n\n쿠키 세션은 로그인 상태를 유지합니다.\n\n배포는 Docker로 컨테이너를 만듭니다.",
    40,
  );

  it("질문과 겹치는 발췌를 점수 순으로 돌려준다", () => {
    const hits = search(chunks, "loader는 무엇을 하나요?");
    expect(hits[0].text).toContain("loader");
  });

  it("영문 낱말만으로도 한글 조사가 붙은 문장을 찾는다", () => {
    expect(search(chunks, "loader")[0].text).toContain("loader는");
  });

  it("겹치는 말이 없으면 빈 배열(= 모델을 부르지 않는다)", () => {
    expect(search(chunks, "zzzqqq 전혀무관xyz")).toEqual([]);
  });

  it("topK 개수를 넘지 않는다", () => {
    expect(search(chunks, "서버 세션 컨테이너 데이터", 2).length).toBeLessThanOrEqual(2);
  });
});

describe("extractCitations", () => {
  it("제공한 발췌 번호만 인정한다(환각된 번호는 버림)", () => {
    expect(extractCitations("A입니다 (발췌 1). B입니다 (발췌 3) (발췌 9).", [1, 2, 3])).toEqual([1, 3]);
    expect(extractCitations("근거 없음", [1])).toEqual([]);
  });
});
