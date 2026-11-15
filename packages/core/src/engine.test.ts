import { describe, expect, it, vi } from "vitest";
import { createAvatarEngine } from "./engine.js";
import { PluginSetupError, SelectionError } from "./errors.js";
import type { Plugin } from "./types.js";

const minimalSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [{ id: "hair", name: "髪", zIndex: 0, required: true }],
  parts: [
    { id: "hair-01", slotId: "hair", name: "P1", assetId: "a1" },
    { id: "hair-02", slotId: "hair", name: "P2", assetId: "a2" },
  ],
  assets: [
    { id: "a1", kind: "svg" as const, src: "a1.svg" },
    { id: "a2", kind: "svg" as const, src: "a2.svg" },
  ],
};

const recordingPlugin = (calls: string[]): Plugin => ({
  id: "rec",
  name: "Rec",
  version: "0.0.0",
  setup(ctx) {
    calls.push("setup");
    ctx.loader.add({
      schemes: ["http", "https", ""],
      load: async (a) => ({ assetId: a.id, kind: a.kind, data: a.src }),
    });
    ctx.renderer.add({
      mount: (_t, c) => { calls.push(`mount:${c.resources.size === 0 ? "0" : "n"}`); },
      update: () => { calls.push("update"); },
      unmount: () => { calls.push("unmount"); },
    });
  },
});

describe("createAvatarEngine", () => {
  it("validates schema and computes initial state", () => {
    const calls: string[] = [];
    const engine = createAvatarEngine({
      schema: minimalSchema,
      plugins: [recordingPlugin(calls)],
    });
    expect(engine.state.selections.hair).toEqual({ partId: "hair-01" });
    expect(calls).toContain("setup");
  });

  it("throws on invalid schema", () => {
    expect(() =>
      createAvatarEngine({ schema: {} as never, plugins: [] }),
    ).toThrow(/schema/i);
  });

  it("uses a custom validate function when given (ADR-0010)", () => {
    const validate = vi.fn((input: unknown) => ({ ok: true as const, schema: input as typeof minimalSchema }));
    const engine = createAvatarEngine({ schema: minimalSchema, plugins: [], validate });
    expect(validate).toHaveBeenCalledOnce();
    expect(engine.state.selections.hair).toEqual({ partId: "hair-01" });
  });

  it("rejects a schemaVersion newer than supported", () => {
    expect(() =>
      createAvatarEngine({ schema: { ...minimalSchema, schemaVersion: "99.0" }, plugins: [] }),
    ).toThrow(/schemaVersion/);
  });

  it("emits state:change and lets select update state", () => {
    const engine = createAvatarEngine({
      schema: minimalSchema,
      plugins: [recordingPlugin([])],
    });
    const handler = vi.fn();
    engine.on("state:change", handler);
    engine.select({ slot: "hair", part: "hair-02" });
    expect(engine.state.selections.hair).toEqual({ partId: "hair-02" });
    expect(handler).toHaveBeenCalled();
  });

  it("mount resolves assets and calls renderer.mount", async () => {
    const engine = createAvatarEngine({
      schema: minimalSchema,
      plugins: [recordingPlugin([])],
    });
    await engine.mount({});
    expect(engine.state).toBeDefined();
  });
});

