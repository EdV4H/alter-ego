import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { normalizeGroupSelections } from "@edv4h/alter-ego-core";
import type { AvatarSeed } from "./types.js";

// 内部モジュール: validateSeed 後の selections を SlotGroup の定義にそろえる。
// パッケージの公開 API ではないため index.ts からは export しない。

/**
 * スキーマの SlotGroup（ADR-0007）に従って、ペアやレイヤーの Slot の選択をそろえる。
 * 規則は core の normalizeGroupSelections と同じ。slot id や part id の命名には依存しない。
 */
export function normalizePairSelections(seed: AvatarSeed, schema: AvatarSchema): AvatarSeed {
  if (!seed.selections) return seed;
  const selections = normalizeGroupSelections(schema, seed.selections) as NonNullable<
    AvatarSeed["selections"]
  >;
  return { ...seed, selections };
}
