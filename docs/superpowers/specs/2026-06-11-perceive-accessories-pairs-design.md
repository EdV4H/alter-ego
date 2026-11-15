# 装着物の反映 + ペア slot のセット選択 設計書

**日付:** 2026-06-11
**ステータス:** 承認済み
**前提:** PR #50 (Gemini プロバイダ選択) merge 済み。E2E 検証で「両プロバイダともメガネを反映しない」問題を確認済み

## 目的

Photo to Avatar の推定品質を 2 点改善する。

1. **装着物の反映漏れ**: メガネ・帽子等の装着物（任意 slot: glasses / accessory_front / accessory_back 等）が「顕著特徴 2〜3 個」の選から漏れて反映されない問題を解消する
2. **ペア slot のセット選択**: `_left` / `_right` や hair の front / back で分かれる slot は同番号のパーツをセットで選ぶようにする（左右の目が別デザインになる等の不揃いを防ぐ）

## 非目標

- 2 段階推定（有無判定 → 選択）の導入
- 「顕著特徴 2〜3 個」コンセプト自体の撤廃
- schema 側のパーツ番号体系の変更

## schema の前提（確認済み）

- `eye_left` / `eye_right`、`eyebrow_left` / `eyebrow_right` のパーツ番号は完全 1:1
- `hair_back` の番号は `hair_front` の部分集合（back 単独の番号は存在しない = セット設計）
- 任意 slot（`required !== true`）: hair_back / glasses / accessory_back / accessory_front

## 設計

### 1. プロンプト改善（`packages/perceive/src/prompt.ts`）

- **SYSTEM_PROMPT**: 「顕著特徴を 2〜3 個選び…」の後に追加:
  「メガネ・ヒゲ・帽子などの装着物は顕著特徴の個数に数えず、写真に写っていれば必ず反映してください。」
- **buildUserPrompt()** に 2 セクション追加:
  - **【装着物・任意パーツの判定指示】**: schema から `required !== true` の slot を列挙し、「これらの slot は写真に対応する要素が写っているかを必ず判定し、写っている場合は必ず partId を設定、写っていない場合は省略する」と指示
  - **【セット選択の指示】**: 「`_left` / `_right` で分かれる slot は同じ番号のパーツを選ぶ。`hair_back` を選ぶ場合は `hair_front` と同じ番号にする。対応する番号が無い場合は片側のみでよい」と指示

### 2. コード正規化（`packages/perceive/src/normalize.ts` 新設）

プロンプト指示は LLM の揺れで破られうるため、`validateSeed` の後にコードで保証する。

```ts
export function normalizePairSelections(
  seed: AvatarSeed,
  schema: AvatarSchema,
): AvatarSeed;
```

正規化ルール:

| 対象 | ルール |
|---|---|
| 左右ペア slot（slot id の `_left` / `_right` サフィックスで機械的に検出） | 両方選択済みで番号不一致 → **右を左と同番号に置換**。片側のみ選択 → 同番号でもう片方を補完。対応番号のパーツが schema に無ければ片側のみ許容（そのまま） |
| `hair_front` / `hair_back` | back の番号が front と不一致 → front と同番号の back に置換。**同番号の back が schema に無ければ back を空にする**（hair_back の選択自体を除外） |

- **color もペアで同色に揃える**（パーツ番号と同じ「左 / front 基準」）:
  - ペア両方が選択されている場合（番号一致・不一致を問わず）: 基準側（左 / front）に color があれば相手側を同色に上書き。基準側に color が無く相手側にだけある場合は基準側にコピー。両方無ければ何もしない
  - 補完時はペア元の color をコピー（結果として常に同色）
- slotTransforms には触れない
- パーツ番号は partId 末尾の数字（`/(\d+)$/`）で判定する。番号が取れない partId は**基準側（左 / front）としては**正規化の起点にならない（そのまま）。ただしペアの相手側（右 / back）が番号なしで基準側に番号がある場合は、基準側に揃えて矯正する
- 適用箇所: openai.ts / gemini.ts の `validateSeed()` 直後（両 adapter 共通）

### 3. テスト

- **`prompt.test.ts` 新設**: buildUserPrompt の出力に (a) 装着物判定指示と任意 slot 名、(b) セット選択指示、が含まれることを assert。SYSTEM_PROMPT に装着物の文言が含まれることも assert
- **`normalize.test.ts` 新設**:
  - 左右番号不一致 → 右が左に揃う（color も左に揃う）
  - 番号一致でも色不一致 → 相手側の color が基準側に揃う
  - 基準側に color が無く相手側にある → 基準側にコピーされ同色になる
  - 左のみ選択 → 右を同番号で補完
  - hair_back 番号不一致 + 同番号 back あり → 置換
  - hair_back 番号不一致 + 同番号 back なし → hair_back が空（除外）
  - ペア対象が無い selections → 無変更
  - 番号なし partId → 無変更
- 既存テスト（118 件）の PASS 維持。adapter テストに normalize 適用の回帰がないことを確認

### 4. 検証（実装後）

E2E で前回（PR #50 検証時）と同条件のメガネあり顔写真を両プロバイダに投入し、以下を確認:

1. glasses slot が反映される
2. 左右の目・眉が同番号になっている

### 5. 進め方

- 実装は subagent（`model: sonnet` 明示）に委譲し、メインセッションがレビュー後に commit（rules/model-delegation.md 準拠）
- ブランチ: `feat/perceive-prompt-accessories-pairs`、完了後 PR（レビュアー EdV4H、ラベル 🤖 claude-code）
