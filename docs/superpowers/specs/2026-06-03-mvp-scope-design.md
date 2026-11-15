# alter-ego MVP スコープ設計書

- **作成日**: 2026-06-03
- **状態**: draft
- **対象**: 最初のリリース可能な実装範囲（MVP）

## 目的

これまで設計フェーズで固めてきたコンセプト・スキーマ・プラグインモデル・ADR (0001〜0006) を、最小の縦串実装で検証するためのスコープを定義する。実装計画 (writing-plans) の入力となる設計書。

## 成功条件

**ブラウザで切り替えが見える**。

apps/react-web を `pnpm dev` で起動し、最小スキーマ (1スロット・パーツ数個) に基づくアバターが描画され、UI上のボタンで部品を選択するとアバターが即座に切り替わる。

## MVP の輪郭

| 項目 | 内容 |
|---|---|
| 成功条件 | ブラウザで切り替えが見える (apps/react-web で動作) |
| スキーマ | 最小スキーマ (1スロット `hair`・パーツ 2〜3個) |
| Renderer | `@edv4h/alter-ego-plugin-renderer-svg` |
| Loader | `@edv4h/alter-ego-plugin-loader-http` |
| FW ラッパー | 使わない (`apps/react-web` から `core` を直接利用) |
| ADR 適用範囲 | ADR-0001〜0006 すべて完全適用 |
| 公開範囲 | ローカル動作のみ (npm publish なし) |
| 実装の進め方 | 薄い E2E 縦串を先に通す → ADR 準拠・テスト整備で補強 |

## 触るパッケージ・触らないパッケージ

**触る (5パッケージ)**

- `packages/schema` — JSON Schema 定義・型・validate
- `packages/core` — AvatarEngine・Registry 群・イベント
- `plugins/renderer-svg` — SVG 描画
- `plugins/loader-http` — HTTP/相対参照アセット取得
- `apps/react-web` — MVP 動作の入口

**触らない (scaffold は残置)**

- `packages/react` / `packages/vue` — FW ラッパー (ポストMVP)
- `plugins/renderer-canvas` — Canvas 描画 (ポストMVP)
- `plugins/loader-memory` — メモリ Loader (テスト用途として後で導入)

## アーキテクチャ

```
apps/react-web
   │  createAvatarEngine + mount + select
   ▼
packages/core (AvatarEngine / Registries / Events)
   ├─ depends → packages/schema (validate + types)
   │
   ├─ plugin: plugins/renderer-svg
   └─ plugin: plugins/loader-http
```

依存方向は [architecture.md](../../architecture.md) の規約通り:

- `core` は `schema` のみに依存
- plugins は `core` の公開インターフェースのみに依存
- `apps/react-web` は `core` + plugins を組み合わせる利用者

## 公開 API (MVP 範囲)

### packages/schema

```ts
// 型
export type AvatarSchema = { /* docs/schema.md の構造 */ };
export type PartsFragment = { /* スキーマ断片 */ };
export type SchemaError = { path: string; message: string };

// 関数
export function validate(schema: unknown):
  | { ok: true; schema: AvatarSchema }
  | { ok: false; errors: SchemaError[] };
```

### packages/core

```ts
export function createAvatarEngine(options: {
  schema: AvatarSchema;
  plugins: Plugin[];
}): AvatarEngine;

export interface AvatarEngine {
  readonly schema: AvatarSchema;
  readonly state: AvatarState;

  select(input: SelectionInput): void;
  mount(target: unknown): Promise<void>;
  unmount(): void;
  dispose(): Promise<void>;
  on(event: EngineEvent, handler: EventHandler): Unsubscribe;
}

export interface Plugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  setup(ctx: PluginContext): void | Promise<void>;
  teardown?(): void | Promise<void>;
}

export interface PluginContext {
  readonly schema: AvatarSchema;
  readonly events: { on; emit };
  readonly renderer: RendererRegistry;
  readonly loader: LoaderRegistry;
  readonly parts: PartsRegistry;
  readonly exporter: ExporterRegistry; // MVPは登録口だけ用意
}

// プラグイン作者が実装する型
export interface Renderer { /* mount / update / unmount */ }
export interface Loader { canHandle(asset): boolean; load(asset): Promise<Resource>; }
```

**内部に持つ責務**:

- `PartsRegistry` — 断片追加時の ID ディープ等価チェック (ADR-0006)
- `LoaderRegistry` — スキーム正規化 (小文字化)、Loader 振り分け、相対参照 `""` の単一制約 (ADR-0005)
- `RendererRegistry` — 複数 Renderer 同時登録可
- `AvatarState` — シリアライズ可能・イミュータブル
- `Resource` キャッシュ — asset.id 単位で core 側に保持 (Loader は素朴に毎回 fetch)

