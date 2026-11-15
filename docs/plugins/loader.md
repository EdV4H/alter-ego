# アセット取得を追加する（loader）

- **目的**: Asset の取得経路を提供するプラグインの書き方を示す
- **対象読者**: 独自ストレージ・CDN・暗号化経路からアセットを読みたい開発者
- **前提知識**: [プラグインガイド](./README.md)、非同期処理（Promise / AbortController）

## 位置づけ

プラグイン自体は統一の `Plugin` 型。取得責務を持つプラグインは、`setup(ctx)` の中で **`Loader` オブジェクトを `ctx.loader.add(loader)` で登録する**。コアは取得経路を知らず、Loader に完全に委譲する。

```
RendererBus が必要な Asset を要求
         │
         ▼
LoaderRegistry ──► 登録順に canHandle(asset) を問い合わせ
         │
         ▼
Loader.load(asset, signal) ──► Promise<Resource>
```

## Loader オブジェクト（仕様検討中）

```ts
// 仕様検討中
interface Loader {
  readonly id: string;
  readonly schemes: string[];          // 担当する src スキーム（"" は相対参照）

  canHandle?(asset: Asset): boolean;   // 同一スキーム内での追加絞り込み（任意）
  load(asset: Asset, signal?: AbortSignal): Promise<Resource>;
  preload?(assets: Asset[]): Promise<void>;
}

interface Resource {
  readonly assetId: string;
  readonly kind: Asset["kind"];
  readonly data: unknown; // Renderer が解釈（SVGElement / ImageBitmap / ArrayBuffer / …）
}
```

| メンバー | 説明 |
| --- | --- |
| `schemes` | この Loader が担当する `src` スキームの一覧。`""` は相対参照（スキームなし）を表す |
| `canHandle(asset)` | 同一スキーム内でさらに絞り込みたい場合の任意判定（例: 拡張子で分岐）。省略可 |
| `load(asset, signal)` | アセットを取得して `Resource` を返す。`signal` で中断対応 |
| `preload(assets)` | まとめて先読みする。省略可 |

## 振り分けルール

コアは `asset.src` の**スキーム**（最初の `:` より前。`:` を含まなければ空スキーム `""`）で担当 Loader を選ぶ（[ADR-0005](../domain/adr/0005-loader-dispatch.md)）。

- そのスキームを `schemes` に含む Loader を **登録順**に走査し、`canHandle` があればそれも `true` を返した **最初の Loader** が担当する
- どの Loader も担当できない場合は `asset:error` を発火し、該当パーツは描画スキップ
- **否定形の catch-all（`!startsWith("mem:")` 等）は禁止**。「自分以外」ではなく「自分が担当するスキーム」を `schemes` で明示する
- 相対参照（スキームなし）を扱う Loader は `schemes` に `""` を含めて明示的に opt-in する

例:

```ts
// 仕様検討中
createAvatarEngine({
  schema,
  plugins: [
    memoryLoaderPlugin({ "mem:*": bundledAssets }),       // mem: を担当
    httpLoaderPlugin({ baseUrl: "https://cdn..." }),      // "" / http / https を担当
    svgRendererPlugin(),
  ],
});
```

> `memoryLoaderPlugin({ "mem:*": ... })` の `"mem:*"` は**プラグインの設定キー（アセットマップのパターン）**であり、振り分け用のスキーム宣言とは別物。この Loader は内部で `schemes: ["mem"]` を宣言する。

> **移行ノート**: 旧仕様では `canHandle` が必須だった。本 ADR で `schemes` 宣言を必須化し `canHandle` を任意化したため、既存・サードパーティ製 Loader は `schemes` の追加が必要（`canHandle` の否定形 catch-all は削除する）。

### スキームの正規化と相対参照

- スキームは **小文字に正規化**し、大文字小文字を無視して照合する（`HTTPS:` は `https` 扱い。RFC 3986 準拠）。Loader は `schemes` を小文字で宣言する
- 相対参照（空スキーム `""`）を担当できる Loader は **1 つだけ**。複数の Loader が `""` を宣言した場合は `createAvatarEngine` 時に例外（fail loud。暗黙の先勝ちにしない）
- 相対参照の解決は担当 Loader 内で行う（例: HTTP Loader は `new URL(src, baseUrl)`）

