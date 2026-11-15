import { describe, expect, it } from "vitest";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { normalizePairSelections } from "./normalize.js";

// eye_left/right は 01,02 が 1:1。 hair_front は 01,02,03、 hair_back は 01,02 のみ
// (= front-03 に対応する back が無い) というセット設計を模した fixture。
// 対応関係は pairKey と groups で宣言する（ADR-0007）。special は pairKey を持たない
const schema: AvatarSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [
    { id: "face", name: "顔", zIndex: 10, required: true },
    { id: "eye_left", name: "目 (左)", zIndex: 30, required: true },
    { id: "eye_right", name: "目 (右)", zIndex: 30, required: true },
    { id: "hair_front", name: "髪 (前)", zIndex: 45, required: true },
    { id: "hair_back", name: "髪 (後)", zIndex: 5 },
  ],
  parts: [
    { id: "face-01", slotId: "face", name: "F1", assetId: "a"  },
    { id: "eye-left-01", slotId: "eye_left", name: "EL1", assetId: "a", pairKey: "01" },
    { id: "eye-left-02", slotId: "eye_left", name: "EL2", assetId: "a", pairKey: "02" },
    { id: "eye-right-01", slotId: "eye_right", name: "ER1", assetId: "a", pairKey: "01" },
    { id: "eye-right-02", slotId: "eye_right", name: "ER2", assetId: "a", pairKey: "02" },
    { id: "eye-right-special", slotId: "eye_right", name: "ERS", assetId: "a"  },
    { id: "hair-front-01", slotId: "hair_front", name: "HF1", assetId: "a", pairKey: "01" },
    { id: "hair-front-02", slotId: "hair_front", name: "HF2", assetId: "a", pairKey: "02" },
    { id: "hair-front-03", slotId: "hair_front", name: "HF3", assetId: "a", pairKey: "03" },
    { id: "hair-back-01", slotId: "hair_back", name: "HB1", assetId: "a", pairKey: "01" },
    { id: "hair-back-02", slotId: "hair_back", name: "HB2", assetId: "a", pairKey: "02" },
  ],
  assets: [{ id: "a", kind: "svg", src: "x.svg" }],
  groups: [
    { id: "eye", name: "目", slots: ["eye_left", "eye_right"] },
    { id: "hair", name: "髪", slots: ["hair_front", "hair_back"] },
  ],
};

