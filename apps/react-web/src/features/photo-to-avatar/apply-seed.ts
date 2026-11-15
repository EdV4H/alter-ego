import type { AvatarEngine } from "@edv4h/alter-ego-core";
import type { AvatarSeed } from "@edv4h/alter-ego-perceive";

/**
 * AvatarSeed を engine の selections と transforms に完全上書き反映する。
 *
 * @param engine - 対象の AvatarEngine
 * @param seed - **validateSeed で sanitize 済みの AvatarSeed を渡すこと**。
 *   未検証の seed (schema に無い partId 等) を渡すと engine.select が SelectionError を
 *   throw し、 途中のスロットから処理が中断する可能性がある。
 *
 * 完全上書きの定義:
 * - required slot: seed の partId に置換、 seed に無ければ schema の先頭 part に戻す
 * - optional slot: seed にあれば select、 無ければ deselect
 * - transforms: 全 slot をリセット → seed のものを setTransform で反映。
 *   mirror のグループ（ADR-0009）は基準 Slot を先に反映し、 seed にある他の Slot の値で上書きする
 * - color: seed の color があれば設定、 無ければ既存色を捨てる
 */
export function applySeedToEngine(
  engine: AvatarEngine,
  seed: AvatarSeed,
): void {
  const schema = engine.schema;
  const seedSelections = seed.selections ?? {};

  for (const slot of schema.slots) {
    const sel = seedSelections[slot.id];
    if (sel) {
      engine.select({
        slot: slot.id,
        part: sel.partId,
        ...(sel.color ? { color: sel.color } : {}),
      });
      continue;
    }
    if (slot.required) {
      // seed に無い required slot は schema の先頭 part に戻す
      const firstPart = schema.parts.find((p) => p.slotId === slot.id);
      if (firstPart) {
        engine.select({ slot: slot.id, part: firstPart.id });
      }
      continue;
    }
    // optional slot は deselect (要素自体を消す)
    if (engine.state.selections[slot.id]) {
      engine.deselect(slot.id);
    }
  }

  // transforms は全リセット → seed のものを反映する。
  // 基準 Slot を先に入れないと、 後から入れた基準の鏡像で他の Slot の値が消えるため並べ替える
  engine.resetTransform();
  const entries = Object.entries(seed.slotTransforms ?? {});
  const isBase = (slotId: string) => schema.groups?.some((g) => g.slots[0] === slotId) ?? false;
  entries.sort(([a], [b]) => Number(isBase(b)) - Number(isBase(a)));
  for (const [slotId, t] of entries) {
    engine.setTransform(slotId, t);
  }
}
