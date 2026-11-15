import type { ButtonHTMLAttributes } from "react";
import styles from "./button.module.css";

type Variant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  readonly size?: "md" | "sm";
}

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

/** 文字のボタン。type は既定で "button" */
export function Button({ variant = "secondary", size = "md", className, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cx(styles.button, styles[variant], size === "sm" && styles.small, className)}
      {...rest}
    />
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 読み上げとツールチップに使う。必須 */
  readonly label: string;
}

/** 記号 1 文字などの四角いボタン。label を title と aria-label に入れる */
export function IconButton({ label, className, type, ...rest }: IconButtonProps) {
  return (
    <button
      type={type ?? "button"}
      aria-label={label}
      title={label}
      className={cx(styles.button, styles.icon, className)}
      {...rest}
    />
  );
}
