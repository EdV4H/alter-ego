import { describe, expect, it } from "vitest";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { SYSTEM_PROMPT, buildUserPrompt, perceiveHintsOf } from "./prompt.js";

// 任意 slot (glasses) と groups、 description / x-perceive / palette を含む schema
const schemaWithOptional: AvatarSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [
    {
      id: "face",
      name: "顔",
      zIndex: 10,
      required: true,
      description: "顔の輪郭",
      palette: ["#ffffff", "#f0c8a8"],
      "x-perceive": { colorHint: "肌の色" },
    },
    { id: "eye_l", name: "左目", zIndex: 20, required: true, "x-perceive": { colorHint: "瞳の色" } },
    { id: "eye_r", name: "右目", zIndex: 20, required: true },
    { id: "glasses", name: "メガネ", zIndex: 60, "x-perceive": { hint: "見落としやすい" } },
    { id: "accessory_front", name: "アクセサリ (前)", zIndex: 70 },
  ],
  parts: [
    { id: "face-01", slotId: "face", name: "F1", assetId: "a-1", description: "丸顔" },
    { id: "el-01", slotId: "eye_l", name: "EL1", assetId: "a-1", pairKey: "1" },
    { id: "er-01", slotId: "eye_r", name: "ER1", assetId: "a-1", pairKey: "1" },
    { id: "glasses-01", slotId: "glasses", name: "G1", assetId: "a-2" },
    { id: "accessory-front-01", slotId: "accessory_front", name: "A1", assetId: "a-3" },
  ],
  assets: [
    { id: "a-1", kind: "svg", src: "f.svg" },
    { id: "a-2", kind: "svg", src: "g.svg" },
    { id: "a-3", kind: "svg", src: "a.svg" },
  ],
  groups: [{ id: "eye", name: "目", slots: ["eye_l", "eye_r"] }],
};

// 必須 slot のみ・説明なしの schema（非人型を想定）
const schemaRequiredOnly: AvatarSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [{ id: "body", name: "体", zIndex: 10, required: true }],
  parts: [{ id: "body-01", slotId: "body", name: "B1", assetId: "a-1" }],
  assets: [{ id: "a-1", kind: "svg", src: "f.svg" }],
};

describe("SYSTEM_PROMPT", () => {
  it("装着物を必ず反映する指示を含む", () => {
    expect(SYSTEM_PROMPT).toContain("装着物");
    expect(SYSTEM_PROMPT).toContain("必ず反映");
  });
});

describe("buildUserPrompt", () => {
  it("Slot と Part の description、 x-perceive の hint を一覧に含める", () => {
    const p = buildUserPrompt(schemaWithOptional);
    expect(p).toContain("- face (顔: 顔の輪郭): face-01 (F1: 丸顔)");
    expect(p).toContain("- glasses (メガネ): glasses-01 (G1)\n  注意: 見落としやすい");
  });

  it("colorHint のある Slot だけ色の推定を指示し、 palette を候補として示す", () => {
    const p = buildUserPrompt(schemaWithOptional);
    expect(p).toContain("【色の推定指示】");
    expect(p).toContain("- face.color = 肌の色\n  候補: #ffffff, #f0c8a8");
    expect(p).toContain("- eye_l.color = 瞳の色");
    expect(p).not.toContain("eye_r.color");
  });

  it("任意 slot の有無判定指示と slot 名を含む", () => {
    const p = buildUserPrompt(schemaWithOptional);
    expect(p).toContain("【装着物・任意パーツの判定指示】");
    expect(p).toContain("glasses, accessory_front");
    expect(p).toContain("写っていない場合は省略");
    expect(p).toContain("写っていない装着物を追加してはいけません");
  });

  it("groups からセット選択の指示を作る", () => {
    const p = buildUserPrompt(schemaWithOptional);
    expect(p).toContain("【セット選択の指示】");
    expect(p).toContain("- 目 (eye_l / eye_r): eye_r は eye_l と同じ組み合わせのパーツを選んでください");
    expect(p).toContain("color は eye_l と同じ値にしてください");
  });

  it("説明やグループの無いスキーマでは、 その指示を出さず Slot id も直書きしない", () => {
    const p = buildUserPrompt(schemaRequiredOnly);
    expect(p).not.toContain("【装着物・任意パーツの判定指示】");
    expect(p).not.toContain("【色の推定指示】");
    expect(p).not.toContain("【セット選択の指示】");
    for (const id of ["face", "hair_front", "hair_back", "eye_left", "_left / _right"]) {
      expect(p).not.toContain(id);
    }
  });
});

describe("perceiveHintsOf", () => {
  it("形の違う x-perceive は無視する", () => {
    expect(perceiveHintsOf({ id: "s", name: "S", zIndex: 0, "x-perceive": "x" })).toEqual({});
    expect(perceiveHintsOf({ id: "s", name: "S", zIndex: 0, "x-perceive": { colorHint: 1, hint: "h" } })).toEqual({ hint: "h" });
  });
});
