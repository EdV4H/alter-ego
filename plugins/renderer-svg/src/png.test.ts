import { afterEach, describe, expect, it, vi } from "vitest";
import { pngSizeOf, prepareSvgForPng, svgToPng } from "./png.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const makeSvg = (viewBox: string | null, imageHref?: string): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  if (viewBox) svg.setAttribute("viewBox", viewBox);
  if (imageHref) {
    const image = document.createElementNS(SVG_NS, "image");
    image.setAttribute("href", imageHref);
    svg.appendChild(image);
  }
  return svg;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pngSizeOf (ADR-0016)", () => {
  it("長辺を size に合わせ、短辺は viewBox の比で決める", () => {
    expect(pngSizeOf("0 0 400 400", 512)).toEqual({ width: 512, height: 512 });
    expect(pngSizeOf("0 0 400 200", 512)).toEqual({ width: 512, height: 256 });
    expect(pngSizeOf("0 0 300 600", 512)).toEqual({ width: 256, height: 512 });
    expect(pngSizeOf("10,20,400,200", 100)).toEqual({ width: 100, height: 50 });
  });

  it("viewBox が無いか壊れていれば正方形", () => {
    expect(pngSizeOf(null, 256)).toEqual({ width: 256, height: 256 });
    expect(pngSizeOf("0 0 0 100", 256)).toEqual({ width: 256, height: 256 });
    expect(pngSizeOf("abc", 256)).toEqual({ width: 256, height: 256 });
  });
});

describe("prepareSvgForPng (ADR-0016)", () => {
  it("複製に寸法を固定し、元の <svg> は変えない", async () => {
    const svg = makeSvg("0 0 400 200");
    const prepared = await prepareSvgForPng(svg, 512);
    expect(prepared.svg).not.toBe(svg);
    expect(prepared.svg.getAttribute("width")).toBe("512");
    expect(prepared.svg.getAttribute("height")).toBe("256");
    expect(svg.hasAttribute("width")).toBe(false);
  });

  it("<image> を data URI にし、読めない画像は外す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("ok") ? new Response(new Blob(["<svg/>"], { type: "image/svg+xml" })) : new Response(null, { status: 404 }),
      ),
    );
    const ok = await prepareSvgForPng(makeSvg("0 0 10 10", "https://cdn.example.com/ok.svg"), 10);
    expect(ok.svg.querySelector("image")?.getAttribute("href")).toMatch(/^data:/);

    const ng = await prepareSvgForPng(makeSvg("0 0 10 10", "https://cdn.example.com/ng.svg"), 10);
    expect(ng.svg.querySelector("image")?.getAttribute("href")).toBe("");
  });

  it("data URI の画像はそのまま", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const prepared = await prepareSvgForPng(makeSvg("0 0 10 10", "data:image/png;base64,AAAA"), 10);
    expect(prepared.svg.querySelector("image")?.getAttribute("href")).toBe("data:image/png;base64,AAAA");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("svgToPng (ADR-0016)", () => {
  it("background が hex でなければエラー", async () => {
    await expect(svgToPng(makeSvg("0 0 10 10"), { size: 10, background: "red" })).rejects.toThrow(/hex/);
  });

  it("size が正の数でなければエラー", async () => {
    await expect(svgToPng(makeSvg("0 0 10 10"), { size: 0 })).rejects.toThrow(RangeError);
  });
});
