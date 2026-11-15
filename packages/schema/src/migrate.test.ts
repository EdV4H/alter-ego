import { describe, expect, it } from "vitest";
import { SchemaValidationError } from "./errors.js";
import { CURRENT_SCHEMA_VERSION, migrate } from "./migrate.js";

const base = {
  metadata: { name: "x" },
  slots: [],
  parts: [],
  assets: [],
};

describe("migrate (ADR-0010)", () => {
  it("returns the current version unchanged", () => {
    const input = { ...base, schemaVersion: CURRENT_SCHEMA_VERSION };
    expect(migrate(input)).toBe(input);
  });

  it("throws for a newer MAJOR", () => {
    expect(() => migrate({ ...base, schemaVersion: "2.0" })).toThrow(SchemaValidationError);
  });

  it("throws for a newer MINOR of the current MAJOR", () => {
    expect(() => migrate({ ...base, schemaVersion: "1.9" })).toThrow(/newer/);
  });

  it("leaves malformed input for validate to report", () => {
    const input = { ...base, schemaVersion: "v1" };
    expect(migrate(input)).toBe(input);
    expect(migrate(null)).toBeNull();
  });
});
