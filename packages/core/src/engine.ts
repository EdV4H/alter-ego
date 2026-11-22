import {
  migrate,
  validate as defaultValidate,
  type AvatarSchema,
  type ValidateResult,
} from "@edv4h/alter-ego-schema";
import { PluginSetupError, SelectionError } from "./errors.js";
import { resolveAllColors } from "./colors.js";
import { EventBus } from "./events.js";
import { ExporterRegistryImpl } from "./registries/exporter.js";
import { LoaderRegistryImpl } from "./registries/loader.js";
import { PartsRegistryImpl } from "./registries/parts.js";
import { RendererRegistryImpl } from "./registries/renderer.js";
import { ResourceCache } from "./resource-cache.js";
import { computeInitialState, deselectSlot, selectPart } from "./state.js";
import { deserializeState, type DeserializeStateOptions } from "./state-json.js";
import { resetSlotTransform, resolvePlacements, setSlotTransform } from "./transforms.js";
import type {
  AvatarState,
  EngineEvent,
  EventHandler,
  Plugin,
  PluginContext,
  RendererContext,
  SelectionInput,
  Unsubscribe,
} from "./types.js";
import type { SlotTransform } from "@edv4h/alter-ego-schema";

/** createAvatarEngine が返すエンジンのインターフェース */
export interface AvatarEngine {
  readonly schema: AvatarSchema;
  readonly state: AvatarState;
  /** スロットのパーツ選択を変更し state:change を発行する */
  select(input: SelectionInput): void;
  /** スロットの選択を解除し state:change を発行する。 required: true のスロットはエラー */
  deselect(slot: string): void;
  /**
   * Slot の変形を更新し state:change を発行する（ADR-0009）。指定しなかった値は今の値を引き継ぐ。
   * mirror: true のグループの基準 Slot なら、他の Slot に鏡像を適用する
   */
  setTransform(slot: string, transform: Partial<SlotTransform>): void;
  /** Slot の変形を元に戻し state:change を発行する。slot を省略すると全 Slot を戻す */
  resetTransform(slot?: string): void;
  /**
   * 保存した状態（JSON 文字列か parse 済みの値）を読み込み、今の状態を丸ごと差し替える（ADR-0015）。
   * options は deserializeState にそのまま渡す（ADR-0012）。state:change は 1 回だけ発行する。
   * 読めなければ SelectionError を投げ、状態は変えない。
   */
  load(input: string | unknown, options?: DeserializeStateOptions): void;
  /**
   * 状態を変えずに、 全 renderer の update を呼ぶ。
   * 外部 state (renderer に渡したオプション等) が変わったが
   * engine の state は不変な状況で、 画面だけ再描画したい場合に使う。
   */
  refresh(): void;
  /** レンダラーをマウントし、必要なアセットをロードして描画を開始する */
  mount(target: unknown): Promise<void>;
  /** レンダラーをアンマウントする */
  unmount(): void;
  /** エンジンを破棄する（アンマウント + プラグイン teardown） */
  dispose(): Promise<void>;
  /** イベントハンドラーを登録し、解除関数を返す */
  on(event: EngineEvent, handler: EventHandler): Unsubscribe;
}

/**
 * エンジンを生成する。マイグレーション → スキーマ検証 → plugin.setup → 初期状態計算の順に実行する。
 *
 * `validate` を渡すと既定の検証（ajv による JSON Schema 検証）を差し替えられる（ADR-0010）。
 */
