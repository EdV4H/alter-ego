import type { ReactNode } from "react";
import { TRANSFORM_STEP } from "../app/config.js";
import {
  hasTransform,
  resetCategoryTransform,
  transformCategory,
  transformControlsOf,
  type TransformOp,
} from "../editor/actions.js";
import { Button, IconButton } from "../ui/button.js";
import { Section } from "../ui/section.js";
import type { CategoryPanel, CategoryPanelProps } from "./types.js";
import styles from "./panels.module.css";

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className={styles.controlRow}>
      <span className={styles.controlLabel}>{label}</span>
      <div className={styles.controlButtons}>{children}</div>
    </div>
  );
}

/**
 * 配置の調整。出すボタンはスキーマで決まる（placement があれば移動・拡縮、
 * mirror のグループなら左右移動の代わりに間隔と傾き）。
 */
function TransformPanel({ engine, state, category }: CategoryPanelProps) {
  const controls = transformControlsOf(category);
  if (!controls) return null;
  const run = (op: TransformOp) => () => transformCategory(engine, category, op);
  const { move, scale, tilt, spread } = TRANSFORM_STEP;

  return (
    <Section
      title="位置と大きさ"
      aside={
        <Button
          size="sm"
          variant="ghost"
          disabled={!hasTransform(state, category)}
          onClick={() => resetCategoryTransform(engine, category)}
        >
          リセット
        </Button>
      }
    >
      <Row label="位置">
        <IconButton label="上へ" onClick={run({ kind: "move", dx: 0, dy: -move })}>↑</IconButton>
        <IconButton label="下へ" onClick={run({ kind: "move", dx: 0, dy: move })}>↓</IconButton>
        {controls.move === "xy" && (
          <>
            <IconButton label="左へ" onClick={run({ kind: "move", dx: -move, dy: 0 })}>←</IconButton>
            <IconButton label="右へ" onClick={run({ kind: "move", dx: move, dy: 0 })}>→</IconButton>
          </>
        )}
      </Row>
      <Row label="大きさ">
        <IconButton label="小さく" onClick={run({ kind: "scale", delta: -scale })}>−</IconButton>
        <IconButton label="大きく" onClick={run({ kind: "scale", delta: scale })}>+</IconButton>
      </Row>
      {controls.spread && (
        <Row label="間隔">
          <IconButton label="寄せる" onClick={run({ kind: "spread", amount: -spread })}>→←</IconButton>
          <IconButton label="離す" onClick={run({ kind: "spread", amount: spread })}>←→</IconButton>
        </Row>
      )}
      {controls.tilt && (
        <Row label="傾き">
          <IconButton label="内向きに傾ける" onClick={run({ kind: "tilt", deg: tilt })}>↻↺</IconButton>
          <IconButton label="外向きに傾ける" onClick={run({ kind: "tilt", deg: -tilt })}>↺↻</IconButton>
        </Row>
      )}
    </Section>
  );
}

export const transformPanel: CategoryPanel = {
  id: "transform",
  isAvailable: (category) => transformControlsOf(category) !== null,
  Component: TransformPanel,
};
