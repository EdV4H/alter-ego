import { describe, expect, it } from "vitest";
import { blobToDataUrl, calcTargetSize } from "./resize.js";

describe("blobToDataUrl", () => {
  it("Blob を data URL に変換する", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    const url = await blobToDataUrl(blob);
    expect(url.startsWith("data:text/plain")).toBe(true);
    expect(url).toContain("base64,");
  });
});

describe("calcTargetSize", () => {
  it("long-edge が limit 以下ならそのまま", () => {
    expect(calcTargetSize(800, 600, 1024)).toEqual({ width: 800, height: 600 });
  });

  it("横長は width=limit、 height を比率縮小", () => {
    expect(calcTargetSize(2048, 1024, 1024)).toEqual({
      width: 1024,
      height: 512,
    });
  });

  it("縦長は height=limit、 width を比率縮小", () => {
    expect(calcTargetSize(1024, 2048, 1024)).toEqual({
      width: 512,
      height: 1024,
    });
  });

  it("同じ辺長なら limit にスナップ", () => {
    expect(calcTargetSize(2048, 2048, 1024)).toEqual({
      width: 1024,
      height: 1024,
    });
  });
});
