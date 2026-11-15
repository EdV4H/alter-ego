import type { AvatarSchema, Placement, SlotTransform } from "@edv4h/alter-ego-schema";
import { groupOfSlot } from "./groups.js";
import type { AvatarState } from "./types.js";

/** 変形なし */
export const IDENTITY_TRANSFORM: SlotTransform = Object.freeze({ dx: 0, dy: 0, scale: 1, rotation: 0 });

export const SCALE_MIN = 0.3;
export const SCALE_MAX = 3;
export const ROTATION_MIN = -180;
export const ROTATION_MAX = 180;

/** core が合成した Slot の配置（canvas 座標系、ADR-0009） */
export interface ResolvedPlacement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 配置の中心を軸にした回転（度） */
  readonly rotation: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** scale と rotation を許される範囲に収める */
export function clampTransform(t: SlotTransform): SlotTransform {
  return {
    dx: t.dx,
    dy: t.dy,
    scale: clamp(t.scale, SCALE_MIN, SCALE_MAX),
    rotation: clamp(t.rotation, ROTATION_MIN, ROTATION_MAX),
  };
}

/** 鏡像の変形（dx と rotation の符号を反転） */
export function mirrorTransform(t: SlotTransform): SlotTransform {
  // 0 - x にして -0 を出さない
  return { dx: 0 - t.dx, dy: t.dy, scale: t.scale, rotation: 0 - t.rotation };
}

/**
 * 既定の配置に変形を合成する。中心を保って拡縮し、その後に移動と回転を足す。
 */
export function composePlacement(base: Placement, t: SlotTransform): ResolvedPlacement {
  const width = base.width * t.scale;
  const height = base.height * t.scale;
  const cx = base.x + base.width / 2;
  const cy = base.y + base.height / 2;
  return {
    x: cx - width / 2 + t.dx,
    y: cy - height / 2 + t.dy,
    width,
    height,
    rotation: (base.rotation ?? 0) + t.rotation,
  };
}

/** Slot の既定の配置。placement が無ければ canvas 全体、canvas も無ければ undefined */
export function basePlacementOf(schema: AvatarSchema, slotId: string): Placement | undefined {
  const slot = schema.slots.find((s) => s.id === slotId);
  if (slot?.placement) return slot.placement;
  if (slot && schema.canvas) return { x: 0, y: 0, width: schema.canvas.width, height: schema.canvas.height };
  return undefined;
}

/** 全 Slot の配置を合成する。既定の配置が決まらない Slot は含めない */
export function resolvePlacements(
  schema: AvatarSchema,
  transforms: AvatarState["transforms"],
): Record<string, ResolvedPlacement> {
  const out: Record<string, ResolvedPlacement> = {};
  for (const slot of schema.slots) {
    const base = basePlacementOf(schema, slot.id);
    if (!base) continue;
    out[slot.id] = composePlacement(base, transforms[slot.id] ?? IDENTITY_TRANSFORM);
  }
  return out;
}

/**
 * Slot の変形を更新した新しい状態を返す。指定しなかった値は今の値を引き継ぐ。
 * mirror: true のグループの基準 Slot なら、他の Slot に鏡像を適用する（ADR-0009）。
 */
export function setSlotTransform(
  state: AvatarState,
  schema: AvatarSchema,
  slotId: string,
  partial: Partial<SlotTransform>,
): AvatarState {
  if (!schema.slots.some((s) => s.id === slotId)) {
    throw new Error(`Unknown slot "${slotId}"`);
  }
  for (const [k, v] of Object.entries(partial)) {
    if (v !== undefined && !Number.isFinite(v)) {
      throw new Error(`Transform "${k}" for slot "${slotId}" must be a finite number`);
    }
  }
  const current = state.transforms[slotId] ?? IDENTITY_TRANSFORM;
  const defined = Object.fromEntries(Object.entries(partial).filter(([, v]) => v !== undefined));
  const nextT = clampTransform({ ...current, ...defined });
  const next: Record<string, SlotTransform> = { ...state.transforms, [slotId]: nextT };

  const group = groupOfSlot(schema, slotId);
  if (group?.mirror && group.slots[0] === slotId) {
    for (const other of group.slots.slice(1)) next[other] = mirrorTransform(nextT);
  }
  return { selections: state.selections, transforms: Object.freeze(next) };
}

/**
 * 変形を元に戻した新しい状態を返す。slotId を省略すると全 Slot を戻す。
 * mirror: true のグループの基準 Slot を戻すと、他の Slot も戻す。
 */
export function resetSlotTransform(
  state: AvatarState,
  schema: AvatarSchema,
  slotId?: string,
): AvatarState {
  if (slotId === undefined) {
    return { selections: state.selections, transforms: Object.freeze({}) };
  }
  if (!schema.slots.some((s) => s.id === slotId)) {
    throw new Error(`Unknown slot "${slotId}"`);
  }
  const next = { ...state.transforms };
  delete next[slotId];
  const group = groupOfSlot(schema, slotId);
  if (group?.mirror && group.slots[0] === slotId) {
    for (const other of group.slots.slice(1)) delete next[other];
  }
  return { selections: state.selections, transforms: Object.freeze(next) };
}
