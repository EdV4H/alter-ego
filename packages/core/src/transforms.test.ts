import { describe, expect, it } from "vitest";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { computeInitialState, selectPart } from "./state.js";
import {
  composePlacement,
  resetSlotTransform,
  resolvePlacements,
  setSlotTransform,
} from "./transforms.js";

const schema: AvatarSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  canvas: { width: 400, height: 400 },
  slots: [
    { id: "face", name: "顔", zIndex: 0, required: true },
    { id: "eye_l", name: "左目", zIndex: 10, required: true, placement: { x: 132, y: 142, width: 128, height: 128 } },
    { id: "eye_r", name: "右目", zIndex: 10, required: true, placement: { x: 68, y: 142, width: 128, height: 128 } },
    { id: "mouth", name: "口", zIndex: 20, placement: { x: 24, y: 130, width: 288, height: 288, rotation: 5 } },
  ],
  parts: [
    { id: "f1", slotId: "face", name: "", assetId: "a" },
    { id: "el1", slotId: "eye_l", name: "", assetId: "a", pairKey: "1" },
    { id: "el2", slotId: "eye_l", name: "", assetId: "a", pairKey: "2" },
    { id: "er1", slotId: "eye_r", name: "", assetId: "a", pairKey: "1" },
    { id: "er2", slotId: "eye_r", name: "", assetId: "a", pairKey: "2" },
  ],
  assets: [{ id: "a", kind: "svg", src: "a.svg" }],
  groups: [{ id: "eye", name: "目", slots: ["eye_l", "eye_r"], mirror: true }],
};

describe("composePlacement", () => {
  it("中心を保って拡縮し、移動と回転を足す", () => {
    expect(composePlacement({ x: 0, y: 0, width: 100, height: 100, rotation: 10 }, { dx: 5, dy: -5, scale: 2, rotation: 20 })).toEqual({
      x: -45,
      y: -55,
      width: 200,
      height: 200,
      rotation: 30,
    });
  });
});

describe("resolvePlacements", () => {
  it("placement が無い Slot は canvas 全体、変形が無ければ既定の配置のまま", () => {
    const placements = resolvePlacements(schema, {});
    expect(placements.face).toEqual({ x: 0, y: 0, width: 400, height: 400, rotation: 0 });
    expect(placements.mouth).toEqual({ x: 24, y: 130, width: 288, height: 288, rotation: 5 });
  });

  it("canvas も placement も無い Slot は含めない", () => {
    const { canvas: _canvas, ...noCanvas } = schema;
    expect(resolvePlacements(noCanvas, {}).face).toBeUndefined();
  });
});

describe("setSlotTransform", () => {
  it("指定した値だけを更新し、範囲外の scale と rotation を収める", () => {
    let state = computeInitialState(schema);
    state = setSlotTransform(state, schema, "mouth", { dy: 4 });
    state = setSlotTransform(state, schema, "mouth", { scale: 10, rotation: -400 });
    expect(state.transforms.mouth).toEqual({ dx: 0, dy: 4, scale: 3, rotation: -180 });
  });

  it("mirror のグループの基準 Slot を動かすと、他の Slot に鏡像を適用する", () => {
    const state = setSlotTransform(computeInitialState(schema), schema, "eye_l", { dx: 4, dy: 2, scale: 1.2, rotation: -6 });
    expect(state.transforms.eye_r).toEqual({ dx: -4, dy: 2, scale: 1.2, rotation: 6 });
  });

  it("基準でない Slot を動かしても基準は変わらない", () => {
    const state = setSlotTransform(computeInitialState(schema), schema, "eye_r", { dx: 4 });
    expect(state.transforms.eye_l).toBeUndefined();
    expect(state.transforms.eye_r).toEqual({ dx: 4, dy: 0, scale: 1, rotation: 0 });
  });

  it("Part を変えても変形を保持する", () => {
    let state = setSlotTransform(computeInitialState(schema), schema, "eye_l", { dy: 8 });
    state = selectPart(state, schema, { slot: "eye_l", part: "el2" });
    expect(state.selections.eye_r).toEqual({ partId: "er2" });
    expect(state.transforms.eye_l).toEqual({ dx: 0, dy: 8, scale: 1, rotation: 0 });
  });

  it("未知の Slot や数値でない値はエラー", () => {
    const state = computeInitialState(schema);
    expect(() => setSlotTransform(state, schema, "nope", { dx: 1 })).toThrow(/Unknown slot/);
    expect(() => setSlotTransform(state, schema, "mouth", { dx: Number.NaN })).toThrow(/finite/);
  });
});

describe("resetSlotTransform", () => {
  it("基準 Slot を戻すと mirror の相手も戻り、省略すると全部戻る", () => {
    let state = setSlotTransform(computeInitialState(schema), schema, "eye_l", { dx: 4 });
    state = setSlotTransform(state, schema, "mouth", { dx: 4 });
    const one = resetSlotTransform(state, schema, "eye_l");
    expect(one.transforms).toEqual({ mouth: { dx: 4, dy: 0, scale: 1, rotation: 0 } });
    expect(resetSlotTransform(state, schema).transforms).toEqual({});
  });
});
