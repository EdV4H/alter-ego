# 描画を追加する（renderer）

- **目的**: アバターの状態を描画先（DOM / Canvas / Buffer / 3D シーン …）に反映する Renderer を登録するプラグインの書き方を示す
- **対象読者**: 新しい描画方式を追加したい開発者
- **前提知識**: [プラグインガイド](./README.md)、対象描画 API（SVG / Canvas / WebGL 等）の知識

## 位置づけ

プラグイン自体は統一の `Plugin` 型（[README](./README.md) 参照）。描画責務を持つプラグインは、`setup(ctx)` の中で **`Renderer` オブジェクトを `ctx.renderer.add(renderer)` で登録する**。コアは描画の詳細を一切知らない。

```
createAvatarEngine({ plugins: [ svgRendererPlugin() ] })
                       │
                setup(ctx) 呼び出し
                       │
                ctx.renderer.add({ mount, render, unmount })
                       │
                state 変化 / asset 揃う度に render が呼ばれる
```

## Renderer オブジェクト（仕様検討中）

プラグインが `ctx.renderer.add()` に渡すオブジェクトの型:

```ts
// 仕様検討中
interface Renderer {
  readonly id: string;

  mount(target: unknown): void | Promise<void>;
  render(state: AvatarState, resources: ResourceMap): void | Promise<void>;
  unmount(): void | Promise<void>;
}
```

| メソッド | タイミング | 備考 |
| --- | --- | --- |
| `mount(target)` | `engine.mount(target)` 呼び出し時 | `target` の型は Renderer ごとに定義（`HTMLElement`, `CanvasRenderingContext2D`, etc.） |
| `render(state, resources)` | state 変化 / アセット読み込み完了時 | 冪等に実装する。同じ入力で何度呼ばれても同じ結果 |
| `unmount()` | `engine.unmount()` 時 | DOM・イベントリスナ・GPU リソース等を解放 |

## 実装例: SVG Renderer プラグイン

```ts
// 仕様検討中
import type { Plugin, PluginContext, Renderer, AvatarState, ResourceMap } from "@edv4h/alter-ego-core";

export function svgRendererPlugin(): Plugin {
  return {
    id: "@edv4h/alter-ego-plugin-renderer-svg",
    name: "SVG Renderer",
    version: "0.1.0",

    setup(ctx: PluginContext) {
      ctx.renderer.add(createSvgRenderer(ctx));
    },
  };
}

function createSvgRenderer(ctx: PluginContext): Renderer {
  let root: SVGSVGElement | null = null;

  return {
    id: "svg",

    async mount(target: HTMLElement) {
      root = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      target.appendChild(root);
    },

    render(state: AvatarState, resources: ResourceMap) {
      if (!root) return;
      root.replaceChildren();
      for (const layer of sortByZIndex(state, ctx.schema)) {
        const resource = resources.get(layer.assetId);
        if (!resource) continue;
        root.appendChild(toSvgNode(resource));
      }
    },

    unmount() {
      root?.remove();
      root = null;
    },
  };
}
```

## 複数 Renderer の共存

Registry は複数 Renderer の登録を許す。実用上よくあるパターン:

- **プレビュー + 書き出し**: 画面上に SVG、ボタン押下で Canvas→PNG
- **デバッグオーバーレイ**: 通常描画 + パーツ境界線表示

ただし「書き出し」のように **明示的なワンショット呼び出しで結果を受け取りたい** 場合は、Renderer より [Exporter](./exporter.md) の方が素直なことが多い。

mount ターゲットの複数指定 API（どの Renderer にどの要素を渡すか）は仕様検討中。

## サーバーサイド利用

Node.js 環境では DOM がないため、次の前提が必要:

- 対応する Renderer プラグインを選ぶ（例: node-canvas ベース、resvg ベース）
- Loader も環境に合わせる（例: FS Loader）
- `mount` の `target` はバッファや仮想キャンバス

「1 回だけレンダリングして Buffer を返す」ワンショット API が欲しい場合は Exporter プラグインで書く方が自然。

## チェックリスト

- [ ] `mount` / `render` / `unmount` が冪等か
- [ ] `render` は state とアセットだけで決まるか（外部状態に依存しないか）
- [ ] `unmount` で全リソースを解放しているか
- [ ] アセット未ロード時の挙動（空描画 / プレースホルダ）を決めたか
- [ ] 例外または `asset:error` イベントで失敗を通知しているか
- [ ] パッケージ名が `@edv4h/alter-ego-plugin-renderer-*` に沿っているか
