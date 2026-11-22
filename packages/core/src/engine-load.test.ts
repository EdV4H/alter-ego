import { describe, expect, it, vi } from "vitest";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { createAvatarEngine } from "./engine.js";
import { SelectionError } from "./errors.js";
import { serializeState } from "./state-json.js";
import type { Plugin } from "./types.js";

// 前後レイヤー（hair: front が基準、back は任意）と左右ペア（eye: mirror）
const schema: AvatarSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  canvas: { width: 100, height: 100 },
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

const recorder = (calls: string[]): Plugin => ({
  id: "rec",
  name: "Rec",
  version: "0.0.0",
  setup(ctx) {
    ctx.loader.add({ schemes: [""], load: async (a) => ({ assetId: a.id, kind: a.kind, data: a.src }) });
    ctx.renderer.add({
      mount: () => {},
      update: () => { calls.push("update"); },
      unmount: () => {},
    });
  },
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("engine.load (ADR-0015)", () => {
  it("保存した状態に 1 回で差し替え、state:change を 1 回だけ出す", () => {
    const source = createAvatarEngine({ schema, plugins: [] });
    source.select({ slot: "hair_front", part: "hf-a", color: "#123456" });
    source.select({ slot: "eye_left", part: "el-2" });
    source.setTransform("eye_left", { dx: 4, rotation: -10 });
    const saved = serializeState(source.state);

    const engine = createAvatarEngine({ schema, plugins: [] });
    const onChange = vi.fn();
    engine.on("state:change", onChange);
    engine.load(saved);

    expect(onChange).toHaveBeenCalledOnce();
    expect(engine.state).toEqual(source.state);
  });

  it("parse 済みの値も読める", () => {
    const engine = createAvatarEngine({ schema, plugins: [] });
    engine.load({
      selections: {
        hair_front: { partId: "hf-b" },
        eye_left: { partId: "el-1" },
        eye_right: { partId: "er-1" },
      },
    });
    expect(engine.state.selections.hair_front).toEqual({ partId: "hf-b" });
    expect(engine.state.selections.hair_back).toBeUndefined();
  });

  it("グループの連動はかけ直さない（基準でない Slot を個別に選んだ結果が残る）", () => {
    const engine = createAvatarEngine({ schema, plugins: [] });
    engine.load({
      selections: {
        hair_front: { partId: "hf-a" },
        eye_left: { partId: "el-1" },
        eye_right: { partId: "er-2" },
      },
    });
    expect(engine.state.selections.eye_right).toEqual({ partId: "er-2" });
  });

  it("変形は鏡像を計算し直さず、読めたとおりに入れる", () => {
    const engine = createAvatarEngine({ schema, plugins: [] });
    engine.load({
      selections: {
        hair_front: { partId: "hf-a" },
        eye_left: { partId: "el-1" },
        eye_right: { partId: "er-1" },
      },
      transforms: { eye_left: { dx: 3, dy: 0, scale: 1, rotation: 0 } },
    });
    expect(engine.state.transforms).toEqual({ eye_left: { dx: 3, dy: 0, scale: 1, rotation: 0 } });
  });

  it("読めなければ SelectionError を投げ、状態も変えず state:change も出さない", () => {
    const engine = createAvatarEngine({ schema, plugins: [] });
    const before = engine.state;
    const onChange = vi.fn();
    engine.on("state:change", onChange);
    expect(() => engine.load({ selections: { hair_front: { partId: "nope" } } })).toThrow(SelectionError);
    expect(() => engine.load("{broken")).toThrow(SelectionError);
    expect(engine.state).toBe(before);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("options を deserializeState に渡す（drop と onIssue）", () => {
    const engine = createAvatarEngine({ schema, plugins: [] });
    const onIssue = vi.fn();
    engine.load(
      {
        selections: {
          hair_front: { partId: "hf-b" },
          eye_left: { partId: "el-1" },
          eye_right: { partId: "er-1" },
          beard: { partId: "x" },
        },
      },
      { unknown: "drop", onIssue },
    );
    expect(engine.state.selections.hair_front).toEqual({ partId: "hf-b" });
    expect(onIssue).toHaveBeenCalledWith(expect.objectContaining({ kind: "dropped", path: "selections.beard" }));
  });

  it("mount 後に読み込むと Renderer を更新する", async () => {
    const calls: string[] = [];
    const engine = createAvatarEngine({ schema, plugins: [recorder(calls)] });
    await engine.mount({});
    calls.length = 0;
    engine.load({
      selections: {
        hair_front: { partId: "hf-b" },
        eye_left: { partId: "el-1" },
        eye_right: { partId: "er-1" },
      },
    });
    await flush();
    expect(calls).toEqual(["update"]);
  });
});
