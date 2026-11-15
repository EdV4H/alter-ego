import { describe, expect, it } from "vitest";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { resolveAllColors, resolveColorBindings } from "./colors.js";

const schema: AvatarSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [
    { id: "face", name: "顔", zIndex: 0 },
    { id: "hair", name: "髪", zIndex: 10 },
    { id: "brow", name: "眉", zIndex: 20 },
    { id: "nose", name: "鼻", zIndex: 30 },
  ],
  parts: [
    { id: "face-01", slotId: "face", name: "F", assetId: "a-face" },
    {
      id: "hair-01",
      slotId: "hair",
      name: "H1",
      assetId: "a-hair",
      variants: [{ id: "dark", overrides: { color: "#000000" } }],
    },
    { id: "hair-02", slotId: "hair", name: "H2", assetId: "a-hair" },
    { id: "brow-01", slotId: "brow", name: "B", assetId: "a-brow" },
    { id: "nose-01", slotId: "nose", name: "N", assetId: "a-nose" },
  ],
  assets: [
    { id: "a-face", kind: "svg", src: "f.svg", colorBindings: [{ target: "#50C7FF", from: ["self"] }] },
    {
      id: "a-hair",
      kind: "svg",
      src: "h.svg",
      colorBindings: [
        { target: "#FCD0D0", from: ["self"] },
        { target: "#50C7FF", from: ["face"] },
      ],
    },
    { id: "a-brow", kind: "svg", src: "b.svg", colorBindings: [{ target: "#FFEB87", from: ["self", "hair"] }] },
    { id: "a-nose", kind: "svg", src: "n.svg", colorBindings: [{ target: "#50C7FF", from: ["face"] }] },
  ],
};

describe("resolveColorBindings", () => {
  it("self と別 Slot の色をそれぞれの領域に割り当てる", () => {
    const selections = {
      face: { partId: "face-01", color: "#f0d0b0" },
      hair: { partId: "hair-01", color: "#663300" },
    };
    expect(resolveColorBindings(schema, selections, "hair")).toEqual([
      { target: "#FCD0D0", color: "#663300" },
      { target: "#50C7FF", color: "#f0d0b0" },
    ]);
  });

  it("from の先頭に色が無ければ次の Slot の色を使う", () => {
    const selections = {
      hair: { partId: "hair-01", color: "#663300" },
      brow: { partId: "brow-01" },
    };
    expect(resolveColorBindings(schema, selections, "brow")).toEqual([
      { target: "#FFEB87", color: "#663300" },
    ]);
    expect(
      resolveColorBindings(schema, { ...selections, brow: { partId: "brow-01", color: "#123456" } }, "brow"),
    ).toEqual([{ target: "#FFEB87", color: "#123456" }]);
  });

  it("どの Slot にも色が無い領域は含めない", () => {
    const selections = { hair: { partId: "hair-01" }, nose: { partId: "nose-01" } };
    expect(resolveColorBindings(schema, selections, "hair")).toEqual([]);
    expect(resolveColorBindings(schema, selections, "nose")).toEqual([]);
  });

  it("variant.overrides の色も参照先の色として使う（ADR-0003 のマージ後）", () => {
    const selections = {
      hair: { partId: "hair-01", variantId: "dark" },
      brow: { partId: "brow-01" },
    };
    expect(resolveColorBindings(schema, selections, "brow")).toEqual([
      { target: "#FFEB87", color: "#000000" },
    ]);
  });

  it("partId を指定すると未選択の Part を今の色で解決する（サムネイル用）", () => {
    const selections = {
      face: { partId: "face-01", color: "#f0d0b0" },
      hair: { partId: "hair-01", variantId: "dark", color: "#663300" },
    };
    expect(resolveColorBindings(schema, selections, "hair", "hair-02")).toEqual([
      { target: "#FCD0D0", color: "#663300" },
      { target: "#50C7FF", color: "#f0d0b0" },
    ]);
  });

  it("Slot が未選択なら空", () => {
    expect(resolveColorBindings(schema, {}, "hair")).toEqual([]);
  });
});

describe("resolveAllColors", () => {
  it("解決結果がある Slot だけを返す", () => {
    const selections = {
      face: { partId: "face-01", color: "#f0d0b0" },
      hair: { partId: "hair-01" },
      nose: { partId: "nose-01" },
    };
    expect(resolveAllColors(schema, selections)).toEqual({
      face: [{ target: "#50C7FF", color: "#f0d0b0" }],
      hair: [{ target: "#50C7FF", color: "#f0d0b0" }],
      nose: [{ target: "#50C7FF", color: "#f0d0b0" }],
    });
  });
});
