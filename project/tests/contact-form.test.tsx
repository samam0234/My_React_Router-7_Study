// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactForm } from "~/components/lab/ui-demos";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals(); // 가짜 fetch를 반드시 되돌린다
});

async function fillValid() {
  await userEvent.type(screen.getByLabelText("이름"), "방문자");
  await userEvent.type(screen.getByLabelText("이메일"), "v@example.com");
  await userEvent.type(screen.getByLabelText("내용"), "안녕하세요 문의드립니다");
}

describe("ContactForm (react-hook-form + zod)", () => {
  it("브라우저에서 먼저 검증한다: 비어 있으면 서버 호출 없이 필드 오류", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ContactForm />);
    await userEvent.click(screen.getByRole("button", { name: "보내기" }));
    expect(await screen.findByText("이름을 입력하세요.")).toBeInTheDocument();
    expect(screen.getByText("올바른 이메일을 입력하세요.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("202면 입력을 비우고 접수 메시지", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: { received: true } }, { status: 202 })));
    render(<ContactForm />);
    await fillValid();
    await userEvent.click(screen.getByRole("button", { name: "보내기" }));
    expect(await screen.findByText("문의를 접수했습니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("이름")).toHaveValue("");
  });

  it("400/422면 서버가 준 fields를 해당 입력칸 아래에 붙인다", async () => {
    for (const status of [400, 422]) {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { fields: { email: ["서버가 거절한 이메일입니다."] } } }, { status })));
      const view = render(<ContactForm />);
      await fillValid();
      await userEvent.click(screen.getByRole("button", { name: "보내기" }));
      expect(await screen.findByText("서버가 거절한 이메일입니다.")).toBeInTheDocument();
      view.unmount();
    }
  });

  it("429면 Retry-After를 알려 준다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: "RATE_LIMITED" } }, { status: 429, headers: { "Retry-After": "30" } })));
    render(<ContactForm />);
    await fillValid();
    await userEvent.click(screen.getByRole("button", { name: "보내기" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("30초 뒤에 다시"));
  });

  it("보내는 본문은 검증·정제된 JSON", async () => {
    const fetchMock = vi.fn(async () => Response.json({}, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ContactForm />);
    await fillValid();
    await userEvent.click(screen.getByRole("button", { name: "보내기" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/contact");
    expect(JSON.parse(String(init.body))).toEqual({ name: "방문자", email: "v@example.com", message: "안녕하세요 문의드립니다" });
  });
});
