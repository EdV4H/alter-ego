# 書き出しを追加する（exporter）

- **目的**: スキーマと状態を別形式に変換して返す Exporter を提供するプラグインの書き方を示す
- **対象読者**: 別 SDK への連携・画像書き出し・印刷用出力を実装したい開発者
- **前提知識**: [プラグインガイド](./README.md)、[スキーマ仕様](../schema.md)

## 位置づけ

プラグイン自体は統一の `Plugin` 型。書き出し責務を持つプラグインは、`setup(ctx)` の中で **`Exporter` オブジェクトを `ctx.exporter.add(exporter)` で登録する**。

Renderer との違い:

| | Renderer | Exporter |
| --- | --- | --- |
| 呼び出し契機 | state 変化のたび自動 | 明示的なワンショット呼び出し |
| 結果 | 画面・キャンバスに反映 | 戻り値（Buffer / JSON / ファイル …） |
| 用途 | リアルタイム表示 | 書き出し・連携・保存 |

同じ SVG を描画するとしても、画面に貼るなら Renderer、PNG Buffer にしてダウンロードさせるなら Exporter、という使い分け。

## Exporter オブジェクト（仕様検討中）

```ts
// 仕様検討中
interface Exporter<Output = unknown, Options = void> {
  readonly id: string;

  export(
    input: { schema: AvatarSchema; state: AvatarState; resources: ResourceMap },
    options?: Options
  ): Promise<Output>;
}
```

- `input` には解決済みの `resources`（Loader で取得済み）も含まれる
- `options` は Exporter ごとに自由に定義（出力サイズ、フォーマット等）
- 戻り値は Exporter ごとに自由（`Uint8Array`、`Blob`、`string`、他 SDK 用 JSON 等）

## 典型的なユースケース

| 用途 | 入力 | 出力 |
| --- | --- | --- |
| PNG 書き出し | state + SVG resources | `Uint8Array`（PNG バイナリ） |
| OGP 生成（サーバー） | state | `Buffer`（1200×630 PNG） |
| 他社アバター SDK 連携 | state | その SDK のスキーマ JSON |
| 印刷用 PDF | state + SVG resources | `Uint8Array`（PDF） |
| バックアップ JSON | schema + state | `string`（シリアライズ済み JSON） |

## 実装例: PNG Exporter プラグイン

```ts
// 仕様検討中
import type { Plugin, PluginContext, Exporter } from "@edv4h/alter-ego-core";

interface PngOptions {
  width: number;
  height: number;
}

export function pngExporterPlugin(): Plugin {
  return {
    id: "@edv4h/alter-ego-plugin-exporter-png",
    name: "PNG Exporter",
    version: "0.1.0",

    setup(ctx: PluginContext) {
      ctx.exporter.add(createPngExporter());
    },
  };
}

function createPngExporter(): Exporter<Uint8Array, PngOptions> {
  return {
    id: "png",
    async export({ state, resources }, options) {
      const svgString = composeSvg(state, resources);
      return await svgToPngBuffer(svgString, options ?? { width: 512, height: 512 });
    },
  };
}
```

## 他 SDK 形式への変換

「受け取ったスキーマを別のフォーマットで出したい」という要望にも Exporter を使う。

```ts
// 仕様検討中
export function otherSdkExporterPlugin(): Plugin {
  return {
    id: "alter-ego-plugin-exporter-other-sdk",
    name: "Other SDK Exporter",
    version: "0.1.0",
    setup(ctx) {
      ctx.exporter.add({
        id: "other-sdk",
        async export({ schema, state }) {
          return mapToOtherSdk(schema, state);
        },
      });
    },
  };
}
```

## 呼び出し方（仕様検討中）

```ts
// 仕様検討中
const png = await engine.export("png", { width: 1024, height: 1024 });
```

- 第一引数で Exporter の `id` を指定
- 第二引数は Exporter 固有の options
- 戻り値は Exporter の出力型

## Renderer と Exporter、どちらで書くか

| シナリオ | 推奨 |
| --- | --- |
| 画面に継続的に表示する | Renderer |
| ボタン押下で画像保存 | Exporter（描画自体は Renderer の成果物を使うケースも） |
| サーバーサイドで 1 枚生成 | Exporter（Renderer を伴わない場合が多い） |
| 他 SDK 形式への変換 | Exporter |
| プレビューと書き出し両方が必要 | Renderer ＋ Exporter 併用 |

## チェックリスト

- [ ] 出力形式が一意に定まっているか（options で揺れすぎないか）
- [ ] 大きな出力（高解像度 PNG 等）での性能を検証したか
- [ ] サーバー・クライアントどちらで動く前提かを README に書いたか
- [ ] 一時リソース（Canvas 等）を関数終了時に解放しているか
- [ ] エラー時に例外を投げているか（戻り値で失敗を表さない）
- [ ] パッケージ名が `@edv4h/alter-ego-plugin-exporter-*` に沿っているか
