const MAX_LONG_EDGE = 1024;
const OUTPUT_MIME = "image/jpeg";
const OUTPUT_QUALITY = 0.9;

/**
 * long-edge を limit に揃える target size を計算する。
 * 既に limit 以下なら元のサイズをそのまま返す。
 *
 * 注意: 縦横比が 1:1024 超 (例: 10000×1) の極端な入力では、 short-edge が
 * Math.round で 0 に丸まる可能性がある。 その場合 resizeImageBlob は
 * canvas.toBlob の null を受けて元 Blob にフォールバックする。 実用上の
 * 写真ではまず発生しないため、 ガードは入れていない。
 */
export function calcTargetSize(
  width: number,
  height: number,
  limit: number = MAX_LONG_EDGE,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= limit) return { width, height };
  const ratio = limit / long;
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

/** Blob を data URL (base64) に変換する。 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("FileReader returned non-string"));
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(blob);
  });
}

/**
 * 画像 Blob を long-edge 1024px に縮小して新しい Blob を返す。
 * 失敗時は元の Blob を返す (フォールバック)。
 *
 * 注意: happy-dom では canvas.toBlob / Image が完全実装されていないため、
 * vitest では vi.mock("./resize.js") で stub し、 Task 10 の手動 E2E で動作確認する。
 */
export async function resizeImageBlob(file: Blob): Promise<Blob> {
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const { width, height } = calcTargetSize(
        img.naturalWidth,
        img.naturalHeight,
      );
      if (width === img.naturalWidth && height === img.naturalHeight) {
        return file;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, OUTPUT_MIME, OUTPUT_QUALITY),
      );
      return blob ?? file;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    console.warn("[resizeImageBlob] 縮小に失敗したため元ファイルを使用します:", err);
    return file;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}
