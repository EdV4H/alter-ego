# プラグインガイド

- **目的**: `alter-ego` のプラグインの統一契約と、責務別の書き始め方を示す
- **対象読者**: プラグインを書く外部開発者、社内の機能追加担当
- **前提知識**: [アーキテクチャ](../architecture.md)、[スキーマ仕様](../schema.md)

## 基本方針

プラグインは **単一のインターフェース `Plugin`** で表現される。Renderer / Loader / Parts / Exporter のような **種別フィールド（`kind`）は持たない**。プラグインは `setup(ctx)` の中で、`ctx` の必要な Registry に **自己登録** することで責務を果たす。

- どの責務かは **パッケージ名の 2 つ目のセグメント**で示す（`@edv4h/alter-ego-plugin-<role>-<name>`）
- 1 つのプラグインが複数の Registry に登録してもよい（例: `parts` プラグインが独自 Loader も同梱）
- 新しい責務を足したくなったら、`ctx` に新しい Registry を追加するだけ（型のユニオンを広げる必要がない）

## 統一インターフェース（仕様検討中）

```ts
// 仕様検討中
interface Plugin {
  readonly id: string;        // 一意識別子。npm 名と同じ想定
  readonly name: string;      // 人間可読名
  readonly version: string;   // セマンティックバージョン

  setup(ctx: PluginContext): void | Promise<void>;
  teardown?(): void | Promise<void>;
}

interface PluginContext {
  readonly schema: AvatarSchema;
  readonly events: {
    on(event: EngineEvent, handler: EventHandler): Unsubscribe;
    emit(event: EngineEvent, payload?: unknown): void;
  };
  readonly renderer: RendererRegistry;
  readonly loader:   LoaderRegistry;
  readonly parts:    PartsRegistry;
  readonly exporter: ExporterRegistry;
}
```

### ライフサイクル

```
生成 ──► setup(ctx)（ctx.*.add で Registry に自己登録）
        │
        ▼
  [ mount(target) → unmount() ]   ── 繰り返し可（描画先への attach / detach）
        │
        ▼
  dispose() ──► teardown
```

- `setup` は `createAvatarEngine` 時に配列順で呼ばれる（1 回のみ）
- `mount` / `unmount` は描画先への attach / detach。`unmount` 後も再 `mount` でき、state・Registry は保持される
- `teardown` は `engine.dispose()` 時に逆順で呼ばれる（`unmount()` では呼ばれない）
- `setup` 内で非同期初期化（IndexedDB オープン等）をしてよい
- 詳細は [ADR-0004](../domain/adr/0004-engine-lifecycle.md) を参照

### 登録パターン

プラグインがやりたいことに応じて、`ctx` の異なる Registry を使う：

| やりたいこと | 使う API | 詳細ガイド |
| --- | --- | --- |
| 描画器を追加する | `ctx.renderer.add(renderer)` | [renderer.md](./renderer.md) |
| アセット取得経路を追加する | `ctx.loader.add(loader)` | [loader.md](./loader.md) |
| パーツ群（スキーマ断片）を追加する | `ctx.parts.addFragment(fragment)` | [parts.md](./parts.md) |
| 書き出し器を追加する | `ctx.exporter.add(exporter)` | [exporter.md](./exporter.md) |

※ Renderer / Loader / Exporter は「ハンドラー型」（`Renderer` / `Loader` / `Exporter` 型を満たすオブジェクト）、Parts は「スキーマ断片」を渡す点が異なる。

## 最小例

何もしないプラグインの骨組み:

```ts
// 仕様検討中
import type { Plugin, PluginContext } from "@edv4h/alter-ego-core";

export function noopPlugin(): Plugin {
  return {
    id: "@edv4h/alter-ego-plugin-noop",
    name: "No-op",
    version: "0.1.0",
    setup(_ctx: PluginContext) {
      // 何も登録しないが、プラグインの最小形として有効
    },
  };
}
```

複数責務をひとつにまとめる例（パーツ群＋専用 Renderer）:

```ts
// 仕様検討中
export function myCharacterPackPlugin(): Plugin {
  return {
    id: "@edv4h/alter-ego-plugin-parts-my-pack",
    name: "My Character Pack",
    version: "0.1.0",
    setup(ctx) {
      ctx.parts.addFragment({ /* slots/parts/assets */ });
      ctx.renderer.add(myCustomRenderer());   // このパック固有の描画
    },
  };
}
```

## 登録

```ts
// 仕様検討中
import { createAvatarEngine } from "@edv4h/alter-ego-core";
import { httpLoaderPlugin } from "@edv4h/alter-ego-plugin-loader-http";
import { svgRendererPlugin } from "@edv4h/alter-ego-plugin-renderer-svg";

const engine = createAvatarEngine({
  schema,
  plugins: [
    httpLoaderPlugin({ baseUrl: "https://cdn.example.com/" }),
    svgRendererPlugin(),
  ],
});
```

- `plugins` 配列の順に `setup` が呼ばれる
- 後の Registry に依存するプラグインは、依存先プラグインより **後** に並べる
- 起動順依存が複雑になる場合は、将来的に明示的な依存宣言 API を検討（未確定）

## エラー方針

- プラグインは例外を握りつぶさない。失敗は例外または `asset:error` 等のイベントで伝える
- `core` はプラグインの例外を受け取り、利用者に再 throw またはイベントで通知する（silent fallback は禁止）

## 配布とネーミング

- npm スコープ: `@edv4h`
- パッケージ名: **`@edv4h/alter-ego-plugin-<role>-<name>`**
  - `<role>`: `renderer` / `loader` / `parts` / `exporter`（役割が主責務のもの）
  - 複数責務の場合は代表的な役割で命名
- サードパーティ配布は任意スコープで可。命名推奨は `alter-ego-plugin-<role>-<name>`
- `package.json` に `version` を書く（`core` 側での互換チェックは仕様検討中）

## 個別ガイド

- [描画を追加する（renderer）](./renderer.md)
- [アセット取得を追加する（loader）](./loader.md)
- [パーツ群を追加する（parts）](./parts.md)
- [書き出しを追加する（exporter）](./exporter.md)
