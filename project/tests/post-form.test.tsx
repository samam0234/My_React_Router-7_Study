// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PostForm } from "~/components/post-form";

afterEach(cleanup);

describe("PostForm 컴포넌트", () => {
  it("서버가 돌려준 오류와 입력값을 보여 준다", () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <PostForm
            submitLabel="등록"
            defaults={{ title: "", body: "", tags: "" }}
            failure={{
              errors: { title: ["1~200자로 입력하세요."] },
              values: { title: "", body: "남은 본문", tags: "a" },
            }}
          />
        ),
      },
    ]);
    render(<Stub />);
    expect(screen.getByRole("alert")).toHaveTextContent("1~200자로 입력하세요.");
    expect(screen.getByLabelText("본문")).toHaveValue("남은 본문");
  });

  it("제출하면 action이 호출되고 전송 중에는 버튼이 막힌다", async () => {
    const action = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return null;
    });
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => <PostForm submitLabel="등록" defaults={{ title: "", body: "", tags: "" }} />,
        action,
      },
    ]);
    render(<Stub />);
    await userEvent.type(screen.getByLabelText("제목"), "새 글");
    await userEvent.click(screen.getByRole("button", { name: "등록" }));
    expect(await screen.findByRole("button", { name: "저장 중…" })).toBeDisabled();
    await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  });
});
