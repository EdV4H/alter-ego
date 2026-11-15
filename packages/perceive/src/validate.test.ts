import { describe, expect, it } from "vitest";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { validateSeed } from "./validate.js";

const schema: AvatarSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [
    { id: "face", name: "顔", zIndex: 10, required: true },
    { id: "hair_front", name: "髪 (前)", zIndex: 45 },
  ],
  parts: [
    { id: "face-01", slotId: "face", name: "F1", assetId: "a-face-01" },
    { id: "hair-front-01", slotId: "hair_front", name: "H1", assetId: "a-hf-01" },
  ],
  assets: [
    { id: "a-face-01", kind: "svg", src: "face-01.svg" },
    { id: "a-hf-01", kind: "svg", src: "hair-front-01.svg" },
  ],
};

describe("validateSeed", () => {
  it("空オブジェクトを {} で受け入れる", () => {
    expect(validateSeed({}, schema)).toEqual({});
  });

  it("正常な selections をそのまま通す", () => {
    const seed = validateSeed(
      { selections: { face: { partId: "face-01", color: "#ffeebb" } } },
      schema,
    );
    expect(seed.selections).toEqual({
      face: { partId: "face-01", color: "#ffeebb" },
    });
  });

  it("schema に無い partId は selection ごと除外", () => {
    const seed = validateSeed(
      {
        selections: {
          face: { partId: "face-99" },
          hair_front: { partId: "hair-front-01" },
        },
      },
      schema,
    );
    expect(seed.selections).toEqual({
      hair_front: { partId: "hair-front-01" },
    });
  });

  it("slotId と partId.slotId が一致しない selection は除外", () => {
    const seed = validateSeed(
      { selections: { face: { partId: "hair-front-01" } } },
      schema,
    );
    expect(seed.selections).toBeUndefined();
  });

  it("不正な color (#RRGGBB でない) は color のみ落とし partId は残す", () => {
    const seed = validateSeed(
      { selections: { face: { partId: "face-01", color: "red" } } },
      schema,
    );
    expect(seed.selections).toEqual({ face: { partId: "face-01" } });
  });

  it("scale を 0.3〜3.0 に clamp", () => {
    const seed = validateSeed(
      { slotTransforms: { face: { scale: 5 } } },
      schema,
    );
    expect(seed.slotTransforms).toEqual({ face: { scale: 3 } });
  });

  it("scale <= 0 は除外 (パーツ消失意図と区別不能なため)", () => {
    const seed = validateSeed(
      {
        slotTransforms: {
          face: { scale: 0, dx: 10 },
          hair_front: { scale: -1 },
        },
      },
      schema,
    );
    // face は dx だけ残る、 hair_front は scale 1 件しか無いので空 transform になる
    expect(seed.slotTransforms?.face).toEqual({ dx: 10 });
    expect(seed.slotTransforms?.hair_front).toEqual({});
  });

  it("rotation を -180〜180 に clamp", () => {
    const seed = validateSeed(
      { slotTransforms: { face: { rotation: 999 } } },
      schema,
    );
    expect(seed.slotTransforms).toEqual({ face: { rotation: 180 } });
  });

  it("schema に無い slot の slotTransforms を除外", () => {
    const seed = validateSeed(
      { slotTransforms: { unknown_slot: { dx: 10 } } },
      schema,
    );
    expect(seed.slotTransforms).toBeUndefined();
  });

  it("型が破滅的に違う (null) なら {} を返す", () => {
    expect(validateSeed(null, schema)).toEqual({});
    expect(validateSeed("oops", schema)).toEqual({});
    expect(validateSeed(42, schema)).toEqual({});
  });

  it("salientFeatures は配列ならそのまま通す", () => {
    const seed = validateSeed(
      { salientFeatures: [{ slot: "face", reason: "丸顔" }] },
      schema,
    );
    expect(seed.salientFeatures).toEqual([{ slot: "face", reason: "丸顔" }]);
  });
});
