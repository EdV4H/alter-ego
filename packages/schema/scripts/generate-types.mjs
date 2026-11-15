// schema/avatar.schema.json（唯一の定義元）から src/types.generated.ts を生成する（ADR-0010）。
// `pnpm --filter @edv4h/alter-ego-schema generate` で実行し、生成物はコミットする。
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const root = new URL("../", import.meta.url);
const schemaPath = fileURLToPath(new URL("schema/avatar.schema.json", root));
const outPath = fileURLToPath(new URL("src/types.generated.ts", root));

const schema = JSON.parse(await readFile(schemaPath, "utf8"));

const banner = [
  "/* eslint-disable */",
  "// このファイルは scripts/generate-types.mjs が schema/avatar.schema.json から生成する。",
  "// 直接編集しないこと。変更はスキーマ JSON に対して行い、`pnpm --filter @edv4h/alter-ego-schema generate` を実行する。",
].join("\n");

let ts = await compile(schema, "AvatarSchema", {
  bannerComment: banner,
  additionalProperties: false,
  unreachableDefinitions: true,
  cwd: fileURLToPath(new URL("schema/", root)),
});

// JSON Schema の patternProperties "^x-" は生成器では `[k: string]` になるため、
// 拡張キー以外の誤記を型で検出できるよう `x-${string}` に絞る。
ts = ts.replaceAll("[k: string]: unknown;", "[k: `x-${string}`]: unknown;");

await writeFile(outPath, ts);
console.log(`generated ${outPath}`);