### plugins/renderer-svg

```ts
export function svgRendererPlugin(options?: {
  containerSelector?: string;
}): Plugin;
```

- mount 時に `<svg>` ターゲット内に `<image>` 要素を slot 順で配置
- `state:change` / `asset:load` で `href` を差し替える
- 描画失敗時は `render:error` 発火

### plugins/loader-http

```ts
export function httpLoaderPlugin(options: {
  baseUrl: string;
}): Plugin;
```

- `canHandle(asset)` で `http(s):` と相対参照 (`""`) を担当
- `fetch` で取得し `Resource { type, data, mime }` を返す
- 失敗時は `asset:error` 発火 + 例外を再 throw

### apps/react-web

- `src/avatar.schema.json` — 最小スキーマ
- `public/assets/hair-{01,02,03}.svg` — ダミー素材
- `src/App.tsx` — useEffect で engine 生成・mount、ボタンで select、`asset:error` / `render:error` を console 表示

## データフロー

### 初期化フェーズ (1回)

1. `App.tsx` が `schema.json` を import
2. `createAvatarEngine({ schema, plugins: [httpLoader, svgRenderer] })`
3. core が schema を `validate` (失敗→例外)
4. core が plugins を配列順に `setup(ctx)` 呼び出し → 各 Registry に自己登録
5. core が schema 内の parts を PartsRegistry に展開 (ADR-0006: 断片ID重複検出)
6. initial state を計算 (各 slot のデフォルト part = 配列先頭)

### マウントフェーズ (1回)

1. `engine.mount(svgRef.current)`
2. core が state から必要 Asset を抽出
3. LoaderRegistry が各 Asset の src からスキーム正規化 (ADR-0005)
4. http(s)/相対 → `httpLoader.load(asset)` 呼び出し
5. `Promise.all` で全 Resource を待つ (完了ごとに `asset:load` 発火)
6. svgRenderer が state + Resource から `<svg>` に `<image>` を配置
7. core が `render:ready` を1回発火

### 選択フェーズ (繰り返し)

1. ボタンクリック → `engine.select({ slot, part })`
2. core が新 state を計算 (イミュータブル) → `state:change` 発火
3. 新規必要 Asset があれば LoaderRegistry 経由でロード (既存はキャッシュから)
4. svgRenderer が該当 `<image>` の href を差し替えて即座に再描画

## エラー処理方針

「silent fallback 禁止」をプラグインガイド通り厳守。**初期化系は throw、実行時系はイベント + アプリ側ハンドリング**で分離。

### 初期化時 — throw (fail loud)

| 状況 | 振る舞い |
|---|---|
| `validate(schema)` 失敗 | `SchemaValidationError` を throw、`createAvatarEngine` 中断 |
| Plugin の `setup` 内例外 | core が catch して `PluginSetupError` (プラグインID付与) で再 throw |
| 同一スキームを複数 Loader が宣言 | `LoaderConflictError` (ADR-0005) |
| 相対参照 `""` を担当する Loader が複数 | 同上 (ADR-0005 単一制約) |
| 断片ID重複かつディープ等価でない | `FragmentConflictError` (ADR-0006、衝突点を含む) |
| ディープ等価な重複 | 黙って許容 (ADR-0006、重複ロードの正常パス) |

### 実行時 — イベント発火

| 状況 | イベント | 補足 |
|---|---|---|
| Asset 取得成功 | `asset:load` | resource を payload に |
| Asset 取得失敗 (fetch エラー / 4xx-5xx) | `asset:error` | error と asset を payload に。**core は再 throw せず、イベントのみ** |
| Renderer の `render()` が throw | `render:error` | 同上 |
| `mount` 後に必要 Asset が揃った | `render:ready` | mount サイクルにつき1回 (ADR-0004) |
| `select` で未知の slot/part 指定 | throw `SelectionError` | 同期API、利用者バグなので即座に伝える |

### apps/react-web のハンドリング

- `engine.on('asset:error', e => console.error(e))` と `engine.on('render:error', ...)` を必ず購読
- 取得失敗した part は対応 `<image>` を非表示 (空のまま) にする — エラーで全体が壊れない
- 初期化例外は try/catch で捉えて画面に表示

### MVP で扱わないエラー

- リトライ / バックオフ — Loader が毎回 fetch する素朴な実装。再選択で再試行される
- ネットワーク復旧後の自動再試行 — ポスト MVP

## テスト方針

