import { z } from "zod";

// 이 파일은 서버와 브라우저가 같이 쓴다. 비밀값이나 DB 코드를 넣지 않는다.
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("올바른 이메일을 입력하세요."));

export const signupSchema = z.object({
  email,
  password: z
    .string()
    .min(8, "8자 이상 입력하세요.")
    .max(72, "72자 이하로 입력하세요."),
  nickname: z.string().trim().min(2, "2~20자로 입력하세요.").max(20, "2~20자로 입력하세요."),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "비밀번호를 입력하세요."),
});

const title = z.string().trim().min(1, "1~200자로 입력하세요.").max(200, "1~200자로 입력하세요.");
const body = z.string().trim().min(1, "본문을 입력하세요.").max(10000, "10000자 이하로 입력하세요.");
const tag = z.string().trim().min(1, "빈 태그는 쓸 수 없습니다.").max(30, "태그는 30자 이하입니다.");
const tags = z.array(tag).max(5, "태그는 5개까지입니다.");

export const postCreateSchema = z.object({
  title,
  body,
  tags: tags.default([]),
});

// PATCH는 일부 필드만 온다. default를 두면 안 보낸 tags가 []로 덮어써지므로 optional만 쓴다.
export const postPatchSchema = z
  .object({
    title: title.optional(),
    body: body.optional(),
    tags: tags.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "수정할 필드를 하나 이상 보내세요.");

export const commentSchema = z.object({
  body: z.string().trim().min(1, "댓글을 입력하세요.").max(1000, "1000자 이하로 입력하세요."),
});

// 문의 폼: 브라우저(react-hook-form)와 서버(API)가 이 스키마 하나를 같이 쓴다.
export const contactSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요.").max(50, "50자 이하로 입력하세요."),
  email,
  message: z.string().trim().min(10, "10자 이상 입력하세요.").max(2000, "2000자 이하로 입력하세요."),
});

/** HTML 폼의 "a, b, c" 입력을 태그 배열로 바꾼다. 중복과 빈 값은 버린다. */
export function parseTags(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return [...new Set(raw.split(",").map((item) => item.trim()).filter(Boolean))];
}

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PostCreateInput = z.infer<typeof postCreateSchema>;
export type PostPatchInput = z.infer<typeof postPatchSchema>;
