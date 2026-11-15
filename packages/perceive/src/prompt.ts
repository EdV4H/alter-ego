import type { AvatarSchema, Slot } from "@edv4h/alter-ego-schema";

// 内部モジュール: adapter (openai.ts / gemini.ts) 間でプロンプトを共有するためのもの。
// パッケージの公開 API ではないため index.ts からは export しない。
//
// プロンプトは「共通の指示（出力形式・安全規則）」と「スキーマから組み立てる指示」の 2 部で作る。
// Slot id を直書きせず、 Slot / Part の description、 palette、 groups と
// x-perceive 拡張だけを使う（ADR-0011）。

/** OpenAI / Gemini 両 adapter で共有するシステムプロンプト */
export const SYSTEM_PROMPT = [
  "あなたはアバター生成アシスタントです。",
  "写真の人物を識別する顕著特徴を 2〜3 個選び、",
  "それを最も強調する partId と color、 必要なら slotTransforms を出力してください。",
  "ただしメガネ・ヒゲ・帽子などの装着物は顕著特徴の個数に数えず、 写真に写っていれば必ず反映してください。",
  "残りはデフォルトで構いません。 出力は JSON のみで、 説明文を含めないでください。",
  "schema に存在しない partId は使わないでください。",
].join(" ");

/** Slot の `x-perceive` 拡張（ADR-0011）。プロンプトに足すヒントで、プロンプト文そのものは書かない */
export interface PerceiveHints {
  /** この Slot の color に何を入れるか。指定した Slot は color を必ず推定させる */
  colorHint?: string;
  /** この Slot を推定するときの注意 */
  hint?: string;
}

/** Slot の x-perceive を読み取る。形が違う値は無視する */
export function perceiveHintsOf(slot: Slot): PerceiveHints {
  const raw = slot["x-perceive"];
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  return {
    ...(typeof r.colorHint === "string" ? { colorHint: r.colorHint } : {}),
    ...(typeof r.hint === "string" ? { hint: r.hint } : {}),
  };
}

const label = (id: string, name: string, description?: string) =>
  description ? `${id} (${name}: ${description})` : `${id} (${name})`;

/**
 * schema から利用可能な slot + partId 一覧と、 スキーマに書かれた説明・ヒントをプロンプトに組み込む。
 * 不明な partId を出さないよう、 各 slot の選択肢を明示する。
 * "JSON" の文字列を含めることでモデルの JSON 出力モード (OpenAI json_object mode 等) の制約を満たす。
 */
export function buildUserPrompt(schema: AvatarSchema): string {
  const lines: string[] = [
    "次の写真からアバターの構成を推定してください。",
    "schema に存在する以下の slot / partId のみを使ってください。",
    "",
  ];
  for (const slot of schema.slots) {
    const parts = schema.parts
      .filter((p) => p.slotId === slot.id)
      .map((p) => label(p.id, p.name, p.description));
    lines.push(`- ${label(slot.id, slot.name, slot.description)}: ${parts.join(", ")}`);
    const { hint } = perceiveHintsOf(slot);
    if (hint) lines.push(`  注意: ${hint}`);
  }

  // 色: colorHint のある Slot は必ず推定させる。palette があれば候補として示す
  const colorSlots = schema.slots.filter((s) => perceiveHintsOf(s).colorHint);
  if (colorSlots.length > 0) {
    lines.push("");
    lines.push("【色の推定指示】");
    lines.push(
      "写真から以下の色を抽出し、 各 slot の color に '#RRGGBB' 形式で必ず設定してください:",
    );
    for (const slot of colorSlots) {
      lines.push(`- ${slot.id}.color = ${perceiveHintsOf(slot).colorHint}`);
      if (slot.palette && slot.palette.length > 0) {
        lines.push(`  候補: ${slot.palette.join(", ")}`);
      }
    }
    lines.push(
      "候補がある slot は、 写真の色に近い候補があればそれを選び、 無ければ写真から読み取った色をそのまま使ってください。",
    );
  }

  const optionalSlots = schema.slots.filter((s) => !s.required);
  if (optionalSlots.length > 0) {
    lines.push("");
    lines.push("【装着物・任意パーツの判定指示】");
    lines.push(
      `次の slot は写真に対応する要素が写っているかを必ず判定してください: ${optionalSlots.map((s) => s.id).join(", ")}`,
    );
    lines.push(
      "写っている場合は必ず該当する partId を設定し、 写っていない場合は省略してください。",
    );
    lines.push(
      "ただし写真に写っていない装着物を追加してはいけません。 迷った場合は省略してください。",
    );
  }

  // セット: groups（ADR-0007）。出力後に core の規則で基準 Slot にそろえるので、ここでは目安を伝える
  const groups = schema.groups ?? [];
  if (groups.length > 0) {
    lines.push("");
    lines.push("【セット選択の指示】");
    for (const group of groups) {
      const [base, ...others] = group.slots;
      const rules: string[] = [];
      if (group.linkParts !== false) {
        rules.push(`${others.join(", ")} は ${base} と同じ組み合わせのパーツを選んでください (対応が無い場合は ${base} のみで構いません)`);
      }
      if (group.linkColor !== false) {
        rules.push(`color は ${base} と同じ値にしてください`);
      }
      if (rules.length > 0) lines.push(`- ${group.name} (${group.slots.join(" / ")}): ${rules.join("。 ")}。`);
    }
  }

  lines.push("");
  lines.push("出力 JSON スキーマ:");
  lines.push(
    "{ selections?: Record<slotId, { partId: string, color?: '#RRGGBB' }>,",
  );
  lines.push(
    "  slotTransforms?: Record<slotId, { dx?: number, dy?: number, scale?: number, rotation?: number }>,",
  );
  lines.push("  salientFeatures?: Array<{ slot: string, reason: string }> }");
  return lines.join("\n");
}
