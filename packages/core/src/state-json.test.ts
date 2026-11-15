import { describe, expect, it } from "vitest";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { deserializeState, serializeState, type StateReadIssue } from "./state-json.js";

const schema: AvatarSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [
    { id: "hair", name: "髪", zIndex: 0, required: true },
    { id: "hat", name: "帽子", zIndex: 1 },
  ],
  parts: [
    { id: "h1", slotId: "hair", name: "", assetId: "a", variants: [{ id: "red" }] },
    { id: "c1", slotId: "hat", name: "", assetId: "a" },
  ],
  assets: [{ id: "a", kind: "svg", src: "a.svg" }],
};

describe("serializeState / deserializeState", () => {
  it("selections と transforms を往復できる", () => {
    const state = {
      selections: { hair: { partId: "h1", variantId: "red", color: "#112233" } },
      transforms: { hat: { dx: 1, dy: 2, scale: 1.5, rotation: 10 } },
    };
    expect(deserializeState(schema, serializeState(state))).toEqual(state);
  });

  it("transforms が無い古い JSON も読め、範囲外の値は収める", () => {
    expect(deserializeState(schema, { selections: { hair: { partId: "h1" } } }).transforms).toEqual({});
    const s = deserializeState(schema, {
      selections: { hair: { partId: "h1" } },
      transforms: { hair: { dx: 0, dy: 0, scale: 9, rotation: 0 } },
    });
    expect(s.transforms.hair?.scale).toBe(3);
  });

  it("スキーマと合わない値はエラー", () => {
    const ok = { partId: "h1" };
    expect(() => deserializeState(schema, { selections: { nope: ok } })).toThrow(/Unknown slot/);
    expect(() => deserializeState(schema, { selections: { hair: { partId: "c1" } } })).toThrow(/Unknown part/);
    expect(() => deserializeState(schema, { selections: { hair: { partId: "h1", variantId: "x" } } })).toThrow(/variant/);
    expect(() => deserializeState(schema, { selections: { hair: { partId: "h1", color: "red" } } })).toThrow(/hex/);
    expect(() => deserializeState(schema, { selections: { hair: { partId: "h1", size: 1 } } })).toThrow(/unknown key/);
    expect(() => deserializeState(schema, { selections: {} })).toThrow(/Required slot/);
    expect(() =>
      deserializeState(schema, { selections: { hair: ok }, transforms: { hair: { dx: "1", dy: 0, scale: 1, rotation: 0 } } }),
    ).toThrow(/finite/);
  });
});

describe("deserializeState の読み替えと drop（ADR-0012）", () => {
  const renamed: AvatarSchema = {
    schemaVersion: "1.1",
    metadata: { name: "t" },
    slots: [
      { id: "hair", name: "髪", zIndex: 0, required: true, renamedFrom: ["hair_front"] },
      { id: "hat", name: "帽子", zIndex: 1 },
    ],
    parts: [
      {
        id: "h2",
        slotId: "hair",
        name: "",
        assetId: "a",
        renamedFrom: ["h1"],
        variants: [{ id: "crimson", renamedFrom: ["red"] }],
      },
      { id: "h3", slotId: "hair", name: "", assetId: "a" },
      { id: "c1", slotId: "hat", name: "", assetId: "a" },
    ],
    assets: [{ id: "a", kind: "svg", src: "a.svg" }],
  };
  const read = (input: unknown, unknown?: "error" | "drop") => {
    const issues: StateReadIssue[] = [];
    const state = deserializeState(renamed, input, { unknown, onIssue: (i) => issues.push(i) });
    return { state, issues };
  };

  it("旧 id の Slot・Part・variant を今の id に読み替え、既定の error でも知らせる", () => {
    const { state, issues } = read({
      selections: { hair_front: { partId: "h1", variantId: "red", color: "#123", "x-note": 1 } },
      transforms: { hair_front: { dx: 1, dy: 0, scale: 1, rotation: 0 } },
    });
    expect(state.selections).toEqual({ hair: { partId: "h2", variantId: "crimson", color: "#123", "x-note": 1 } });
    expect(Object.keys(state.transforms)).toEqual(["hair"]);
    expect(issues).toEqual([
      { kind: "renamed", path: "selections.hair_front", from: "hair_front", to: "hair" },
      { kind: "renamed", path: "selections.hair.partId", from: "h1", to: "h2" },
      { kind: "renamed", path: "selections.hair.variantId", from: "red", to: "crimson" },
      { kind: "renamed", path: "transforms.hair_front", from: "hair_front", to: "hair" },
    ]);
    // 保存し直すと今の id だけになる
    expect(serializeState(state)).not.toMatch(/hair_front|"h1"|"red"/);
  });

  it("今の id と旧 id が同じ Slot に来たら今の id を使い、旧 id は読めない値にする", () => {
    const both = { selections: { hair_front: { partId: "h3" }, hair: { partId: "h2" } } };
    expect(() => read(both)).toThrow(/duplicates/);
    const { state, issues } = read(both, "drop");
    expect(state.selections.hair).toEqual({ partId: "h2" });
    expect(issues).toEqual([
      expect.objectContaining({ kind: "dropped", path: "selections.hair_front", from: "hair_front" }),
    ]);
  });

  it("別の Slot の Part は読み替えない", () => {
    expect(() => read({ selections: { hair: { partId: "c1" } } })).toThrow(/Unknown part/);
  });

  it("drop は読めない値をその単位だけ捨てて続ける", () => {
    const { state, issues } = read(
      {
        selections: {
          gone: { partId: "x" },
          hair: { partId: "h2", variantId: "nope", color: "red", size: 1 },
          hat: { partId: "nope" },
        },
        transforms: { gone: { dx: 0, dy: 0, scale: 1, rotation: 0 }, hat: { dx: "1", dy: 0, scale: 1, rotation: 0 } },
      },
      "drop",
    );
    expect(state.selections).toEqual({ hair: { partId: "h2" } });
    expect(state.transforms).toEqual({});
    expect(issues.map((i) => `${i.kind} ${i.path}`)).toEqual([
      "dropped selections.gone",
      "dropped selections.hair.variantId",
      "dropped selections.hair.color",
      "dropped selections.hair.size",
      "dropped selections.hat.partId",
      "dropped transforms.gone",
      "dropped transforms.hat",
    ]);
  });

  it("drop で required の Slot が空になったら最初の Part で補う", () => {
    const { state, issues } = read({ selections: { hair: { partId: "old" } } }, "drop");
    expect(state.selections.hair).toEqual({ partId: "h2" });
    expect(issues.at(-1)).toEqual({ kind: "filled", path: "selections.hair.partId", to: "h2" });
  });

  it("全体が読めないときは drop でもエラー", () => {
    expect(() => read("not json", "drop")).toThrow();
    expect(() => read([], "drop")).toThrow(/must be an object/);
    expect(() => read({ selections: [] }, "drop")).toThrow(/selections must be an object/);
  });
});
