import { z } from "zod";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { ROTATION_MAX, ROTATION_MIN, SCALE_MAX, SCALE_MIN } from "@edv4h/alter-ego-core";
import type { AvatarSeed, AvatarSlotTransformSeed } from "./types.js";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const SelectionEntrySchema = z.object({
  partId: z.string(),
  color: z.string().optional(),
});

const SlotTransformSchema = z.object({
  dx: z.number().finite().optional(),
  dy: z.number().finite().optional(),
  scale: z.number().finite().optional(),
  rotation: z.number().finite().optional(),
});

const SeedSchema = z
  .object({
    selections: z.record(z.string(), SelectionEntrySchema).optional(),
    slotTransforms: z.record(z.string(), SlotTransformSchema).optional(),
    salientFeatures: z
      .array(z.object({ slot: z.string(), reason: z.string() }))
      .optional(),
  })
  .passthrough();


function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function sanitizeTransform(
  t: AvatarSlotTransformSeed,
): AvatarSlotTransformSeed {
  const out: AvatarSlotTransformSeed = {};
  if (t.dx !== undefined) out.dx = t.dx;
  if (t.dy !== undefined) out.dy = t.dy;
  // scale: <= 0 は除外 (パーツ消失意図と区別不能、安全側で破棄)、> 0 のみ clamp
  if (t.scale !== undefined && t.scale > 0)
    out.scale = clamp(t.scale, SCALE_MIN, SCALE_MAX);
  if (t.rotation !== undefined)
    out.rotation = clamp(t.rotation, ROTATION_MIN, ROTATION_MAX);
  return out;
}

/**
 * 任意の JSON 入力を安全な AvatarSeed に変換する。
 * - 構造が破滅的に違えば {} を返す
 * - schema に無い partId / slot は除外
 * - 不正な color (#RRGGBB でない) は捨てる (partId は残す)
 * - transform は範囲外なら clamp、scale <= 0 は除外
 * - 全 selection / slotTransform が落ちて空になった場合は undefined にする
 */
export function validateSeed(
  input: unknown,
  schema: AvatarSchema,
): AvatarSeed {
  const parsed = SeedSchema.safeParse(input);
  if (!parsed.success) return {};
  const raw = parsed.data;

  const seed: AvatarSeed = {};

  if (raw.selections) {
    const sel: NonNullable<AvatarSeed["selections"]> = {};
    for (const [slotId, entry] of Object.entries(raw.selections)) {
      const slot = schema.slots.find((s) => s.id === slotId);
      if (!slot) continue;
      const part = schema.parts.find(
        (p) => p.id === entry.partId && p.slotId === slotId,
      );
      if (!part) continue;
      sel[slotId] = {
        partId: entry.partId,
        ...(entry.color && HEX_COLOR_RE.test(entry.color)
          ? { color: entry.color }
          : {}),
      };
    }
    if (Object.keys(sel).length > 0) seed.selections = sel;
  }

  if (raw.slotTransforms) {
    const tr: NonNullable<AvatarSeed["slotTransforms"]> = {};
    for (const [slotId, t] of Object.entries(raw.slotTransforms)) {
      if (!schema.slots.some((s) => s.id === slotId)) continue;
      // 空 transform ({}) でも slot エントリを残す。
      // Task 7 の applySeedToEngine が全 slot を IDENTITY リセット → seed をマージする
      // ので、 空 {} は「IDENTITY に戻す」と等価で実害なし。
      tr[slotId] = sanitizeTransform(t);
    }
    if (Object.keys(tr).length > 0) seed.slotTransforms = tr;
  }

  // salientFeatures は UI / デバッグ用のメタ情報。
  // アバター描画に影響しないため slot の schema 検証はあえて行わない。
  if (raw.salientFeatures && raw.salientFeatures.length > 0) {
    seed.salientFeatures = raw.salientFeatures;
  }

  return seed;
}
