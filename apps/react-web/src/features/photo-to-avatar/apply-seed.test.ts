import { describe, expect, it } from "vitest";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import type { AvatarEngine } from "@edv4h/alter-ego-core";
import { createAvatarEngine } from "@edv4h/alter-ego-core";
import type { AvatarSeed } from "@edv4h/alter-ego-perceive";
import { applySeedToEngine } from "./apply-seed.js";

// 本番 schema の required slot 群を模倣 (face / mouth / eye_left / eye_right / eyebrow_left / eyebrow_right)
// + optional の hair_front を加えて「optional は seed に無ければ deselect」も同時にテストできる形に。
const schema: AvatarSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [
    { id: "face", name: "顔", zIndex: 10, required: true },
    { id: "mouth", name: "口", zIndex: 15, required: true },
    { id: "eye_left", name: "目 (左)", zIndex: 30, required: true },
    { id: "eye_right", name: "目 (右)", zIndex: 20, required: true },
    { id: "eyebrow_left", name: "眉 (左)", zIndex: 40, required: true },
    { id: "eyebrow_right", name: "眉 (右)", zIndex: 35, required: true },
    { id: "hair_front", name: "髪 (前)", zIndex: 45 },
  ],
  parts: [
    { id: "face-01", slotId: "face", name: "F1", assetId: "a-face-01" },
    { id: "face-02", slotId: "face", name: "F2", assetId: "a-face-02" },
    { id: "mouth-01", slotId: "mouth", name: "M1", assetId: "a-m-01" },
    { id: "eye-left-01", slotId: "eye_left", name: "EL1", assetId: "a-el-01" },
    { id: "eye-right-01", slotId: "eye_right", name: "ER1", assetId: "a-er-01" },
    { id: "eyebrow-left-01", slotId: "eyebrow_left", name: "BL1", assetId: "a-bl-01" },
    { id: "eyebrow-right-01", slotId: "eyebrow_right", name: "BR1", assetId: "a-br-01" },
    { id: "hair-front-01", slotId: "hair_front", name: "H1", assetId: "a-hf-01" },
  ],
  assets: [
    { id: "a-face-01", kind: "svg", src: "face-01.svg" },
    { id: "a-face-02", kind: "svg", src: "face-02.svg" },
    { id: "a-m-01", kind: "svg", src: "mouth-01.svg" },
    { id: "a-el-01", kind: "svg", src: "eye-left-01.svg" },
    { id: "a-er-01", kind: "svg", src: "eye-right-01.svg" },
    { id: "a-bl-01", kind: "svg", src: "eyebrow-left-01.svg" },
    { id: "a-br-01", kind: "svg", src: "eyebrow-right-01.svg" },
    { id: "a-hf-01", kind: "svg", src: "hair-front-01.svg" },
  ],
};

const makeEngine = (): AvatarEngine =>
  createAvatarEngine({ schema, plugins: [] });

describe("applySeedToEngine", () => {
  it("required slot は seed の partId に置換される", () => {
    const engine = makeEngine();
    expect(engine.state.selections.face?.partId).toBe("face-01");

    const seed: AvatarSeed = {
      selections: { face: { partId: "face-02" } },
    };
    applySeedToEngine(engine, seed);
    expect(engine.state.selections.face?.partId).toBe("face-02");
  });

  it("optional slot は seed に無ければ deselect される", () => {
    const engine = makeEngine();
    engine.select({ slot: "hair_front", part: "hair-front-01" });
    expect(engine.state.selections.hair_front).toBeDefined();

    applySeedToEngine(engine, {});
    expect(engine.state.selections.hair_front).toBeUndefined();
  });

  it("required slot が seed に無ければ schema の先頭 part に戻る", () => {
    const engine = makeEngine();
    engine.select({ slot: "face", part: "face-02", color: "#abcdef" });
    expect(engine.state.selections.face?.partId).toBe("face-02");

    applySeedToEngine(engine, {});
    expect(engine.state.selections.face?.partId).toBe("face-01");
    expect(engine.state.selections.face?.color).toBeUndefined();
  });

  it("seed が一部 required slot のみ埋め、 残りの required は schema 先頭に戻る", () => {
    const engine = makeEngine();
    // 事前に face を 02 系に変える
    engine.select({ slot: "face", part: "face-02" });

    // seed は eye_left だけ指定。 face / mouth / eye_right / eyebrow_* は schema 先頭に戻るべき
    applySeedToEngine(
      engine,
      { selections: { eye_left: { partId: "eye-left-01" } } }
    );
    expect(engine.state.selections.face?.partId).toBe("face-01");
    expect(engine.state.selections.mouth?.partId).toBe("mouth-01");
    expect(engine.state.selections.eye_left?.partId).toBe("eye-left-01");
    expect(engine.state.selections.eye_right?.partId).toBe("eye-right-01");
    expect(engine.state.selections.eyebrow_left?.partId).toBe("eyebrow-left-01");
    expect(engine.state.selections.eyebrow_right?.partId).toBe("eyebrow-right-01");
  });

  it("seed の color が selection に反映される", () => {
    const engine = makeEngine();
    applySeedToEngine(
      engine,
      { selections: { face: { partId: "face-01", color: "#ffeebb" } } }
    );
    expect(engine.state.selections.face?.color).toBe("#ffeebb");
  });

  it("transforms は全部リセットしてから seed のものを反映する", () => {
    const engine = makeEngine();
    engine.setTransform("face", { dx: 99 });
    engine.setTransform("mouth", { dy: 5 });
    applySeedToEngine(engine, { slotTransforms: { face: { scale: 1.2 } } });
    expect(engine.state.transforms).toEqual({ face: { dx: 0, dy: 0, scale: 1.2, rotation: 0 } });
  });

  it("seed.slotTransforms が無ければ transforms は空にリセット", () => {
    const engine = makeEngine();
    engine.setTransform("face", { dx: 10, dy: 10, scale: 2, rotation: 30 });
    applySeedToEngine(engine, {});
    expect(engine.state.transforms).toEqual({});
  });

  it("mirror のグループは基準を先に反映し、 seed にある他の Slot の値を残す", () => {
    const engine = createAvatarEngine({
      schema: { ...schema, groups: [{ id: "eye", name: "目", slots: ["eye_left", "eye_right"], mirror: true }] },
      plugins: [],
    });
    applySeedToEngine(engine, {
      slotTransforms: { eye_right: { dx: 3 }, eye_left: { dx: 8, dy: 2 } },
    });
    expect(engine.state.transforms.eye_left).toEqual({ dx: 8, dy: 2, scale: 1, rotation: 0 });
    expect(engine.state.transforms.eye_right).toEqual({ dx: 3, dy: 2, scale: 1, rotation: 0 });
  });
});
