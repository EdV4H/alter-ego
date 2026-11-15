import type { AvatarSchema, Asset, SelectionEntry, SlotTransform } from "@edv4h/alter-ego-schema";
import type { ResolvedColor } from "./colors.js";
import type { ResolvedPlacement } from "./transforms.js";

/** イベントリスナーの解除関数 */
export type Unsubscribe = () => void;

/** エンジンが発行するイベントの種類 */
export type EngineEvent =
  | "state:change"
  | "asset:load"
  | "asset:error"
  | "render:ready"
  | "render:error";

/** イベントハンドラーの型 */
export type EventHandler = (payload?: unknown) => void;

/** アバターの現在の状態。selections と transforms を合わせて JSON にできる（ADR-0009） */
export interface AvatarState {
  readonly selections: Readonly<Record<string, SelectionEntry>>;
  /** Slot ごとの変形。無い Slot は変形なし。Part を変えても保持する */
  readonly transforms: Readonly<Record<string, SlotTransform>>;
}

/** スロットへのパーツ選択入力 */
export interface SelectionInput {
  slot: string;
  part: string;
  variant?: string;
  color?: string;
}

/** ローダーが読み込んだアセットのリソース表現 */
export interface Resource {
  readonly assetId: string;
  readonly kind: string;
  readonly mime?: string;
  readonly data: unknown;
}

/** アセットを読み込むローダーのインターフェース */
export interface Loader {
  /** このローダーが担当するスキーム (小文字)。`""` は相対参照を意味する */
  readonly schemes: readonly string[];
  load(asset: Asset): Promise<Resource>;
  /** 追加の動的判定 (オプション) */
  canHandle?(asset: Asset): boolean;
}

/** アバターを描画するレンダラーのインターフェース */
export interface Renderer {
  mount(target: unknown, ctx: RendererContext): void | Promise<void>;
  update(ctx: RendererContext): void | Promise<void>;
  unmount(): void | Promise<void>;
}

/** レンダラーに渡されるコンテキスト */
export interface RendererContext {
  readonly schema: AvatarSchema;
  readonly state: AvatarState;
  readonly resources: ReadonlyMap<string, Resource>;
  /** Slot ごとの解決済みの着色領域（ADR-0008）。color が決まらない領域は含まない */
  readonly colors: Readonly<Record<string, readonly ResolvedColor[]>>;
  /**
   * Slot ごとの配置（ADR-0009）。既定の配置と変形を合成した canvas 座標系の値。
   * placement も canvas も無い Slot は含まない（Renderer の既定で描く）
   */
  readonly placements: Readonly<Record<string, ResolvedPlacement>>;
}

/** プラグインが追加できるパーツ・アセットの断片 */
export interface PartsFragment {
  parts?: AvatarSchema["parts"];
  assets?: AvatarSchema["assets"];
}

/** レンダラーを登録するレジストリ */
export interface RendererRegistry { add(renderer: Renderer): void; }

/** ローダーを登録するレジストリ */
export interface LoaderRegistry { add(loader: Loader): void; }

/** パーツフラグメントを登録するレジストリ */
export interface PartsRegistry { addFragment(fragment: PartsFragment): void; }

/** エクスポーターを登録するレジストリ */
export interface ExporterRegistry { add(exporter: unknown): void; }

/** プラグインの setup に渡されるコンテキスト */
export interface PluginContext {
  readonly schema: AvatarSchema;
  readonly events: {
    on(event: EngineEvent, handler: EventHandler): Unsubscribe;
    emit(event: EngineEvent, payload?: unknown): void;
  };
  readonly renderer: RendererRegistry;
  readonly loader: LoaderRegistry;
  readonly parts: PartsRegistry;
  readonly exporter: ExporterRegistry;
}

/**
 * プラグインのインターフェース。
 * kind フィールドは持たない（ADR 0001）。
 */
export interface Plugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  setup(ctx: PluginContext): void | Promise<void>;
  teardown?(): void | Promise<void>;
}
