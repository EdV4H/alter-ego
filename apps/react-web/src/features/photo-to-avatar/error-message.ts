import type { PerceiveError } from "@edv4h/alter-ego-perceive";

/** PerceiveError を画面に出す文に直す */
export function errorMessageFor(e: PerceiveError): string {
  switch (e.kind) {
    case "network":
      return "ネットワークエラーが発生しました";
    case "auth":
      return "API キーが正しくありません";
    case "parse":
      return "結果の解釈に失敗しました";
    case "validate":
      return "写真からアバターを作れませんでした。別の写真を試してください";
    case "cancelled":
      // 呼び出し側でキャンセルは先に処理するので、通常はここに来ない
      return "キャンセルされました";
    default: {
      // PerceiveErrorKind が増えたらここで型エラーになる
      const _exhaustive: never = e.kind;
      return "不明なエラーが発生しました";
    }
  }
}
