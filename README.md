# alter-ego

> Headless, schema-driven, pluggable avatar SDK

`alter-ego` は、**任意の UI・任意のレンダラ・任意の素材形式** で動く汎用アバター作成 SDK です。コアは headless（描画を持たない）で、パーツ構成はスキーマで宣言し、Renderer / Loader / Parts / Exporter をプラグインとして差し替えます。

## 特徴

- 🧩 **Headless**: コアは描画も I/O も持たず、どこにでも組み込める
- 📜 **スキーマ駆動**: パーツ・アセットを JSON で宣言し、JSON Schema でバリデーション
- 🔌 **プラグイン式**: Renderer / Loader / Parts / Exporter を自由に差し替え
- ⏳ **非同期アセット**: Loader プラグインで URL / CDN / ローカル / IndexedDB を透過的に扱う
- 🪶 **最小依存**: コア本体は他ライブラリにほぼ依存しない

## 想定利用者

| 役割 | 使い方 |
| --- | --- |
| Web アプリ開発者 | `@edv4h/alter-ego-core` + Renderer / FW ラッパーを組み合わせてアプリに組み込む |
| デザイナー | スキーマ仕様に沿ってパーツを追加するだけで、新しい絵柄を導入できる |
| プラグイン作者 | Renderer / Loader / Exporter を実装して公開すれば、任意の出力先に対応できる |

## インストール

```sh
npm install @edv4h/alter-ego-core @edv4h/alter-ego-plugin-renderer-svg @edv4h/alter-ego-plugin-loader-http
# React から使うとき
npm install @edv4h/alter-ego-react
```

ESM のみで、Node.js 20 以上かバンドラ（Vite など）を前提にしています。

## クイックスタート

```ts
import { createAvatarEngine } from "@edv4h/alter-ego-core";
import { svgRendererPlugin } from "@edv4h/alter-ego-plugin-renderer-svg";
import { httpLoaderPlugin } from "@edv4h/alter-ego-plugin-loader-http";
import schema from "./avatar.schema.json";

const engine = createAvatarEngine({
  schema,
  plugins: [
    httpLoaderPlugin({ baseUrl: "https://cdn.example.com/assets" }),
    svgRendererPlugin(),
  ],
});

// svgRendererPlugin の mount 先は <svg> 要素
await engine.mount(document.querySelector<SVGSVGElement>("svg#avatar")!);
engine.select({ slot: "hair", part: "hair-01" });
```

動く例は [apps/react-web](./apps/react-web) を参照してください。

## パッケージ一覧

| パッケージ | 役割 | 状態 |
| --- | --- | --- |
| `@edv4h/alter-ego-core` | スキーマ解釈・状態管理・プラグイン登録 | 実装済み |
| `@edv4h/alter-ego-schema` | JSON Schema 定義とバリデータ | 実装済み |
| `@edv4h/alter-ego-perceive` | 写真から `AvatarSeed` を推定する Perceive 層（OpenAI / Gemini） | 実装済み |
| `@edv4h/alter-ego-plugin-renderer-svg` | SVG で描画するプラグイン | 実装済み |
| `@edv4h/alter-ego-plugin-loader-http` | HTTP 経由でアセットを取得するプラグイン | 実装済み |
| `@edv4h/alter-ego-plugin-renderer-canvas` | Canvas 2D で描画するプラグイン | 未実装（private） |
| `@edv4h/alter-ego-plugin-loader-memory` | メモリ上のアセットを返すプラグイン | 未実装（private） |
| `@edv4h/alter-ego-react` | React 向けのフック（`useAvatarEngine` / `useAvatarState`） | 実装済み |
| `@edv4h/alter-ego-vue` | Vue バインディング | 未実装（private） |
| `@edv4h/alter-ego-plugin-parts-*` | パーツ群（スキーマ断片＋アセット）を追加するプラグイン | 予定 |
| `@edv4h/alter-ego-plugin-exporter-*` | スキーマから別形式を生成するプラグイン | 予定 |

未実装のパッケージは `private: true` にしてあり、npm には公開されません。

※ パッケージは段階的に追加されます。プラグインはすべて `@edv4h/alter-ego-plugin-*` に統一し、用途は 2 つ目のセグメント（`renderer` / `loader` / `parts` / `exporter`）で示します。

## ドキュメント

- [DOMAIN.md](./DOMAIN.md) — ドメイン知識の索引（用語・ADR・ドメインモデル）
- [コンセプトとゴール](./docs/concept.md)
- [アーキテクチャ設計](./docs/architecture.md)
- [スキーマ仕様](./docs/schema.md)
- [プラグインガイド](./docs/plugins/README.md)
  - [描画を追加する（renderer）](./docs/plugins/renderer.md)
  - [アセット取得を追加する（loader）](./docs/plugins/loader.md)
  - [パーツ群を追加する（parts）](./docs/plugins/parts.md)
  - [書き出しを追加する（exporter）](./docs/plugins/exporter.md)

## ステータス

**alpha（0.x）**。core / schema / perceive / react / renderer-svg / loader-http は実装とテストがあり、npm に公開します。リファレンス実装アプリ [apps/react-web](./apps/react-web) で動作を確認できます。0.x の間は minor でも API とスキーマ形式に壊れる変更が入ることがあり、変更点は各パッケージの CHANGELOG に書きます。公開の流れは [docs/release.md](./docs/release.md) を参照してください。

## コントリビュート

開発手順と規約は [CONTRIBUTING.md](./CONTRIBUTING.md) を、脆弱性の報告は [SECURITY.md](./SECURITY.md) を参照してください。

## ライセンス

コードは [MIT License](./LICENSE) です。

デモアプリのマスコットの素材（`apps/react-web/public/assets/mascot/`）も MIT です。人のスキーマの素材は公開していないので、リポジトリには入っていません。
