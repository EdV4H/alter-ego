# アーキテクチャ設計

- **目的**: `alter-ego` の内部構造・モジュール責務・データフローを定義する
- **対象読者**: コア実装者、プラグイン作者、コードレビュワー
- **前提知識**: [コンセプト](./concept.md)、TypeScript の基本的な型定義、npm ワークスペースの概念

## 全体像

```
┌──────────────────────────────────────────────────┐
│  App / FW ラッパー (React, Vue, Svelte, ...)      │
└────────────┬─────────────────────────────────────┘
             │ createAvatarEngine({ schema, plugins })
┌────────────▼─────────────────────────────────────┐
│  @edv4h/alter-ego-core : AvatarEngine             │
│  ┌────────────────────────────────────────────┐  │
│  │  Schema (JSON)  ←─ @edv4h/alter-ego-schema │  │
│  └────────────────────────────────────────────┘  │
│  ┌─────────┐ ┌────────┐ ┌───────┐ ┌──────────┐   │
│  │ parts   │ │ loader │ │renderer│ │ exporter │  │
│  │Registry │ │Registry│ │Registry│ │ Registry │  │
│  └────▲────┘ └────▲───┘ └───▲────┘ └────▲─────┘  │
│       │            │         │           │        │
│       └────────────┴──ctx────┴───────────┘        │
└──────────────────────▲───────────────────────────┘
                       │ setup(ctx) で自己登録
         ┌─────────────┴──────────────┐
         │                            │
  Plugin A                     Plugin B ...
  (@edv4h/alter-ego-plugin-*)  (同左)
```

コアは **スキーマを真実の単一ソース**として扱う。プラグインは種類別に分かれていない単一インターフェース `Plugin` で、`setup(ctx)` 時に `ctx.renderer.add()` / `ctx.loader.add()` / `ctx.parts.addFragment()` / `ctx.exporter.add()` といった **Registry への自己登録** を通じて責務を果たす。コアはプラグインの種類を知らない。

## モジュール構成

npm スコープは `@edv4h`、パッケージ名は `alter-ego-` プレフィックスで統一する。プラグインはすべて `@edv4h/alter-ego-plugin-*` に揃え、**用途は 2 つ目のセグメント**（`renderer` / `loader` / `parts` / `exporter`）で示す。

| パッケージ | 責務 | 依存方向 |
| --- | --- | --- |
| `@edv4h/alter-ego-core` | スキーマ解釈、状態管理、プラグイン登録、イベント発火 | `schema` のみに依存 |
| `@edv4h/alter-ego-schema` | JSON Schema 定義、バリデータ、TS 型エクスポート | 依存なし |
| `@edv4h/alter-ego-plugin-renderer-svg` | SVG DOM で描画するプラグイン | `core` の公開インターフェースのみ |
| `@edv4h/alter-ego-plugin-renderer-canvas` | Canvas 2D で描画するプラグイン | 同上 |
| `@edv4h/alter-ego-plugin-loader-http` | HTTP 経由でアセットを取得するプラグイン | 同上 |
| `@edv4h/alter-ego-plugin-loader-memory` | メモリ上の固定アセットを返すプラグイン（テスト・SSR 用） | 同上 |
| `@edv4h/alter-ego-plugin-parts-*` | パーツ群（スキーマ断片＋アセット）を追加するプラグイン | 同上 |
| `@edv4h/alter-ego-plugin-exporter-*` | スキーマと状態を別形式に変換するプラグイン | `core` + 出力先ライブラリ |
| `@edv4h/alter-ego-react` | React 向けのフック（`useAvatarEngine` / `useAvatarState`、[ADR-0013](./domain/adr/0013-react-bindings-package.md)） | `core` + `react` |
| `@edv4h/alter-ego-vue` | Vue 向けバインディング | `core` + `vue` |

**依存ルール**:

