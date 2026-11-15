import { describe, expect, it } from "vitest";
import { computeInitialState, deselectSlot, selectPart } from "./state.js";

const schema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [
    { id: "hair", name: "髪", zIndex: 0, required: true },
    { id: "base", name: "素体", zIndex: -10, required: true },
  ],
  parts: [
    { id: "hair-01", slotId: "hair", name: "P1", assetId: "a1" },
    { id: "hair-02", slotId: "hair", name: "P2", assetId: "a2" },
    { id: "base-01", slotId: "base", name: "B1", assetId: "b1" },
  ],
  assets: [
    { id: "a1", kind: "svg" as const, src: "a1.svg" },
    { id: "a2", kind: "svg" as const, src: "a2.svg" },
    { id: "b1", kind: "svg" as const, src: "b1.svg" },
  ],
} as const;

describe("computeInitialState", () => {
  it("picks the first part of each required slot as default", () => {
    const state = computeInitialState(schema);
    expect(state.selections).toEqual({
      hair: { partId: "hair-01" },
      base: { partId: "base-01" },
    });
  });

  it("leaves optional slots empty by default", () => {
    const schemaOpt = {
      ...schema,
      slots: [
        { id: "hair", name: "髪", zIndex: 0, required: true },
        { id: "accessory", name: "アクセ", zIndex: 5 },
      ],
      parts: [
        ...schema.parts,
        { id: "acc-01", slotId: "accessory", name: "A1", assetId: "x1" },
      ],
      assets: [
        ...schema.assets,
        { id: "x1", kind: "svg" as const, src: "x1.svg" },
      ],
    };
    const state = computeInitialState(schemaOpt);
    expect(state.selections.hair).toEqual({ partId: "hair-01" });
    expect(state.selections.accessory).toBeUndefined();
  });
});

describe("selectPart", () => {
  it("returns a new state with the slot's part replaced", () => {
    const before = computeInitialState(schema);
    const after = selectPart(before, schema, { slot: "hair", part: "hair-02" });
    expect(after.selections.hair).toEqual({ partId: "hair-02" });
    expect(after.selections.base).toEqual({ partId: "base-01" });
    expect(after).not.toBe(before);
  });

  it("throws when slot is unknown", () => {
    const state = computeInitialState(schema);
    expect(() =>
      selectPart(state, schema, { slot: "nope", part: "x" }),
    ).toThrow(/unknown slot/i);
  });

  it("throws when part is unknown", () => {
    const state = computeInitialState(schema);
    expect(() =>
      selectPart(state, schema, { slot: "hair", part: "nope" }),
    ).toThrow(/unknown part/i);
  });
});

describe("deselectSlot", () => {
  // 解除可能 (hair: optional) と必須 (base: required) のミックス。
  // 初期状態では base のみ選択される。 hair は selectPart で明示的にセットしてから解除する。
  const schemaMixed = {
    ...schema,
    slots: [
      { id: "hair", name: "髪", zIndex: 0 },
      { id: "base", name: "素体", zIndex: -10, required: true },
    ],
  } as const;

  it("removes the selection for the given slot", () => {
    const initial = computeInitialState(schemaMixed);
    const withHair = selectPart(initial, schemaMixed, { slot: "hair", part: "hair-01" });
    expect(withHair.selections.hair).toBeDefined();
    const after = deselectSlot(withHair, schemaMixed, "hair");
    expect(after.selections.hair).toBeUndefined();
    expect(after.selections.base).toEqual({ partId: "base-01" });
    expect(after).not.toBe(withHair);
  });

  it("returns the same state when slot is not selected", () => {
    const before = { selections: Object.freeze({}) };
    const after = deselectSlot(before, schemaMixed, "hair");
    expect(after).toBe(before);
  });

  it("throws when slot is unknown", () => {
    const state = computeInitialState(schemaMixed);
    expect(() =>
      deselectSlot(state, schemaMixed, "nope"),
    ).toThrow(/unknown slot/i);
  });

  it("throws when slot is required", () => {
    const state = computeInitialState(schemaMixed);
    expect(() =>
      deselectSlot(state, schemaMixed, "base"),
    ).toThrow(/required/i);
  });
});
