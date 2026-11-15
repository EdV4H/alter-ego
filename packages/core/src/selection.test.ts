import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { describe, expect, it } from "vitest";
import { resolveEffectiveSelection } from "./selection.js";

const schema: AvatarSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [{ id: "hair", name: "髪", zIndex: 0 }],
  parts: [
    {
      id: "hair-01",
      slotId: "hair",
      name: "ショート",
      assetId: "a1",
      colorable: true,
      variants: [
        { id: "hair-01-red", overrides: { color: "#ff0000" } },
        {
          id: "hair-01-physics",
          overrides: { color: "#00ff00", "x-physics": { sway: 0.3 } },
        },
      ],
    },
    {
      id: "hair-02",
      slotId: "hair",
      name: "ロング",
      assetId: "a2",
    },
  ],
  assets: [
    { id: "a1", kind: "svg", src: "a1.svg" },
    { id: "a2", kind: "svg", src: "a2.svg" },
  ],
};

describe("resolveEffectiveSelection", () => {
  it("variantId も color もない場合は partId だけを返す", () => {
    const result = resolveEffectiveSelection(schema, { partId: "hair-01" });
    expect(result).toEqual({ partId: "hair-01" });
  });

  it("variantId が指定された場合は variant.overrides を適用する", () => {
    const result = resolveEffectiveSelection(schema, {
      partId: "hair-01",
      variantId: "hair-01-red",
    });
    expect(result).toEqual({
      partId: "hair-01",
      variantId: "hair-01-red",
      color: "#ff0000",
    });
  });

  it("Selection.color は variant.overrides.color より優先される", () => {
    const result = resolveEffectiveSelection(schema, {
      partId: "hair-01",
      variantId: "hair-01-red",
      color: "#0000ff",
    });
    expect(result.color).toBe("#0000ff");
  });

  it("Selection が color だけ上書きした場合、variant の x-* は保持される", () => {
    const result = resolveEffectiveSelection(schema, {
      partId: "hair-01",
      variantId: "hair-01-physics",
      color: "#0000ff",
    });
    expect(result).toEqual({
      partId: "hair-01",
      variantId: "hair-01-physics",
      color: "#0000ff",
      "x-physics": { sway: 0.3 },
    });
  });

  it("Selection の x-* は variant の x-* をトップレベル単位で置換する (浅いマージ)", () => {
    const result = resolveEffectiveSelection(schema, {
      partId: "hair-01",
      variantId: "hair-01-physics",
      "x-physics": { sway: 0.9, gravity: 1.0 },
    } as never); // SelectionEntry の x-* インデックスシグネチャを使う
    expect(result["x-physics"]).toEqual({ sway: 0.9, gravity: 1.0 });
    expect(result.color).toBe("#00ff00");
  });

  it("variant を持たない Part でも動作する", () => {
    const result = resolveEffectiveSelection(schema, {
      partId: "hair-02",
      color: "#abcdef",
    });
    expect(result).toEqual({ partId: "hair-02", color: "#abcdef" });
  });

  it("存在しない partId の場合は例外を投げる", () => {
    expect(() =>
      resolveEffectiveSelection(schema, { partId: "unknown" }),
    ).toThrow(/unknown part/i);
  });

  it("Part に存在しない variantId の場合は例外を投げる", () => {
    expect(() =>
      resolveEffectiveSelection(schema, {
        partId: "hair-01",
        variantId: "no-such-variant",
      }),
    ).toThrow(/unknown variant/i);
  });
});