- プラグインは `core` の「公開インターフェース」だけに依存する。内部実装には触れない
- `core` はいかなるプラグインにも依存しない
- FW バインディングは `core` に依存するが、プラグイン実装には依存しない（利用者が組み合わせる）

## プラグインモデル

プラグインは **単一の統一インターフェース**で表現し、種別フィールド（`kind` 等）は持たない。責務は `setup(ctx)` で必要な Registry に自己登録することで決まる。

```ts
// 仕様検討中
interface Plugin {
  readonly id: string;        // 一意な識別子（npm 名と同じでよい）
  readonly name: string;      // 人間可読名
  readonly version: string;   // セマンティックバージョン

  setup(ctx: PluginContext): void | Promise<void>;
  teardown?(): void | Promise<void>;
}
```

この設計の利点:

- **1 プラグインが複数責務を持てる**: `parts` プラグインが独自 Renderer を同梱する、`exporter` が内部で独自 Loader を使う、といった合成が自然にできる
- **責務の追加が破壊的変更にならない**: 新しい Registry を `ctx` に足すだけで済む（ユニオン型を広げる必要がない）
- **ラッパー・合成プラグインが書きやすい**: 既存プラグインをラップして差し替えるのも、`setup` の中で `ctx` を操作するだけ

設計上のトレードオフ:

- プラグインが何を登録するかは「実行してみないと分からない」。これは **パッケージ命名規約で補う**（用途が 2 つ目のセグメントに表れる）
- 登録順に意味が出うる。`core` はプラグイン配列順に `setup` を呼ぶ

## コアの内部構造

`AvatarEngine` は以下の要素から構成される（仕様検討中）。

```ts
// 仕様検討中
interface AvatarEngine {
  readonly schema: AvatarSchema;
  readonly state: AvatarState;

  select(input: SelectionInput): void;
  setTransform(slot: string, transform: Partial<SlotTransform>): void;  // ADR-0009
  resetTransform(slot?: string): void;
  mount(target: unknown): Promise<void>;   // 描画先へ attach。再 mount 可
  unmount(): void;                          // 描画先から detach。state/Registry は保持
  dispose(): void | Promise<void>;          // teardown を逆順に実行しエンジンを破棄
  on(event: EngineEvent, handler: EventHandler): Unsubscribe;

  export<T = unknown>(exporterId: string, options?: unknown): Promise<T>;
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

プラグインのライフサイクル（`setup` は生成時 1 回、`mount`/`unmount` は描画先への attach/detach で再実行可、`teardown` は `dispose()` 時のみ）は [ADR-0004](./domain/adr/0004-engine-lifecycle.md) で定義する。

### Schema

- `AvatarSchema` は JSON オブジェクト（[スキーマ仕様](./schema.md)参照）
- バリデーションは `@edv4h/alter-ego-schema` が提供する JSON Schema で行う
- 読み込み時にバリデーションエラーがあれば、エンジン生成時に例外を投げる

### State

- `AvatarState` は「どのスロットにどのパーツを選んでいるか」と「スロットごとの変形」の純粋なデータ（[ADR-0009](./domain/adr/0009-slot-transform-in-state.md)）
- 副作用を持たず、シリアライズ可能（JSON で保存・復元できる）
- `select()` は新しい state を計算し、変更イベントを発火する（イミュータブル更新）

### Registries

プラグインが `setup(ctx)` 内で登録する先。プラグイン種別の代わりに **「どの Registry を使ったか」** が責務を表す。

- **parts**: スキーマから解決されたパーツ定義を保持し、描画側がレイヤー順に取り出せるようにする。`ctx.parts.addFragment(fragment)` で追加
- **loader**: Asset ごとの取得方法を管理。`canHandle(asset)` で担当判定する Loader を `ctx.loader.add(loader)` で登録
- **renderer**: state の変化・アセットのロード完了・unmount を通知される描画器を `ctx.renderer.add(renderer)` で登録。複数登録可（プレビュー + 書き出し等）
- **exporter**: ワンショット変換器を `ctx.exporter.add(exporter)` で登録。`engine.export(id, options)` から呼ばれる

### イベント

コアは以下のイベントを発火する（仕様検討中）。

| イベント | タイミング |
| --- | --- |
| `state:change` | `select()` 等で state が変わった時 |
| `asset:load` | Loader がアセット取得を完了した時 |
| `asset:error` | Loader がアセット取得に失敗した時 |
| `render:ready` | mount 後、必要なアセットが揃い描画可能になった時（mount ごとに発火しうる） |
| `render:error` | Renderer の描画が失敗した時 |

発火回数の規約:

- `render:ready` は **1 つの mount サイクルにつき 1 回**発火する。`unmount()` で readiness はリセットされ、次の `mount()` で再び発火しうる。mount 後の `state:change` に伴う追加アセットのロードは `asset:load` で通知され描画も更新されるが、`render:ready` は再発火しない（「この mount は初回描画可能になった」のマイルストーンに限定する）
- `asset:load` / `asset:error` はアセットごと、`render:error` は描画失敗のたびに発火する

## データフロー

```
┌─────────────┐
│ Schema JSON │
└──────┬──────┘
       │ 1. load & validate
       ▼
