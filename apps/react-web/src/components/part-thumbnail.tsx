import { assetSrcForPart, groupedPartsFor, resolveColorBindings, type AvatarState } from "@edv4h/alter-ego-core";
import { applyResolvedColors } from "@edv4h/alter-ego-plugin-renderer-svg";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { placementOf } from "../editor/categories.js";
import styles from "./part-thumbnail.module.css";

export interface ThumbnailSource {
  readonly schema: AvatarSchema;
  readonly state: AvatarState;
  /** アセットの基点 URL */
  readonly assetBase: string;
  /** 読み込み済みの SVG 文字列（URL → 中身） */
  readonly texts: ReadonlyMap<string, string>;
}

/** Part のアセット URL。見つからなければ空文字 */
export function partAssetUrl(schema: AvatarSchema, assetBase: string, partId: string): string {
  const src = assetSrcForPart(schema, partId);
  return src ? new URL(src, assetBase).href : "";
}

/** サムネイルに描く Part（同じグループの対になる Part も含め、背面から順に） */
export function thumbnailLayers(schema: AvatarSchema, partId: string): string[] {
  return groupedPartsFor(schema, partId);
}

type Selections = AvatarState["selections"];

/**
 * 「このサムネイルの Part を選んだら」の選択。描く Part をすべて選んだことにし、
 * 色は元の Part の Slot の今の色にそろえる。今は選ばれていない後ろ髪なども正しい色で見せるため。
 */
function previewSelections(schema: AvatarSchema, state: AvatarState, partId: string, layers: string[]): Selections {
  const rootSlot = schema.parts.find((p) => p.id === partId)?.slotId;
  const color = rootSlot ? state.selections[rootSlot]?.color : undefined;
  const out: Record<string, Selections[string]> = { ...state.selections };
  for (const id of layers) {
    const slotId = schema.parts.find((p) => p.id === id)?.slotId;
    if (!slotId) continue;
    const c = color ?? state.selections[slotId]?.color;
    out[slotId] = { partId: id, ...(c ? { color: c } : {}) };
  }
  return out;
}

/**
 * Part の画像の src。読み込み済みなら色を置き換えた data URI、まだなら元の URL をそのまま返す。
 */
function layerSrc(source: ThumbnailSource, selections: Selections, partId: string): string {
  const { schema, assetBase, texts } = source;
  const url = partAssetUrl(schema, assetBase, partId);
  const text = texts.get(url);
  const part = schema.parts.find((p) => p.id === partId);
  if (!text || !part) return url;
  const resolved = resolveColorBindings(schema, selections, part.slotId, partId);
  return `data:image/svg+xml;utf8,${encodeURIComponent(applyResolvedColors(text, resolved))}`;
}

export interface PartThumbnailProps {
  readonly source: ThumbnailSource;
  readonly partId: string;
  /**
   * 左右の目のように、Slot を基準配置どおりに並べて描くときの viewBox。
   * null なら画像を重ねるだけ。
   */
  readonly viewBox: string | null;
}

/** Part の見た目。グループで対になる Part も重ねて描く */
export function PartThumbnail({ source, partId, viewBox }: PartThumbnailProps) {
  const layers = thumbnailLayers(source.schema, partId);
  const selections = previewSelections(source.schema, source.state, partId, layers);
  if (viewBox) {
    return (
      <svg viewBox={viewBox} className={styles.fill} aria-hidden>
        {layers.map((id) => {
          const slotId = source.schema.parts.find((p) => p.id === id)?.slotId;
          const pl = slotId ? placementOf(source.schema, slotId) : undefined;
          if (!pl) return null;
          return <image key={id} href={layerSrc(source, selections, id)} x={pl.x} y={pl.y} width={pl.width} height={pl.height} />;
        })}
      </svg>
    );
  }
  return (
    <div className={styles.stack} aria-hidden>
      {layers.map((id) => (
        <img key={id} src={layerSrc(source, selections, id)} alt="" className={styles.layer} draggable={false} />
      ))}
    </div>
  );
}
