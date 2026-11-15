import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { linkFromSlot, normalizeGroupSelections } from "./groups.js";
import type { AvatarState, SelectionInput } from "./types.js";

/**
 * スキーマから初期状態を計算する。
 * required: true のスロットだけ最初のパーツをデフォルトとして選択する。
 * オプションスロットは空 (未選択) で開始する。
 * その後、SlotGroup の基準 Slot に他の Slot をそろえる（ADR-0007）。
 */
export function computeInitialState(schema: AvatarSchema): AvatarState {
  const selections: Record<string, { partId: string }> = {};
  for (const slot of schema.slots) {
    if (!slot.required) continue;
    const first = schema.parts.find((p) => p.slotId === slot.id);
    if (first) selections[slot.id] = { partId: first.id };
  }
  return {
    selections: Object.freeze(normalizeGroupSelections(schema, selections)),
    transforms: Object.freeze({}),
  };
}

/**
 * 指定スロットのパーツを差し替えた新しい状態を返す。不変オブジェクトとして返す。
 * 基準 Slot を選んだ場合は、同じグループの他の Slot もそろえる（ADR-0007）。
 */
export function selectPart(
  state: AvatarState,
  schema: AvatarSchema,
  input: SelectionInput,
): AvatarState {
  if (!schema.slots.some((s) => s.id === input.slot)) {
    throw new Error(`Unknown slot "${input.slot}"`);
  }
  if (
    !schema.parts.some(
      (p) => p.id === input.part && p.slotId === input.slot,
    )
  ) {
    throw new Error(`Unknown part "${input.part}" for slot "${input.slot}"`);
  }
  const next = {
    ...state.selections,
    [input.slot]: {
      partId: input.part,
      ...(input.variant ? { variantId: input.variant } : {}),
      ...(input.color ? { color: input.color } : {}),
    },
  };
  return {
    selections: Object.freeze(linkFromSlot(schema, next, input.slot)),
    transforms: state.transforms,
  };
}

/**
 * 指定スロットの選択を解除した新しい状態を返す。
 * required: true のスロットは解除不可（エラー）。
 * 既に選択がない場合は元の state をそのまま返す。
 */
export function deselectSlot(
  state: AvatarState,
  schema: AvatarSchema,
  slot: string,
): AvatarState {
  const slotDef = schema.slots.find((s) => s.id === slot);
  if (!slotDef) {
    throw new Error(`Unknown slot "${slot}"`);
  }
  if (slotDef.required) {
    throw new Error(`Cannot deselect required slot "${slot}"`);
  }
  if (!(slot in state.selections)) {
    return state;
  }
  const next = { ...state.selections };
  delete next[slot];
  return { selections: Object.freeze(next), transforms: state.transforms };
}
