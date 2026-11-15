import type { AvatarEngine } from "@edv4h/alter-ego-core";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import humanSchema from "../schemas/human.schema.json" with { type: "json" };
import mascotSchema from "../schemas/mascot.schema.json" with { type: "json" };

// スキーマに書けない、このデモアプリだけの設定。
// スキーマに書けることは（カテゴリ・色の候補・配置など）ここに書かない。

/** 起動直後に当てる選択。part を省くと今の Part のまま色だけ当てる（色が未設定のときだけ） */
export type InitialSelections = Readonly<Record<string, { readonly part?: string; readonly color?: string }>>;

/** 画面で切り替えられるスキーマ */
export interface DemoSchema {
  /** URL（?schema=）と、どれを選んでいたかの保存に使う */
  readonly id: string;
  /** 切り替えのメニューに出す名前 */
  readonly label: string;
  readonly schema: AvatarSchema;
  /**
   * mount 直後（保存の復元より前）に当てる選択。スキーマに Slot の既定値を書く仕組みができたらそちらへ移す。
   * 例: 人の顔のアセットは肌のプレースホルダ色（#50C7FF）で描かれているので、白で置き換えて見せる
   */
  readonly initial?: InitialSelections;
}

const HUMAN: DemoSchema = {
  id: "human",
  label: "人",
  schema: humanSchema as AvatarSchema,
  initial: { face: { color: "#ffffff" } },
};

const MASCOT: DemoSchema = {
  id: "mascot",
  label: "マスコット",
  schema: mascotSchema as AvatarSchema,
  initial: { ear_left: { part: "ear-left-cat" }, cheek: { part: "cheek-round" } },
};

/** スキーマとして持っているもの全部。スキーマを足すときは src/schemas/ に JSON を置いてここに足す */
export const ALL_DEMO_SCHEMAS: readonly DemoSchema[] = [HUMAN, MASCOT];

/**
 * 人のスキーマを画面に出すか。人の素材（SVG）はリポジトリに入れていないので、
 * 手元に素材を置いて `VITE_DEMO_HUMAN=true` を指定したときだけ出す（README を参照）
 */
export const humanEnabled = (env: { readonly VITE_DEMO_HUMAN?: string } = import.meta.env): boolean =>
  env.VITE_DEMO_HUMAN === "true";

/** 切り替えのメニューに並ぶ順 */
export const DEMO_SCHEMAS: readonly DemoSchema[] = humanEnabled() ? [HUMAN, MASCOT] : [MASCOT];

/** URL の指定も前回の選択も無いときに開くスキーマ */
export const DEFAULT_DEMO_SCHEMA: DemoSchema = DEMO_SCHEMAS[0] ?? MASCOT;

/** アセット（SVG）を読む URL の基点。スキーマの asset.src はここからの相対パス */
export const assetBaseUrl = (): string => `${window.location.origin}/assets/`;

/** エンジンのスキーマに対応する DemoSchema の初期選択を当てる */
export function applyInitialSelections(engine: AvatarEngine): void {
  const demo = ALL_DEMO_SCHEMAS.find((d) => d.schema.metadata.name === engine.schema.metadata.name);
  for (const [slot, { part, color }] of Object.entries(demo?.initial ?? {})) {
    const sel = engine.state.selections[slot];
    if (part !== undefined) {
      engine.select({ slot, part, ...(color ? { color } : {}) });
    } else if (sel && color && !sel.color) {
      engine.select({ slot, part: sel.partId, color });
    }
  }
}

/** 変形ボタン 1 回分の量 */
export const TRANSFORM_STEP = {
  /** 移動（px） */
  move: 4,
  /** 拡縮（倍率）。範囲 0.3〜3 は core が収める */
  scale: 0.1,
  /** 傾き（度） */
  tilt: 6,
  /** 左右の間隔（px） */
  spread: 4,
} as const;

/** 写真の上限（Photo to Avatar） */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** PNG 書き出しの長辺（px） */
export const PNG_EXPORT_SIZE = 1024;