┌─────────────────────┐
│ AvatarEngine 生成   │
└──────┬──────────────┘
       │ 2. 各 Plugin.setup(ctx) で Registry に自己登録
       ▼
┌─────────────────────┐
│ user: select(...)   │
└──────┬──────────────┘
       │ 3. state 更新
       ▼
┌─────────────────────┐
│ 必要な Asset を解決 │─── 4. Loader.load(asset) ──► Promise<Resource>
└──────┬──────────────┘
       │ 5. Resource 揃ったら RendererBus に通知
       ▼
┌─────────────────────┐
│ Renderer.render()   │─── 6. DOM / Canvas / Buffer に描画
└─────────────────────┘
```

## monorepo 方針

- ツール: **pnpm workspaces**
- ディレクトリ構成（予定）:

```
alter-ego/
├── packages/
│   ├── core/                      # @edv4h/alter-ego-core
│   ├── schema/                    # @edv4h/alter-ego-schema
│   ├── react/                     # @edv4h/alter-ego-react
│   └── vue/                       # @edv4h/alter-ego-vue
├── plugins/
│   ├── renderer-svg/              # @edv4h/alter-ego-plugin-renderer-svg
│   ├── renderer-canvas/           # @edv4h/alter-ego-plugin-renderer-canvas
│   ├── loader-http/               # @edv4h/alter-ego-plugin-loader-http
│   ├── loader-memory/             # @edv4h/alter-ego-plugin-loader-memory
│   ├── parts-*/                   # @edv4h/alter-ego-plugin-parts-*
│   └── exporter-*/                # @edv4h/alter-ego-plugin-exporter-*
├── apps/
│   └── docs/                      # 将来のドキュメントサイト用（予約）
└── docs/                          # Markdown ドキュメント（このフォルダ）
```

- バージョン管理: Changesets で版を上げる。版はパッケージごとに上げる（[ADR-0014](./domain/adr/0014-release-with-changesets.md)、手順は [release.md](./release.md)）
- ビルド: 各パッケージが自前のビルド設定を持つ（turborepo 等の導入は実装開始時に判断）

## 未確定事項

- パッケージ間の型共有方法（単一の型エントリパッケージを作るか、各パッケージで re-export するか）
- Renderer 複数同時利用（プレビュー＋書き出し用など）の mount ターゲット指定方法
- SSR 専用 API（Node.js 環境向けの軽量エントリ）の有無
- プラグインのバージョン互換性チェック（`core` 側がプラグインの version を検査する仕組み）
- プラグインの `setup` 順依存が生じた場合の解決策（明示的な依存宣言 / 再試行 / イベントでの遅延束縛）

これらは実装着手時に [コンセプト](./concept.md) の原則に照らして決める。
