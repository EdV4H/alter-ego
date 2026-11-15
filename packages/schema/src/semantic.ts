import type { AvatarSchema, SchemaError } from "./types.js";

/**
 * JSON Schema では表せない参照整合性を検査する。
 * SlotGroup（ADR-0007）と colorBindings（ADR-0008）の参照先と、renamedFrom（ADR-0012）の重なりを見る。
 */
export function semanticErrors(schema: AvatarSchema): SchemaError[] {
  const errors: SchemaError[] = [];
  const groups = schema.groups ?? [];
  const slotById = new Map(schema.slots.map((s) => [s.id, s]));
  const groupIds = new Set<string>();
  const owner = new Map<string, string>();

  groups.forEach((group, gi) => {
    const base = `/groups/${gi}`;
    if (groupIds.has(group.id)) {
      errors.push({ path: `${base}/id`, message: `duplicate group id "${group.id}"` });
    }
    groupIds.add(group.id);

    group.slots.forEach((slotId, si) => {
      if (!slotById.has(slotId)) {
        errors.push({ path: `${base}/slots/${si}`, message: `unknown slot "${slotId}"` });
      }
      const prev = owner.get(slotId);
      if (prev !== undefined) {
        errors.push({
          path: `${base}/slots/${si}`,
          message: `slot "${slotId}" already belongs to group "${prev}"`,
        });
      } else {
        owner.set(slotId, group.id);
      }
    });

    // linkParts のグループでは、基準 Slot のどの Part を選んでも required な Slot が空にならないこと
    if (group.linkParts === false) return;
    const [baseSlot, ...others] = group.slots;
    const requiredOthers = others.filter((id) => slotById.get(id)?.required);
    if (requiredOthers.length === 0) return;
    for (const part of schema.parts.filter((p) => p.slotId === baseSlot)) {
      if (part.pairKey === undefined) continue;
      for (const slotId of requiredOthers) {
        const matched = schema.parts.some(
          (p) => p.slotId === slotId && p.pairKey === part.pairKey,
        );
        if (!matched) {
          errors.push({
            path: base,
            message: `required slot "${slotId}" has no part with pairKey "${part.pairKey}" (from "${part.id}")`,
          });
        }
      }
    }
  });

  schema.assets.forEach((asset, ai) => {
    asset.colorBindings?.forEach((binding, bi) => {
      binding.from.forEach((slotId, fi) => {
        if (slotId !== "self" && !slotById.has(slotId)) {
          errors.push({
            path: `/assets/${ai}/colorBindings/${bi}/from/${fi}`,
            message: `unknown slot "${slotId}"`,
          });
        }
      });
    });
  });

  errors.push(...renamedFromErrors(schema));
  return errors;
}

interface Renameable {
  readonly id: string;
  readonly renamedFrom?: readonly string[];
}

/**
 * 同じ種類の要素どうしで、renamedFrom が今の id と重なったり、同じ旧 id が 2 か所に出てきたりしないか（ADR-0012）。
 * 重なると、保存した状態の旧 id をどれに読み替えるか決まらない。
 */
function checkRenames(items: readonly Renameable[], basePath: string, kind: string): SchemaError[] {
  const errors: SchemaError[] = [];
  const currentIds = new Set(items.map((item) => item.id));
  const claimedBy = new Map<string, string>();
  items.forEach((item, i) => {
    item.renamedFrom?.forEach((oldId, ri) => {
      const path = `${basePath}/${i}/renamedFrom/${ri}`;
      if (currentIds.has(oldId)) {
        errors.push({ path, message: `renamedFrom "${oldId}" is a current ${kind} id` });
        return;
      }
      const prev = claimedBy.get(oldId);
      if (prev !== undefined) {
        errors.push({ path, message: `renamedFrom "${oldId}" is already claimed by ${kind} "${prev}"` });
        return;
      }
      claimedBy.set(oldId, item.id);
    });
  });
  return errors;
}

function renamedFromErrors(schema: AvatarSchema): SchemaError[] {
  const errors = [
    ...checkRenames(schema.slots, "/slots", "slot"),
    ...checkRenames(schema.parts, "/parts", "part"),
  ];
  schema.parts.forEach((part, pi) => {
    if (part.variants) errors.push(...checkRenames(part.variants, `/parts/${pi}/variants`, "variant"));
  });
  return errors;
}
