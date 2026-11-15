---
id: 0010
title: JSON Schema ファイルを唯一の定義元とし schemaVersion を運用する
status: accepted
date: 2026-11-01
deciders: [EdV4H]
tags: [schema, versioning, packaging]
---

# ADR-0010: JSON Schema ファイルを唯一の定義元とし schemaVersion を運用する

## Context

`alter-ego` の価値の中心は「汎用のアバタースキーマ」であり、スキーマは TypeScript 以外のツール（素材制作ツール、他言語のサーバ、エディタの補完）からも参照されるべきものである。現状は次のとおり。

- スキーマ定義は `packages/schema/src/types.ts`（TS 型）と `json-schema.ts`（TS の定数としての JSON Schema）に **手書きで二重管理** されている。`variants` の要素は JSON Schema 側で中身が未定義
- JSON Schema は `.json` ファイルとして配布されておらず、`$id` も無い。TS 以外からは参照できない
- `docs/schema.md` は「`schemaVersion` はセマンティックバージョン」「core がマイグレーション関数を同梱」と書くが、実装では `schemaVersion` は任意の文字列で、マイグレーションも無い
- core は検証のために schema 経由で ajv を必ず読み込む。ゴール G5（最小依存）と緊張関係にある

## Decision

**`packages/schema` に置く JSON Schema ファイルを唯一の定義元とし、TS 型はそこから生成する。`schemaVersion` は `MAJOR.MINOR` 形式とし、マイグレーションは schema パッケージが提供する。**

### 定義元と配布

- 定義元: `packages/schema/schema/avatar.schema.json`（JSON Schema draft 2020-12）
- `$id` は npm 経由で解決できる URL にする（例: `https://unpkg.com/@edv4h/alter-ego-schema@1/schema/avatar.schema.json`）。独自ドメインを用意した場合は別 ADR で切り替える
- TS 型は `json-schema-to-typescript` 等で生成し、生成物はコミットする。CI で「再生成して差分が出ない」ことを検査する
- パッケージは `exports` に `./schema.json` を追加し、JSON ファイルを直接 import できるようにする

### バージョン

- `schemaVersion` は `^\d+\.\d+$`（例: `"1.0"`）。既存スキーマはそのまま有効
- MINOR: 任意フィールドの追加など、旧スキーマがそのまま新バリデータを通る変更
- MAJOR: 旧スキーマが通らなくなる変更。マイグレーション関数を必ず添える
- `migrate(schema): AvatarSchema` を `@edv4h/alter-ego-schema` が提供する。core は `createAvatarEngine` で `migrate` → `validate` の順に呼ぶ
- npm パッケージのバージョンと `schemaVersion` は独立に進める。対応表を `docs/schema.md` に置く

### 検証の依存

- ajv を使う完全な検証は `@edv4h/alter-ego-schema` に残す
- core は検証関数を引数で受け取れるようにし（`createAvatarEngine({ schema, plugins, validate? })`）、省略時は schema パッケージの `validate` を使う。本番で検証を外したい利用者は自前の軽量な関数を渡せる

### やらないこと

- JSON Schema 以外の定義元（TS 型、Zod など）を併存させない
- スキーマの仕様を他言語向けに別途書き起こすことはしない（JSON Schema で足りる）

## Consequences

### 良い影響

- 他言語・他ツールから同じスキーマを参照でき、「汎用スキーマ」としての採用障壁が下がる
- 二重管理による型と検証の食い違いがなくなる
- 公開後の破壊的変更に対して、利用者のスキーマ JSON を移行する道筋ができる

### 悪い影響・トレードオフ

- 型生成のツールチェーンが 1 つ増える
- `$id` を unpkg に依存させると、unpkg の可用性に引きずられる（`$id` は識別子であり、取得できなくても検証自体は動く）

### 影響範囲

- `@edv4h/alter-ego-schema`（構成の変更、`migrate` の追加、`exports`）
- `@edv4h/alter-ego-core`（`createAvatarEngine` の引数）
- `docs/schema.md`（バージョニング節の更新、対応表）
- CI（型の再生成チェック）

### 追随タスク

- ADR-0007〜0009 で追加するフィールドは、本 ADR で定めた JSON Schema ファイルに対して追加する
- npm 初回公開の前に本 ADR を accepted にする
