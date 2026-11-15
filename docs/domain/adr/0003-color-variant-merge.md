---
id: 0003
title: パーツの色・variant マージ規則
status: accepted
date: 2026-05-29
deciders: [EdV4H]
tags: [schema, state, color, variant, core]
---

# ADR-0003: パーツの色・variant マージ規則

## Context

パーツの見た目を指定する経路が **2 つ** あり、両者が同時に存在したときのマージ規則が未定義だった。

- `Part.variants[].overrides`（[スキーマ仕様](../../schema.md#part)）— パーツ定義側で色違い等の派生を宣言する
- `Selection.color`（[スキーマ仕様](../../schema.md#selection状態)）— 選択状態側で色を直接指定する

このため代表例集の中でも流儀が割れていた。

- 人型標準セットの Selection: `"hair": { "partId": "hair-short-red" }` … **variant の id を `partId` に入れている**
- 非人型の Selection: `"body": { "partId": "body-round", "color": "#f6c177" }` … **`partId` + `color` で直接指定している**

「variant を選ぶ」と「`color` で塗る」が競合したときどちらが勝つのか、variant id を `partId` として扱ってよいのか、`overrides` に何を入れてよいのかが決まっておらず、色機能は実装に進めない状態だった。`schema.md` 自身も「`variants` の合成順序」「色指定フォーマット」を未確定事項として挙げていた。

検討した代替案:

- **variant = 独立した選択肢（派生 Part 相当）**: variant id を `partId` として直接選ぶ。マージ不要で明快だが、色違いの数だけ Part が増え、`Selection.color` の存在意義と二重化する
- **variants 廃止・`color` 一本化**: 派生はすべて別 Part で表現。最小だが「推奨色セット」のような名付きプリセットを表現できない

## Decision

**variant は「プリセット（名付き overrides 束）」として扱い、`Part 既定値 → variant.overrides → Selection の明示値` の順で後勝ちのフィールド単位マージを行う。**

### 型

```ts
// 仕様検討中
interface Part {
  // ... 既存フィールド
  variants?: Variant[];
}

interface Variant {
  readonly id: string;
  readonly overrides: AdjustmentFields; // 調整フィールドの部分集合
}

interface Selection {
  readonly partId: string;
  readonly variantId?: string;
  readonly color?: string;
  // x-* 拡張キーを許容（コアは素通し、プラグインが解釈）
  readonly [ext: `x-${string}`]: unknown;
}
```

### マージ規則

ある Slot の最終的な調整値は、次の順に **トップレベルのフィールド単位で後勝ち（浅いマージ）**に解決する。

1. **Part の既定値**（Part 自身が持つ調整値）
2. **`variant.overrides`**（`Selection.variantId` が指定されている場合のみ）
3. **`Selection` の明示値**（`color` および `x-*`）

- マージは **トップレベルのキー単位**であり、オブジェクト全体の置換ではない。例: variant が `color` と `x-physics` を持ち、Selection が `color` だけを指定した場合、`color` は Selection 値で上書きされ、`x-physics` は variant 由来の値が保持される
- 同じトップレベルキーが複数段で指定された場合は **後段の値で丸ごと置換**する（入れ子オブジェクトの再帰マージは行わない）
- 結果として **`Selection.color` が最優先**となる
- `x-*` キーもこのトップレベル単位マージの対象とする

### 標準化する調整軸

- コアが標準化する調整軸は **`color` のみ**とする
- `scale` / `offset` / `opacity` / `flipX` など他の調整は **`x-*` 拡張**で運び、解釈は各プラグイン（主に Renderer）に委ねる
- これにより Minimal core の原則を保ちつつ、マージ規則だけは `x-*` も含めて汎用に定義する
- 追記（2026-11-02）: 位置・拡縮・回転は [ADR-0009](./0009-slot-transform-in-state.md) で標準化した。Selection ではなく、Slot ごとの変形として `AvatarState.transforms` に持つ

### やらないこと

- variant id を `partId` として直接選択する形式は **採らない**。variant は必ず `{ partId, variantId }` で指す
- コアは `color` の値フォーマット（hex / CSS color 等）を本 ADR では確定しない（別途スキーマ仕様で詰める）

## Consequences

### 良い影響

- 色・variant の解決順が一意に定まり、実装・テストの基準ができる
- Renderer は「解決済みの調整値」を受け取れる（マージ責務はコアに集約）
- 「推奨色セット」を variant プリセットで表現しつつ、ユーザーの自由な色変更を `Selection.color` で両立できる
- `x-*` を同じマージ規則に乗せることで、調整軸の追加がコア改修なしで可能

### 悪い影響・トレードオフ

- マージ規則の実装（フィールド単位の深いマージ）と、その単体テストが必要になる
- 「variant を選んだのに color で上書きされた」という直感に反するケースが起こりうる（最優先は常に `Selection.color`）

### 影響範囲

- `@edv4h/alter-ego-core`（state 解決ロジック）
- `@edv4h/alter-ego-schema`（`Variant` / `Selection` 型・バリデータ）
- `docs/schema.md`（`Part` / `Selection` 節、代表例 2 の Selection 記述）
- 各 Renderer プラグイン（解決済み調整値を前提に描画）

### 追随タスク

- ~~`docs/schema.md` 代表例 2（人型標準セット）の Selection を、variant id 直接指定から正規形 `{ partId: "hair-short", variantId: "hair-short-red" }` へ修正~~（対応済み）
- ~~`color` の値フォーマット確定（hex のみか CSS color も許すか）~~（hex のみで確定。[スキーマ仕様](../../schema.md#色color-の値フォーマット)）
- ~~variant の `overrides` に対する JSON Schema 制約の定義~~（`{ color?, "x-*"? }` で確定。[スキーマ仕様](../../schema.md#selection状態)）
- ~~入れ子の `x-*` オブジェクトを再帰マージしたい需要が出た場合の規則（現状は浅いマージのみ）~~（浅いマージで確定）

## 参照

- [スキーマ仕様 — Part / Selection](../../schema.md)
- [ドメインモデル — Selection / AvatarState](../model.md)
