import type { ReactNode } from "react";
import styles from "./section.module.css";

export interface SectionProps {
  readonly title: string;
  /** 見出しの右に置く操作（リセットなど） */
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}

/** 見出し付きのカード。右ペインのパネルはこれで包む */
export function Section({ title, aside, children }: SectionProps) {
  return (
    <section className={styles.section} aria-label={title}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Spinner() {
  return <div className={styles.spinner} aria-hidden />;
}
