import { describe, expect, it } from "vitest";
import { LoaderConflictError } from "../errors.js";
import type { Loader, Resource } from "../types.js";
import { LoaderRegistryImpl } from "./loader.js";

const makeLoader = (schemes: readonly string[], label: string): Loader => ({
  schemes,
  load: async (a) => ({ assetId: a.id, kind: a.kind, data: label } satisfies Resource),
});

describe("LoaderRegistry (ADR-0005 dispatch by scheme)", () => {
  it("normalizes scheme to lowercase before matching", async () => {
    const reg = new LoaderRegistryImpl();
    reg.add(makeLoader(["https"], "https-loader"));
    const resource = await reg.resolve({
      id: "a", kind: "svg",
      src: "HTTPS://x/y.svg",
    });
    expect(resource.data).toBe("https-loader");
  });

  it("dispatches relative refs via empty scheme", async () => {
    const reg = new LoaderRegistryImpl();
    reg.add(makeLoader([""], "relative-loader"));
    const r = await reg.resolve({ id: "a", kind: "svg", src: "y.svg" });
    expect(r.data).toBe("relative-loader");
  });

  it("throws LoaderConflictError when two loaders claim the same scheme", () => {
    const reg = new LoaderRegistryImpl();
    reg.add(makeLoader(["https"], "a"));
    expect(() => reg.add(makeLoader(["https"], "b"))).toThrow(LoaderConflictError);
  });

  it("throws LoaderConflictError when two loaders claim relative ref", () => {
    const reg = new LoaderRegistryImpl();
    reg.add(makeLoader([""], "a"));
    expect(() => reg.add(makeLoader([""], "b"))).toThrow(LoaderConflictError);
  });

  it("throws when no loader claims the asset's scheme", async () => {
    const reg = new LoaderRegistryImpl();
    reg.add(makeLoader(["https"], "a"));
    await expect(
      reg.resolve({ id: "a", kind: "svg", src: "mem:x" }),
    ).rejects.toThrow(/no loader/i);
  });
});
