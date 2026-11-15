import Ajv2020 from "ajv/dist/2020.js";
import { avatarSchemaJsonSchema } from "./json-schema.js";
import { semanticErrors } from "./semantic.js";
import type { AvatarSchema, SchemaError } from "./types.js";

const ajv = new Ajv2020({ allErrors: true });
// 型生成用の注釈キーワード。検証には影響しない
ajv.addKeyword({ keyword: "tsType", schemaType: "string" });
const validator = ajv.compile(avatarSchemaJsonSchema);

export type ValidateResult =
  | { ok: true; schema: AvatarSchema }
  | { ok: false; errors: SchemaError[] };

export function validate(input: unknown): ValidateResult {
  const valid = validator(input);
  if (valid) {
    const schema = input as unknown as AvatarSchema;
    const errors = semanticErrors(schema);
    return errors.length === 0 ? { ok: true, schema } : { ok: false, errors };
  }
  const errors: SchemaError[] = (validator.errors ?? []).map((e) => ({
    path: e.instancePath || "/",
    message: `${e.keyword}: ${e.message ?? "invalid"}`,
  }));
  return { ok: false, errors };
}