export function createAvatarEngine(options: {
  schema: AvatarSchema;
  plugins: Plugin[];
  validate?: (input: unknown) => ValidateResult;
}): AvatarEngine {
  // マイグレーション → スキーマ検証
  const validate = options.validate ?? defaultValidate;
  const result = validate(migrate(options.schema));
  if (!result.ok) {
    throw new Error(
      `Invalid schema: ${result.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`,
    );
  }
  const schema = result.schema;

  const events = new EventBus();
  const renderer = new RendererRegistryImpl();
  const loader = new LoaderRegistryImpl();
  const parts = new PartsRegistryImpl();
  const exporter = new ExporterRegistryImpl();
  const cache = new ResourceCache();

  let state = computeInitialState(schema);
  let target: unknown = undefined;
  // mount サイクルごとに render:ready を 1 回だけ発行するためのフラグ
  let readyEmittedForCurrentMount = false;

  const makeCtx = (): RendererContext => ({
    schema,
    state,
    resources: cache.asReadonlyMap(),
    colors: resolveAllColors(schema, state.selections),
    placements: resolvePlacements(schema, state.transforms),
  });

  // 状態が変わったあと、アセットの読み込みを待たずに全 renderer を更新する
  const updateRenderers = () => {
    for (const r of renderer.renderers) {
      try {
        void Promise.resolve(r.update(makeCtx())).catch((e) => events.emit("render:error", e));
      } catch (e) {
        events.emit("render:error", e);
      }
    }
  };

  const ctx: PluginContext = {
    schema,
    events: {
      on: (e, h) => events.on(e, h),
      emit: (e, p) => events.emit(e, p),
    },
    renderer,
    loader,
    parts,
    exporter,
  };

  // プラグインを順番に setup し、失敗時は PluginSetupError でラップする
  for (const plugin of options.plugins) {
    try {
      const r = plugin.setup(ctx);
      if (r instanceof Promise) {
        throw new Error(
          "Async plugin.setup は非同期未対応。UI に渡す前に await してください。",
        );
      }
    } catch (e) {
      throw new PluginSetupError(plugin.id, e);
    }
  }

  // スキーマ由来のパーツ・アセットを登録する
  parts.addFragment({ parts: schema.parts, assets: schema.assets });

  /** 現在の state に必要なアセットをロードし、キャッシュに格納する */
  const resolveResourcesForState = async () => {
    const neededAssetIds = new Set<string>();
    for (const slotId of Object.keys(state.selections)) {
      const sel = state.selections[slotId];
      if (!sel) continue;
      const part = schema.parts.find((p) => p.id === sel.partId);
      if (part) neededAssetIds.add(part.assetId);
    }
    const tasks = [...neededAssetIds]
      .map((id) => schema.assets.find((a) => a.id === id))
      .filter((a): a is NonNullable<typeof a> => a !== undefined)
      .filter((a) => !cache.get(a.id))
      .map(async (asset) => {
        try {
          const res = await loader.resolve(asset);
          cache.set(res);
          events.emit("asset:load", res);
        } catch (e) {
          events.emit("asset:error", { asset, error: e });
        }
      });
    await Promise.all(tasks);
  };

  return {
    get schema() { return schema; },
    get state() { return state; },

    select(input) {
      try {
        state = selectPart(state, schema, input);
      } catch (e) {
        throw new SelectionError(e instanceof Error ? e.message : String(e));
      }
      events.emit("state:change", state);
      // 非同期でアセット解決 → レンダラー更新
      void resolveResourcesForState().then(updateRenderers);
    },

    deselect(slot) {
      try {
        state = deselectSlot(state, schema, slot);
      } catch (e) {
        throw new SelectionError(e instanceof Error ? e.message : String(e));
      }
      events.emit("state:change", state);
      // 解除時はアセット解決の必要はないので即時 update する
      updateRenderers();
    },

    setTransform(slot, transform) {
      try {
        state = setSlotTransform(state, schema, slot, transform);
      } catch (e) {
        throw new SelectionError(e instanceof Error ? e.message : String(e));
      }
      events.emit("state:change", state);
      updateRenderers();
    },

    resetTransform(slot) {
      try {
        state = resetSlotTransform(state, schema, slot);
      } catch (e) {
        throw new SelectionError(e instanceof Error ? e.message : String(e));
      }
      events.emit("state:change", state);
      updateRenderers();
    },

    load(input, readOptions) {
      let next: AvatarState;
      try {
        next = deserializeState(schema, input, readOptions);
      } catch (e) {
        throw new SelectionError(e instanceof Error ? e.message : String(e));
      }
      // 保存した状態はエンジンが作ったものなので、グループの連動はかけ直さない（ADR-0015）
      state = next;
      events.emit("state:change", state);
      void resolveResourcesForState().then(updateRenderers);
    },

    refresh() {
      // state は変えずに全 renderer の update を呼ぶ
      updateRenderers();
    },

    async mount(t) {
      target = t;
      // 新しい mount サイクルが始まるのでフラグをリセット
      readyEmittedForCurrentMount = false;
      await resolveResourcesForState();
      await Promise.all(
        renderer.renderers.map(async (r) => {
          try {
            await r.mount(target, makeCtx());
          } catch (e) {
            events.emit("render:error", e);
          }
        }),
      );
      // mount サイクルにつき 1 回だけ render:ready を発行する
      if (!readyEmittedForCurrentMount) {
        readyEmittedForCurrentMount = true;
        events.emit("render:ready");
      }
    },

    unmount() {
      for (const r of renderer.renderers) {
        try { void r.unmount(); } catch (e) { events.emit("render:error", e); }
      }
      target = undefined;
      readyEmittedForCurrentMount = false;
    },

    async dispose() {
      this.unmount();
      // プラグインを逆順で teardown する（順次実行が意味を持つため Promise.all は使わない）
      for (const p of [...options.plugins].toReversed()) {
        if (p.teardown) {
          // oxlint-disable-next-line no-await-in-loop
          await p.teardown();
        }
      }
    },

    on(event, handler) { return events.on(event, handler); },
  };
}
