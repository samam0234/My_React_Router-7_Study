import { useCallback, useEffect, useState } from "react";

/**
 * localStorage에 JSON으로 저장되는 상태.
 * 서버에는 localStorage가 없으므로, 서버 렌더링과 브라우저의 "첫" 렌더링은 항상 initial을 쓰고
 * 마운트된 뒤(useEffect)에 저장된 값을 읽는다. 처음부터 읽으면 서버 HTML과 달라져 하이드레이션 오류가 난다.
 */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // 깨진 JSON이나 접근 불가(사생활 보호 모드)는 initial을 그대로 쓴다.
    }
    setReady(true);
  }, [key]);

  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      setValue((previous) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(previous) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // 저장 공간이 가득 찼거나 막혀 있으면 화면 상태만 바꾼다.
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, update, ready] as const;
}