describe("normalizePairSelections", () => {
  it("左右の番号不一致は左に揃え、 color も左に揃う", () => {
    const seed = normalizePairSelections(
      {
        selections: {
          eye_left: { partId: "eye-left-01", color: "#111111" },
          eye_right: { partId: "eye-right-02", color: "#222222" },
        },
      },
      schema,
    );
    expect(seed.selections!.eye_right).toEqual({
      partId: "eye-right-01",
      color: "#111111",
    });
    expect(seed.selections!.eye_left).toEqual({
      partId: "eye-left-01",
      color: "#111111",
    });
  });

  it("左のみ選択なら右を同番号で補完し、 color をコピーする", () => {
    const seed = normalizePairSelections(
      { selections: { eye_left: { partId: "eye-left-02", color: "#333333" } } },
      schema,
    );
    expect(seed.selections!.eye_right).toEqual({
      partId: "eye-right-02",
      color: "#333333",
    });
  });

  it("基準 (左) が未選択なら変更しない", () => {
    const seed = normalizePairSelections(
      { selections: { eye_right: { partId: "eye-right-01" } } },
      schema,
    );
    expect(seed.selections!.eye_left).toBeUndefined();
    expect(seed.selections!.eye_right).toEqual({ partId: "eye-right-01" });
  });

  it("hair_back の番号が一致し front に color が無ければ back の color を front に共有する", () => {
    const seed = normalizePairSelections(
      {
        selections: {
          hair_front: { partId: "hair-front-01" },
          hair_back: { partId: "hair-back-01", color: "#444444" },
        },
      },
      schema,
    );
    expect(seed.selections!.hair_back).toEqual({
      partId: "hair-back-01",
      color: "#444444",
    });
    expect(seed.selections!.hair_front).toEqual({
      partId: "hair-front-01",
      color: "#444444",
    });
  });

  it("hair_back の番号不一致は front と同番号の back に置換し、 front に color が無ければ back の color を共有する", () => {
    const seed = normalizePairSelections(
      {
        selections: {
          hair_front: { partId: "hair-front-02" },
          hair_back: { partId: "hair-back-01", color: "#666666" },
        },
      },
      schema,
    );
    expect(seed.selections!.hair_back).toEqual({
      partId: "hair-back-02",
      color: "#666666",
    });
    expect(seed.selections!.hair_front).toEqual({
      partId: "hair-front-02",
      color: "#666666",
    });
  });

  it("front と同番号の back が無ければ hair_back を空にする (選択から除外)", () => {
    const seed = normalizePairSelections(
      {
        selections: {
          hair_front: { partId: "hair-front-03" },
          hair_back: { partId: "hair-back-01" },
        },
      },
      schema,
    );
    expect(seed.selections!.hair_back).toBeUndefined();
    expect(seed.selections!.hair_front).toEqual({ partId: "hair-front-03" });
  });

  it("hair_back のみ (front 未選択) は基準が無いため変更しない", () => {
    const seed = normalizePairSelections(
      { selections: { hair_back: { partId: "hair-back-01" } } },
      schema,
    );
    expect(seed.selections!.hair_back).toEqual({ partId: "hair-back-01" });
  });

  it("番号が一致していても色が違う場合は基準側 (左) に揃える", () => {
    const seed = normalizePairSelections(
      {
        selections: {
          eye_left: { partId: "eye-left-01", color: "#aa0000" },
          eye_right: { partId: "eye-right-01", color: "#00bb00" },
        },
      },
      schema,
    );
    expect(seed.selections!.eye_right).toEqual({
      partId: "eye-right-01",
      color: "#aa0000",
    });
  });

  it("hair の番号が一致していても色が違う場合は front に揃える", () => {
    const seed = normalizePairSelections(
      {
        selections: {
          hair_front: { partId: "hair-front-01", color: "#123456" },
          hair_back: { partId: "hair-back-01", color: "#654321" },
        },
      },
      schema,
    );
    expect(seed.selections!.hair_back).toEqual({
      partId: "hair-back-01",
      color: "#123456",
    });
  });

  it("両方に color が無ければ color は付与しない", () => {
    const seed = normalizePairSelections(
      {
        selections: {
          eye_left: { partId: "eye-left-01" },
          eye_right: { partId: "eye-right-02" },
        },
      },
      schema,
    );
    expect(seed.selections!.eye_right).toEqual({ partId: "eye-right-01" });
    expect(seed.selections!.eye_left).toEqual({ partId: "eye-left-01" });
  });

  it("ペア対象が無い selections は無変更", () => {
    const seed = normalizePairSelections(
      { selections: { face: { partId: "face-01", color: "#555555" } } },
      schema,
    );
    expect(seed.selections).toEqual({
      face: { partId: "face-01", color: "#555555" },
    });
  });

  it("基準の Part に pairKey が無ければ Part は変えない", () => {
    const seed = normalizePairSelections(
      {
        selections: {
          eye_left: { partId: "eye-left-special" },
          eye_right: { partId: "eye-right-01" },
        },
      },
      schema,
    );
    expect(seed.selections!.eye_left).toEqual({ partId: "eye-left-special" });
    expect(seed.selections!.eye_right).toEqual({ partId: "eye-right-01" });
  });

  it("pairKey が無くても color はペアで揃える (partId は維持)", () => {
    const seed = normalizePairSelections(
      {
        selections: {
          eye_left: { partId: "eye-left-special", color: "#aaaaaa" },
          eye_right: { partId: "eye-right-01", color: "#bbbbbb" },
        },
      },
      schema,
    );
    expect(seed.selections!.eye_left).toEqual({
      partId: "eye-left-special",
      color: "#aaaaaa",
    });
    expect(seed.selections!.eye_right).toEqual({
      partId: "eye-right-01",
      color: "#aaaaaa",
    });
  });

  it("右の Part に pairKey が無く左にある場合は、 右を左に揃えて矯正する", () => {
    const seed = normalizePairSelections(
      {
        selections: {
          eye_left: { partId: "eye-left-01" },
          eye_right: { partId: "eye-right-special" },
        },
      },
      schema,
    );
    expect(seed.selections!.eye_right).toEqual({ partId: "eye-right-01" });
  });

  it("selections が無い seed はそのまま返す", () => {
    const seed = normalizePairSelections({ salientFeatures: [] }, schema);
    expect(seed).toEqual({ salientFeatures: [] });
  });

  it("slotTransforms には触れない", () => {
    const seed = normalizePairSelections(
      {
        selections: { eye_left: { partId: "eye-left-01" } },
        slotTransforms: { eye_left: { dx: 1 } },
      },
      schema,
    );
    expect(seed.slotTransforms).toEqual({ eye_left: { dx: 1 } });
  });
});
