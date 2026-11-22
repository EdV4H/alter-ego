---
id: 0015
title: 保存した状態を engine.load でエンジンに丸ごと読み込む
status: accepted
date: 2026-11-22
deciders: [EdV4H]
tags: [core, state, engine]
---

# ADR-0015: 保存した状態を engine.load でエンジンに丸ごと読み込む

## Context

[ADR-0012](./0012-state-renames-and-lenient-read.md) と [ADR-0013](./0013-react-bindings-package.md) は、「保存した状態をエンジンに丸ごと読み込む API を core に持たせるか」を追随タスクとして残した。今は次のとおり。

- core には状態を丸ごと入れ替える API が無い。`apps/react-web/src/editor/state.ts` の `applyStateToEngine` が、`deserializeState` で読んだ状態を `select` / `deselect` / `resetTransform` / `setTransform` に分けて順に流している
- 1 回の読み込みで Slot の数だけ `state:change` が出て、Renderer も同じ回数だけ更新される。途中の状態（髪だけ新しく目は古い、など）も購読者に届く
- グループの基準 Slot を先に選び、mirror の鏡像で上書きされないよう変形を後から入れる、という順番の知識がアプリ側にある。写し間違えると、保存したとおりに戻らない
- アバターを保存して読み戻すアプリ（サーバーに保存する Web アプリ、ランダムに作った候補を入れ替える画面など）は、どれもこの処理を写すことになる

検討した案:

- **`applyStateToEngine` をそのまま core の関数として export する**: 写す手間は消えるが、`state:change` が何度も出る問題は残る
- **エンジンの生成時に初期状態を渡せるようにする**: 最初の 1 回には足りるが、作った後に別の状態へ切り替える用途（候補の入れ替え、元に戻す）に使えない
- **エンジンに `load` を足し、状態を 1 回で差し替える（採用）**

## Decision

**`AvatarEngine` に `load(input, options?)` を足し、`deserializeState` で読んだ状態に 1 回で差し替える。`state:change` は 1 回だけ出す。**

```ts
interface AvatarEngine {
  // ... 既存
  /**
   * 保存した状態（JSON 文字列か parse 済みの値）を読み込み、今の状態を丸ごと差し替える。
   * options は deserializeState にそのまま渡す（ADR-0012）。
   */
  load(input: string | unknown, options?: DeserializeStateOptions): void;
}
```

### 規則

- 中身は `deserializeState(engine.schema, input, options)` で読む。旧 id の読み替え・`unknown: "drop"`・`onIssue` は ADR-0012 のとおり
- 読めた状態をそのまま使う。グループの連動（ADR-0007）はかけ直さない。保存した状態はエンジンが作ったものなので、すでにそろっている。かけ直すと、基準でない Slot を個別に選んだ結果が消える
- 変形も読めたとおりに入れる。mirror の鏡像は `setTransform` のときに計算済みなので、ここでは計算しない
- 差し替えたら `state:change` を 1 回出し、`select` と同じくアセットを解決してから Renderer を更新する
- 読めなかったとき（`"error"` で読めない値があった、JSON が壊れている、など）は `SelectionError` で包んで投げ、状態は変えない。`state:change` も出さない
- `mount` の前でも呼べる。そのときは状態だけ差し替わり、`mount` で描かれる

### やらないこと

- 部分的な読み込み（selections だけ、transforms だけ）は用意しない。今の状態と組み合わせたいときは、アプリが `serializeState` した結果を書き換えて `load` に渡す
- 状態を初期状態に戻す `reset` は今回足さない
- `@edv4h/alter-ego-react` に読み込み用のフックは足さない。`engine.load` を呼べば `useAvatarState` が 1 回で追従する

## Consequences

### 良い影響

- 保存した状態の読み戻しが 1 行になり、順番の知識がアプリから消える
- 購読者と Renderer に途中の状態が届かない。読み込みのたびの再描画も 1 回で済む
- ランダムに作った状態（[ADR-0017](./0017-random-state.md)）や、元に戻す用に取っておいた状態も同じ API で入れられる

### 悪い影響・トレードオフ

- `AvatarEngine` のメソッドが 1 つ増える（公開 API なので、以後は変えにくい）
- グループの連動をかけ直さないので、手で書いた状態（基準と他の Slot で pairKey が合わないもの）はそのまま描かれる。必要なら `normalizeGroupSelections` をアプリが先にかける

### 影響範囲

- `@edv4h/alter-ego-core`: `AvatarEngine.load`、テスト
- `apps/react-web`: `applyStateToEngine` を消し、`engine.load` を使う
- `docs/architecture.md`、`docs/schema.md`（状態の保存と読み込みの節）
- changeset: `@edv4h/alter-ego-core` を minor で上げる
