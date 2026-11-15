import type { ReactNode } from "react";
import styles from "./swatch.module.css";

export interface SwatchProps {
  /** 塗る色。null は透明（市松模様だけ） */
  readonly color: string | null;
  readonly selected: boolean;
  readonly label: string;
  readonly onSelect: () => void;
}

/** 色を 1 つ選ぶボタン */
export function Swatch({ color, selected, label, onSelect }: SwatchProps) {
  return (
    <button
      type="button"
      className={styles.swatch}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      onClick={selected ? undefined : onSelect}
    >
      {color && <span className={styles.fill} style={{ background: color }} aria-hidden />}
    </button>
  );
}

export function SwatchGrid({ children, label }: { readonly children: ReactNode; readonly label: string }) {
  return (
    <div className={styles.grid} role="group" aria-label={label}>
      {children}
    </div>
  );
}

/** 2 つの色表記が同じ色か（大文字小文字を無視） */
export const sameColor = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
