import type { SelectionEntry, SlotTransform } from "@edv4h/alter-ego-schema";

/**
 * AI 知覚層の出力。写真から推定したアバターの初期構成。
 * core の AvatarState（selections + transforms）の部分集合として扱える（ADR-0009）。
 * 全フィールド optional: AI が省略した部分は呼び出し側でデフォルト処理する。
 */
export interface AvatarSeed {
  /** スロットごとのパーツ選択 */
  selections?: Record<string, Pick<SelectionEntry, "partId" | "color">>;
  /** スロットごとの位置・サイズ・回転 (基準値からの差分) */
  slotTransforms?: Record<string, AvatarSlotTransformSeed>;
  /** AI が選定した顕著特徴のメタ情報 (デバッグ・UI 説明用) */
  salientFeatures?: Array<{ slot: string; reason: string }>;
}

/** Slot ごとの変形の推定値。core の SlotTransform の一部（scale は 0.3〜3.0、rotation は -180〜180 に収める） */
export type AvatarSlotTransformSeed = Partial<SlotTransform>;
