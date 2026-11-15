import { useEffect, useRef, useState, type RefObject } from "react";
import { createAvatarEngine, type AvatarEngine, type Plugin } from "@edv4h/alter-ego-core";
import type { AvatarSchema, ValidateResult } from "@edv4h/alter-ego-schema";

export interface UseAvatarEngineOptions {
  readonly schema: AvatarSchema;
  /** エンジンごとに新しいプラグインを作る（プラグインは使い回さない） */
  readonly createPlugins: () => Plugin[];
  /** createAvatarEngine にそのまま渡す検証関数（ADR-0010）。省略時は既定の検証 */
  readonly validate?: (input: unknown) => ValidateResult;
  /** エンジンを作った直後（mount の前）に呼ぶ。イベントの購読などに使い、後片付けの関数を返せる */
  readonly onCreate?: (engine: AvatarEngine) => (() => void) | void;
  /** mount が終わった直後に 1 回呼ぶ。初期値の設定や保存の復元に使い、後片付けの関数を返せる */
  readonly onReady?: (engine: AvatarEngine) => (() => void) | void;
}

export interface UseAvatarEngineResult<T extends Element> {
  /** 描画先の要素に渡す ref */
  readonly mountRef: RefObject<T | null>;
  /** mount まで終わったエンジン。準備中は null */
  readonly engine: AvatarEngine | null;
  /** エンジンの作成か mount に失敗したときのエラー */
  readonly error: Error | null;
}

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/**
 * AvatarEngine を作って描画先に mount し、アンマウントで破棄する（ADR-0013）。
 *
 * - 描画先の型は呼び出し側が決める（例: `useAvatarEngine<SVGSVGElement>(...)`）
 * - エンジンを作り直すのは schema のオブジェクトが変わったときだけ。
 *   createPlugins や各コールバックは最新のものを使うが、変わっても作り直さない
 * - StrictMode で effect が 2 回走っても、mount が終わってから古いエンジンを破棄する
 */
export function useAvatarEngine<T extends Element = Element>(
  options: UseAvatarEngineOptions,
): UseAvatarEngineResult<T> {
  const { schema } = options;
  const mountRef = useRef<T | null>(null);
  const [engine, setEngine] = useState<AvatarEngine | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const target = mountRef.current;
    if (!target) return;
    let cancelled = false;
    let mounted: AvatarEngine | null = null;
    const cleanups: (() => void)[] = [];
    const runCleanups = () => {
      for (const c of cleanups.splice(0)) c();
    };
    setError(null);

    void (async () => {
      let local: AvatarEngine | null = null;
      try {
        const { createPlugins, validate } = optionsRef.current;
        local = createAvatarEngine({ schema, plugins: createPlugins(), ...(validate ? { validate } : {}) });
        const afterCreate = optionsRef.current.onCreate?.(local);
        if (afterCreate) cleanups.push(afterCreate);
        await local.mount(target);
        // mount 中に片付けが走った（StrictMode の 2 回実行など）なら、ここで捨てる。
        // mount の途中で dispose すると Renderer が描画先を失うため、終わるまで待つ
        if (cancelled) {
          runCleanups();
          void local.dispose();
          return;
        }
        mounted = local;
        const afterReady = optionsRef.current.onReady?.(local);
        if (afterReady) cleanups.push(afterReady);
        setEngine(local);
      } catch (e) {
        runCleanups();
        if (local) void local.dispose();
        if (!cancelled) setError(toError(e));
      }
    })();

    return () => {
      cancelled = true;
      setEngine(null);
      // mount 中でも購読はすぐ外す（捨てるエンジンのイベントを拾わないように）
      runCleanups();
      if (mounted) void mounted.dispose();
    };
  }, [schema]);

  return { mountRef, engine, error };
}
