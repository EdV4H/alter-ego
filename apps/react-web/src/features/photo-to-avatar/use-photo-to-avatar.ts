import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AvatarEngine } from "@edv4h/alter-ego-core";
import {
  createGeminiPerceiver,
  createOpenAIPerceiver,
  PerceiveError,
  type Perceiver,
} from "@edv4h/alter-ego-perceive";
import { PHOTO_MAX_BYTES } from "../../app/config.js";
import { applySeedToEngine } from "./apply-seed.js";
import { errorMessageFor } from "./error-message.js";

/** 推定に使うプロバイダ */
export type PerceiveProvider = "openai" | "gemini";

export const PROVIDER_LABEL: Record<PerceiveProvider, string> = {
  openai: "ChatGPT (gpt-5.4-mini)",
  gemini: "Gemini (2.5 Flash-Lite)",
};

export type PhotoStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string };

/**
 * 写真を API キーを持つ dev server の proxy（vite.config.ts）経由で送る Perceiver。
 * クライアントはキーを持たない。
 */
function createPerceiver(provider: PerceiveProvider, engine: AvatarEngine): Perceiver {
  const schema = engine.schema;
  if (provider === "gemini") return createGeminiPerceiver({ endpoint: "/api/perceive/gemini", schema });
  const model = import.meta.env.VITE_OPENAI_MODEL;
  return createOpenAIPerceiver({ endpoint: "/api/perceive", schema, ...(model ? { model } : {}) });
}

export interface PhotoToAvatar {
  readonly status: PhotoStatus;
  readonly provider: PerceiveProvider;
  readonly setProvider: (p: PerceiveProvider) => void;
  /** 写真から推定し、結果で今の構成を上書きする */
  readonly run: (file: File) => Promise<void>;
  readonly cancel: () => void;
  /** 直前の写真でもう一度 */
  readonly retry: () => void;
}

export function usePhotoToAvatar(engine: AvatarEngine | null): PhotoToAvatar {
  const [status, setStatus] = useState<PhotoStatus>({ kind: "idle" });
  const [provider, setProvider] = useState<PerceiveProvider>("openai");
  const lastFile = useRef<File | null>(null);
  const abort = useRef<AbortController | null>(null);
  const perceiver = useMemo(() => (engine ? createPerceiver(provider, engine) : null), [engine, provider]);

  // アンマウントで進行中の推定を止める
  useEffect(() => () => abort.current?.abort(), []);

  const run = useCallback(
    async (file: File) => {
      if (!engine || !perceiver) return;
      if (file.size > PHOTO_MAX_BYTES) {
        setStatus({ kind: "error", message: "写真サイズは 5MB 以下にしてください" });
        return;
      }
      lastFile.current = file;
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setStatus({ kind: "loading" });
      try {
        const seed = await perceiver.perceive(file, { signal: controller.signal });
        applySeedToEngine(engine, seed);
        setStatus({ kind: "idle" });
      } catch (e) {
        if (e instanceof PerceiveError && e.kind === "cancelled") {
          setStatus({ kind: "idle" });
          return;
        }
        setStatus({
          kind: "error",
          message: e instanceof PerceiveError ? errorMessageFor(e) : "不明なエラーが発生しました",
        });
      } finally {
        if (abort.current === controller) abort.current = null;
      }
    },
    [engine, perceiver],
  );

  const cancel = useCallback(() => {
    abort.current?.abort();
    setStatus({ kind: "idle" });
  }, []);

  const retry = useCallback(() => {
    if (lastFile.current) void run(lastFile.current);
  }, [run]);

  return { status, provider, setProvider, run, cancel, retry };
}
