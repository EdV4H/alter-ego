# Changesets

公開パッケージに利用者から見える変更を入れたら、PR に changeset を 1 つ足します。

```sh
pnpm changeset
```

対象のパッケージと、版の上げ幅（patch / minor / major）と、変更の要約を聞かれます。要約は CHANGELOG にそのまま載るので、利用者向けに書いてください。

- 0.x の間は、壊れる変更を minor、それ以外を patch にします
- 版はパッケージごとに上げます。変えたパッケージだけを選んでください。依存しているパッケージの版の範囲から外れるときは、Changesets が依存している側も patch で上げます
- ドキュメントやテストだけの変更、デモアプリ（`apps/`）だけの変更には不要です

リリースの流れは [docs/release.md](../docs/release.md) を参照してください。
