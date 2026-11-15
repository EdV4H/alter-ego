import {
  deserializeState,
  type AvatarEngine,
  type AvatarState,
  type DeserializeStateOptions,
} from "@edv4h/alter-ego-core";

/**
 * 保存しておいた状態（JSON 文字列か AvatarState）をエンジンにそのまま読み込む。
 * 中身はスキーマで検査し、合わなければ例外を投げる（エンジンは変えない）。
 * options はそのまま deserializeState に渡す。旧 id の読み替えは常に行い、`unknown: "drop"` なら読めない値を捨てて続ける（ADR-0012）。
 *
 * core には状態を丸ごと入れ替える API が無いので、select / deselect / setTransform を順に呼ぶ。
 * - グループの基準 Slot を先に選ぶ。基準を選ぶと他の Slot がそろえられるので、その後で他の Slot を上書きする
 * - 保存に無い optional の Slot は外す（required の Slot が無い状態は deserializeState が弾く）
 * - 変形は全部戻してから、基準 Slot → 他の Slot の順に入れる（mirror の鏡像で上書きされないように）
 */
export function applyStateToEngine(
  engine: AvatarEngine,
  input: string | AvatarState,
  options?: DeserializeStateOptions,
): void {
  const schema = engine.schema;
  const next = deserializeState(
    schema,
    typeof input === "string" ? input : JSON.parse(JSON.stringify(input)),
    options,
  );
  const isBase = (slotId: string) => schema.groups?.some((g) => g.slots[0] === slotId) ?? false;
  const inGroup = (slotId: string) => schema.groups?.some((g) => g.slots.includes(slotId)) ?? false;
  const firstPass = schema.slots.filter((s) => isBase(s.id) || !inGroup(s.id));
  const secondPass = schema.slots.filter((s) => !firstPass.includes(s));

  for (const slot of [...firstPass, ...secondPass]) {
    const sel = next.selections[slot.id];
    if (sel) {
      engine.select({
        slot: slot.id,
        part: sel.partId,
        ...(sel.variantId ? { variant: sel.variantId } : {}),
        ...(sel.color ? { color: sel.color } : {}),
      });
    } else if (!slot.required && engine.state.selections[slot.id]) {
      engine.deselect(slot.id);
    }
  }

  engine.resetTransform();
  const entries = Object.entries(next.transforms).toSorted(
    ([a], [b]) => Number(isBase(b)) - Number(isBase(a)),
  );
  for (const [slotId, t] of entries) engine.setTransform(slotId, t);
}

/** 画面に出す用の、読みやすい JSON */
export function formatState(state: AvatarState): string {
  return JSON.stringify({ selections: state.selections, transforms: state.transforms }, null, 2);
}
