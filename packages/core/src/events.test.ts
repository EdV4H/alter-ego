import { describe, expect, it, vi } from "vitest";
import { EventBus } from "./events.js";

describe("EventBus", () => {
  it("invokes subscribed handlers", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("state:change", handler);
    bus.emit("state:change", { foo: "bar" });
    expect(handler).toHaveBeenCalledWith({ foo: "bar" });
  });

  it("supports multiple handlers per event", () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("asset:load", a);
    bus.on("asset:load", b);
    bus.emit("asset:load");
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("unsubscribe stops further calls", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const off = bus.on("render:ready", handler);
    off();
    bus.emit("render:ready");
    expect(handler).not.toHaveBeenCalled();
  });

  it("invokes multiple handlers in registration order", () => {
    const bus = new EventBus();
    const order: number[] = [];
    bus.on("state:change", () => order.push(1));
    bus.on("state:change", () => order.push(2));
    bus.on("state:change", () => order.push(3));
    bus.emit("state:change");
    expect(order).toEqual([1, 2, 3]);
  });

  it("does not throw if handler throws — other handlers still run", () => {
    const bus = new EventBus();
    const bad = vi.fn(() => { throw new Error("boom"); });
    const good = vi.fn();
    bus.on("asset:error", bad);
    bus.on("asset:error", good);
    expect(() => bus.emit("asset:error")).not.toThrow();
    expect(good).toHaveBeenCalled();
  });
});