| レイヤー | テスト | ツール |
|---|---|---|
| schema validate | 有効/無効スキーマ4ケース (最小/欠落フィールド/型不一致/ID重複) | vitest |
| core: PartsRegistry | 断片重複 (ディープ等価/不等価) の許容/拒否 (ADR-0006) | vitest |
| core: LoaderRegistry | スキーム正規化 (大文字/小文字)、相対参照単一制約、未知スキーム失敗 (ADR-0005) | vitest |
| core: AvatarEngine | createAvatarEngine → mount → select → state変更 のシーケンス (モック plugin) | vitest |
| renderer-svg | mount 時の構築、state:change 時の href 差し替え (`<svg>`/`<image>` 検査) | vitest + happy-dom |
| loader-http | canHandle 判定、fetch 成功/失敗時の Resource 形/asset:error 発火 | vitest + msw |
| apps/react-web | `pnpm dev` で手動確認、スクリーンショット1枚を spec に添付 | 手動 |

- **カバレッジ目標**: core/schema は 80%以上、plugins は主要パスのみ
- **CI**: GitHub Actions で `pnpm install && pnpm test && pnpm build`。publish フローは含めない
- **E2E**: MVP では入れない (Playwright 等はポスト MVP)

## 実装の進め方 (薄い E2E 縦串先行)

C案 (薄い E2E 先行) で進める。最初に最小骨格で縦に貫通させ、その後で ADR 準拠・テスト・エラー処理を太らせる。

### Phase 1: 最小骨格を縦に通す

1. `packages/schema` に型と最小 `validate` (JSON Schema は使わずまず形だけ) を実装
2. `packages/core` に `createAvatarEngine` / `AvatarEngine` の最小実装 (Registry は配列でOK)
3. `plugins/loader-http` の最小実装 (相対参照のみ、http(s):も対応)
4. `plugins/renderer-svg` の最小実装 (`<image>` を並べるだけ)
5. `apps/react-web` で動作確認 → スクリーンショット記録

**ゲート**: ブラウザでアバターが表示され、ボタンで切り替わる。

### Phase 2: ADR 準拠と契約強化

6. `packages/schema`: JSON Schema による厳密 validate に置き換え
7. `packages/core`: PartsRegistry の重複検出 (ADR-0006)
8. `packages/core`: LoaderRegistry のスキーム振り分け・単一制約 (ADR-0005)
9. エラー型の整備 (`SchemaValidationError`, `PluginSetupError`, `LoaderConflictError`, `FragmentConflictError`, `SelectionError`)
10. イベント (`state:change`/`asset:load`/`asset:error`/`render:ready`/`render:error`) の発火実装と単発化規約 (ADR-0004)

**ゲート**: ADR 0003〜0006 と整合 + Phase 1 のブラウザ動作が壊れていない。

### Phase 3: テスト整備

11. 各レイヤーのユニットテスト追加 (上記テスト方針表の通り)
12. CI ワークフロー追加 (`.github/workflows/ci.yml`)
13. apps/react-web で手動確認、結果スクショを spec へ追記

**ゲート**: `pnpm test` 全通過 + CI green + 手動動作 OK。

## MVP 完了確認 (Phase 3 検証結果)

- **実施日**: 2026-06-03
- **検証環境**: `http://localhost:5173/` / Chrome (Chrome DevTools MCP 経由)
- **動作**:
  - 初期表示: `hair-01` (赤) のアバターが描画される
  - `hair-02` ボタン押下: 青 (`#2980b9`) に切り替わる
  - `hair-03` ボタン押下: 緑 (`#27ae60`) に切り替わる
  - 各切り替えで `<image data-slot="hair">` の `href` (data URI) が更新される
  - `Selected: hair-XX` 表示が同期して更新される
- **既知の警告**:
  - React 19 の StrictMode による初回 mount → cleanup → 再 mount で `[render:error]` が 1 回出力される (動作には影響なし、ポスト MVP で解消予定)
- **スクリーンショット**: （スクリーンショットは公開していません）
- **テスト合計**: 40 件 (schema 7 + core events 5 + core parts 5 + core loader 5 + core state 4 + core engine 7 + renderer-svg 3 + loader-http 4)

## ポスト MVP (本設計の範囲外)

- packages/react / packages/vue の実装
- plugins/renderer-canvas / plugins/loader-memory の実装
- exporter プラグイン (PNG 書き出し等)
- 複数スロット・人型標準スキーマへの拡張
- Changesets 導入 + npm publish フロー
- E2E テスト (Playwright)
- リトライ / バックオフ / オフライン対応

## 参照ドキュメント

- [docs/concept.md](../../concept.md)
- [docs/architecture.md](../../architecture.md)
- [docs/schema.md](../../schema.md)
- [docs/plugins/README.md](../../plugins/README.md)
- ADR-0001〜0006 (`docs/domain/adr/`)
