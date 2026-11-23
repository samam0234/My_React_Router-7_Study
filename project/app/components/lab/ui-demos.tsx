import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { contactSchema } from "~/lib/schemas";
import { useUiStore } from "~/stores/ui";

/** 상태 관리(zustand): 테마와 토스트는 컴포넌트가 달라도 같은 store를 본다. */
export function StateDemo() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const pushToast = useUiStore((s) => s.pushToast);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(["light", "dark", "system"] as const).map((value) => (
        <button key={value} type="button" onClick={() => setTheme(value)}
          aria-pressed={theme === value}
          className={`rounded border px-3 py-1 ${theme === value ? "bg-blue-600 text-white" : ""}`}>
          {value}
        </button>
      ))}
      <button type="button" onClick={() => pushToast("토스트가 store를 거쳐 표시됩니다.")} className="rounded border px-3 py-1">
        토스트 띄우기
      </button>
    </div>
  );
}

/** UI 라이브러리(Radix Dialog): 포커스 가두기·ESC 닫기·aria 속성을 라이브러리가 맡는다. 모양은 Tailwind로 입힌다. */
export function ConfirmDemo() {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState("");
  return (
    <>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger className="rounded border border-red-400 px-3 py-1 text-red-600">삭제 확인 열기</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/3 w-80 -translate-x-1/2 rounded bg-white p-4 shadow-lg dark:bg-gray-900">
            <Dialog.Title className="font-semibold">정말 삭제할까요?</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-gray-500">이 작업은 되돌릴 수 없습니다.</Dialog.Description>
            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close className="rounded border px-3 py-1">취소</Dialog.Close>
              <button type="button" className="rounded bg-red-600 px-3 py-1 text-white"
                onClick={() => { setResult("삭제했습니다(예시)."); setOpen(false); }}>
                삭제
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {result ? <p role="status" className="mt-2 text-sm">{result}</p> : null}
    </>
  );
}

type ContactValues = z.input<typeof contactSchema>;

/** 폼 라이브러리(react-hook-form + zod): 브라우저에서 먼저 검증하고, 통과하면 같은 스키마를 쓰는 서버 API로 보낸다. */
export function ContactForm() {
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
  });
  const [message, setMessage] = useState("");

  const onSubmit = handleSubmit(async (values) => {
    setMessage("");
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    // 응답 코드에 따라 화면을 나눈다: 202 성공 / 400·422 필드 오류 / 429 잠시 후 / 그 밖은 일반 오류
    if (response.status === 202) {
      reset();
      setMessage("문의를 접수했습니다.");
    } else if (response.status === 400 || response.status === 422) {
      const body = (await response.json()) as { error: { fields?: Record<string, string[]> } };
      for (const [field, messages] of Object.entries(body.error.fields ?? {})) {
        setError(field as keyof ContactValues, { message: messages[0] });
      }
    } else if (response.status === 429) {
      setMessage(`요청이 너무 많습니다. ${response.headers.get("Retry-After") ?? "잠시"}초 뒤에 다시 시도하세요.`);
    } else {
      setMessage("전송하지 못했습니다. 잠시 후 다시 시도하세요.");
    }
  });

  const input = "mt-1 w-full rounded border px-3 py-2 dark:bg-gray-900";
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-2">
      <div>
        <label htmlFor="c-name" className="text-sm">이름</label>
        <input id="c-name" {...register("name")} className={input} />
        {errors.name ? <p role="alert" className="text-sm text-red-600">{errors.name.message}</p> : null}
      </div>
      <div>
        <label htmlFor="c-email" className="text-sm">이메일</label>
        <input id="c-email" type="email" {...register("email")} className={input} />
        {errors.email ? <p role="alert" className="text-sm text-red-600">{errors.email.message}</p> : null}
      </div>
      <div>
        <label htmlFor="c-message" className="text-sm">내용</label>
        <textarea id="c-message" rows={3} {...register("message")} className={input} />
        {errors.message ? <p role="alert" className="text-sm text-red-600">{errors.message.message}</p> : null}
      </div>
      <button type="submit" disabled={isSubmitting} className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50">
        {isSubmitting ? "보내는 중…" : "보내기"}
      </button>
      {message ? <p role="status" className="text-sm">{message}</p> : null}
    </form>
  );
}
