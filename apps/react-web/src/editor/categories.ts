import type { AvatarSchema, Placement } from "@edv4h/alter-ego-schema";
import { groupOfSlot } from "@edv4h/alter-ego-core";

/**
 * 画面の左に並ぶ「カテゴリ」。スキーマの SlotGroup 1 つ、
 * またはどのグループにも入らない Slot 1 つに対応する。
 *
 * 画面の部品はこの形だけを見て組み立てる。スキーマの Slot ID を UI に直接書かない。
 */
export interface Category {
  /** グループ ID、またはグループに入らない Slot の ID */
  readonly id: string;
  /** 表示名。groups[].name / slots[].name をそのまま使う */
  readonly name: string;
  /** カテゴリに含まれる Slot。先頭が基準 Slot（ADR-0007） */
  readonly slots: readonly string[];
  /** パーツ一覧・色・アイコンの基準にする Slot */
  readonly baseSlot: string;
  /** 全 Slot が required でないとき true。「なし」で外せる */
  readonly deselectable: boolean;
  /** 基準 Slot の palette。無ければ色の UI を出さない */
  readonly palette?: readonly string[];
  /** placement を持つ Slot。変形の対象 */
  readonly transformSlots: readonly string[];
  /** mirror: true のグループ（左右対称に動く） */
  readonly mirror: boolean;
}

/**
 * スキーマからカテゴリ一覧を作る。並びは `slots` の配列順で、
 * グループはその最初の Slot が現れた位置に 1 回だけ置く。
 */
export function deriveCategories(schema: AvatarSchema): Category[] {
  const out: Category[] = [];
  const seenGroups = new Set<string>();
  const slotById = new Map(schema.slots.map((s) => [s.id, s]));

  const build = (id: string, name: string, slots: string[], mirror: boolean): Category => {
    const baseSlot = slots[0] as string;
    const base = slotById.get(baseSlot);
    return {
      id,
      name,
      slots,
      baseSlot,
      deselectable: slots.every((s) => !slotById.get(s)?.required),
      ...(base?.palette ? { palette: base.palette } : {}),
      transformSlots: slots.filter((s) => slotById.get(s)?.placement !== undefined),
      mirror,
    };
  };

  for (const slot of schema.slots) {
    const group = groupOfSlot(schema, slot.id);
    if (!group) {
      out.push(build(slot.id, slot.name, [slot.id], false));
      continue;
    }
    if (seenGroups.has(group.id)) continue;
    seenGroups.add(group.id);
    // スキーマにある Slot だけを残す（groups に書かれた未定義の Slot は無視する）
    const slots = group.slots.filter((s) => slotById.has(s));
    out.push(build(group.id, group.name, slots, group.mirror === true));
  }
  return out;
}

/** Slot の基準配置。無ければ undefined */
export function placementOf(schema: AvatarSchema, slotId: string): Placement | undefined {
  return schema.slots.find((s) => s.id === slotId)?.placement;
}

/**
 * 指定した Slot を基準配置どおりに並べたときに全体が収まる viewBox を返す。
 * 左右の目など、複数の Slot を実物の位置関係のまま縮小表示するのに使う。
 * 1 つでも placement の無い Slot があれば null。
 */
export function layoutViewBox(
  schema: AvatarSchema,
  slotIds: readonly string[],
  padding = 8,
): string | null {
  if (slotIds.length === 0) return null;
  const placements = slotIds.map((s) => placementOf(schema, s));
  if (placements.some((p) => p === undefined)) return null;
  const ps = placements as Placement[];
  const minX = Math.min(...ps.map((p) => p.x)) - padding;
  const minY = Math.min(...ps.map((p) => p.y)) - padding;
  const maxX = Math.max(...ps.map((p) => p.x + p.width)) + padding;
  const maxY = Math.max(...ps.map((p) => p.y + p.height)) + padding;
  return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
}

/**
 * カテゴリのサムネイルを、Slot を基準配置どおりに並べた SVG で描くときの viewBox。
 * 全 Slot が placement を持つときだけ（口や鼻のように小さいパーツも、その範囲に寄せて大きく見せる）。
 */
export function categoryViewBox(schema: AvatarSchema, category: Category): string | null {
  return layoutViewBox(schema, category.slots);
}

/** 基準 Slot に属する Part 一覧（パーツ選択の候補） */
export function partsOfCategory(schema: AvatarSchema, category: Category) {
  return schema.parts.filter((p) => p.slotId === category.baseSlot);
}
