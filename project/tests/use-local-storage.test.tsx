// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useLocalStorage } from "~/lib/use-local-storage";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("useLocalStorage", () => {
  it("저장값이 없으면 초기값을 쓰고 ready가 된다", () => {
    const { result } = renderHook(() => useLocalStorage<string[]>("k", ["기본"]));
    expect(result.current[0]).toEqual(["기본"]);
    expect(result.current[2]).toBe(true); // 마운트 effect가 끝났다
  });

  it("마운트 뒤에 저장된 값을 복원한다", () => {
    localStorage.setItem("k", JSON.stringify(["a", "b"]));
    const { result } = renderHook(() => useLocalStorage<string[]>("k", []));
    expect(result.current[0]).toEqual(["a", "b"]);
  });

  it("바꾸면 localStorage에도 JSON으로 저장된다(함수형 갱신 포함)", () => {
    const { result } = renderHook(() => useLocalStorage<string[]>("k", []));
    act(() => result.current[1](["x"]));
    act(() => result.current[1]((prev) => [...prev, "y"]));
    expect(result.current[0]).toEqual(["x", "y"]);
    expect(JSON.parse(localStorage.getItem("k")!)).toEqual(["x", "y"]);
  });

  it("깨진 JSON이 들어 있어도 죽지 않고 초기값을 쓴다", () => {
    localStorage.setItem("k", "{not json");
    const { result } = renderHook(() => useLocalStorage<string[]>("k", ["기본"]));
    expect(result.current[0]).toEqual(["기본"]);
  });
});
