# DOMAIN

> alter-ego プロジェクトのドメイン知識索引。用語・ADR・モデルなど、コードの外にある「決まりごと」の入口です。

このファイルは **索引** です。実内容は `docs/domain/` 配下の各ファイルにあります。AI / 人間のどちらが読んでも、ここを起点に必要な資料へ辿れる構成を目指しています。

## 使い方（AI 向けの読み方）

- 作業を始める前に、このファイルを一度読む
- 関連する項目のリンク先を開き、該当箇所だけ読む
- 新しい用語や意思決定が発生したら、対応するファイルを追加・更新し、このファイルにも索引行を足す

## 索引

### 用語集

- [用語集（glossary）](./docs/domain/glossary.md) — プロジェクト内で使う用語の基準。新語を導入したら必ず追記する

### ドメインモデル

- [ドメインモデル（model）](./docs/domain/model.md) — Avatar / Schema / Slot / Part / Asset / Selection の関係と責務

### スキーマ例集

- [代表例（パターン集）](./docs/schema.md#代表例パターン集) — 最小 / 人型標準 / 非人型 / 非アバター の 4 パターン。JSON と Selection 例、設計意図付き

### アーキテクチャ決定記録（ADR）

- [ADR 運用ルール](./docs/domain/adr/README.md) — ADR の書き方・フォーマット・更新ポリシー
- [0001 - 統一プラグインインターフェース](./docs/domain/adr/0001-unified-plugin-interface.md)
- [0002 - プラグインパッケージ命名規則](./docs/domain/adr/0002-package-naming.md)
- [0003 - パーツの色・variant マージ規則](./docs/domain/adr/0003-color-variant-merge.md)
- [0004 - AvatarEngine のライフサイクル](./docs/domain/adr/0004-engine-lifecycle.md)
- [0005 - Loader 振り分けとアセット解決（スキーム方式）](./docs/domain/adr/0005-loader-dispatch.md)（proposed）
- [0006 - スキーマ断片の登録と ID 一意性](./docs/domain/adr/0006-fragment-id-uniqueness.md)（proposed）
- [0007 - Slot グループ（ペア・レイヤー）をスキーマで宣言する](./docs/domain/adr/0007-slot-groups.md)
- [0008 - 色の連動（colorBindings）とパレットをスキーマで宣言する](./docs/domain/adr/0008-color-bindings.md)
- [0009 - Slot の配置と変形を標準化し AvatarState に含める](./docs/domain/adr/0009-slot-transform-in-state.md)
- [0010 - JSON Schema ファイルを唯一の定義元とし schemaVersion を運用する](./docs/domain/adr/0010-canonical-json-schema.md)
- [0011 - perceive のプロンプトをスキーマから生成する](./docs/domain/adr/0011-perceive-prompt-from-schema.md)
- [0012 - id の改名を renamedFrom で宣言し、保存した状態を読み込むときに読み替える](./docs/domain/adr/0012-state-renames-and-lenient-read.md)
- [0013 - React 向けのフックを @edv4h/alter-ego-react として提供する](./docs/domain/adr/0013-react-bindings-package.md)
- [0014 - Changesets で版を上げ、GitHub Actions から Trusted Publishing で npm に公開する](./docs/domain/adr/0014-release-with-changesets.md)
- [0015 - 保存した状態を engine.load でエンジンに丸ごと読み込む](./docs/domain/adr/0015-engine-load-state.md)
- [0016 - 描いた SVG を PNG にする関数を renderer-svg に足し、背景は状態に入れない](./docs/domain/adr/0016-svg-to-png.md)
- [0017 - ランダムな状態を randomState で作り、パーツの選び方を差し替えられるようにする](./docs/domain/adr/0017-random-state.md)

## 他ドキュメントとの関係

| ドキュメント | 役割 |
| --- | --- |
| [README.md](./README.md) | プロジェクトの顔。インストールとクイックスタート |
| [docs/concept.md](./docs/concept.md) | なぜ作るか・ゴール・非目標 |
| [docs/architecture.md](./docs/architecture.md) | モジュール構成・データフロー |
| [docs/schema.md](./docs/schema.md) | スキーマ JSON の仕様 |
| [docs/app/avatar-editor.md](./docs/app/avatar-editor.md) | リファレンス実装アプリ（react-web）のアバター機能仕様 |
| [docs/plugins/](./docs/plugins/README.md) | プラグインの書き方 |
| [docs/release.md](./docs/release.md) | npm への公開の流れ |
| **DOMAIN.md（このファイル）** | **用語・ADR・ドメインモデルの索引** |
| [CLAUDE.md](./CLAUDE.md) | AI エージェント向けの振る舞いヒント |

## 更新ルール

- **新しい用語を導入したら**: `docs/domain/glossary.md` に追加
- **アーキテクチャ上の決定をしたら**: `docs/domain/adr/NNNN-<title>.md` を作り、このファイルの索引に追加
- **ドメインモデルの関係が変わったら**: `docs/domain/model.md` を更新
- このファイル（DOMAIN.md）は **索引以上のことを書かない**。詳細は必ず各ファイルへ
