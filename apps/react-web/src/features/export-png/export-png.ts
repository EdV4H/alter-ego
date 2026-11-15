import { drawBackground, readFileAsDataUri, type BackgroundConfig } from "../background/background.js";

const XLINK = "http://www.w3.org/1999/xlink";

/**
 * SVG 内の <image href> をすべて data URI にする。
 * blob: や http: のまま canvas に描くと canvas が汚染され toBlob が失敗するため。
 * 読めなかった画像は href を空にして描画から外す。
 */
async function inlineImages(root: SVGSVGElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("image"));
  await Promise.all(
    images.map(async (image) => {
      const href = image.getAttribute("href") ?? image.getAttributeNS(XLINK, "href");
      if (!href || href.startsWith("data:")) return;
      try {
        const res = await fetch(href);
        image.setAttribute("href", await readFileAsDataUri(await res.blob()));
      } catch (e) {
        console.warn("[export-png] 画像を埋め込めなかったので外します", href, e);
        image.setAttribute("href", "");
      }
      image.removeAttributeNS(XLINK, "href");
    }),
  );
}

/** viewBox から、長辺が size になる書き出しサイズを求める。viewBox が壊れていれば正方形 */
export function exportSizeOf(viewBox: string | null, size: number): { width: number; height: number } {
  const vb = viewBox?.trim().split(/[\s,]+/).map(Number);
  const valid = vb && vb.length === 4 && vb.every((n) => Number.isFinite(n) && n > 0);
  const w = valid ? (vb[2] as number) : size;
  const h = valid ? (vb[3] as number) : size;
  return w >= h
    ? { width: size, height: Math.round((size * h) / w) }
    : { width: Math.round((size * w) / h), height: size };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img), { once: true });
    img.addEventListener("error", () => reject(new Error("SVG load failed")), { once: true });
    img.src = src;
  });
}

/**
 * 描画中のアバター SVG を PNG にする。
 * SVG を複製 → 画像を data URI 化 → <img> で読む → canvas に背景と SVG を描く → PNG。
 */
export async function renderAvatarPng(
  svg: SVGSVGElement,
  background: BackgroundConfig,
  size: number,
): Promise<Blob> {
  const { width, height } = exportSizeOf(svg.getAttribute("viewBox"), size);
  // width / height を固定しないと <img> が表示サイズで読まれてぼやける
  const cloned = svg.cloneNode(true) as SVGSVGElement;
  cloned.setAttribute("width", String(width));
  cloned.setAttribute("height", String(height));
  await inlineImages(cloned);

  const svgUrl = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(cloned)], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const img = await loadImage(svgUrl);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas context unavailable");
    await drawBackground(ctx, width, height, background);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG encode failed (canvas may be tainted)");
    return blob;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/** Blob をファイルとして保存させる */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Firefox は click 直後に revoke すると保存に失敗するので、次のタスクで消す
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** avatar-2026-06-16T12-34-56.png の形のファイル名 */
export function pngFilename(now = new Date()): string {
  return `avatar-${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)}.png`;
}
