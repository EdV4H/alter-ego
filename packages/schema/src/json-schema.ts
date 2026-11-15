// 唯一の定義元である JSON Schema ファイルをそのまま再公開する（ADR-0010）。
import avatarSchemaJson from "../schema/avatar.schema.json" with { type: "json" };

export const avatarSchemaJsonSchema = avatarSchemaJson;
