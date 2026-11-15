import { groupOfSlot } from "@edv4h/alter-ego-core";
import { Section } from "../ui/section.js";
import type { CategoryPanel, CategoryPanelProps } from "./types.js";
import styles from "./panels.module.css";

/**
 * 開発者向け: 今のカテゴリが、スキーマのどの定義から作られたか。
 * 画面に出ている色や変形がどこから来たかを、JSON を開かずに確かめられる。
 */
function SchemaPanel({ engine, category }: CategoryPanelProps) {
  const schema = engine.schema;
  const group = groupOfSlot(schema, category.baseSlot);
  const definition = {
    ...(group ? { group } : {}),
    slots: category.slots.map((id) => schema.slots.find((s) => s.id === id)),
  };
  return (
    <Section title="スキーマ">
      <details className={styles.details}>
        <summary>このカテゴリの定義（groups / slots）</summary>
        <pre className={styles.code}>{JSON.stringify(definition, null, 2)}</pre>
      </details>
    </Section>
  );
}

export const schemaPanel: CategoryPanel = {
  id: "schema",
  isAvailable: () => true,
  Component: SchemaPanel,
};
