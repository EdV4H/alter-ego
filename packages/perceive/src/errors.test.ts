import { describe, expect, it } from "vitest";
import { PerceiveError } from "./errors.js";

describe("PerceiveError", () => {
  it("kind と message を保持する", () => {
    const e = new PerceiveError("network", "timeout");
    expect(e.kind).toBe("network");
    expect(e.message).toBe("timeout");
    expect(e.name).toBe("PerceiveError");
  });

  it("cause を保持できる", () => {
    const cause = new Error("inner");
    const e = new PerceiveError("parse", "bad json", cause);
    expect(e.cause).toBe(cause);
  });

  it("instanceof PerceiveError かつ instanceof Error になる", () => {
    const e = new PerceiveError("network", "timeout");
    expect(e).toBeInstanceOf(PerceiveError);
    expect(e).toBeInstanceOf(Error);
  });
});
