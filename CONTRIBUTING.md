# コントリビューションガイド

`alter-ego` への貢献に興味を持っていただきありがとうございます。このファイルは開発環境の準備から PR を出すまでの手順をまとめたものです。

## 最初に読むもの

1. [DOMAIN.md](./DOMAIN.md) — 用語・ADR・ドメインモデルの索引
2. [docs/concept.md](./docs/concept.md) — ゴールと非目標
3. 作業領域に関係するドキュメント（[docs/architecture.md](./docs/architecture.md)、[docs/schema.md](./docs/schema.md)、[docs/plugins/](./docs/plugins/README.md)）

## 開発環境

- Node.js 20 以上（[.nvmrc](./.nvmrc) を参照）
- pnpm 10（`corepack enable` で `package.json` の `packageManager` に従います）

```sh
pnpm install
pnpm --filter @alter-ego/app-react-web dev   # リファレンス実装アプリを起動
```

## よく使うコマンド

| コマンド | 内容 |
| --- | --- |
| `pnpm typecheck` | 全パッケージの型検査 |
| `pnpm lint` | oxlint |
| `pnpm test` | vitest（node / happy-dom の 2 プロジェクト） |
| `pnpm build` | packages / plugins のビルド |
| `pnpm lint:pkg` | ビルド後に publint で exports と成果物の整合を検査 |
| `pnpm changeset` | 公開パッケージの変更に changeset を足す |

PR を出す前に、CI と同じ `typecheck → lint → test → build → lint:pkg` が通ることを確認してください。

## リポジトリ構成

| ディレクトリ | 内容 |
| --- | --- |
| `packages/` | core / schema / perceive / FW バインディング |
| `plugins/` | `@edv4h/alter-ego-plugin-<role>-<name>` 形式のプラグイン（[ADR 0002](./docs/domain/adr/0002-package-naming.md)） |
| `apps/react-web/` | リファレンス実装アプリ（npm には公開しない） |
| `docs/` | 設計ドキュメント、ADR、用語集 |

## 変更の進め方

- **設計に影響する変更**: 先に issue か ADR で議論します。ADR の書き方は [docs/domain/adr/README.md](./docs/domain/adr/README.md) を参照してください
- **新しい用語を導入した**: [docs/domain/glossary.md](./docs/domain/glossary.md) に追記します
- **プラグイン**: `Plugin { setup(ctx), teardown?() }` の統一インターフェースに従います（[ADR 0001](./docs/domain/adr/0001-unified-plugin-interface.md)）
- **ドキュメント言語**: 日本語で書きます

## コミットと PR

- コミットメッセージは gitmoji + 短い要約にします（例: `✨ feat(core): ...`、`🐛 fix(perceive): ...`、`📝 docs: ...`）
- PR のタイトルは 70 文字以内にし、詳細は本文に書きます
- main へ直接 push せず、必ず PR を経由します
- 公開パッケージ（`private` でないもの）に利用者から見える変更を入れたら、`pnpm changeset` で changeset を足します（[.changeset/README.md](./.changeset/README.md)）。npm への公開の流れは [docs/release.md](./docs/release.md) を参照してください
