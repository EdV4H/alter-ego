import { describe, expect, it, vi } from "vitest";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { randomState } from "./random.js";
import { deserializeState } from "./state-json.js";

const schema: AvatarSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [
    { id: "face", name: "顔", zIndex: 0, required: true, palette: ["#f0c0a0", "#c08060"] },
    { id: "hair_back", name: "後ろ髪", zIndex: 10 },
    { id: "hair_front", name: "前髪", zIndex: 40, required: true, palette: ["#111111", "#884422"] },
    { id: "glasses", name: "メガネ", zIndex: 50 },
  ],
  parts: [
    { id: "face-1", slotId: "face", name: "", assetId: "x" },
    { id: "face-2", slotId: "face", name: "", assetId: "x" },
    { id: "hb-a", slotId: "hair_back", name: "", assetId: "x", pairKey: "a" },
    { id: "hf-a", slotId: "hair_front", name: "", assetId: "x", pairKey: "a" },
    { id: "hf-b", slotId: "hair_front", name: "", assetId: "x", pairKey: "b" },
    { id: "g-1", slotId: "glasses", name: "", assetId: "x" },
  ],
  assets: [{ id: "x", kind: "svg", src: "x.svg" }],
  groups: [{ id: "hair", name: "髪", slots: ["hair_front", "hair_back"] }],
};

/** 決まった列を順に返す乱数 */
const sequence = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length] as number;
};

/** 種から作る再現できる乱数（mulberry32） */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe("randomState (ADR-0017)", () => {
  it("required の Slot は必ず埋める", () => {
    for (let seed = 0; seed < 50; seed++) {
      const state = randomState(schema, { random: seeded(seed) });
      expect(state.selections.face).toBeDefined();
      expect(state.selections.hair_front).toBeDefined();
      expect(state.transforms).toEqual({});
    }
  });

  it("Part の無い Slot は空のまま", () => {
    const withEmpty: AvatarSchema = {
      ...schema,
      slots: [...schema.slots, { id: "empty", name: "空", zIndex: 60, required: true }],
    };
    expect(randomState(withEmpty, { random: seeded(1) }).selections.empty).toBeUndefined();
  });

  it("色は palette から選び、palette の無い Slot には書かない", () => {
    for (let seed = 0; seed < 50; seed++) {
      const state = randomState(schema, { random: seeded(seed), fillRate: 1 });
      expect(["#f0c0a0", "#c08060"]).toContain(state.selections.face?.color);
      expect(state.selections.glasses?.color).toBeUndefined();
    }
  });

  it("optional の Slot は fillRate で入れるかを決める（Slot ごとにも書ける）", () => {
    const none = randomState(schema, { random: seeded(1), fillRate: 0 });
    expect(none.selections.glasses).toBeUndefined();
    const all = randomState(schema, { random: seeded(1), fillRate: 1 });
    expect(all.selections.glasses).toEqual({ partId: "g-1" });
    const perSlot = randomState(schema, { random: seeded(1), fillRate: { glasses: 1, hair_back: 0 } });
    expect(perSlot.selections.glasses).toEqual({ partId: "g-1" });
  });

  it("グループの基準 Slot に他の Slot をそろえる（ペアの後ろ髪が付く）", () => {
    const state = randomState(schema, {
      fillRate: 0,
      choosePart: (slot) => (slot.id === "hair_front" ? 0 : 0),
      random: () => 0,
    });
    expect(state.selections.hair_front?.partId).toBe("hf-a");
    expect(state.selections.hair_back?.partId).toBe("hb-a");
    expect(state.selections.hair_back?.color).toBe(state.selections.hair_front?.color);
  });

  it("同じ乱数なら同じ状態になる", () => {
    expect(randomState(schema, { random: seeded(42) })).toEqual(randomState(schema, { random: seeded(42) }));
  });

  it("choosePart を渡しても乱数を回す回数は変わらない（色と入れるかの結果が同じ）", () => {
    const values = [0.1, 0.9, 0.7, 0.2, 0.3, 0.6, 0.4, 0.8, 0.5, 0.05, 0.95, 0.15, 0.35, 0.45, 0.55];
    const plain = randomState(schema, { random: sequence(values) });
    const chosen = randomState(schema, { random: sequence(values), choosePart: () => 0 });
    // グループに入らない Slot で比べる（前髪の Part が変わると後ろ髪は連動で変わるため）
    expect(chosen.selections.face?.color).toBe(plain.selections.face?.color);
    expect(chosen.selections.glasses === undefined).toBe(plain.selections.glasses === undefined);
  });

  it("choosePart に Slot と候補を渡し、返した番号の Part を選ぶ", () => {
    const choosePart = vi.fn((_slot, candidates: readonly unknown[]) => candidates.length - 1);
    const state = randomState(schema, { random: seeded(3), fillRate: 1, choosePart });
    expect(state.selections.face?.partId).toBe("face-2");
    expect(choosePart).toHaveBeenCalledWith(expect.objectContaining({ id: "face" }), expect.any(Array));
  });

  it("choosePart が範囲外を返したらエラー", () => {
    expect(() => randomState(schema, { choosePart: () => 9 })).toThrow(RangeError);
    expect(() => randomState(schema, { choosePart: () => 0.5 })).toThrow(RangeError);
  });

  it("deserializeState を通しても同じ状態になる", () => {
    for (let seed = 0; seed < 50; seed++) {
      const state = randomState(schema, { random: seeded(seed) });
      expect(deserializeState(schema, JSON.stringify(state))).toEqual(state);
    }
  });
});