### 取得不要アセットの契約（loader-inline）

`builtin:` / `inline:` を担当する Loader は、取得を行わず Asset の記述をそのまま `Resource` 化する。最小契約:

```ts
// 仕様検討中
return {
  assetId: asset.id,
  kind: asset.kind,                       // 例: "text"
  data: { src: asset.src, hints: asset.hints, ...pickXKeys(asset) },
};
```

`data` の解釈は担当 Renderer に委ねる（テキスト描画など）。パッケージとしての詳細仕様は実装時に確定する。

## キャッシュとの関係

- Loader 自体はキャッシュを持たなくてよい
- コアは Registry 層で **LRU キャッシュ**を提供する（仕様検討中）
- キャッシュキーは `asset.id`。`asset.id` は登録全体でグローバル一意であることが保証される（[ADR-0006](../domain/adr/0006-fragment-id-uniqueness.md)）
- Loader 側で独自キャッシュを持つ場合（例: IndexedDB）は `canCache: false` 相当を宣言可能にする案を検討中

## 実装例: HTTP Loader プラグイン

```ts
// 仕様検討中
import type { Plugin, PluginContext, Loader, Asset, Resource } from "@edv4h/alter-ego-core";

export function httpLoaderPlugin(config: { baseUrl: string }): Plugin {
  return {
    id: "@edv4h/alter-ego-plugin-loader-http",
    name: "HTTP Loader",
    version: "0.1.0",

    setup(ctx: PluginContext) {
      ctx.loader.add(createHttpLoader(config));
    },
  };
}

function createHttpLoader(config: { baseUrl: string }): Loader {
  return {
    id: "http",
    schemes: ["", "http", "https"],   // 相対参照と絶対 URL を担当（否定形は使わない）

    async load(asset: Asset, signal?: AbortSignal): Promise<Resource> {
      const url = new URL(asset.src, config.baseUrl).toString();
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`asset fetch failed: ${url} (${res.status})`);
      const data = asset.kind === "svg"
        ? await res.text()
        : await res.arrayBuffer();
      return { assetId: asset.id, kind: asset.kind, data };
    },
  };
}
```

## 非同期方針

- **Abort 対応**: 長時間の取得はユーザー操作でキャンセルされる。`AbortSignal` を尊重する
- **優先度**: 表示中パーツを優先、プリロードは低優先（実装時に検討）
- **再試行**: Loader 自体では行わず、呼び出し側（コアまたはユーザー）で制御する方針

## よく使う Loader パターン

| 役割 | パッケージ例 | 担当スキーム | 用途 |
| --- | --- | --- | --- |
| HTTP | `@edv4h/alter-ego-plugin-loader-http` | `""` / `http` / `https` | Web アプリ・CDN |
| メモリ | `@edv4h/alter-ego-plugin-loader-memory` | `mem` | テスト、SSR、バンドル同梱 |
| IndexedDB | `@edv4h/alter-ego-plugin-loader-indexeddb` | `idb` | オフライン対応 |
| ファイルシステム（Node.js） | `@edv4h/alter-ego-plugin-loader-fs` | `fs` / `file` | サーバーサイド画像生成 |
| インライン（取得不要） | `@edv4h/alter-ego-plugin-loader-inline` | `builtin` / `inline` | テキスト・手続き生成など取得を伴わないアセット。`src`/`hints`/`x-*` をそのまま `Resource` 化（[ADR-0005](../domain/adr/0005-loader-dispatch.md)） |

## チェックリスト

- [ ] `schemes` で担当スキームを明示しているか（否定形 catch-all を使っていないか）
- [ ] `canHandle` を使う場合、副作用なし・高速に判定するか
- [ ] `load` が `AbortSignal` を尊重するか
- [ ] エラー時に例外または `asset:error` で通知するか
- [ ] `Resource.data` の型が担当 Renderer の期待と一致するか
- [ ] パッケージ名が `@edv4h/alter-ego-plugin-loader-*` に沿っているか
