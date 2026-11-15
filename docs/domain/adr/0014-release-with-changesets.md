---
id: 0014
title: Changesets で版を上げ、GitHub Actions から Trusted Publishing で npm に公開する
status: accepted
date: 2026-11-12
deciders: [EdV4H]
tags: [release, npm, packaging]
---

# ADR-0014: Changesets で版を上げ、GitHub Actions から Trusted Publishing で npm に公開する

## Context

公開する 6 パッケージ（core / schema / perceive / react / plugin-loader-http / plugin-renderer-svg）は exports・型・publint の検査まで済んでいるが、版の上げ方と npm に出す仕組みが無い。[architecture.md](../../architecture.md) には「Changesets で各パッケージ独立に版を上げる想定（実装時に確定）」とだけ書いてあった。

決めることは 3 つ。

- 版の上げ方: 独立か、揃えるか
- 誰がどこから公開するか: 手元の `npm publish` か、CI か
- パッケージ間の依存の書き方: `workspace:*` は公開時に `0.1.0` のような固定の版になり、利用者の側で重複しやすい

npm は長く使えるトークンを減らす方向にあり、CI からの公開には Trusted Publishing（GitHub Actions の OIDC で、トークンを置かずに公開する仕組み）を勧めている。ただし Trusted Publishing はパッケージが npm にあってからでないと設定できないので、初回だけは手元から出す必要がある。

## Decision

Changesets で版を上げ、main へのマージを起点に GitHub Actions が Trusted Publishing で npm に公開する。

- 変更を入れる PR に changeset（`.changeset/*.md`）を足す。main に溜まると、changesets/action が「版を上げる PR」を作り、それをマージすると公開する
- 版は **パッケージごとに** 上げる。変えていないパッケージは版を上げない
  - 依存している版の範囲から外れるとき（0.x で core を minor で上げたときなど）は、Changesets が依存している側も patch で上げ、範囲を書き換える（`updateInternalDependencies: "patch"`）
  - 6 パッケージを同じ版で揃える案も検討したが、変えていないパッケージの版まで上がるので採らなかった
- 0.x の間は、壊れる変更を minor、それ以外を patch にする
- 最初の版は 6 パッケージとも `0.1.0` にする（`0.0.0` は未公開の印として使っていた）
- パッケージ間の依存は `workspace:^` で書く。公開時に `^0.1.0` になる
- 公開は `scripts/publish-packages.mjs` が行う。`pnpm pack` で tarball を作り、`npm publish` に渡す。npm にまだ無い版だけを出し、公開した版に `<name>@<version>` の git tag を付ける
  - `pnpm publish` を使わないのは、Trusted Publishing に対応している npm CLI（11.5.1 以上）に公開を任せるため
- npm にまだ無いパッケージは CI では飛ばし、手元から `--allow-new` を付けて初回公開する。そのあと npm 上で Trusted Publisher を設定する
- private のパッケージ（vue / plugin-loader-memory / plugin-renderer-canvas / apps）は版を上げず、公開もしない

やらないこと:

- npm のトークンを GitHub の secret に置かない
- 版をコミットのメッセージから自動で決める仕組み（semantic-release など）は使わない

## Consequences

- 良い影響: 公開のたびに CHANGELOG と GitHub Release が残る。トークンを管理しなくてよい。公開した版は provenance（どのコミットとワークフローから作ったかの証明）付きになる（リポジトリが public のとき）
- 良い影響: 公開済みの版を飛ばすので、途中で失敗してもやり直せる
- 悪い影響: 利用者はパッケージごとの版を見ることになる。どの版の組み合わせで動くかは、各パッケージの `dependencies` の範囲で判断してもらう
- 悪い影響: 0.x の間は core を minor で上げるたびに、core に依存する公開パッケージもすべて patch で上がる
- 悪い影響: 新しい公開パッケージ（parts / exporter プラグインなど）を足すたびに、初回だけ手元から公開し、Trusted Publisher を設定する手間がかかる
- 悪い影響: GitHub Actions の標準トークンで作った「版を上げる PR」では CI が走らない。中身は版と CHANGELOG だけなので、そのままマージしてよい
- 制約: 公開した版は 72 時間を過ぎると取り消せない。LICENSE の著作権者や同梱物の確認は初回公開の前に済ませる
- 制約: スキーマの `$id`（`https://unpkg.com/@edv4h/alter-ego-schema@1/...`）は 1.0 を出すまで解決できない。識別子としては問題ない
- [architecture.md](../../architecture.md) の「Changesets で各パッケージ独立に版を上げる想定（実装時に確定）」をこの ADR で確定する
- 手順は [docs/release.md](../../release.md) にまとめる
