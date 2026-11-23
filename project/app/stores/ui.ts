import { create } from "zustand";

export type Theme = "light" | "dark" | "system";
type Toast = { id: number; message: string };

type UiState = {
  theme: Theme;
  toasts: Toast[];
  unread: number;
  setTheme: (theme: Theme) => void;
  pushToast: (message: string) => void;
  dismissToast: (id: number) => void;
  bump: () => void;
  clearUnread: () => void;
};

/** 문서에 theme 클래스를 반영하고 선택을 기억한다. 브라우저에서만 호출한다. */
export function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("theme", theme);
}

let nextToastId = 1;

/**
 * 화면 상태(테마·토스트·안 읽은 알림 수)만 담는다.
 * ⚠ 이 모듈은 서버에서도 한 번 로드되어 "모든 요청이 공유"한다. 그래서 사용자별 데이터(이름, 토큰 등)는
 *   여기에 넣지 않고 loader가 주는 데이터로 다룬다. 이 store는 브라우저에서만 값을 바꾼다.
 */
export const useUiStore = create<UiState>((set) => ({
  theme: "system",
  toasts: [],
  unread: 0,
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  pushToast: (message) => set((s) => ({ toasts: [...s.toasts, { id: nextToastId++, message }].slice(-4) })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  bump: () => set((s) => ({ unread: s.unread + 1 })),
  clearUnread: () => set({ unread: 0 }),
}));

/** 페이지가 그려지기 전에 실행해 깜빡임(흰 화면 → 어두운 화면)을 막는 인라인 스크립트. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;
