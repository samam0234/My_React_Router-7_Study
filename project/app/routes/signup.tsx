import { Form, Link, redirect, useNavigation } from "react-router";
import { FieldError, FormError } from "~/components/field-error";
import { userContext } from "~/context";
import { failure, readFields, type FormFailure } from "~/lib/form.server";
import { signup } from "~/services/auth.server";
import { createUserSession } from "~/session.server";
import type { Route } from "./+types/signup";

export function meta() {
  return [{ title: "회원가입 · RR7 게시판" }];
}

export function loader({ context }: Route.LoaderArgs) {
  if (context.get(userContext)) throw redirect("/posts");
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const values = readFields(form, ["email", "nickname"]);
  try {
    const user = await signup({ ...values, password: String(form.get("password") ?? "") });
    // 가입하자마자 로그인 상태로 만든다.
    return await createUserSession(request, user.id, "/posts", "가입을 환영합니다.");
  } catch (error) {
    return failure(error, values);
  }
}

export default function Signup({ actionData }: Route.ComponentProps) {
  const failed = actionData as FormFailure | undefined;
  const submitting = useNavigation().state !== "idle";
  const input = "mt-1 w-full rounded border px-3 py-2 dark:bg-gray-900";
  return (
    <>
      <h1 className="mb-4 text-xl font-bold">회원가입</h1>
      <Form method="post" className="space-y-3">
        <FormError message={failed?.formError} />
        <div>
          <label htmlFor="email" className="block text-sm">이메일</label>
          <input id="email" name="email" type="email" autoComplete="email" defaultValue={failed?.values.email} className={input} />
          <FieldError messages={failed?.errors.email} />
        </div>
        <div>
          <label htmlFor="nickname" className="block text-sm">닉네임</label>
          <input id="nickname" name="nickname" autoComplete="nickname" defaultValue={failed?.values.nickname} className={input} />
          <FieldError messages={failed?.errors.nickname} />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm">비밀번호 (8자 이상)</label>
          <input id="password" name="password" type="password" autoComplete="new-password" className={input} />
          <FieldError messages={failed?.errors.password} />
        </div>
        <button type="submit" disabled={submitting} className="w-full rounded bg-blue-600 py-2 text-white disabled:opacity-50">
          {submitting ? "가입 중…" : "가입하기"}
        </button>
      </Form>
      <p className="mt-4 text-sm">
        이미 계정이 있나요? <Link to="/login" className="text-blue-600 underline">로그인</Link>
      </p>
    </>
  );
}
