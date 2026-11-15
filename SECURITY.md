# セキュリティポリシー

## 対象バージョン

`alter-ego` は alpha 段階で、セキュリティ修正は main ブランチの最新版にのみ適用します。

## 脆弱性の報告

脆弱性は **公開 issue に書かず**、GitHub の [Private vulnerability reporting](https://github.com/EdV4H/alter-ego/security/advisories/new) から報告してください。

報告には次の情報を含めてください。

- 影響を受けるパッケージとバージョン（またはコミット）
- 再現手順
- 想定される影響

## 特に注意している領域

- **`@edv4h/alter-ego-perceive`**: LLM の API キーを扱います。キーをブラウザに渡さず、サーバ側 proxy で付与する構成を推奨しています（[packages/perceive/README.md](./packages/perceive/README.md)）
- **Loader プラグイン**: 外部 URL からアセットを取得します。信頼できない SVG を描画する場合は、利用者側でサニタイズや CSP を検討してください
