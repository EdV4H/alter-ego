import type { AvatarState } from "@edv4h/alter-ego-core";

/** 画面に出す用の、読みやすい JSON */
export function formatState(state: AvatarState): string {
  return JSON.stringify({ selections: state.selections, transforms: state.transforms }, null, 2);
}
