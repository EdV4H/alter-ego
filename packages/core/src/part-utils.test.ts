import { describe, expect, it } from "vitest";
import { assetSrcForPart } from "./part-utils.js";

const schema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [
    { id: "hair_back", name: "背髪", zIndex: 0 },
    { id: "face", name: "顔", zIndex: 10, required: true },
    { id: "hair_front", name: "前髪", zIndex: 45, required: true },
  ],
  parts: [
    { id: "face-01", slotId: "face", name: "f1", assetId: "a-face-01" },
    { id: "hair-back-02", slotId: "hair_back", name: "hb2", assetId: "a-hb-02" },
    { id: "hair-back-15", slotId: "hair_back", name: "hb15", assetId: "a-hb-15" },
    { id: "hair-front-01", slotId: "hair_front", name: "hf1", assetId: "a-hf-01" },
    { id: "hair-front-15", slotId: "hair_front", name: "hf15", assetId: "a-hf-15" },
  ],
  assets: [
    { id: "a-face-01", kind: "svg" as const, src: "face/face-01.svg" },
    { id: "a-hb-02", kind: "svg" as const, src: "hair_back/hair-back-02.svg" },
    { id: "a-hb-15", kind: "svg" as const, src: "hair_back/hair-back-15.svg" },
    { id: "a-hf-01", kind: "svg" as const, src: "hair_front/hair-front-01.svg" },
    { id: "a-hf-15", kind: "svg" as const, src: "hair_front/hair-front-15.svg" },
  ],
};

describe("assetSrcForPart", () => {
  it("returns asset src for an existing part", () => {
    expect(assetSrcForPart(schema, "face-01")).toBe("face/face-01.svg");
    expect(assetSrcForPart(schema, "hair-front-15")).toBe(
      "hair_front/hair-front-15.svg",
    );
  });

  it("returns null when part or asset is missing", () => {
    expect(assetSrcForPart(schema, "nope")).toBeNull();
  });
});
