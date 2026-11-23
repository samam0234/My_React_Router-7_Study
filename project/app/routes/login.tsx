import { Form, Link, redirect, useNavigation } from "react-router";
import { FieldError, FormError } from "~/components/field-error";
import { userContext } from "~/context";
import { failure, readFields, type FormFailure } from "~/lib/form.server";
import { createUserSession, safeRedirect } from "~/session.server";
import { login } from "~/services/auth.server";
import { githubEnabled } from "~/services/oauth.server";
import type { Route } from "./+types/login";

export function meta() {
  return [{ title: "로그인 · RR7 게시판" }];
}

export async function loader({ url, context }: Route.LoaderArgs) {
  const redirectTo = safeRedirect(url.searchParams.get("redirectTo"), "/posts");
  // 이미 로그인했다면 로그인 화면을 보여 줄 이유가 없다.
  if (context.get(userContext)) throw redirect(redirectTo);
  return { redirectTo, github: githubEnabled() };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const values = readFields(form, ["email"]);
  const redirectTo = safeRedirect(form.get("redirectTo"), "/posts");
  try {
    const user = await login({ email: values.email, password: String(form.get("password") ?? "") });
    return await createUserSession(request, user.id, redirectTo, `${user.nickname}님 환영합니다.`);
  } catch (error) {
    return failure(error, values); // 비밀번호는 다시 채워 보내지 않는다.
  }
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const failed = actionData as FormFailure | undefined;
  const submitting = useNavigation().state !== "idle";
  return (
    <>
      <h1 className="mb-4 text-xl font-bold">로그인</h1>
      <Form method="post" className="space-y-3">
        <input type="hidden" name="redirectTo" value={loaderData.redirectTo} />
        <FormError message={failed?.formError} />
        <div>
          <label htmlFor="email" className="block text-sm">이메일</label>
          <input id="email" name="email" type="email" autoComplete="email" defaultValue={failed?.values.email}
            className="mt-1 w-full rounded border px-3 py-2 dark:bg-gray-900" />
          <FieldError messages={failed?.errors.email} />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm">비밀번호</label>
          <input id="password" name="password" type="password" autoComplete="current-password"
            className="mt-1 w-full rounded border px-3 py-2 dark:bg-gray-900" />
          <FieldError messages={failed?.errors.password} />
        </div>
        <button type="submit" disabled={submitting}
          className="w-full rounded bg-blue-600 py-2 text-white disabled:opacity-50">
          {submitting ? "확인 중…" : "로그인"}
        </button>
      </Form>
      {loaderData.github ? (
        // 소셜 로그인은 "페이지 이동"이어야 한다(fetch 불가). 그래서 Form이 아니라 일반 링크다.
        <a href="/auth/github" className="mt-3 block rounded border py-2 text-center">GitHub로 로그인</a>
      ) : null}
      <p className="mt-4 text-sm">
        계정이 없나요? <Link to="/signup" className="text-blue-600 underline">회원가입</Link>
      </p>
    </>
  );
}
