/* eslint-disable */
// このファイルは scripts/generate-types.mjs が schema/avatar.schema.json から生成する。
// 直接編集しないこと。変更はスキーマ JSON に対して行い、`pnpm --filter @edv4h/alter-ego-schema generate` を実行する。

/**
 * This interface was referenced by `AvatarSchema`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * 以前の id。保存した AvatarState を読み込むとき、旧 id を今の id に読み替える。新しいものから順に並べる（ADR-0012）
 *
 * @minItems 1
 *
 * This interface was referenced by `AvatarSchema`'s JSON-Schema
 * via the `definition` "RenamedFrom".
 */
export type RenamedFrom = string[];
/**
 * hex 形式の色（#RGB / #RGBA / #RRGGBB / #RRGGBBAA）
 *
 * This interface was referenced by `AvatarSchema`'s JSON-Schema
 * via the `definition` "Color".
 */
export type Color = string;

/**
 * alter-ego のアバター構成を宣言するスキーマ。docs/schema.md を参照
 */
export interface AvatarSchema {
  /**
   * スキーマ形式のバージョン。MAJOR.MINOR（ADR-0010）
   */
  schemaVersion: string;
  metadata: Metadata;
  canvas?: Canvas;
  slots: Slot[];
  parts: Part[];
  assets: Asset[];
  /**
   * 複数の Slot を 1 単位として扱う宣言（ADR-0007）
   */
  groups?: SlotGroup[];
  /**
   * This interface was referenced by `AvatarSchema`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * This interface was referenced by `AvatarSchema`'s JSON-Schema
 * via the `definition` "Metadata".
 */
export interface Metadata {
  name: string;
  description?: string;
  author?: string;
  /**
   * This interface was referenced by `Metadata`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * 描画座標系。Slot の配置と変形はこの座標系の値で書く（ADR-0009）
 *
 * This interface was referenced by `AvatarSchema`'s JSON-Schema
 * via the `definition` "Canvas".
 */
export interface Canvas {
  width: number;
  height: number;
}
/**
 * This interface was referenced by `AvatarSchema`'s JSON-Schema
 * via the `definition` "Slot".
 */
export interface Slot {
  id: Id;
  renamedFrom?: RenamedFrom;
  name: string;
  /**
   * 人間にも AI にも読める説明。perceive のプロンプトにも使う（ADR-0011）
   */
  description?: string;
  zIndex: number;
  required?: boolean;
  category?: string;
  /**
   * この Slot で選べる色の候補。UI と perceive が参照する。Selection.color が候補外でもエラーにしない（ADR-0008）
   */
  palette?: string[];
  placement?: Placement;
  /**
   * This interface was referenced by `Slot`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * Slot の既定の配置。canvas 座標系での位置・大きさ・回転（度）。省略時は canvas 全体（ADR-0009）
 *
 * This interface was referenced by `AvatarSchema`'s JSON-Schema
 * via the `definition` "Placement".
 */
export interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}
/**
 * This interface was referenced by `AvatarSchema`'s JSON-Schema
 * via the `definition` "Part".
 */
export interface Part {
  id: Id;
  renamedFrom?: RenamedFrom;
  slotId: string;
  name: string;
  /**
   * 人間にも AI にも読める説明。perceive のプロンプトにも使う（ADR-0011）
   */
  description?: string;
  assetId: string;
  colorable?: boolean;
  variants?: Variant[];
  /**
   * SlotGroup 内で対応する Part を引くキー。同じグループの別 Slot で同じ値を持つ Part が対応する（ADR-0007）
   */
  pairKey?: string;
  /**
   * This interface was referenced by `Part`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * This interface was referenced by `AvatarSchema`'s JSON-Schema
 * via the `definition` "Variant".
 */
export interface Variant {
  id: Id;
  renamedFrom?: RenamedFrom;
  overrides?: VariantOverrides;
}
/**
 * This interface was referenced by `AvatarSchema`'s JSON-Schema
 * via the `definition` "VariantOverrides".
 */
export interface VariantOverrides {
  color?: Color;
  /**
   * This interface was referenced by `VariantOverrides`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * This interface was referenced by `AvatarSchema`'s JSON-Schema
 * via the `definition` "Asset".
 */
export interface Asset {
  id: Id;
  /**
   * 素材の種類。svg / image / 3d / text 以外も許容する
   */
  kind: "svg" | "image" | "3d" | "text" | (string & {});
  src: string;
  /**
   * Renderer が使うヒント（サイズ・配置原点等）
   */
  hints?: Record<string, unknown>;
  /**
   * アセット内の着色領域と、色を取る Slot の宣言（ADR-0008）
   */
  colorBindings?: ColorBinding[];
  /**
   * This interface was referenced by `Asset`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * アセット内の 1 つの着色領域。from の先頭から順に見て、最初に color を持つ Slot の色を使う（ADR-0008）
 *
 * This interface was referenced by `AvatarSchema`'s JSON-Schema
 * via the `definition` "ColorBinding".
 */
export interface ColorBinding {
  /**
   * アセット内の領域を指す値。解釈は Renderer が決める（renderer-svg では置換元の hex）
   */
  target: string;
  /**
   * 色を取る Slot の id の優先順。"self" はこの Part が入っている Slot
   *
   * @minItems 1
   */
  from: string[];
  /**
   * This interface was referenced by `ColorBinding`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * 複数の Slot を 1 単位として扱う宣言。slots の先頭が基準 Slot（ADR-0007）
 *
 * This interface was referenced by `AvatarSchema`'s JSON-Schema
 * via the `definition` "SlotGroup".
 */
export interface SlotGroup {
  id: Id;
  name: string;
  /**
   * グループに属する Slot の id。先頭が基準 Slot
   *
   * @minItems 2
   */
  slots: string[];
  /**
   * 基準 Slot の選択に合わせて、他の Slot から同じ pairKey の Part を選ぶか。既定 true
   */
  linkParts?: boolean;
  /**
   * 基準 Slot の color を他の Slot にもそろえるか。既定 true
   */
  linkColor?: boolean;
  /**
   * 変形を鏡像で連動させるか（ADR-0009）。既定 false
   */
  mirror?: boolean;
  /**
   * This interface was referenced by `SlotGroup`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * Slot に対する Part の選択（AvatarState の要素）
 *
 * This interface was referenced by `AvatarSchema`'s JSON-Schema
 * via the `definition` "SelectionEntry".
 */
export interface SelectionEntry {
  partId: string;
  variantId?: string;
  color?: Color;
  /**
   * This interface was referenced by `SelectionEntry`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * Slot ごとの変形（AvatarState の要素、ADR-0009）。中心を保って拡縮し、その後に移動と回転を行う
 *
 * This interface was referenced by `AvatarSchema`'s JSON-Schema
 * via the `definition` "SlotTransform".
 */
export interface SlotTransform {
  /**
   * canvas 座標系での横の移動量
   */
  dx: number;
  /**
   * canvas 座標系での縦の移動量
   */
  dy: number;
  /**
   * 拡縮率。0.3〜3.0
   */
  scale: number;
  /**
   * 回転（度）。-180〜180
   */
  rotation: number;
}
