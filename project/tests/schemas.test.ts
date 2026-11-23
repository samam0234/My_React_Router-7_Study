import { describe, expect, it } from "vitest";
import { AppError } from "~/lib/errors";
import { parseTags, postCreateSchema, postPatchSchema, signupSchema } from "~/lib/schemas";
import { parseId, parseOrThrow } from "~/lib/validate";

describe("schemas", () => {
  it("이메일은 공백을 지우고 소문자로 만든다", () => {
    const result = signupSchema.parse({ email: "  Mina@Example.COM ", password: "password123", nickname: "mina" });
    expect(result.email).toBe("mina@example.com");
  });

  it("검증 실패는 필드별 메시지를 가진 VALIDATION_ERROR", () => {
    try {
      parseOrThrow(signupSchema, { email: "x", password: "1", nickname: "" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const app = error as AppError;
      expect(app.code).toBe("VALIDATION_ERROR");
      expect(Object.keys(app.fields ?? {}).sort()).toEqual(["email", "nickname", "password"]);
    }
  });

  it("생성에서는 tags 기본값 [], PATCH에서는 안 보낸 필드를 건드리지 않는다", () => {
    expect(postCreateSchema.parse({ title: "a", body: "b" }).tags).toEqual([]);
    expect(postPatchSchema.parse({ title: "새 제목" })).toEqual({ title: "새 제목" });
    expect(() => postPatchSchema.parse({})).toThrow();
  });

  it("parseTags는 중복·빈 값을 버린다", () => {
    expect(parseTags("a, b,, a ,  ")).toEqual(["a", "b"]);
    expect(parseTags(undefined)).toEqual([]);
  });

  it("parseId는 양의 정수만 받는다", () => {
    expect(parseId("12")).toBe(12);
    for (const bad of ["abc", "0", "-1", "1.5", "", undefined]) {
      expect(() => parseId(bad)).toThrow(AppError);
    }
  });
});
