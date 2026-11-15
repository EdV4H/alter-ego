import { useSyncExternalStore, type CSSProperties } from "react";

/**
 * アバターの背景。プレビューと PNG 書き出しの両方に使う。
 * - transparent: 透明（PNG も透過）
 * - color: 単色
 * - image: アバターと同じ寸法（400×400 想定）の 1 枚絵を枠いっぱいに引き伸ばす
 */
export type BackgroundConfig =
  | { readonly kind: "transparent" }
  | { readonly kind: "color"; readonly color: string }
  | { readonly kind: "image"; readonly dataUri: string };

/** 背景の色の候補（明るい色から濃い色、アクセントまで） */
export const BACKGROUND_PALETTE: readonly string[] = [
  "#ffffff", "#f5f5f5",
  "#fce3d0", "#fae3d2",
  "#cfe8ff", "#9bd1ff",
  "#cfead4", "#9be0a8",
  "#fff3a8", "#ffd58a",
  "#f3c7e8", "#e8a5c8",
  "#d8caff", "#9b8cf2",
  "#1a1a1a",
];

export const DEFAULT_BACKGROUND: BackgroundConfig = { kind: "color", color: "#ffffff" };

// 背景はアプリ全体で 1 つ。プレビュー・パネル・書き出しが同じものを読むので、
// React の state ではなく小さなストアに置く（どこからでも読み書きできる）。
let current: BackgroundConfig = DEFAULT_BACKGROUND;
const listeners = new Set<() => void>();

export function getBackground(): BackgroundConfig {
  return current;
}

export function setBackground(next: BackgroundConfig): void {
  current = next;
  for (const l of listeners) l();
}

/** 背景が変わったら呼ばれる。解除する関数を返す */
export function subscribeBackground(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useBackground(): BackgroundConfig {
  return useSyncExternalStore(subscribeBackground, getBackground);
}

/** プレビュー枠に当てる CSS */
export function backgroundStyle(bg: BackgroundConfig): CSSProperties {
  switch (bg.kind) {
    case "transparent":
      // 透明は市松模様で見せる（PNG には描かない）
      return {
        backgroundColor: "var(--bg-surface)",
        backgroundImage: "var(--checker)",
        backgroundSize: "var(--checker-size)",
        backgroundPosition: "var(--checker-position)",
      };
    case "color":
      return { background: bg.color };
    case "image":
      return {
        backgroundImage: `url(${bg.dataUri})`,
        backgroundSize: "100% 100%",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
      };
  }
}

/**
 * canvas に背景を描く（PNG 書き出し用）。CSS の backgroundStyle と同じ見た目にする。
 * 画像の読み込みに失敗しても書き出しは止めず、透明のまま続ける。
 */
export async function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bg: BackgroundConfig,
): Promise<void> {
  if (bg.kind === "transparent") return;
  if (bg.kind === "color") {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, width, height);
    return;
  }
  try {
    const img = new Image();
    img.src = bg.dataUri;
    await img.decode();
    ctx.drawImage(img, 0, 0, width, height);
  } catch (e) {
    console.warn("[export-png] 背景画像を読めなかったので透明にします", e);
  }
}

/** ファイルを data URI にする */
export function readFileAsDataUri(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("FileReader returned non-string")),
    );
    reader.addEventListener("error", () => reject(reader.error ?? new Error("FileReader error")));
    reader.readAsDataURL(file);
  });
}