describe("createAvatarEngine (ADR-0004 + errors)", () => {
  it("wraps plugin.setup throw in PluginSetupError", async () => {
    const bad: Plugin = {
      id: "bad",
      name: "Bad",
      version: "0.0.0",
      setup() { throw new Error("boom"); },
    };
    await expect(async () =>
      createAvatarEngine({ schema: minimalSchema, plugins: [bad] }),
    ).rejects.toThrow(PluginSetupError);
  });

  it("select throws SelectionError for unknown slot", () => {
    const engine = createAvatarEngine({
      schema: minimalSchema,
      plugins: [recordingPlugin([])],
    });
    expect(() => engine.select({ slot: "no", part: "x" })).toThrow(SelectionError);
  });

  it("deselect removes selection and emits state:change", () => {
    const schemaOpt = {
      ...minimalSchema,
      slots: [{ id: "hair", name: "髪", zIndex: 0 }],
    };
    const engine = createAvatarEngine({
      schema: schemaOpt,
      plugins: [recordingPlugin([])],
    });
    // optional slot は初期で空。 deselect の動作を見るため一旦 select してから解除する。
    engine.select({ slot: "hair", part: "hair-01" });
    expect(engine.state.selections.hair).toBeDefined();
    const handler = vi.fn();
    engine.on("state:change", handler);
    engine.deselect("hair");
    expect(engine.state.selections.hair).toBeUndefined();
    expect(handler).toHaveBeenCalled();
  });

  it("deselect throws SelectionError for required slot", () => {
    const schemaReq = {
      ...minimalSchema,
      slots: [{ id: "hair", name: "髪", zIndex: 0, required: true }],
    };
    const engine = createAvatarEngine({
      schema: schemaReq,
      plugins: [recordingPlugin([])],
    });
    expect(() => engine.deselect("hair")).toThrow(SelectionError);
  });

  it("refresh calls renderer.update without changing state", async () => {
    const calls: string[] = [];
    const engine = createAvatarEngine({
      schema: minimalSchema,
      plugins: [recordingPlugin(calls)],
    });
    await engine.mount({});
    const beforeState = engine.state;
    const beforeCallCount = calls.filter((c) => c === "update").length;

    engine.refresh();
    await new Promise((r) => setTimeout(r, 0));

    expect(engine.state).toBe(beforeState); // 同じ参照
    const afterCallCount = calls.filter((c) => c === "update").length;
    expect(afterCallCount).toBe(beforeCallCount + 1);
  });

  it("emits render:ready exactly once per mount cycle", async () => {
    const engine = createAvatarEngine({
      schema: minimalSchema,
      plugins: [recordingPlugin([])],
    });
    const ready = vi.fn();
    engine.on("render:ready", ready);
    await engine.mount({});
    engine.select({ slot: "hair", part: "hair-02" });
    await new Promise((r) => setTimeout(r, 0));
    expect(ready).toHaveBeenCalledTimes(1);

    engine.unmount();
    await engine.mount({});
    expect(ready).toHaveBeenCalledTimes(2);
  });

  it("passes resolved colorBindings to renderers as ctx.colors (ADR-0008)", async () => {
    const seen: unknown[] = [];
    const schema = {
      ...minimalSchema,
      assets: [
        { id: "a1", kind: "svg" as const, src: "a1.svg", colorBindings: [{ target: "#FCD0D0", from: ["self"] }] },
        { id: "a2", kind: "svg" as const, src: "a2.svg" },
      ],
    };
    const engine = createAvatarEngine({
      schema,
      plugins: [
        {
          id: "r",
          name: "R",
          version: "0.0.0",
          setup(ctx) {
            ctx.loader.add({ schemes: [""], load: async (a) => ({ assetId: a.id, kind: a.kind, data: a.src }) });
            ctx.renderer.add({ mount: (_t, c) => { seen.push(c.colors); }, update: (c) => { seen.push(c.colors); }, unmount: () => {} });
          },
        },
      ],
    });
    await engine.mount({});
    expect(seen.at(-1)).toEqual({});
    engine.select({ slot: "hair", part: "hair-01", color: "#112233" });
    await new Promise((r) => setTimeout(r, 0));
    expect(seen.at(-1)).toEqual({ hair: [{ target: "#FCD0D0", color: "#112233" }] });
  });

  it("setTransform updates state, emits state:change and passes ctx.placements (ADR-0009)", async () => {
    const seen: unknown[] = [];
    const schema = {
      ...minimalSchema,
      canvas: { width: 100, height: 100 },
    };
    const engine = createAvatarEngine({
      schema,
      plugins: [
        {
          id: "r",
          name: "R",
          version: "0.0.0",
          setup(ctx) {
            ctx.loader.add({ schemes: [""], load: async (a) => ({ assetId: a.id, kind: a.kind, data: a.src }) });
            ctx.renderer.add({ mount: (_t, c) => { seen.push(c.placements); }, update: (c) => { seen.push(c.placements); }, unmount: () => {} });
          },
        },
      ],
    });
    const changes = vi.fn();
    engine.on("state:change", changes);
    await engine.mount({});
    expect(seen.at(-1)).toEqual({ hair: { x: 0, y: 0, width: 100, height: 100, rotation: 0 } });

    engine.setTransform("hair", { dx: 10, scale: 0.5 });
    expect(engine.state.transforms.hair).toEqual({ dx: 10, dy: 0, scale: 0.5, rotation: 0 });
    expect(seen.at(-1)).toEqual({ hair: { x: 35, y: 25, width: 50, height: 50, rotation: 0 } });

    engine.resetTransform();
    expect(engine.state.transforms).toEqual({});
    expect(changes).toHaveBeenCalledTimes(2);
    expect(() => engine.setTransform("nope", { dx: 1 })).toThrow(SelectionError);
  });
});
