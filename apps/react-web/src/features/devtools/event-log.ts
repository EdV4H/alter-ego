import { useSyncExternalStore } from "react";
import type { AvatarEngine, AvatarState, EngineEvent } from "@edv4h/alter-ego-core";

/** イベントログの 1 行 */
export interface LogEntry {
  readonly id: number;
  readonly at: Date;
  readonly event: EngineEvent;
  /** 中身の要約（1 行） */
  readonly detail: string;
}

const MAX_ENTRIES = 100;
const EVENTS: readonly EngineEvent[] = ["state:change", "asset:load", "asset:error", "render:ready", "render:error"];

let entries: readonly LogEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

const notify = () => {
  for (const l of listeners) l();
};

/** 変わる前の状態と比べて、変わった Slot だけを並べる */
function diffState(prev: AvatarState | null, next: AvatarState): string {
  if (!prev) return "初期状態";
  const changed = new Set<string>();
  for (const key of ["selections", "transforms"] as const) {
    const a = prev[key] as Record<string, unknown>;
    const b = next[key] as Record<string, unknown>;
    for (const slot of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (JSON.stringify(a[slot]) !== JSON.stringify(b[slot])) changed.add(`${slot}.${key}`);
    }
  }
  return changed.size > 0 ? [...changed].join(", ") : "変化なし";
}

function summarize(payload: unknown): string {
  if (payload === undefined) return "";
  if (payload instanceof Error) return payload.message;
  if (typeof payload === "object" && payload !== null) {
    const p = payload as Record<string, unknown>;
    if (typeof p.assetId === "string") return p.assetId;
    const asset = p.asset as { id?: unknown } | undefined;
    if (asset && typeof asset.id === "string") return `${asset.id}: ${String(p.error)}`;
  }
  const text = JSON.stringify(payload) ?? String(payload);
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

function push(event: EngineEvent, detail: string): void {
  entries = [{ id: nextId++, at: new Date(), event, detail }, ...entries].slice(0, MAX_ENTRIES);
  notify();
}

/**
 * エンジンのイベントを記録し始める。mount より前に呼ぶと、アセットの読み込みも記録できる。
 * 記録をやめる関数を返す。
 */
export function attachEventLog(engine: AvatarEngine): () => void {
  let prev: AvatarState | null = engine.state;
  const offs = EVENTS.map((event) =>
    engine.on(event, (payload) => {
      if (event === "state:change") {
        const next = payload as AvatarState;
        push(event, diffState(prev, next));
        prev = next;
      } else {
        push(event, summarize(payload));
      }
    }),
  );
  return () => {
    for (const off of offs) off();
  };
}

export function clearEventLog(): void {
  entries = [];
  notify();
}

export function useEventLog(): readonly LogEntry[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => entries,
  );
}
