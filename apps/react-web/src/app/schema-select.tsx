import { useId } from "react";
import { DEMO_SCHEMAS, type DemoSchema } from "./config.js";
import styles from "./app.module.css";

export interface SchemaSelectProps {
  readonly value: string;
  readonly onChange: (demo: DemoSchema) => void;
}

/** デモ用スキーマの切り替え。選ぶとエディタ全体をそのスキーマで作り直す */
export function SchemaSelect({ value, onChange }: SchemaSelectProps) {
  const id = useId();
  return (
    <div className={styles.schemaSelect}>
      <label htmlFor={id} className={styles.schemaSelectLabel}>
        スキーマ
      </label>
      <select
        id={id}
        className={styles.select}
        value={value}
        onChange={(e) => {
          const next = DEMO_SCHEMAS.find((d) => d.id === e.target.value);
          if (next) onChange(next);
        }}
      >
        {DEMO_SCHEMAS.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
      </select>
    </div>
  );
}
