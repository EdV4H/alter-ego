import { svgToPng } from "@edv4h/alter-ego-plugin-renderer-svg";
import { drawBackground, type BackgroundConfig } from "../background/background.js";

const HEX = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * 描画中のアバター SVG を PNG にする。
 * 透明と単色の背景は svgToPng に任せ、画像の背景は透明の PNG を作ってから重ねる（ADR-0016）。
 */
export async function renderAvatarPng(
  svg: SVGSVGElement,
  background: BackgroundConfig,
  size: number,
): Promise<Blob> {
  if (background.kind === "transparent") return svgToPng(svg, { size });
  if (background.kind === "color" && HEX.test(background.color)) {
    return svgToPng(svg, { size, background: background.color });
  }

  const avatar = await createImageBitmap(await svgToPng(svg, { size }));
  try {
    const canvas = document.createElement("canvas");
    canvas.width = avatar.width;
    canvas.height = avatar.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas context unavailable");
    await drawBackground(ctx, avatar.width, avatar.height, background);
    ctx.drawImage(avatar, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG encode failed (canvas may be tainted)");
    return blob;
  } finally {
    avatar.close();
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
