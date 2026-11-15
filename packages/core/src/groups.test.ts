import { describe, expect, it } from "vitest";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { createAvatarEngine } from "./engine.js";
import { groupedPartsFor, linkFromSlot, normalizeGroupSelections } from "./groups.js";

// 前後レイヤー（hair: front が基準、back は任意）と左右ペア（eye: 両方 required）
const schema: AvatarSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [
    { id: "hair_back", name: "後ろ髪", zIndex: 0 },
    { id: "eye_left", name: "左目", zIndex: 30, required: true },
    { id: "eye_right", name: "右目", zIndex: 20, required: true },
    { id: "hair_front", name: "前髪", zIndex: 45, required: true },
  ],
  parts: [
    { id: "hb-a", slotId: "hair_back", name: "", assetId: "x", pairKey: "a" },
    { id: "hf-a", slotId: "hair_front", name: "", assetId: "x", pairKey: "a" },
    { id: "hf-b", slotId: "hair_front", name: "", assetId: "x", pairKey: "b" },
    { id: "hf-free", slotId: "hair_front", name: "", assetId: "x" },
    { id: "el-1", slotId: "eye_left", name: "", assetId: "x", pairKey: "1" },
    { id: "el-2", slotId: "eye_left", name: "", assetId: "x", pairKey: "2" },
    { id: "er-1", slotId: "eye_right", name: "", assetId: "x", pairKey: "1" },
    { id: "er-2", slotId: "eye_right", name: "", assetId: "x", pairKey: "2" },
  ],
  assets: [{ id: "x", kind: "svg", src: "x.svg" }],
  groups: [
    { id: "hair", name: "髪", slots: ["hair_front", "hair_back"] },
    { id: "eye", name: "目", slots: ["eye_left", "eye_right"], mirror: true },
  ],
};

describe("normalizeGroupSelections", () => {
  it("基準の pairKey に他の Slot をそろえ、color も基準にそろえる", () => {
    const out = normalizeGroupSelections(schema, {
      eye_left: { partId: "el-1", color: "#111111" },
      eye_right: { partId: "er-2", color: "#222222" },
    });
    expect(out.eye_right).toEqual({ partId: "er-1", color: "#111111" });
    expect(out.eye_left).toEqual({ partId: "el-1", color: "#111111" });
  });

  it("基準に color が無ければ他の Slot の color を共有する", () => {
    const out = normalizeGroupSelections(schema, {
      hair_front: { partId: "hf-a" },
      hair_back: { partId: "hb-a", color: "#444444" },
    });
    expect(out.hair_front).toEqual({ partId: "hf-a", color: "#444444" });
  });

  it("対応する Part が無い任意 Slot は選択を解除する", () => {
    const out = normalizeGroupSelections(schema, {
      hair_front: { partId: "hf-b" },
      hair_back: { partId: "hb-a" },
    });
    expect(out.hair_back).toBeUndefined();
  });

  it("基準が未選択なら変更しない", () => {
    const input = { hair_back: { partId: "hb-a" } };
    expect(normalizeGroupSelections(schema, input)).toEqual(input);
  });

  it("基準の Part に pairKey が無ければ他の Slot の Part は変えない", () => {
    const out = normalizeGroupSelections(schema, {
      hair_front: { partId: "hf-free" },
      hair_back: { partId: "hb-a" },
    });
    expect(out.hair_back).toEqual({ partId: "hb-a" });
  });

  it("linkParts / linkColor が false なら連動しない", () => {
    const s = {
      ...schema,
      groups: [{ id: "eye", name: "目", slots: ["eye_left", "eye_right"], linkParts: false, linkColor: false }],
    };
    const input = {
      eye_left: { partId: "el-1", color: "#111111" },
      eye_right: { partId: "er-2", color: "#222222" },
    };
    expect(normalizeGroupSelections(s, input)).toEqual(input);
  });

  it("入力を変更しない", () => {
    const input = { eye_left: { partId: "el-1" }, eye_right: { partId: "er-2" } };
    normalizeGroupSelections(schema, input);
    expect(input.eye_right.partId).toBe("er-2");
  });
});

describe("linkFromSlot", () => {
  it("基準以外の Slot を選んだときは連動させない", () => {
    const out = linkFromSlot(
      schema,
      { eye_left: { partId: "el-1" }, eye_right: { partId: "er-2" } },
      "eye_right",
    );
    expect(out.eye_left).toEqual({ partId: "el-1" });
  });
});

describe("groupedPartsFor", () => {
  it("同じ pairKey の Part を zIndex 昇順で返す", () => {
    expect(groupedPartsFor(schema, "hf-a")).toEqual(["hb-a", "hf-a"]);
  });

  it("対応が無い Slot は飛ばす", () => {
    expect(groupedPartsFor(schema, "hf-b")).toEqual(["hf-b"]);
  });

  it("存在しない Part は空配列", () => {
    expect(groupedPartsFor(schema, "nope")).toEqual([]);
  });
});

describe("AvatarEngine と SlotGroup", () => {
  it("初期状態でグループをそろえる", () => {
    const engine = createAvatarEngine({ schema, plugins: [] });
    expect(engine.state.selections.eye_left).toEqual({ partId: "el-1" });
    expect(engine.state.selections.eye_right).toEqual({ partId: "er-1" });
    expect(engine.state.selections.hair_back).toEqual({ partId: "hb-a" });
  });

  it("基準 Slot を選ぶと他の Slot も切り替わる", () => {
    const engine = createAvatarEngine({ schema, plugins: [] });
    engine.select({ slot: "eye_left", part: "el-2", color: "#abcdef" });
    expect(engine.state.selections.eye_right).toEqual({ partId: "er-2", color: "#abcdef" });
    engine.select({ slot: "hair_front", part: "hf-b" });
    expect(engine.state.selections.hair_back).toBeUndefined();
  });
});
