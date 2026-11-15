import type { EngineEvent, EventHandler, Unsubscribe } from "./types.js";

export class EventBus {
  private handlers = new Map<EngineEvent, Set<EventHandler>>();

  on(event: EngineEvent, handler: EventHandler): Unsubscribe {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => {
      // on() 内で必ず Set を代入済みのため非 null が保証される
      set!.delete(handler);
    };
  }

  emit(event: EngineEvent, payload?: unknown): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (e) {
        console.error(`[alter-ego] event handler threw for "${event}":`, e);
      }
    }
  }
}
