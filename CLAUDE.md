# CLAUDE.md

> このファイルは、このリポジトリで作業する AI エージェント（Claude Code 等）向けの振る舞いヒントです。人間の開発者にとっても、プロジェクトの読み方ガイドとして有用です。

## まず読むもの

新しいタスクを始めるときは、以下の順で読むと全体像を素早く掴めます。

1. **[DOMAIN.md](./DOMAIN.md)** — 用語・ADR・ドメインモデルの索引。**必ずここから始める**
2. [README.md](./README.md) — プロジェクト概要、パッケージ一覧
3. [docs/concept.md](./docs/concept.md) — ゴールと非目標（何を作り、何を作らないか）
4. 作業領域に関連するドキュメント（`docs/architecture.md`, `docs/schema.md`, `docs/plugins/*` のうち関連するもの）

`DOMAIN.md` は索引なので短い。読んだうえで必要なリンク先に進むのが最短経路。

## プロジェクトの基本方針

これらは ADR やドキュメントで決まっている前提。提案や実装時に逸脱しない。

- **Headless / 形式非依存**: `@edv4h/alter-ego-core` は描画・I/O を持たない
- **スキーマ駆動**: アバター構成は JSON スキーマが単一の真実
- **プラグインは統一インターフェース**: `Plugin { setup(ctx), teardown?() }` のみ。`kind` フィールドは持たない（[ADR 0001](./docs/domain/adr/0001-unified-plugin-interface.md)）
- **プラグイン命名**: `@edv4h/alter-ego-plugin-<role>-<name>` 形式（[ADR 0002](./docs/domain/adr/0002-package-naming.md)）
- **ドキュメント言語**: 日本語のみ

## タスクの進め方

- **ドキュメント変更**: PR ベース。main へ直接 push しない（初回セットアップを除く）
- **新しい用語を使った**: `docs/domain/glossary.md` に追記
- **アーキテクチャに影響する決定をした**: ADR を新規作成し、`DOMAIN.md` の索引に行を追加
- **コミットメッセージ**: gitmoji + 短い要約（例: `📝 docs: add ADR for ...`）
- **PR のタイトル**: 70 文字以内。詳細は本文へ
- **実装局面の PR レビュアー**: 実装（feat/fix/refactor/perf/test/chore のうちコードに触れるもの）の PR を作るときは `--reviewer EdV4H` を指定する。ドキュメント・スタイル変更のみの PR は不要

## ADR を書くとき

AI が書く前提なので、機械可読なフロントマターを持った軽量 ADR フォーマットを使う。詳細は [docs/domain/adr/README.md](./docs/domain/adr/README.md) を参照。

- ファイル名: `docs/domain/adr/NNNN-<kebab-title>.md`（NNNN は連番 4 桁）
- YAML フロントマターで `id` / `status` / `date` / `supersedes` 等を記録
- 本文は Context / Decision / Consequences の 3 セクション

## やらないこと

- `DOMAIN.md` に詳細を直接書かない（必ず `docs/domain/` 配下のファイルへ）
- 用語の同義語を増やさない（「描画器」と「Renderer」を混在させない等）
- 未承認の設計変更をコードに含めない（まず ADR か issue で議論）
- 承認済みの ADR や issue に基づかない実装を追加しない（現在は alpha。実装は PR ベースで進める）
