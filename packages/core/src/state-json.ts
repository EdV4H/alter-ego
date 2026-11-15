import type { AvatarSchema, Part, SelectionEntry, Slot, SlotTransform } from "@edv4h/alter-ego-schema";
import { clampTransform } from "./transforms.js";
import type { AvatarState } from "./types.js";

const HEX = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const SELECTION_KEYS = new Set(["partId", "variantId", "color"]);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** deserializeState が読み替えた値・捨てた値・補った値 1 件（ADR-0012） */
export interface StateReadIssue {
  readonly kind: "renamed" | "dropped" | "filled";
  /** 例: "selections.hair_back.partId" */
  readonly path: string;
  /** 元の値（旧 id など） */
  readonly from?: string;
  /** 読み替え後の値・補った値 */
  readonly to?: string;
  /** dropped のときの理由 */
  readonly reason?: string;
}

export interface DeserializeStateOptions {
  /** 読めない値を見つけたときの扱い。"error"（既定）は例外を投げ、"drop" は捨てて続ける */
  readonly unknown?: "error" | "drop";
  /** 読み替え・捨てた値・補った値を 1 件ずつ知らせる */
  readonly onIssue?: (issue: StateReadIssue) => void;
}

/** AvatarState（selections と transforms）を JSON 文字列にする（ADR-0009）。id は常に今のものを書く */
export function serializeState(state: AvatarState): string {
  return JSON.stringify({ selections: state.selections, transforms: state.transforms });
}

interface Renameable {
  readonly id: string;
  readonly renamedFrom?: readonly string[];
}

/** 今の id → renamedFrom の順に探す */
function findById<T extends Renameable>(items: readonly T[], id: string): { item: T; renamed: boolean } | null {
  const current = items.find((item) => item.id === id);
  if (current) return { item: current, renamed: false };
  const old = items.find((item) => item.renamedFrom?.includes(id));
  return old ? { item: old, renamed: true } : null;
}

/**
 * JSON 文字列（または parse 済みの値）から AvatarState を作る。
 *
 * - Slot・Part・variant の旧 id は、スキーマの renamedFrom を見て今の id に読み替える（ADR-0012）
 * - スキーマに無い Slot・Part・variant、hex でない color、数値でない変形、未知のキーは「読めない値」。
 *   既定ではエラーにし、`unknown: "drop"` なら捨てて続ける
 * - "drop" で required の Slot が空になったら、初期状態と同じくその Slot の最初の Part で補う
 * - 最上位や selections / transforms がオブジェクトでないときは、どちらでもエラー
 * - transforms の scale と rotation は範囲に収める
 */
