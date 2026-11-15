# パーツ群を追加する（parts）

- **目的**: 新しいパーツ群（絵柄・衣装パック・季節アセット等）を追加するプラグインの書き方を示す
- **対象読者**: 素材を提供するデザイナー、アセットパックを配布したい開発者
- **前提知識**: [スキーマ仕様](../schema.md)、[プラグインガイド](./README.md)

## 位置づけ

プラグイン自体は統一の `Plugin` 型。パーツ追加を担うプラグインは、`setup(ctx)` の中で **スキーマ断片を `ctx.parts.addFragment(fragment)` で登録する**。複数責務を兼ねてもよい（例: 専用 Renderer や Loader を同プラグイン内で `ctx.renderer.add` / `ctx.loader.add` する）。

```
基本スキーマ（slots 定義）
       +
parts プラグイン A（髪パック）    ──┐
parts プラグイン B（服パック）    ──┼──► AvatarEngine が集約
parts プラグイン C（アクセサリ） ──┘
```

## スキーマ断片の形（仕様検討中）

`addFragment()` に渡すオブジェクトは [スキーマ仕様](../schema.md) のサブセット:

```ts
// 仕様検討中
interface PartsFragment {
  parts: Part[];
  assets: Asset[];
  slots?: Slot[]; // 新規スロットを足すときのみ
}
```

- `slots` は省略可。既存スロット（髪・目・服 等）に追加するだけなら不要
- `parts[].slotId` は基本スキーマまたは他プラグインで定義されているスロットを参照する
- `assets[].src` は Loader が解釈できる形にする（CDN URL、`mem:xxx` 等）

## 実装例

```ts
// 仕様検討中
import type { Plugin, PluginContext } from "@edv4h/alter-ego-core";

export function hairPackPlugin(): Plugin {
  return {
    id: "@edv4h/alter-ego-plugin-parts-hair-basic",
    name: "Basic Hair Pack",
    version: "0.1.0",

    setup(ctx: PluginContext) {
      ctx.parts.addFragment({
        parts: [
          { id: "hair-01", slotId: "hair", name: "ショート", assetId: "asset-hair-01" },
          { id: "hair-02", slotId: "hair", name: "ロング",   assetId: "asset-hair-02" },
        ],
        assets: [
          { id: "asset-hair-01", kind: "svg", src: "https://cdn.example.com/hair/01.svg" },
          { id: "asset-hair-02", kind: "svg", src: "https://cdn.example.com/hair/02.svg" },
        ],
      });
    },
  };
}
```

複数責務を持たせる場合（パック専用の Loader を同梱）:

```ts
// 仕様検討中
export function offlineHairPackPlugin(): Plugin {
  return {
    id: "@edv4h/alter-ego-plugin-parts-hair-offline",
    name: "Offline Hair Pack",
    version: "0.1.0",
    setup(ctx) {
      ctx.parts.addFragment({ /* ... */ });
      ctx.loader.add(bundledMemoryLoader(/* assetMap */));
    },
  };
}
```

## パーツ追加のフロー（デザイナー向け）

1. **スロットを決める**: 既存スロットに入るか、新規スロットが必要か
2. **アセットファイルを用意**: SVG / PNG / glTF 等。命名規則はパック側で統一
3. **スキーマ断片を書く**: `parts` と `assets` エントリを JSON で書く
4. **Loader に合わせて `src` を設定**: CDN 前提なら絶対 URL、バンドル同梱なら `mem:xxx`
5. **プラグインとしてエクスポート**: `setup(ctx)` で `addFragment` する関数を export
6. **動作確認**: サンプルアプリに読み込み、レイヤー順・色差し替え・拡大表示を確認

## ネーミング規約

| 対象 | 推奨形式 | 例 |
| --- | --- | --- |
| パッケージ名（公式） | `@edv4h/alter-ego-plugin-parts-<pack>` | `@edv4h/alter-ego-plugin-parts-hair-basic` |
| パッケージ名（サードパーティ） | `alter-ego-plugin-parts-<pack>` | `alter-ego-plugin-parts-fantasy` |
| Slot ID | 小文字ハイフン区切り | `hair`, `eyes`, `outer-wear` |
| Part ID | `<slot>-<name>[-<variant>]` | `hair-01-red` |
| Asset ID | `asset-<part>`、派生は suffix | `asset-hair-01` |

## 必須メタ情報

- パック名は `Plugin.name`（[プラグインガイド](./README.md)）に人間可読な名前を設定する（例: `"Basic Hair Pack"`）。`PartsFragment` 自体はメタ情報フィールドを持たないため、パックの識別は Plugin オブジェクト側で行う
- アセットのライセンス情報を明示する（スキーマ拡張 `x-license` を使うことも検討）
- 各 Part の `name` はエンドユーザー向け表示名（国際化は将来拡張）

## 競合とレイヤー

- `slot.id` / `part.id` / `asset.id` は登録全体でグローバル一意。複数プラグインで同じ `id` が定義されると、完全同一定義なら冪等に許容、定義が食い違えば **衝突エラー**（暗黙の後勝ち上書きはしない。[ADR-0006](../domain/adr/0006-fragment-id-uniqueness.md)）
  - 「完全同一定義」は **全フィールド（`x-*` 含む）のディープ等価**で判定する。`src` や `hints` 等に少しでも差があれば衝突エラー
- `zIndex` はスロット側で定義。Parts プラグイン側で Slot を上書きしないのが原則
- どうしても Slot を追加する場合は `slots[]` に新規 Slot のみ入れ、既存 Slot の変更は行わない

## チェックリスト

- [ ] 全パーツの `slotId` が既存スロットまたは同プラグイン内の新規スロットを指しているか
- [ ] 全 Part の `assetId` が `assets[]` 内に存在するか
- [ ] 命名規約に沿っているか
- [ ] Loader が解決可能な `src` になっているか
- [ ] ライセンス表記を付けたか
- [ ] パッケージ名が `@edv4h/alter-ego-plugin-parts-*` に沿っているか
