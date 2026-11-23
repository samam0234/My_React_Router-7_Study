import { Form, useNavigation } from "react-router";
import type { FormFailure } from "~/lib/form.server";
import { FieldError, FormError } from "./field-error";

type Props = {
  submitLabel: string;
  defaults: { title: string; body: string; tags: string };
  failure?: FormFailure;
};

/** 글쓰기·수정이 같이 쓰는 폼. 서버가 돌려준 값(failure.values)이 있으면 그것으로 다시 채운다. */
export function PostForm({ submitLabel, defaults, failure }: Props) {
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";
  const values = failure?.values ?? defaults;
  return (
    <Form method="post" className="space-y-4">
      <FormError message={failure?.formError} />
      <div>
        <label htmlFor="title" className="block text-sm font-medium">제목</label>
        <input
          id="title"
          name="title"
          defaultValue={values.title}
          maxLength={200}
          aria-invalid={failure?.errors.title ? true : undefined}
          className="mt-1 w-full rounded border px-3 py-2 dark:bg-gray-900"
        />
        <FieldError messages={failure?.errors.title} />
      </div>
      <div>
        <label htmlFor="body" className="block text-sm font-medium">본문</label>
        <textarea
          id="body"
          name="body"
          rows={8}
          defaultValue={values.body}
          aria-invalid={failure?.errors.body ? true : undefined}
          className="mt-1 w-full rounded border px-3 py-2 dark:bg-gray-900"
        />
        <FieldError messages={failure?.errors.body} />
      </div>
      <div>
        <label htmlFor="tags" className="block text-sm font-medium">태그 (쉼표로 구분, 최대 5개)</label>
        <input
          id="tags"
          name="tags"
          defaultValue={values.tags}
          className="mt-1 w-full rounded border px-3 py-2 dark:bg-gray-900"
        />
        <FieldError messages={failure?.errors.tags} />
      </div>
      {/* 전송 중에는 버튼을 막아 같은 요청이 두 번 가지 않게 한다. */}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? "저장 중…" : submitLabel}
      </button>
    </Form>
  );
}
