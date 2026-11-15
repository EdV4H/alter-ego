import { describe, expect, it } from "vitest";
import { FragmentConflictError } from "../errors.js";
import { PartsRegistryImpl } from "./parts.js";

describe("PartsRegistry (Phase 1)", () => {
  it("collects parts and assets from fragments", () => {
    const reg = new PartsRegistryImpl();
    reg.addFragment({
      parts: [{ id: "p1", slotId: "s1", name: "P1", assetId: "a1" }],
      assets: [{ id: "a1", kind: "svg", src: "p1.svg" }],
    });
    reg.addFragment({
      parts: [{ id: "p2", slotId: "s1", name: "P2", assetId: "a2" }],
      assets: [{ id: "a2", kind: "svg", src: "p2.svg" }],
    });

    expect(reg.parts).toHaveLength(2);
    expect(reg.assets).toHaveLength(2);
    expect(reg.findAsset("a1")).toEqual({ id: "a1", kind: "svg", src: "p1.svg" });
  });

  it("handles empty fragments", () => {
    const reg = new PartsRegistryImpl();
    reg.addFragment({});
    expect(reg.parts).toEqual([]);
    expect(reg.assets).toEqual([]);
  });
});

describe("PartsRegistry (ADR-0006: id uniqueness)", () => {
  it("allows duplicate id when fully deep-equal", () => {
    const reg = new PartsRegistryImpl();
    const asset = { id: "a1", kind: "svg" as const, src: "x.svg" };
    reg.addFragment({ assets: [asset] });
    reg.addFragment({ assets: [{ ...asset }] });
    expect(reg.assets).toHaveLength(1);
  });

  it("throws when duplicate id has different fields", () => {
    const reg = new PartsRegistryImpl();
    reg.addFragment({ assets: [{ id: "a1", kind: "svg", src: "x.svg" }] });
    expect(() =>
      reg.addFragment({ assets: [{ id: "a1", kind: "svg", src: "y.svg" }] }),
    ).toThrow(FragmentConflictError);
  });

  it("applies to parts too", () => {
    const reg = new PartsRegistryImpl();
    reg.addFragment({ parts: [{ id: "p1", slotId: "s", name: "P1", assetId: "a" }] });
    expect(() =>
      reg.addFragment({ parts: [{ id: "p1", slotId: "s", name: "DIFFERENT", assetId: "a" }] }),
    ).toThrow(FragmentConflictError);
  });
});
