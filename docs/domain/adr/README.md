# ADR 運用ルール

> Architecture Decision Record。このプロジェクトで下された設計判断を、AI にも人間にも追いやすい形で残すための運用ルール。

## 目的

- 「なぜこうなっているのか」を後から読める形で残す
- AI エージェントが過去の決定を学習・参照して、一貫した提案ができるようにする
- 決定の撤回・上書きを履歴として保全する

## ファイル構造

- 場所: `docs/domain/adr/`
- ファイル名: `NNNN-<kebab-title>.md`
  - `NNNN` は 4 桁の連番（`0001`, `0002`, ...）
  - `<kebab-title>` は小文字ハイフン区切りの短い題（例: `unified-plugin-interface`）
- 追加したら必ず `DOMAIN.md` の索引にリンク行を足す

## フォーマット

AI が生成・更新する前提で、**YAML フロントマター + 3 セクション本文** の軽量形式を採用する。

```markdown
---
id: NNNN
title: 決定の短いタイトル
status: proposed | accepted | superseded | deprecated
date: YYYY-MM-DD
deciders: [name-or-handle, ...]
supersedes: [NNNN, ...]      # 省略可
superseded_by: NNNN          # 省略可。status=superseded の時に指定
tags: [plugin, naming, ...]  # 検索用タグ。省略可
---

# ADR-NNNN: 決定の短いタイトル

## Context
解決したい問題・背景・制約を 3〜10 行で。ここを読むだけで「なぜ議論になったか」が分かる粒度で書く。

## Decision
採用した結論を明確に 1 文で書き、続けて詳細を箇条書き。代替案に触れる場合も短く。

## Consequences
この決定によって何が起きるか。良い影響・悪い影響・新たに発生する制約を分けて書く。
```

## セクションの中身ガイド

### Context

- 問題が発生した背景・経緯
- 既存仕組みのどこが不満・不十分か
- 関連する制約（技術的・運用的・ビジネス的）
- 可能なら、判断時点で検討した代替案を箇条書き

### Decision

- 採った選択肢を 1 文で明記（動詞で締める）
- 具体的な形（型、命名、手順）を続けて
- 重要な「やらないこと」も明示

### Consequences

- **良い影響**: この決定で得られる利点
- **悪い影響・トレードオフ**: 失うもの、難しくなること
- **影響範囲**: どのファイル・パッケージ・ドキュメントに影響するか
- **追随タスク**: 別途 issue や ADR が必要ならその旨

## ステータスの使い分け

| status | 意味 |
| --- | --- |
| `proposed` | 提案段階。議論中 |
| `accepted` | 採用済み。プロジェクトの現行方針 |
| `superseded` | 新しい ADR に上書きされた。`superseded_by` を必ず設定 |
| `deprecated` | 採用を中止したが、置き換えは未決 |

## ステータス遷移と更新方針

- 一度 `accepted` になった ADR は**書き換えず**、決定を覆すときは新しい ADR を作る（`supersedes: [N]` を付ける）
- 古い ADR は `status: superseded` に変更し、`superseded_by: M` を追加する
- `accepted` ADR の誤字・リンク切れ等の軽微な修正は許容（意味は変えない）

## AI が ADR を書くときの注意

- **1 決定 = 1 ADR**: 複数論点を 1 本に詰めない
- **事実と意見を分ける**: Context には事実、Decision には選択、Consequences には帰結
- **曖昧さを残さない**: 「〜が望ましい」ではなく「〜を採用する」と言い切る
- **背景の引用元を書く**: 先行プロジェクトや外部記事を参照したなら URL を残す
- **`DOMAIN.md` の更新を忘れない**: ADR を足したら索引行を追加

## 最小テンプレート

新しい ADR を書くときはこのテンプレートをコピーする。

```markdown
---
id: NNNN
title: ...
status: proposed
date: YYYY-MM-DD
deciders: []
tags: []
---

# ADR-NNNN: ...

## Context

## Decision

## Consequences
```
