import { useSyncExternalStore } from "react";

/** 画面のテーマ。system は OS の設定に従う */
export type Theme = "system" | "light" | "dark";

// index.html のインラインスクリプトと同じキー（読み込み直後のちらつきを防ぐため先に当てている）
const STORAGE_KEY = "alter-ego-demo-theme";
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    // localStorage が使えない環境では system のまま
  }
  return "system";
}

let current: Theme = typeof window === "undefined" ? "system" : read();

export function setTheme(next: Theme): void {
  current = next;
  if (next === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = next;
  try {
    if (next === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // 保存できなくても切り替え自体は効く
  }
  for (const l of listeners) l();
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export const THEME_LABEL: Record<Theme, string> = {
  system: "OS に合わせる",
  light: "ライト",
  dark: "ダーク",
};

export const nextTheme = (t: Theme): Theme =>
  t === "system" ? "light" : t === "light" ? "dark" : "system";
