import type { AvatarSchema, SelectionEntry } from "@edv4h/alter-ego-schema";

/**
 * Slot に対する最終的な調整値 (ADR-0003)。
 * `color` および `x-*` キーは Part 既定 → variant.overrides → Selection の順に
 * トップレベル単位で後勝ち (浅いマージ) で解決済み。
 */
export interface EffectiveSelection {
  partId: string;
  variantId?: string;
  color?: string;
  [xKey: `x-${string}`]: unknown;
}

/**
 * Part 既定 → variant.overrides → Selection の順でトップレベル単位の浅いマージを行う。
 * `Selection.color` が常に最優先。入れ子オブジェクトは再帰マージしない。
 *
 * @param schema - アバタースキーマ
 * @param selection - 選択エントリ
 * @returns マージ済みの有効な選択値
 * @throws 存在しない partId または variantId が指定された場合
 */
export function resolveEffectiveSelection(
  schema: AvatarSchema,
  selection: SelectionEntry,
): EffectiveSelection {
  const part = schema.parts.find((p) => p.id === selection.partId);
  if (!part) {
    throw new Error(`Unknown part "${selection.partId}"`);
  }

  // 1. Part の既定値 (MVP では空)
  const merged: Record<string, unknown> = { partId: selection.partId };

  // 2. variant.overrides (variantId が指定された場合のみ)
  if (selection.variantId !== undefined) {
    const variant = part.variants?.find((v) => v.id === selection.variantId);
    if (!variant) {
      throw new Error(
        `Unknown variant "${selection.variantId}" for part "${selection.partId}"`,
      );
    }
    merged.variantId = selection.variantId;
    if (variant.overrides) {
      for (const [k, v] of Object.entries(variant.overrides)) {
        merged[k] = v;
      }
    }
  }

  // 3. Selection の明示値 (color および x-*) で後勝ち
  for (const [k, v] of Object.entries(selection)) {
    if (k === "partId" || k === "variantId") continue;
    if (v === undefined) continue;
    if (k === "color" || k.startsWith("x-")) {
      merged[k] = v;
    }
  }

  return merged as unknown as EffectiveSelection;
}
