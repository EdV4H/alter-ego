import type { AvatarSeed } from "./types.js";

export interface PerceiveOptions {
  /** AbortSignal で fetch をキャンセル可能にする */
  signal?: AbortSignal;
}

export interface Perceiver {
  /**
   * 写真ファイルから AvatarSeed を推定する。
   * 失敗時は PerceiveError を throw する。
   */
  perceive(file: Blob, options?: PerceiveOptions): Promise<AvatarSeed>;
}
