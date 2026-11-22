---
id: 0017
title: ランダムな状態を randomState で作り、パーツの選び方を差し替えられるようにする
status: accepted
date: 2026-11-22
deciders: [EdV4H]
tags: [core, state, random]
---

# ADR-0017: ランダムな状態を randomState で作り、パーツの選び方を差し替えられるようにする

## Context

アバター作成の最初に、ランダムに作った候補をたくさん並べて選ばせる画面がよくある。そのとき次が要る。

- スキーマに沿ったランダムな状態を作る（required の Slot は必ず埋め、optional の Slot はときどき空にする、色は Slot の `palette` から選ぶ）
- グループ（[ADR-0007](./0007-slot-groups.md)）の基準 Slot に他の Slot をそろえる。前髪と後ろ髪、左右の目がちぐはぐにならないようにする
- 同じ候補をあとで作り直せる。乱数を差し替えられれば、種から同じ候補を再現できる
- 並べたときに隣と同じパーツが続かないよう、パーツの選び方をアプリが決められる（マスの座標から番号を決める、など）

今は core にランダム生成が無く、アプリがそれぞれ書くことになる。グループや `palette` の扱いを写し間違えると、スキーマ上ありえない状態ができる。

検討した案:

- **エンジンに `randomize()` を足す**: 1 体だけなら手軽だが、候補を何十体も並べるときにエンジンを候補の数だけ作ることになる
- **状態を返す純粋な関数にする（採用）**: エンジンを作らずに何体でも作れ、`engine.load`（[ADR-0015](./0015-engine-load-state.md)）や `serializeState` にそのまま渡せる

## Decision

**core に `randomState(schema, options?)` を足し、ランダムな `AvatarState` を返す。乱数とパーツの選び方は引数で差し替えられる。**

```ts
interface RandomStateOptions {
  /** 0 以上 1 未満を返す乱数。既定は Math.random */
  readonly random?: () => number;
  /** optional の Slot に Part を入れる確率。Slot id ごとにも書ける。既定は 0.5 */
  readonly fillRate?: number | Readonly<Record<string, number>>;
  /**
   * Slot の Part を候補の中から選ぶ。候補の番号（0 から）を返す。
   * 既定は random() で等確率に選ぶ
   */
  readonly choosePart?: (slot: Slot, candidates: readonly Part[]) => number;
}

function randomState(schema: AvatarSchema, options?: RandomStateOptions): AvatarState;
```

### 規則

- 決める順番はスキーマの `slots` の順。すべての Slot を決めてから、最後にグループの連動（`normalizeGroupSelections`）で基準 Slot に他の Slot をそろえる。`linkParts: false` のグループでも基準でない Slot が空にならないよう、基準でない Slot も一度は決める
- required の Slot は必ず Part を入れる。optional の Slot は `fillRate` の確率で入れ、外れたら空にする
- `choosePart` が範囲外の番号を返したらエラーにする
- 色は、Slot に `palette` があればその中から選ぶ。無ければ `color` を書かない（Part の既定の色で描かれる）
- variant は選ばない。変形は空（`transforms` は `{}`）
- 乱数を回す回数は、`choosePart` を渡しても渡さなくても、Slot ごとに同じにする。`choosePart` を差し替えても、色や空にするかどうかの結果が変わらないようにするため
- 戻り値は `deserializeState` を通しても同じ状態になる（スキーマ上ありえる状態だけを返す）

### やらないこと

- 色やパーツの出やすさ（重み）はスキーマに書かない。必要なアプリは `choosePart` と、作った状態の色の書き換えで扱う
- 隣と被らない並べ方そのもの（マスの座標から番号を決める計算）は core に入れない。並べ方は画面ごとに違うので、`choosePart` でアプリが渡す
- 写真から作る（perceive）とは別の機能として扱う。perceive の結果に乱数を混ぜることはしない

## Consequences

### 良い影響

- ランダムな候補をスキーマどおりに作れ、グループや `palette` の扱いをアプリが写さなくて済む
- 乱数を差し替えれば、同じ候補を作り直せる（種をマスの座標から作る、など）
- `choosePart` で、隣と被らない並べ方や、特定のパーツを出さない絞り込みができる

### 悪い影響・トレードオフ

- 公開 API が 1 つ増える
- 重みを持てないので、「この肌の色は出にくく」といった調整は `randomState` の外でやることになる

### 影響範囲

- `@edv4h/alter-ego-core`: `randomState`、`RandomStateOptions` の export、テスト
- `apps/react-web`: 「ランダム」ボタンを足して試せるようにする（任意）
- `docs/schema.md`（状態を作る方法）、`docs/domain/glossary.md`
- changeset: `@edv4h/alter-ego-core` を minor で上げる
