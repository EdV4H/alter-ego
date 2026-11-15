import { IDENTITY_TRANSFORM, type AvatarEngine, type AvatarState } from "@edv4h/alter-ego-core";
import type { AvatarSchema, SlotTransform } from "@edv4h/alter-ego-schema";
import { placementOf, type Category } from "./categories.js";

// 画面の操作はすべてここに置く。ボタンはこれを呼ぶだけにして、
// Photo to Avatar や今後の別 UI・テストからも同じ操作を使えるようにする。

/** カテゴリで選ばれている Part（基準 Slot の Part） */
export function selectedPartOf(state: AvatarState, category: Category): string | null {
  return state.selections[category.baseSlot]?.partId ?? null;
}

/** カテゴリの今の色（基準 Slot の色） */
export function colorOf(state: AvatarState, category: Category): string | null {
  return state.selections[category.baseSlot]?.color ?? null;
}

/** カテゴリ内に 1 つでも選択があるか */
export function hasSelection(state: AvatarState, category: Category): boolean {
  return category.slots.some((s) => state.selections[s] !== undefined);
}

/**
 * Part を選ぶ。基準 Slot だけを選べば、同じグループの他の Slot は
 * engine が pairKey と linkColor に従ってそろえる（ADR-0007）。今の色は引き継ぐ。
 */
export function selectPart(engine: AvatarEngine, category: Category, partId: string): void {
  const color = engine.state.selections[category.baseSlot]?.color;
  engine.select({ slot: category.baseSlot, part: partId, ...(color ? { color } : {}) });
}

/** カテゴリの選択を外す。required の Slot は残す */
export function clearCategory(engine: AvatarEngine, category: Category): void {
  for (const slotId of category.slots) {
    const required = engine.schema.slots.find((s) => s.id === slotId)?.required;
    if (!required && engine.state.selections[slotId]) engine.deselect(slotId);
  }
}

/**
 * カテゴリ内で選択のある Slot すべてに色を付ける。
 * 他のカテゴリへの連動（肌の色など）はスキーマの colorBindings を core が解く（ADR-0008）。
 */
export function setColor(engine: AvatarEngine, category: Category, color: string): void {
  for (const slotId of category.slots) {
    const sel = engine.state.selections[slotId];
    if (sel) engine.select({ slot: slotId, part: sel.partId, color });
  }
}

/** カテゴリで使える変形の操作。null なら変形の UI を出さない */
export interface TransformControls {
  /** "xy": 上下左右に動かせる / "y": 上下だけ（mirror のグループは左右が間隔になる） */
  readonly move: "xy" | "y";
  readonly scale: true;
  /** 左右の間隔（mirror のグループだけ） */
  readonly spread: boolean;
  /** 内向き / 外向きの傾き（mirror のグループだけ） */
  readonly tilt: boolean;
}

export function transformControlsOf(category: Category): TransformControls | null {
  if (category.transformSlots.length === 0) return null;
  return category.mirror
    ? { move: "y", scale: true, spread: true, tilt: true }
    : { move: "xy", scale: true, spread: false, tilt: false };
}

export type TransformOp =
  | { readonly kind: "move"; readonly dx: number; readonly dy: number }
  | { readonly kind: "scale"; readonly delta: number }
  /** 正で広げる、負で寄せる */
  | { readonly kind: "spread"; readonly amount: number }
  /** 正で上側を内向き（寄り目）、負で外向き */
  | { readonly kind: "tilt"; readonly deg: number };

/**
 * mirror のグループで、基準 Slot が他の Slot より右にあれば +1、左なら -1。
 * 「広げる」「内向き」を基準 Slot の dx / rotation の向きに直すのに使う。
 */
export function outwardSign(schema: AvatarSchema, category: Category): 1 | -1 {
  const centerX = (slotId: string) => {
    const p = placementOf(schema, slotId);
    return p ? p.x + p.width / 2 : 0;
  };
  const others = category.transformSlots.filter((s) => s !== category.baseSlot);
  if (others.length === 0) return 1;
  const otherX = others.reduce((sum, s) => sum + centerX(s), 0) / others.length;
  return centerX(category.baseSlot) >= otherX ? 1 : -1;
}

/** 実際に setTransform する Slot。mirror のグループは基準 Slot だけ（他は core が鏡像を当てる。ADR-0009） */
function drivenSlots(category: Category): readonly string[] {
  if (category.mirror) {
    return category.transformSlots.includes(category.baseSlot) ? [category.baseSlot] : [];
  }
  return category.transformSlots;
}

function nextTransform(cur: SlotTransform, op: TransformOp, sign: 1 | -1): SlotTransform {
  switch (op.kind) {
    case "move":
      return { ...cur, dx: cur.dx + op.dx, dy: cur.dy + op.dy };
    case "scale":
      return { ...cur, scale: cur.scale + op.delta };
    case "spread":
      return { ...cur, dx: cur.dx + sign * op.amount };
    case "tilt":
      // SVG の rotate は時計回りが正。右側の Slot の上側を内（左）へ倒すには反時計回り
      return { ...cur, rotation: cur.rotation - sign * op.deg };
  }
}

/** カテゴリ全体に変形を当てる。範囲（拡縮 0.3〜3 など）は core が収める */
export function transformCategory(engine: AvatarEngine, category: Category, op: TransformOp): void {
  const sign = outwardSign(engine.schema, category);
  for (const slotId of drivenSlots(category)) {
    const cur = engine.state.transforms[slotId] ?? IDENTITY_TRANSFORM;
    engine.setTransform(slotId, nextTransform(cur, op, sign));
  }
}

/** カテゴリの変形を元に戻す */
export function resetCategoryTransform(engine: AvatarEngine, category: Category): void {
  for (const slotId of category.transformSlots) engine.resetTransform(slotId);
}

/** カテゴリに変形が掛かっているか（リセットボタンの有効・無効に使う） */
export function hasTransform(state: AvatarState, category: Category): boolean {
  return category.transformSlots.some((s) => {
    const t = state.transforms[s];
    return t !== undefined && (t.dx !== 0 || t.dy !== 0 || t.scale !== 1 || t.rotation !== 0);
  });
}
