import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./dialog.module.css";

export interface DialogProps {
  readonly open: boolean;
  readonly title: string;
  /** Esc・背景クリック・閉じるボタンで呼ばれる */
  readonly onClose: () => void;
  readonly children: ReactNode;
  /** 下に右寄せで並べるボタン */
  readonly actions: ReactNode;
}

/**
 * モーダルダイアログ。ブラウザ標準の <dialog> を使うので、
 * フォーカスの閉じ込めと Esc での close はブラウザに任せる。
 */
export function Dialog({ open, title, onClose, children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // 背景（dialog 要素そのもの）のクリックで閉じる
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      <div className={styles.body}>{children}</div>
      <div className={styles.actions}>{actions}</div>
    </dialog>
  );
}
