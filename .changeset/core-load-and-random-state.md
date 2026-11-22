---
"@edv4h/alter-ego-core": minor
---

`engine.load(input, options?)` を足した。保存した状態を 1 回で差し替え、`state:change` を 1 回だけ出す（ADR-0015）。あわせて、スキーマに沿ったランダムな状態を返す `randomState(schema, options?)` を足した。乱数と Part の選び方を差し替えられる（ADR-0017）。
