# リリース手順

> npm への公開の流れ。決めごとは [ADR-0014](./domain/adr/0014-release-with-changesets.md) を参照。

公開するのは `private` でない 6 パッケージで、版はパッケージごとに上げます。

- `@edv4h/alter-ego-core`
- `@edv4h/alter-ego-schema`
- `@edv4h/alter-ego-perceive`
- `@edv4h/alter-ego-react`
- `@edv4h/alter-ego-plugin-loader-http`
- `@edv4h/alter-ego-plugin-renderer-svg`

## ふだんの流れ

1. 公開パッケージを変える PR に `pnpm changeset` で changeset を足す（書き方は [.changeset/README.md](../.changeset/README.md)）
2. PR を main にマージすると、Release ワークフローが「🔖 chore: release packages」という PR を作る（すでにあれば更新する）。版と CHANGELOG の変更だけが入っている
3. その PR をマージすると、Release ワークフローが npm に公開し、`<name>@<version>` の git tag と GitHub Release を作る

「版を上げる PR」は GitHub Actions の標準トークンで作るので、CI が走りません。中身は版と CHANGELOG だけなので、そのままマージして構いません。

## 初回の公開（1 回だけ）

Trusted Publishing はパッケージが npm にあってからでないと設定できないので、最初の `0.1.0` だけは手元から出します。

### 前提

- [ ] リポジトリを public にする（npm のページからリンクするため。provenance も public でないと付かない）
- [ ] LICENSE の著作権者を確定する（公開した版は 72 時間を過ぎると取り消せない）
- [ ] npm で `edv4h` スコープを使えること（ユーザー名が `edv4h` か、`edv4h` という organization を持っていること）
- [ ] npm アカウントの 2 要素認証が有効なこと

### 手順

```sh
git switch main && git pull
pnpm install --frozen-lockfile
npm login                                  # ブラウザで認証する
pnpm release --dry-run --allow-new         # 何が出るかを確認する（ビルドも走る）
pnpm release --allow-new                   # 公開する。パッケージごとに 2 要素認証を求められることがある
git push origin --tags                     # 付いた git tag を push する
```

`pnpm release` は公開済みの版を飛ばすので、途中で失敗してもそのままやり直せます。

### Trusted Publisher の設定

6 パッケージそれぞれで、npmjs.com のパッケージのページから Settings → Trusted Publisher を開き、GitHub Actions を選んで次のように入れます。

| 項目 | 値 |
| --- | --- |
| Organization or user | `EdV4H` |
| Repository | `alter-ego` |
| Workflow filename | `release.yml` |
| Environment name | 空のまま |

設定したら、同じ Settings の Publishing access を「Require two-factor authentication and disallow tokens」にしておくと、トークンでは公開できなくなります（Trusted Publishing はそのまま使えます）。

設定してから 2 日以内に 1 回目の公開をしないと、設定が失効します。失効したら消して作り直してください。

## 新しい公開パッケージを足すとき

1. `package.json` から `private: true` を外し、版を `0.1.0` にする
2. main にマージしたら、手元から `pnpm release --allow-new` で初回公開し、上と同じ Trusted Publisher を設定する

CI はまだ npm に無いパッケージを飛ばします（警告だけ出します）。

## うまくいかないとき

- `npm login` が npmjs.com 以外（社内のプロキシなど）に向かう: npm の設定で registry を変えている。そのターミナルでだけ `export npm_config_registry=https://registry.npmjs.org/` してから `npm login --auth-type=web` と `pnpm release` を実行する

- `npm publish` が 404 や認証エラーになる: Trusted Publisher の設定（ワークフロー名が `release.yml` か）と、`package.json` の `repository.url` がリポジトリと一致しているかを確認する
- 版を上げる PR ができない: リポジトリの Settings → Actions → General で「Allow GitHub Actions to create and approve pull requests」を有効にする
