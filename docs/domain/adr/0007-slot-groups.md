---
id: 0007
title: Slot グループ（ペア・レイヤー）をスキーマで宣言する
status: accepted
date: 2026-11-01
deciders: [EdV4H]
tags: [schema, slot, part, core, perceive]
---

# ADR-0007: Slot グループ（ペア・レイヤー）をスキーマで宣言する

## Context

複数の Slot を 1 つの単位として扱う需要が、リファレンス実装で既に 3 種類ある。

- **左右ペア**: `eye_left` / `eye_right`、`eyebrow_left` / `eyebrow_right`。同じ形のパーツを左右にそろえる
- **前後レイヤー**: `hair_front` / `hair_back`、`accessory_front` / `accessory_back`。1 つの髪型を前面と背面の 2 枚で表す。背面が無い髪型もある
- **UI のまとまり**: エディタで「Hair」「Eye」を 1 つのカテゴリとして見せる

スキーマにはこれを表す語彙が無いため、同じ知識が 3 か所で別々に実装されている。

- `apps/react-web/src/App.tsx` の `CATEGORIES`（`subSlots` / `primarySlot`）
- `packages/perceive/src/normalize.ts`（`_left` / `_right` の接尾辞と `hair_front` / `hair_back` を定数で直書き）
- `packages/core/src/part-utils.ts`（`partNumberOf` / `partForSlotByNumber` / `layeredPartsForPrimary`）

さらに「どの Part とどの Part が対応するか」は **Part id 末尾の番号**という命名規約で引いており、仕様に書かれていない。core は `-(\d+)$`、perceive は `(\d+)$` と、正規表現が既に食い違っている。

`Slot.category` は UI のグルーピング用タグとして存在するが、対応関係や基準 Slot を表せない。

検討した代替案:

- **命名規約を仕様化する**（`<slot>-NN` を必須にする）: 変更は最小だが、id に意味を持たせるのは汎用スキーマとして脆い。非人型・非アバターの例と相性が悪い
- **`x-group` 拡張で運ぶ**: コア改修は不要だが、core / perceive / アプリの 3 者が同じ解釈を必要とするため、拡張にすると結局各所で再実装になる

## Decision

**トップレベルに `groups` を、Part に `pairKey` を追加し、Slot 間の対応関係をスキーマで宣言する。対応する Part の解決は core が行う。**

### 型

```ts
interface AvatarSchema {
  // ... 既存フィールド
  groups?: SlotGroup[];
}

interface SlotGroup {
  id: string;
  name: string;
  /** グループに属する Slot。先頭を基準 Slot とする */
  slots: string[];
  /** 基準 Slot の選択に合わせて他の Slot をそろえるか */
  linkParts?: boolean;     // 既定 true
  /** 基準 Slot の color を他の Slot にもそろえるか */
  linkColor?: boolean;     // 既定 true
  /** 左右ペアなど、変形を鏡像で連動させるか（ADR-0009） */
  mirror?: boolean;        // 既定 false
}

interface Part {
  // ... 既存フィールド
  /** グループ内で対応する Part を引くキー。同じグループの別 Slot で同じ値を持つ Part が対応する */
  pairKey?: string;
}
```

### 解決規則

- `linkParts: true` のグループで基準 Slot の Part を選ぶと、core は他の各 Slot から **同じ `pairKey` を持つ Part** を選ぶ。該当が無い Slot は選択を解除する（`required` の Slot で該当が無い場合はスキーマ検証エラー）
- 基準以外の Slot を直接 `select` した場合はそろえない（左右で別の形を選ぶ自由を残す）
- `linkColor: true` のとき、基準 Slot の `color` を他の Slot に適用する。ADR-0003 のマージ規則上は「Selection の明示値」として扱う
- 1 つの Slot は高々 1 つのグループにしか属せない（検証エラー）
- `Slot.category` は UI 用タグとして残す。グループとは独立

### やらないこと

- Part id の命名規約に意味を持たせない。`partNumberOf` などの命名規約依存の関数は廃止する
- 3 つ以上の Slot の相互制約（「この眼鏡はこの髪型と排他」など）は扱わない。別 ADR とする

## Consequences

### 良い影響

- 対応関係が JSON に書かれるため、アプリ・perceive・別の Renderer が同じ規則を共有できる
- perceive の `normalizePairSelections` は「グループ定義に従って core の解決関数を呼ぶ」だけになり、slot id の直書きが消える
- エディタ UI はグループをそのままカテゴリとして表示できる

### 悪い影響・トレードオフ

- 既存の `avatar.schema.json`（約 490 id）に `groups` と `pairKey` の追記が必要。番号から機械的に生成できる
- 「基準 Slot を選んだら他が自動で変わる」挙動は、基準を持たない対称なペアでは不自然に感じる場合がある

### 影響範囲

- `@edv4h/alter-ego-schema`（型・JSON Schema・検証）
- `@edv4h/alter-ego-core`（`select` 時の連動、`part-utils.ts` の置き換え）
- `@edv4h/alter-ego-perceive`（`normalize.ts`）
- `apps/react-web`（`CATEGORIES` をスキーマから導出）
- `docs/schema.md`、`docs/domain/model.md`、`docs/domain/glossary.md`（SlotGroup / pairKey）

### 追随タスク

- `avatar.schema.json` を `groups` / `pairKey` 付きに変換するスクリプト
- 左右ペアの transform を鏡像にする規則は [ADR-0009](./0009-slot-transform-in-state.md) で扱う
