export type PerceiveErrorKind =
  | "network"
  | "parse"
  | "validate"
  | "auth"
  | "cancelled";

/**
 * Perception 層が throw するエラー。
 * kind で UI 側の分岐 (再試行ボタンを出すか等) を決める。
 */
export class PerceiveError extends Error {
  override readonly name = "PerceiveError";
  constructor(
    public readonly kind: PerceiveErrorKind,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
  }
}
