---
id: 0009
title: Slot の配置と変形（SlotTransform）を標準化し AvatarState に含める
status: accepted
date: 2026-11-01
deciders: [EdV4H]
tags: [schema, state, transform, renderer, core]
---

# ADR-0009: Slot の配置と変形（SlotTransform）を標準化し AvatarState に含める

## Context

ADR-0003 は「`scale` / `offset` などの調整は `x-*` 拡張で運び、解釈は Renderer に任せる」と決めた。実装が進んだ結果、位置・拡縮・回転は拡張ではなく **アバターの状態そのもの** として扱われている。

- `apps/react-web` は Slot ごとの `slotTransforms`（`dx` / `dy` / `scale` / `rotation`）を React の state で持つ
- 既定の配置（`BASE_PLACEMENTS`、例: `eye_left` は x=132, y=142, 128×128）もアプリの定数
- renderer-svg は両者を合成した `slotPlacements` をオプションで受け取る
- perceive の `AvatarSeed` は `slotTransforms` を出力する

core の `AvatarState` は `selections` しか持たないため、変形は core を経由しない。その結果、次のことができない。

- 状態を 1 つの JSON として保存・復元する（selections と transforms が別の場所にある）
- `state:change` イベントで変形の変化を購読する
- 別の Renderer で同じ配置を再現する

## Decision

**スキーマに描画座標系と Slot の既定配置を、`AvatarState` に Slot ごとの変形を追加し、core が両者を合成した配置を Renderer に渡す。** これは ADR-0003 の「標準化する調整軸は color のみ」を部分的に改める（color は Selection、変形は Slot 単位の状態として別に持つ）。

### 型

```ts
interface AvatarSchema {
  // ... 既存フィールド
  /** 描画座標系。配置の単位はこの座標系 */
  canvas?: { width: number; height: number };
}

interface Slot {
  // ... 既存フィールド
  /** 既定の配置。省略時は canvas 全体 */
  placement?: { x: number; y: number; width: number; height: number; rotation?: number };
}

interface SlotTransform {
  dx: number;        // canvas 座標系での移動量
  dy: number;
  scale: number;     // 中心を保って拡縮。0.3〜3.0 に clamp
  rotation: number;  // 度。-180〜180 に clamp
}

interface AvatarState {
  readonly selections: Readonly<Record<string, SelectionEntry>>;
  readonly transforms: Readonly<Record<string, SlotTransform>>;
}

interface AvatarEngine {
  // ... 既存メソッド
  setTransform(slot: string, transform: Partial<SlotTransform>): void;
  resetTransform(slot?: string): void;
}
```

### 規則

- 変形は Slot に紐づき、Part を変えても保持する
- core は `placement` と `transform` を合成し（中心を保って拡縮、その後に移動と回転）、`RendererContext` に Slot ごとの解決済み配置を渡す
- [ADR-0007](./0007-slot-groups.md) のグループに `mirror: true` を指定すると、基準 Slot への変形を他の Slot に鏡像で適用する（`dx` と `rotation` の符号を反転）
- 変形が変わったときも `state:change` を発行する
- `AvatarState` 全体（selections + transforms）を JSON で書き出し・読み込みする関数を core が提供する

### やらないこと

- 拡縮の縦横比を変える・せん断するなど、上記 4 値以外の変形は標準化しない（引き続き `x-*`）
- アニメーションやキーフレームは扱わない

## Consequences

### 良い影響

- アバターの状態が 1 つの JSON にまとまり、保存・共有・サーバ側での再描画ができる
- perceive の `AvatarSeed` がそのまま `AvatarState` の部分集合になる
- Renderer は解決済みの配置を描くだけになり、SVG と Canvas で同じ配置になる

### 悪い影響・トレードオフ

- `AvatarState` の形が変わるため、`state` を直接読んでいるコードは追随が必要
- `canvas` を持たない既存スキーマでは、既定配置が「全面」になる。既存の非人型の例はこれで問題ない

### 影響範囲

- `@edv4h/alter-ego-schema`（`canvas` / `Slot.placement` / `SlotTransform`）
- `@edv4h/alter-ego-core`（state・engine API・配置の合成・シリアライズ）
- `@edv4h/alter-ego-plugin-renderer-svg`（`slotPlacements` オプションを解決済み配置に置き換え）
- `@edv4h/alter-ego-perceive`（`AvatarSeed` の型を core の型から導出）
- `apps/react-web`（`slotTransforms` と `BASE_PLACEMENTS` をスキーマと engine へ移す）
- ADR-0003（本 ADR が accepted になったら、「標準化する調整軸」節に本 ADR への参照を追記）
