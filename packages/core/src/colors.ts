import type { AvatarSchema, SelectionEntry } from "@edv4h/alter-ego-schema";
import { resolveEffectiveSelection } from "./selection.js";

/** 解決済みの着色領域 1 件（ADR-0008） */
export interface ResolvedColor {
  /** アセット内の領域。解釈は Renderer が決める */
  readonly target: string;
  /** 塗る色（hex） */
  readonly color: string;
}

type Selections = Readonly<Record<string, SelectionEntry>>;

function effectiveColorOf(schema: AvatarSchema, selection: SelectionEntry | undefined): string | undefined {
  if (!selection) return undefined;
  return resolveEffectiveSelection(schema, selection).color;
}

/**
 * Slot に入っている Part のアセットの colorBindings を解決する。
 * `from` を先頭から見て、最初に color を持つ Slot の色を使う。"self" は `slotId` を指す。
 * どの Slot にも color が無い領域は結果に含めない。
 *
 * @param partId - 省略時は `selections[slotId]` の Part。サムネイルなど未選択の Part を描くときに指定する
 */
export function resolveColorBindings(
  schema: AvatarSchema,
  selections: Selections,
  slotId: string,
  partId: string | undefined = selections[slotId]?.partId,
): ResolvedColor[] {
  if (partId === undefined) return [];
  const part = schema.parts.find((p) => p.id === partId);
  const asset = part && schema.assets.find((a) => a.id === part.assetId);
  if (!asset?.colorBindings) return [];

  // partId が選択中の Part と違うときも、"self" の色は今の Slot の選択から取る
  const selfSelection = selections[slotId];
  const selfColor =
    selfSelection && selfSelection.partId === partId
      ? effectiveColorOf(schema, selfSelection)
      : selfSelection?.color;

  const resolved: ResolvedColor[] = [];
  for (const binding of asset.colorBindings) {
    for (const from of binding.from) {
      const color = from === "self" ? selfColor : effectiveColorOf(schema, selections[from]);
      if (color !== undefined) {
        resolved.push({ target: binding.target, color });
        break;
      }
    }
  }
  return resolved;
}

/** 選択中のすべての Slot について colorBindings を解決する */
export function resolveAllColors(
  schema: AvatarSchema,
  selections: Selections,
): Record<string, readonly ResolvedColor[]> {
  const out: Record<string, readonly ResolvedColor[]> = {};
  for (const slotId of Object.keys(selections)) {
    const resolved = resolveColorBindings(schema, selections, slotId);
    if (resolved.length > 0) out[slotId] = resolved;
  }
  return out;
}
