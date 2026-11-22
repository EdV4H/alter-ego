import type { AvatarSchema, Part, SelectionEntry, Slot } from "@edv4h/alter-ego-schema";
import { normalizeGroupSelections } from "./groups.js";
import type { AvatarState } from "./types.js";

/** randomState の引数（ADR-0017） */
export interface RandomStateOptions {
  /** 0 以上 1 未満を返す乱数。既定は Math.random */
  readonly random?: () => number;
  /** optional の Slot に Part を入れる確率。Slot id ごとにも書ける。既定は 0.5 */
  readonly fillRate?: number | Readonly<Record<string, number>>;
  /**
   * Slot の Part を候補の中から選ぶ。候補の番号（0 から）を返す。
   * 既定は random() で等確率に選ぶ
   */
  readonly choosePart?: (slot: Slot, candidates: readonly Part[]) => number;
}

const DEFAULT_FILL_RATE = 0.5;

const pick = <T>(items: readonly T[], draw: number): T =>
  items[Math.min(items.length - 1, Math.floor(draw * items.length))] as T;

/**
 * スキーマに沿ったランダムな状態を作る（ADR-0017）。
 *
 * - すべての Slot を slots の順に決めてから、グループの基準 Slot に他の Slot をそろえる（ADR-0007）
 * - required の Slot は必ず Part を入れ、optional の Slot は fillRate の確率で入れる
 * - 色は Slot に palette があればその中から選ぶ。variant は選ばず、変形は空
 * - 乱数は Slot ごとに 3 回（入れるか・Part・色）回す。choosePart を渡しても回す回数は変わらない
 */
export function randomState(schema: AvatarSchema, options: RandomStateOptions = {}): AvatarState {
  const random = options.random ?? Math.random;
  const rateOf = (slot: Slot): number => {
    const rate = options.fillRate;
    if (typeof rate === "number") return rate;
    return rate?.[slot.id] ?? DEFAULT_FILL_RATE;
  };

  const selections: Record<string, SelectionEntry> = {};
  for (const slot of schema.slots) {
    const fillDraw = random();
    const partDraw = random();
    const colorDraw = random();

    const candidates = schema.parts.filter((p) => p.slotId === slot.id);
    // Part が 1 つも無い Slot は、初期状態と同じく空のままにする
    if (candidates.length === 0) continue;
    if (!slot.required && fillDraw >= rateOf(slot)) continue;

    const index = options.choosePart
      ? options.choosePart(slot, candidates)
      : Math.floor(partDraw * candidates.length);
    if (!Number.isInteger(index) || index < 0 || index >= candidates.length) {
      throw new RangeError(
        `choosePart returned ${String(index)} for slot "${slot.id}" (expected 0..${candidates.length - 1})`,
      );
    }
    const part = candidates[index] as Part;
    const palette = slot.palette;
    selections[slot.id] = {
      partId: part.id,
      ...(palette && palette.length > 0 ? { color: pick(palette, colorDraw) } : {}),
    };
  }

  return {
    selections: Object.freeze(normalizeGroupSelections(schema, selections)),
    transforms: Object.freeze({}),
  };
}
