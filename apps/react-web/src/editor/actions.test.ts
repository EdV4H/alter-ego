import { describe, expect, it } from "vitest";
import { createAvatarEngine } from "@edv4h/alter-ego-core";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { deriveCategories, type Category } from "./categories.js";
import {
  clearCategory,
  hasTransform,
  outwardSign,
  resetCategoryTransform,
  selectPart,
  setColor,
  transformCategory,
  transformControlsOf,
} from "./actions.js";

// 左右の目（mirror）・単独の口・optional のメガネを持つ小さなスキーマ
const schema: AvatarSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [
    { id: "eye_left", name: "目 (左)", zIndex: 1, required: true, palette: ["#111111", "#222222"], placement: { x: 200, y: 100, width: 100, height: 100 } },
    { id: "eye_right", name: "目 (右)", zIndex: 1, required: true, placement: { x: 100, y: 100, width: 100, height: 100 } },
    { id: "mouth", name: "口", zIndex: 2, required: true, placement: { x: 150, y: 250, width: 100, height: 100 } },
    { id: "glasses", name: "メガネ", zIndex: 3, palette: ["#333333"] },
  ],
  groups: [{ id: "eye", name: "目", slots: ["eye_left", "eye_right"], mirror: true }],
  parts: [
    { id: "el-1", slotId: "eye_left", name: "1", assetId: "a", pairKey: "1" },
    { id: "el-2", slotId: "eye_left", name: "2", assetId: "a", pairKey: "2" },
    { id: "er-1", slotId: "eye_right", name: "1", assetId: "a", pairKey: "1" },
    { id: "er-2", slotId: "eye_right", name: "2", assetId: "a", pairKey: "2" },
    { id: "m-1", slotId: "mouth", name: "1", assetId: "a" },
    { id: "g-1", slotId: "glasses", name: "1", assetId: "a" },
  ],
  assets: [{ id: "a", kind: "svg", src: "a.svg" }],
};

const setup = () => {
  const engine = createAvatarEngine({ schema, plugins: [] });
  const cats = Object.fromEntries(deriveCategories(schema).map((c) => [c.id, c])) as Record<
    "eye" | "mouth" | "glasses",
    Category
  >;
  return { engine, ...cats };
};

describe("selectPart / setColor / clearCategory", () => {
  it("基準 Slot を選ぶと、ペアの Slot も pairKey でそろい、色は引き継ぐ", () => {
    const { engine, eye } = setup();
    setColor(engine, eye, "#222222");
    selectPart(engine, eye, "el-2");
    expect(engine.state.selections.eye_left).toEqual({ partId: "el-2", color: "#222222" });
    expect(engine.state.selections.eye_right).toEqual({ partId: "er-2", color: "#222222" });
  });

  it("clearCategory は required でない Slot だけを外す", () => {
    const { engine, glasses, mouth } = setup();
    selectPart(engine, glasses, "g-1");
    clearCategory(engine, glasses);
    clearCategory(engine, mouth);
    expect(engine.state.selections.glasses).toBeUndefined();
    expect(engine.state.selections.mouth?.partId).toBe("m-1");
  });
});

describe("変形", () => {
  it("mirror のグループは上下と間隔・傾き、単独 Slot は上下左右を出す。placement が無ければ出さない", () => {
    const { eye, mouth, glasses } = setup();
    expect(transformControlsOf(eye)).toMatchObject({ move: "y", spread: true, tilt: true });
    expect(transformControlsOf(mouth)).toMatchObject({ move: "xy", spread: false, tilt: false });
    expect(transformControlsOf(glasses)).toBeNull();
  });

  it("基準 Slot が右にあれば外向きは +1", () => {
    const { eye } = setup();
    expect(outwardSign(schema, eye)).toBe(1);
  });

  it("広げると左右が外へ離れる（基準は +dx、反対側は core の鏡像で -dx）", () => {
    const { engine, eye } = setup();
    transformCategory(engine, eye, { kind: "spread", amount: 4 });
    expect(engine.state.transforms.eye_left?.dx).toBe(4);
    expect(engine.state.transforms.eye_right?.dx).toBe(-4);
  });

  it("内向きに傾けると、右側の目は反時計回り・左側の目は時計回りになる", () => {
    const { engine, eye } = setup();
    transformCategory(engine, eye, { kind: "tilt", deg: 6 });
    expect(engine.state.transforms.eye_left?.rotation).toBe(-6);
    expect(engine.state.transforms.eye_right?.rotation).toBe(6);
  });

  it("移動・拡縮を足し込み、リセットで戻る", () => {
    const { engine, mouth } = setup();
    transformCategory(engine, mouth, { kind: "move", dx: 4, dy: -4 });
    transformCategory(engine, mouth, { kind: "scale", delta: 0.1 });
    expect(engine.state.transforms.mouth).toMatchObject({ dx: 4, dy: -4 });
    expect(engine.state.transforms.mouth?.scale).toBeCloseTo(1.1);
    expect(hasTransform(engine.state, mouth)).toBe(true);
    resetCategoryTransform(engine, mouth);
    expect(hasTransform(engine.state, mouth)).toBe(false);
  });
});
