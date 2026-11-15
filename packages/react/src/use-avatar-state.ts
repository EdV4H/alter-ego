import { useCallback, useSyncExternalStore } from "react";
import type { AvatarEngine, AvatarState } from "@edv4h/alter-ego-core";

const EMPTY_STATE: AvatarState = Object.freeze({ selections: Object.freeze({}), transforms: Object.freeze({}) });
const getEmptyState = () => EMPTY_STATE;

/**
 * エンジンの状態を React から読む（ADR-0013）。状態の持ち主はエンジンで、ここは購読するだけ。
 * engine.state は変更のたびに新しいオブジェクトになるので、そのままスナップショットに使える。
 * engine が null の間と、サーバー描画では空の状態を返す。
 */
export function useAvatarState(engine: AvatarEngine | null): AvatarState {
  const subscribe = useCallback(
    (onChange: () => void) => (engine ? engine.on("state:change", onChange) : () => {}),
    [engine],
  );
  const getSnapshot = useCallback(() => engine?.state ?? EMPTY_STATE, [engine]);
  return useSyncExternalStore(subscribe, getSnapshot, getEmptyState);
}
