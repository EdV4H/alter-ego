import { describe, expect, it } from "vitest";
import { createAvatarEngine, serializeState } from "@edv4h/alter-ego-core";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import humanSchema from "../schemas/human.schema.json" with { type: "json" };
import { applyStateToEngine } from "./state.js";

const human = humanSchema as AvatarSchema;
const make = () => createAvatarEngine({ schema: human, plugins: [] });

describe("applyStateToEngine", () => {
  it("別のエンジンで作った状態を、そのまま再現する", () => {
    const a = make();
    a.select({ slot: "hair_front", part: "hair-front-05", color: "#c43c3c" });
    a.select({ slot: "eye_left", part: "eye-left-05", color: "#3b82f6" });
    // 基準でない Slot だけ色を変えた状態も残る
    a.select({ slot: "eye_right", part: "eye-right-05", color: "#22c55e" });
    a.select({ slot: "glasses", part: "glasses-02", color: "#00000080" });
    a.setTransform("eye_left", { dx: 6, rotation: -12 });
    a.setTransform("mouth", { dy: -8, scale: 1.2 });

    const b = make();
    applyStateToEngine(b, serializeState(a.state));
    expect(b.state).toEqual(a.state);
  });

  it("保存に無い optional の Slot は外す", () => {
    const saved = make();
    saved.select({ slot: "face", part: "face-02" });
    const engine = make();
    engine.select({ slot: "glasses", part: "glasses-01" });
    applyStateToEngine(engine, serializeState(saved.state));
    expect(engine.state.selections.glasses).toBeUndefined();
    expect(engine.state.selections.face?.partId).toBe("face-02");
  });

  it("スキーマに合わない状態は例外にし、エンジンは変えない", () => {
    const engine = make();
    const before = engine.state;
    expect(() =>
      applyStateToEngine(engine, JSON.stringify({ selections: { face: { partId: "nope" } } })),
    ).toThrow();
    expect(engine.state).toBe(before);
  });

  it("drop なら読めない Slot を捨て、残りは戻す", () => {
    const engine = make();
    applyStateToEngine(
      engine,
      JSON.stringify({ selections: { face: { partId: "face-02" }, removed_slot: { partId: "x" } } }),
      { unknown: "drop" },
    );
    expect(engine.state.selections.face?.partId).toBe("face-02");
  });
});
