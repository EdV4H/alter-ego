import { describe, expect, it } from "vitest";
import { SchemaValidationError } from "./errors.js";
import { validate } from "./validate.js";

const schemaWithVariantColor = (color: string) => ({
  schemaVersion: "1.0",
  metadata: { name: "x" },
  slots: [{ id: "hair", name: "髪", zIndex: 0 }],
  parts: [
    {
      id: "hair-01",
      slotId: "hair",
      name: "h",
      assetId: "a",
      variants: [{ id: "red", overrides: { color } }],
    },
  ],
  assets: [{ id: "a", kind: "svg", src: "a.svg" }],
});

describe("validate (minimal structural check)", () => {
  it("returns ok for a minimal valid schema", () => {
    const schema = {
      schemaVersion: "1.0",
      metadata: { name: "minimal" },
      slots: [{ id: "hair", name: "髪", zIndex: 0 }],
      parts: [
        { id: "hair-01", slotId: "hair", name: "ショート", assetId: "asset-hair-01" },
      ],
      assets: [
        { id: "asset-hair-01", kind: "svg", src: "hair-01.svg" },
      ],
    };
    const result = validate(schema);
    expect(result.ok).toBe(true);
  });

  it("returns not-ok when required top-level keys are missing", () => {
    const result = validate({ schemaVersion: "1.0" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns not-ok when slots is not an array", () => {
    const result = validate({
      schemaVersion: "1.0",
      metadata: { name: "x" },
      slots: "not-array",
      parts: [],
      assets: [],
    });
    expect(result.ok).toBe(false);
  });

  it("SchemaValidationError carries the error list", () => {
    const err = new SchemaValidationError([
      { path: "/slots", message: "must be array" },
    ]);
    expect(err.errors).toHaveLength(1);
    expect(err.message).toContain("must be array");
  });
});

describe("validate (JSON Schema strict)", () => {
  it("rejects unknown non x- top-level keys", () => {
    const result = validate({
      schemaVersion: "1.0",
      metadata: { name: "x" },
      slots: [],
      parts: [],
      assets: [],
      unknownKey: 1,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts x- prefixed unknown keys", () => {
    const result = validate({
      schemaVersion: "1.0",
      metadata: { name: "x" },
      slots: [],
      parts: [],
      assets: [],
      "x-custom": { foo: 1 },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects invalid id pattern", () => {
    const result = validate({
      schemaVersion: "1.0",
      metadata: { name: "x" },
      slots: [{ id: "with space", name: "n", zIndex: 0 }],
      parts: [],
      assets: [],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a schemaVersion that is not MAJOR.MINOR", () => {
    const result = validate({ schemaVersion: "1", metadata: { name: "x" }, slots: [], parts: [], assets: [] });
    expect(result.ok).toBe(false);
  });

  it("validates variant overrides color as hex", () => {
    expect(validate(schemaWithVariantColor("#ff0000")).ok).toBe(true);
    expect(validate(schemaWithVariantColor("red")).ok).toBe(false);
  });
});

describe("validate (SlotGroup / ADR-0007)", () => {
  const base = {
    schemaVersion: "1.0",
    metadata: { name: "x" },
    slots: [
      { id: "l", name: "L", zIndex: 0, required: true },
      { id: "r", name: "R", zIndex: 0, required: true },
      { id: "o", name: "O", zIndex: 0 },
    ],
    parts: [
      { id: "l1", slotId: "l", name: "", assetId: "a", pairKey: "1" },
      { id: "r1", slotId: "r", name: "", assetId: "a", pairKey: "1" },
    ],
    assets: [{ id: "a", kind: "svg", src: "a.svg" }],
  };

  it("accepts a consistent group", () => {
    expect(validate({ ...base, groups: [{ id: "g", name: "G", slots: ["l", "r"] }] }).ok).toBe(true);
  });

  it("rejects unknown slots and double membership", () => {
    const r = validate({
      ...base,
      groups: [
        { id: "g", name: "G", slots: ["l", "nope"] },
        { id: "h", name: "H", slots: ["l", "o"] },
      ],
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors.map((e) => e.message).join("\n")).toMatch(/unknown slot "nope"[\s\S]*already belongs/);
  });

  it("rejects a required slot without a matching pairKey", () => {
    const r = validate({
      ...base,
      parts: [...base.parts, { id: "l2", slotId: "l", name: "", assetId: "a", pairKey: "2" }],
      groups: [{ id: "g", name: "G", slots: ["l", "r"] }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects a group with fewer than 2 slots", () => {
    expect(validate({ ...base, groups: [{ id: "g", name: "G", slots: ["l"] }] }).ok).toBe(false);
  });
});

describe("validate (colorBindings / palette, ADR-0008)", () => {
  const base = {
    schemaVersion: "1.0",
    metadata: { name: "x" },
    slots: [
      { id: "face", name: "F", zIndex: 0, palette: ["#ffffff", "#f0d0b0"] },
      { id: "hair", name: "H", zIndex: 1 },
    ],
    parts: [{ id: "h1", slotId: "hair", name: "", assetId: "a" }],
  };
  const withBindings = (from: string[]) => ({
    ...base,
    assets: [{ id: "a", kind: "svg", src: "a.svg", colorBindings: [{ target: "#50C7FF", from }] }],
  });

  it("accepts bindings that point at self or existing slots", () => {
    expect(validate(withBindings(["self", "face"])).ok).toBe(true);
  });

  it("rejects a binding that points at an unknown slot", () => {
    const r = validate(withBindings(["self", "skin"]));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors[0]).toEqual({ path: "/assets/0/colorBindings/0/from/1", message: 'unknown slot "skin"' });
  });

  it("rejects an empty from and a non-hex palette entry", () => {
    expect(validate(withBindings([])).ok).toBe(false);
    const bad = withBindings(["self"]);
    bad.slots = [{ id: "face", name: "F", zIndex: 0, palette: ["skin"] }, base.slots[1]!];
    expect(validate(bad).ok).toBe(false);
  });
});

describe("validate (canvas / placement, ADR-0009)", () => {
  const base = {
    schemaVersion: "1.0",
    metadata: { name: "x" },
    parts: [],
    assets: [],
  };

  it("accepts canvas and slot placement", () => {
    const r = validate({
      ...base,
      canvas: { width: 400, height: 400 },
      slots: [{ id: "eye", name: "E", zIndex: 0, placement: { x: 1, y: 2, width: 3, height: 4, rotation: 5 } }],
    });
    expect(r.ok).toBe(true);
  });

  it("rejects a zero-size canvas and an incomplete placement", () => {
    expect(validate({ ...base, canvas: { width: 0, height: 400 }, slots: [] }).ok).toBe(false);
    expect(validate({ ...base, slots: [{ id: "eye", name: "E", zIndex: 0, placement: { x: 1, y: 2 } }] }).ok).toBe(false);
  });
});

const renameSchemaWith = (over: { slots?: unknown[]; parts?: unknown[] }) => ({
  schemaVersion: "1.1",
  metadata: { name: "x" },
  slots: over.slots ?? [
    { id: "hair", name: "髪", zIndex: 0, renamedFrom: ["hair_front"] },
    { id: "eye", name: "目", zIndex: 1 },
  ],
  parts: over.parts ?? [
    {
      id: "hair-02",
      slotId: "hair",
      name: "h",
      assetId: "a",
      renamedFrom: ["hair-01"],
      variants: [{ id: "red", renamedFrom: ["crimson"] }],
    },
  ],
  assets: [{ id: "a", kind: "svg", src: "a.svg" }],
});

const renameSlot = (renamedFrom: unknown) => ({ id: "hair", name: "髪", zIndex: 0, renamedFrom });

describe("validate (renamedFrom, ADR-0012)", () => {
  it("accepts renamedFrom on slots, parts and variants", () => {
    expect(validate(renameSchemaWith({})).ok).toBe(true);
  });

  it("rejects an old id that is still a current id", () => {
    const r = validate(
      renameSchemaWith({
        slots: [
          { id: "hair", name: "髪", zIndex: 0, renamedFrom: ["eye"] },
          { id: "eye", name: "目", zIndex: 1 },
        ],
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.path)).toContain("/slots/0/renamedFrom/0");
  });

  it("rejects the same old id on two parts and on two variants", () => {
    const r = validate(
      renameSchemaWith({
        parts: [
          { id: "p1", slotId: "hair", name: "1", assetId: "a", renamedFrom: ["old"] },
          {
            id: "p2",
            slotId: "eye",
            name: "2",
            assetId: "a",
            renamedFrom: ["old"],
            variants: [
              { id: "v1", renamedFrom: ["x"] },
              { id: "v2", renamedFrom: ["x"] },
            ],
          },
        ],
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const paths = r.errors.map((e) => e.path);
      expect(paths).toContain("/parts/1/renamedFrom/0");
      expect(paths).toContain("/parts/1/variants/1/renamedFrom/0");
    }
  });

  it("rejects an empty renamedFrom and a malformed old id", () => {
    expect(validate(renameSchemaWith({ slots: [renameSlot([])], parts: [] })).ok).toBe(false);
    expect(validate(renameSchemaWith({ slots: [renameSlot(["has space"])], parts: [] })).ok).toBe(false);
  });
});
