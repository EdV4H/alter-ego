import type { AvatarSchema } from "@edv4h/alter-ego-schema";

/**
 * part id から、 対応する asset.src (スキーマで定義された相対パス) を返す。
 * 見つからない場合は null。
 *
 * URL の組み立て (origin の前置等) は呼び出し側で行うこと。
 * これは src を返すだけのピュア関数で、 ブラウザ依存物に触れない。
 */
export function assetSrcForPart(
  schema: AvatarSchema,
  partId: string,
): string | null {
  const part = schema.parts.find((p) => p.id === partId);
  if (!part) return null;
  const asset = schema.assets.find((a) => a.id === part.assetId);
  return asset?.src ?? null;
}
