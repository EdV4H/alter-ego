---
id: 0008
title: 色の連動（colorBindings）とパレットをスキーマで宣言する
status: accepted
date: 2026-11-01
deciders: [EdV4H]
tags: [schema, color, asset, renderer, core]
---

# ADR-0008: 色の連動（colorBindings）とパレットをスキーマで宣言する

## Context

ADR-0003 で、コアが標準化する調整軸は `color` 1 つと決めた。しかしリファレンス実装では、1 つのアセットの中に **複数の着色領域** があり、それぞれが別の Slot の色に従う。

- 髪のアセットは「髪の色（自 Slot の color）」と「肌の色（`face` の color）」の 2 領域を持つ
- 鼻は自分の色を持たず、肌の色にだけ従う
- 眉は自 Slot の color があればそれ、無ければ `hair_front` の color に従う（フォールバック）

この知識は現在 `apps/react-web/src/App.tsx` の `COLOR_REPLACE_MAP` にあり、「アセット中の `#50C7FF` は肌を表す」という **素材側の約束** をアプリが知っている。renderer-svg はそれをオプションで受け取って hex を置換する。

この形では次の問題がある。

- 同じ素材セットを別のアプリで使うと、`COLOR_REPLACE_MAP` を写して持っていく必要がある
- Canvas renderer など別の Renderer は同じ設定を別の形で受け取ることになり、ゴール G2（任意のレンダラ）と衝突する
- 色の候補（パレット）もアプリの定数（`HAIR_PALETTE` など）にあり、スキーマ作者が「この Slot はこの色から選ぶ」と宣言できない

`docs/schema.md` の代表例 3 は、将来案として `x-color-link` を挙げている。

## Decision

**Asset に着色領域の宣言 `colorBindings` を、Slot に色候補 `palette` を追加する。core が各領域の最終色を解決し、Renderer には解決済みの色を渡す。**

### 型

```ts
interface Asset {
  // ... 既存フィールド
  colorBindings?: ColorBinding[];
}

interface ColorBinding {
  /** アセット内の領域を指す値。解釈は Renderer に任せる（SVG なら置換元の hex） */
  target: string;
  /** 色を取る Slot の優先順。"self" はこの Part が入っている Slot。最初に color を持つ Slot の値を使う */
  from: string[];
}

interface Slot {
  // ... 既存フィールド
  /** この Slot で選べる色の候補（hex）。UI と perceive が参照する。検証は行わない */
  palette?: string[];
}
```

例（リファレンス実装の髪）:

```json
{
  "id": "asset-hair-front-01",
  "kind": "svg",
  "src": "hair_front/hair-front-01.svg",
  "colorBindings": [
    { "target": "#FCD0D0", "from": ["self"] },
    { "target": "#50C7FF", "from": ["face"] }
  ]
}
```

### 解決規則

- core は描画ごとに、各 Asset の `colorBindings` を ADR-0003 のマージ後の `color` を使って解決し、`RendererContext` に `{ target, color }[]` として渡す
- `from` のどの Slot にも color が無い領域は、解決結果に含めない（Renderer は素材の元の色で描く）
- `target` の意味は Renderer ごとに定める。renderer-svg は「この hex を置換する」と解釈する。Canvas や 3D の Renderer はマスク名やマテリアル名として解釈してよい
- `palette` は候補の提示に使い、`Selection.color` が palette 外でも検証エラーにしない

### やらないこと

- 色以外の調整軸（不透明度・グラデーション等）は本 ADR では標準化しない
- renderer-svg の `colorReplaceMap` オプションは移行期間だけ残し、次のメジャーで削除する

## Consequences

### 良い影響

- 素材の約束が素材のメタ情報（Asset）に移り、スキーマと素材をセットで配布すればどのアプリでも同じ見た目になる
- Renderer は「解決済みの色を領域に塗る」だけになり、実装が単純になる
- perceive は palette を使って「候補から選ぶ」プロンプトを組める

### 悪い影響・トレードオフ

- `target` の解釈が Renderer 依存のため、SVG 用の素材を Canvas で描くと色が反映されない場合がある。素材は対象 Renderer を前提に作る必要がある
- 解決処理が描画のたびに走る。Asset 数 × 領域数は小さいので実害は無い見込み

### 影響範囲

- `@edv4h/alter-ego-schema`（Asset / Slot の型と JSON Schema）
- `@edv4h/alter-ego-core`（色の解決、`RendererContext` の拡張）
- `@edv4h/alter-ego-plugin-renderer-svg`（解決済みの色を受け取る形へ）
- `apps/react-web`（`COLOR_REPLACE_MAP` と各 PALETTE をスキーマへ移す）
- `docs/schema.md`（代表例 3 の `x-color-link` 案を置き換え）
