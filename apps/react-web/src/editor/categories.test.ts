import { describe, expect, it } from "vitest";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import humanSchema from "../schemas/human.schema.json" with { type: "json" };
import { categoryViewBox, deriveCategories, layoutViewBox } from "./categories.js";

const human = humanSchema as AvatarSchema;

const minimal: AvatarSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [
    { id: "body", name: "体", zIndex: 0, required: true, palette: ["#ffffff", "#000000"] },
    { id: "ear_l", name: "耳 (左)", zIndex: 1, placement: { x: 200, y: 0, width: 100, height: 100 } },
    { id: "ear_r", name: "耳 (右)", zIndex: 1, placement: { x: 0, y: 0, width: 100, height: 100 } },
    { id: "hat", name: "帽子", zIndex: 2 },
  ],
  groups: [{ id: "ears", name: "耳", slots: ["ear_l", "ear_r"], mirror: true }],
  parts: [],
  assets: [],
};

describe("deriveCategories", () => {
  it("グループは 1 つにまとめ、どのグループにも入らない Slot はそれぞれ 1 カテゴリにする", () => {
    const cats = deriveCategories(minimal);
    expect(cats.map((c) => c.id)).toEqual(["body", "ears", "hat"]);
    expect(cats.map((c) => c.name)).toEqual(["体", "耳", "帽子"]);
    expect(cats[1]).toMatchObject({ slots: ["ear_l", "ear_r"], baseSlot: "ear_l", mirror: true });
  });

  it("required の有無・palette・placement をスキーマから読む", () => {
    const [body, ears, hat] = deriveCategories(minimal);
    expect(body).toMatchObject({ deselectable: false, palette: ["#ffffff", "#000000"], transformSlots: [] });
    expect(ears).toMatchObject({ deselectable: true, transformSlots: ["ear_l", "ear_r"] });
    expect(ears?.palette).toBeUndefined();
    expect(hat).toMatchObject({ deselectable: true, mirror: false });
  });

  it("デモの人型スキーマは、これまでの画面と同じ並びのカテゴリになる", () => {
    const cats = deriveCategories(human);
    expect(cats.map((c) => c.id)).toEqual([
      "face",
      "hair",
      "eye",
      "eyebrow",
      "nose",
      "mouth",
      "accessory",
      "glasses",
    ]);
    // hair は hair_front が必須なので「なし」は出さない。accessory は両方 optional
    const byId = Object.fromEntries(cats.map((c) => [c.id, c]));
    expect(byId.hair?.deselectable).toBe(false);
    expect(byId.accessory?.deselectable).toBe(true);
    expect(byId.eye?.mirror).toBe(true);
    expect(byId.mouth?.transformSlots).toEqual(["mouth"]);
    expect(byId.nose?.palette).toBeUndefined();
  });
});

describe("layoutViewBox", () => {
  it("Slot を基準配置どおりに並べた範囲に padding を足す", () => {
    expect(layoutViewBox(minimal, ["ear_l", "ear_r"], 8)).toBe("-8 -8 316 116");
  });

  it("placement の無い Slot を含めば null", () => {
    expect(layoutViewBox(minimal, ["ear_l", "hat"])).toBeNull();
  });

  it("カテゴリの全 Slot が placement を持つときだけ viewBox を返す", () => {
    const [body, ears] = deriveCategories(minimal);
    expect(categoryViewBox(minimal, body!)).toBeNull();
    expect(categoryViewBox(minimal, ears!)).toBe("-8 -8 316 116");
  });
});
