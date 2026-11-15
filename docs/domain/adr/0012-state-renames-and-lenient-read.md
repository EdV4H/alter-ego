---
id: 0012
title: id の改名を renamedFrom で宣言し、保存した状態を読み込むときに読み替える
status: accepted
date: 2026-11-10
deciders: [EdV4H]
tags: [schema, state, versioning, core]
---

# ADR-0012: id の改名を renamedFrom で宣言し、保存した状態を読み込むときに読み替える

## Context

`AvatarState`（selections と transforms）は、Slot・Part・variant をすべて id で指している。利用者は `serializeState` で状態を保存し、あとで `deserializeState(schema, json)` で読み戻す（[ADR-0009](./0009-slot-transform-in-state.md)）。

- `deserializeState` は、スキーマに無い Slot・Part・variant、未知のキー、hex でない色、数値でない変形が 1 つでもあると例外を投げる
- スキーマの側で id を 1 つ改名しただけで、それまでに保存された状態はすべて読めなくなる。読めた部分だけ使う手段も無い
- `apps/react-web` は、読めなかった保存を丸ごと捨てている（`features/persistence/persistence.ts` の `restoreSaved`）
- `@edv4h/alter-ego-schema` の `migrate` が変換するのはスキーマ JSON だけで、保存済みの状態には手が届かない（[ADR-0010](./0010-canonical-json-schema.md)）
- npm で公開すると、状態はアプリの DB やブラウザに保存されていく。保存データの互換の取り方は、公開後に変えにくい

検討した案:

- **状態に version を持たせ、移行関数で変換する**: 何でも書けるが、スキーマを作る人が JavaScript を書かないと改名すら吸収できない。スキーマは JSON だけで完結させたい
- **スキーマの最上位に `renames` の対応表を置く**: 改名の情報が対象から離れ、断片（`addFragment`）を足したときに対応表をどうマージするかが別の問題になる
- **改名した要素自身に旧 id を書く（採用）**: 改名の情報が要素と一緒に動くので、断片でもそのまま使える

## Decision

**Slot・Part・variant に任意の `renamedFrom`（旧 id の配列）を追加し、`deserializeState` は旧 id を今の id に読み替える。あわせて、読めない値を「エラーにする」か「捨てて続ける」かを呼び出し側が選べるようにする。**

### スキーマ

```ts
interface Slot {
  // ... 既存フィールド
  /** この Slot の以前の id。新しいものから順に並べる */
  renamedFrom?: string[];
}

interface Part {
  // ... 既存フィールド
  renamedFrom?: string[];
  variants?: Array<{
    id: string;
    // ... 既存フィールド
    renamedFrom?: string[];
  }>;
}
```

- `a` → `b` → `c` と 2 回改名したら、`c` の `renamedFrom` に `["b", "a"]` と両方書く
- 検証（`@edv4h/alter-ego-schema` の参照整合性チェック）で次をエラーにする
  - `renamedFrom` の値が、同じ種類の今の id と重なる（Slot 同士、Part 同士は全体で、variant は同じ Part の中で）
  - 同じ旧 id が 2 つの要素の `renamedFrom` に出てくる
- 任意フィールドの追加なので `schemaVersion` は MINOR を上げて `"1.1"` にする（[ADR-0010](./0010-canonical-json-schema.md)）

### 読み替えの規則

`deserializeState` は、次の順に id を引く。

1. Slot: `selections` と `transforms` のキーを、今の Slot id → `renamedFrom` の順で探す
2. Part: 1 で決まった Slot の Part の中から、今の id → `renamedFrom` の順で探す
3. variant: 2 で決まった Part の中から、同じ順で探す

- 読み替えは常に行う。`renamedFrom` に書いてあれば意味は一つに決まるので、オプションで切り替えない
- 別の Slot へ移った Part は読み替えない（Slot の意味が変わっている可能性があるため）。2 で見つからなければ「読めない値」として扱う
- 今の id と旧 id の両方で同じ Slot に値が来たら、今の id の値を使う。旧 id の値は「読めない値」として扱う
- `serializeState` は今の id だけを書く。読み替えた状態を保存し直せば、旧 id は残らない
- `engine.select` などの操作 API は今の id だけを受け付ける。読み替えは保存データの読み込みに限る

