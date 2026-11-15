export type {
  AvatarSchema,
  Canvas,
  Asset,
  ColorBinding,
  Color,
  Metadata,
  Part,
  Placement,
  SchemaError,
  SelectionEntry,
  Slot,
  SlotGroup,
  SlotTransform,
  Variant,
  VariantOverrides,
} from "./types.js";
export { SchemaValidationError } from "./errors.js";
export { validate } from "./validate.js";
export type { ValidateResult } from "./validate.js";
export { migrate, CURRENT_SCHEMA_VERSION } from "./migrate.js";
export { avatarSchemaJsonSchema } from "./json-schema.js";