export function deserializeState(
  schema: AvatarSchema,
  input: string | unknown,
  options: DeserializeStateOptions = {},
): AvatarState {
  const drop = options.unknown === "drop";
  const report = (issue: StateReadIssue) => options.onIssue?.(issue);
  /** 読めない値。"error" なら投げ、"drop" なら知らせて続ける */
  const unreadable = (path: string, reason: string, from?: string) => {
    if (!drop) throw new Error(reason);
    report({ kind: "dropped", path, reason, ...(from !== undefined ? { from } : {}) });
  };

  const raw: unknown = typeof input === "string" ? JSON.parse(input) : input;
  if (!isRecord(raw)) throw new Error("AvatarState must be an object");
  const rawSel = raw.selections ?? {};
  if (!isRecord(rawSel)) throw new Error("selections must be an object");
  const rawTr = raw.transforms ?? {};
  if (!isRecord(rawTr)) throw new Error("transforms must be an object");

  /**
   * キーを Slot に読み替える。今の id のキーを先に処理し、同じ Slot に旧 id のキーも来たら旧 id の方を読めない値にする
   */
  const resolveSlots = (section: "selections" | "transforms", record: Record<string, unknown>) => {
    const resolved: { key: string; slot: Slot; value: unknown }[] = [];
    const taken = new Set<string>();
    const entries = Object.entries(record).map(([key, value]) => ({ key, value, hit: findById(schema.slots, key) }));
    const ordered = [...entries.filter((e) => !e.hit?.renamed), ...entries.filter((e) => e.hit?.renamed)];
    for (const { key, value, hit } of ordered) {
      const path = `${section}.${key}`;
      if (!hit) {
        unreadable(path, `Unknown slot "${key}"`, key);
        continue;
      }
      if (taken.has(hit.item.id)) {
        unreadable(path, `Slot "${key}" duplicates "${hit.item.id}"`, key);
        continue;
      }
      if (hit.renamed) report({ kind: "renamed", path, from: key, to: hit.item.id });
      taken.add(hit.item.id);
      resolved.push({ key, slot: hit.item, value });
    }
    return resolved;
  };

  const selections: Record<string, SelectionEntry> = {};
  for (const { slot, value } of resolveSlots("selections", rawSel)) {
    const base = `selections.${slot.id}`;
    if (!isRecord(value) || typeof value.partId !== "string") {
      unreadable(`${base}.partId`, `${base}.partId must be a string`);
      continue;
    }
    const partHit = findById(
      schema.parts.filter((p) => p.slotId === slot.id),
      value.partId,
    );
    if (!partHit) {
      unreadable(`${base}.partId`, `Unknown part "${value.partId}" for slot "${slot.id}"`, value.partId);
      continue;
    }
    const part: Part = partHit.item;
    if (partHit.renamed) report({ kind: "renamed", path: `${base}.partId`, from: value.partId, to: part.id });
    const entry: Record<string, unknown> = { partId: part.id };

    if (value.variantId !== undefined) {
      const variantHit =
        typeof value.variantId === "string" ? findById(part.variants ?? [], value.variantId) : null;
      if (!variantHit) {
        unreadable(
          `${base}.variantId`,
          `Unknown variant "${String(value.variantId)}" for part "${part.id}"`,
          String(value.variantId),
        );
      } else {
        if (variantHit.renamed) {
          report({ kind: "renamed", path: `${base}.variantId`, from: String(value.variantId), to: variantHit.item.id });
        }
        entry.variantId = variantHit.item.id;
      }
    }

    if (value.color !== undefined) {
      if (typeof value.color !== "string" || !HEX.test(value.color)) {
        unreadable(`${base}.color`, `${base}.color must be a hex color`, String(value.color));
      } else {
        entry.color = value.color;
      }
    }

    for (const [key, v] of Object.entries(value)) {
      if (SELECTION_KEYS.has(key)) continue;
      if (key.startsWith("x-")) entry[key] = v;
      else unreadable(`${base}.${key}`, `${base} has an unknown key "${key}"`, key);
    }
    selections[slot.id] = entry as unknown as SelectionEntry;
  }

  const transforms: Record<string, SlotTransform> = {};
  for (const { slot, value } of resolveSlots("transforms", rawTr)) {
    const base = `transforms.${slot.id}`;
    if (!isRecord(value)) {
      unreadable(base, `${base} must be an object`);
      continue;
    }
    const t = { dx: value.dx, dy: value.dy, scale: value.scale, rotation: value.rotation };
    const bad = Object.entries(t).find(([, v]) => typeof v !== "number" || !Number.isFinite(v));
    if (bad) {
      unreadable(base, `${base}.${bad[0]} must be a finite number`);
      continue;
    }
    transforms[slot.id] = clampTransform(t as SlotTransform);
  }

  for (const slot of schema.slots) {
    if (!slot.required || selections[slot.id]) continue;
    if (!drop) throw new Error(`Required slot "${slot.id}" has no selection`);
    // Part が 1 つも無い Slot は、初期状態と同じく空のままにする
    const first = schema.parts.find((p) => p.slotId === slot.id);
    if (!first) continue;
    selections[slot.id] = { partId: first.id };
    report({ kind: "filled", path: `selections.${slot.id}.partId`, to: first.id });
  }

  return { selections: Object.freeze(selections), transforms: Object.freeze(transforms) };
}