### 読めない値の扱い

```ts
interface DeserializeStateOptions {
  /** 読めない値を見つけたときの扱い。既定は "error"（今の動きのまま） */
  unknown?: "error" | "drop";
  /** 読み替え・捨てた値・補った値を 1 件ずつ知らせる */
  onIssue?: (issue: StateReadIssue) => void;
}

interface StateReadIssue {
  kind: "renamed" | "dropped" | "filled";
  /** 例: "selections.hair_back.partId" */
  path: string;
  /** 元の値（旧 id など） */
  from?: string;
  /** 読み替え後・補った値 */
  to?: string;
  /** dropped のときの理由 */
  reason?: string;
}

function deserializeState(
  schema: AvatarSchema,
  input: string | unknown,
  options?: DeserializeStateOptions,
): AvatarState;
```

`unknown: "drop"` のときは、読めない値を次の単位で捨てて続ける。

| 読めない値 | 捨てる範囲 |
| --- | --- |
| 未知の Slot | その Slot の selection と transform |
| 未知の Part | その Slot の selection |
| 未知の variant | `variantId` だけ（Part の選択は残す） |
| hex でない色 | `color` だけ |
| 未知のキー（`x-*` 以外） | そのキーだけ |
| 数値でない変形 | その Slot の transform |

- 捨てた結果 required の Slot が空になったら、初期状態と同じ規則（その Slot の最初の Part）で補い、`filled` として知らせる
- JSON として壊れている、最上位がオブジェクトでない、など全体が読めない場合は `"drop"` でも例外を投げる
- `"error"` のときは今と同じく最初の 1 件で例外を投げる。読み替え（`renamed`）は `"error"` でも行い、`onIssue` で知らせる

### やらないこと

- Slot の分割・統合、Part の Slot 間の移動、色や変形の値の変換は扱わない。必要になったら状態の移行関数を別の ADR で決める
- 状態の JSON に独自の version フィールドは足さない
- `renamedFrom` はスキーマの MAJOR を上げたときに整理してよい（古い旧 id を消すかどうかはスキーマを作る人が決める）

## Consequences

### 良い影響

- スキーマの id を改名しても、保存済みの状態がそのまま読める。スキーマを作る人は JSON を書き足すだけでよい
- アプリは「読めた分だけ使う」を選べる。デモの「合わない保存は丸ごと捨てる」がなくなる
- `onIssue` で、何を読み替え・何を捨てたかを利用者に見せたり、保存し直したりできる
- 既定は `"error"` なので、今 `deserializeState` を使っているコードの動きは変わらない

### 悪い影響・トレードオフ

- スキーマに改名の履歴が残り続ける
- 旧 id を探す分、読み込みの処理が少し増える（読み込み時に 1 回だけなので問題にならない想定）
- `"drop"` を選ぶと、利用者が気づかないうちに選択が消えることがある。`onIssue` で知らせることを docs で勧める

### 影響範囲

- `@edv4h/alter-ego-schema`: `avatar.schema.json`（`renamedFrom`）、生成する型、参照整合性チェック、`CURRENT_SCHEMA_VERSION` を `"1.1"` に
- `@edv4h/alter-ego-core`: `deserializeState` の読み替えとオプション、`StateReadIssue` 型の export
- `docs/schema.md`: Slot・Part・variant の表、状態の保存と読み込みの節
- `docs/domain/glossary.md`: renamedFrom
- `apps/react-web`: 保存の復元を `"drop"` にし、読み替え・捨てた値があれば保存し直す

### 追随タスク

- 状態を丸ごとエンジンに読み込む API（今は `apps/react-web/src/editor/state.ts` の `applyStateToEngine` がアプリ側で select を順に呼んでいる）を core に持たせるかは、別の ADR で決める
