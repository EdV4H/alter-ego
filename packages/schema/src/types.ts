// 型の定義元は schema/avatar.schema.json（ADR-0010）。ここでは生成物を再公開する。
export type {
  AvatarSchema,
  Canvas,
  Asset,
  ColorBinding,
  Color,
  Metadata,
  Part,
  Placement,
  SelectionEntry,
  Slot,
  SlotGroup,
  SlotTransform,
  Variant,
  VariantOverrides,
} from "./types.generated.js";

/** バリデーションエラー 1 件 */
export interface SchemaError {
  path: string;
  message: string;
}
