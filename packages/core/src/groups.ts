import type { AvatarSchema, SelectionEntry, SlotGroup } from "@edv4h/alter-ego-schema";

type Selections = Record<string, SelectionEntry>;

/** Slot が属する SlotGroup を返す（ADR-0007）。属さなければ undefined */
export function groupOfSlot(schema: AvatarSchema, slotId: string): SlotGroup | undefined {
  return schema.groups?.find((g) => g.slots.includes(slotId));
}

/** SlotGroup の基準 Slot（slots の先頭） */
function baseSlotOf(group: SlotGroup): string {
  return group.slots[0] as string;
}

/**
 * 1 つのグループについて、基準 Slot の選択に他の Slot をそろえる（ADR-0007）。
 *
 * - 基準 Slot が未選択なら何もしない
 * - linkParts: 基準の Part が pairKey を持てば、他の Slot から同じ pairKey の Part を選ぶ。
 *   該当が無い Slot は、required でなければ選択を解除する。基準の Part が pairKey を持たなければ Part は変えない
 * - linkColor: 基準の color（無ければ他の Slot のうち最初に見つかった color）を、選択のある全 Slot にそろえる
 */
function linkGroup(schema: AvatarSchema, group: SlotGroup, selections: Selections): void {
  const baseId = baseSlotOf(group);
  const base = selections[baseId];
  if (!base) return;
  const others = group.slots.slice(1);

  if (group.linkParts !== false) {
    const key = schema.parts.find((p) => p.id === base.partId)?.pairKey;
    if (key !== undefined) {
      for (const slotId of others) {
        const match = schema.parts.find((p) => p.slotId === slotId && p.pairKey === key);
        const current = selections[slotId];
        if (match) {
          if (current?.partId !== match.id) {
            // Part が変わるので variant は引き継がない（color は下で linkColor が扱う）
            selections[slotId] = {
              partId: match.id,
              ...(current?.color ? { color: current.color } : {}),
            };
          }
        } else if (!schema.slots.find((s) => s.id === slotId)?.required) {
          delete selections[slotId];
        }
      }
    }
  }

  if (group.linkColor !== false) {
    const color =
      base.color ??
      others.map((id) => selections[id]?.color).find((c): c is string => c !== undefined);
    if (color === undefined) return;
    for (const slotId of group.slots) {
      const sel = selections[slotId];
      if (sel && sel.color !== color) selections[slotId] = { ...sel, color };
    }
  }
}

/**
 * 全グループについて、基準 Slot の選択に他の Slot をそろえた新しい selections を返す（ADR-0007）。
 * 入力は変更しない。初期状態の計算や、外部から受け取った選択（perceive の出力など）の正規化に使う。
 */
export function normalizeGroupSelections(
  schema: AvatarSchema,
  selections: Readonly<Record<string, SelectionEntry>>,
): Record<string, SelectionEntry> {
  const out: Selections = { ...selections };
  for (const group of schema.groups ?? []) linkGroup(schema, group, out);
  return out;
}

/**
 * slotId が基準 Slot であるグループだけをそろえた新しい selections を返す。
 * 基準以外の Slot を直接選んだときは連動させない（ADR-0007）。
 */
export function linkFromSlot(
  schema: AvatarSchema,
  selections: Readonly<Record<string, SelectionEntry>>,
  slotId: string,
): Record<string, SelectionEntry> {
  const group = groupOfSlot(schema, slotId);
  if (!group || baseSlotOf(group) !== slotId) return { ...selections };
  const out: Selections = { ...selections };
  linkGroup(schema, group, out);
  return out;
}

/**
 * Part と同じグループ内で対応する Part の id を、zIndex 昇順（背面 → 前面）で返す。
 * 対応は pairKey で引く。グループに属さない、または pairKey を持たない Part はそれ自身だけを返す。
 * 重ね合わせのサムネイルなどに使う。
 */
export function groupedPartsFor(schema: AvatarSchema, partId: string): string[] {
  const part = schema.parts.find((p) => p.id === partId);
  if (!part) return [];
  const group = groupOfSlot(schema, part.slotId);
  if (!group || part.pairKey === undefined) return [part.id];
  const zOf = (slotId: string) => schema.slots.find((s) => s.id === slotId)?.zIndex ?? 0;
  return group.slots
    .map((slotId) =>
      slotId === part.slotId
        ? part
        : schema.parts.find((p) => p.slotId === slotId && p.pairKey === part.pairKey),
    )
    .filter((p): p is NonNullable<typeof p> => p !== undefined)
    .toSorted((a, b) => zOf(a.slotId) - zOf(b.slotId))
    .map((p) => p.id);
}
