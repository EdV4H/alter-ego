const XLINK = "http://www.w3.org/1999/xlink";
const HEX = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** svgToPng の引数（ADR-0016） */
export interface SvgToPngOptions {
  /** 長辺の画素数。短辺は viewBox の比で決める */
  readonly size: number;
  /** 背景色（hex）。省略すると透明 */
  readonly background?: string;
}

/** viewBox から、長辺が size になる書き出しの寸法を求める。viewBox が無いか壊れていれば正方形 */
export function pngSizeOf(viewBox: string | null, size: number): { width: number; height: number } {
  const vb = viewBox?.trim().split(/[\s,]+/).map(Number);
  const valid = vb && vb.length === 4 && vb.every((n) => Number.isFinite(n)) && (vb[2] as number) > 0 && (vb[3] as number) > 0;
  const w = valid ? (vb[2] as number) : size;
  const h = valid ? (vb[3] as number) : size;
  return w >= h
    ? { width: size, height: Math.max(1, Math.round((size * h) / w)) }
    : { width: Math.max(1, Math.round((size * w) / h)), height: size };
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)), { once: true });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("read failed")), { once: true });
    reader.readAsDataURL(blob);
  });
}

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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        image.setAttribute("href", await blobToDataUri(await res.blob()));
      } catch {
        image.setAttribute("href", "");
      }
      image.removeAttributeNS(XLINK, "href");
    }),
  );
}

/**
 * 書き出し用に <svg> を複製する。元の要素は変えない。
 * 寸法を固定し（固定しないと表示サイズで読まれてぼやける）、<image> を data URI にする。
 */
export async function prepareSvgForPng(
  svg: SVGSVGElement,
  size: number,
): Promise<{ svg: SVGSVGElement; width: number; height: number }> {
  const { width, height } = pngSizeOf(svg.getAttribute("viewBox"), size);
  const cloned = svg.cloneNode(true) as SVGSVGElement;
  cloned.setAttribute("width", String(width));
  cloned.setAttribute("height", String(height));
  await inlineImages(cloned);
  return { svg: cloned, width, height };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img), { once: true });
    img.addEventListener("error", () => reject(new Error("SVG could not be loaded as an image")), { once: true });
    img.src = src;
  });
}

/**
 * 描画中の <svg> を PNG にする（ADR-0016）。ブラウザ専用。
 * SVG を複製 → 画像を data URI 化 → <img> で読む → canvas に背景と SVG を描く → PNG。
 */
export async function svgToPng(svg: SVGSVGElement, options: SvgToPngOptions): Promise<Blob> {
  if (typeof document === "undefined") throw new Error("svgToPng needs a browser (document is not available)");
  if (!Number.isFinite(options.size) || options.size <= 0) throw new RangeError("size must be a positive number");
  if (options.background !== undefined && !HEX.test(options.background)) {
    throw new Error(`background must be a hex color: ${options.background}`);
  }

  const prepared = await prepareSvgForPng(svg, Math.round(options.size));
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(prepared.svg)], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = prepared.width;
    canvas.height = prepared.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context is not available");
    if (options.background) {
      ctx.fillStyle = options.background;
      ctx.fillRect(0, 0, prepared.width, prepared.height);
    }
    ctx.drawImage(img, 0, 0, prepared.width, prepared.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG encode failed (the canvas may be tainted)");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
