import { SchemaValidationError } from "./errors.js";

/** このパッケージが扱う現行の schemaVersion（MAJOR.MINOR） */
export const CURRENT_SCHEMA_VERSION = "1.1";

const VERSION_RE = /^(\d+)\.(\d+)$/;

/** MAJOR を上げたときに 1 段ずつ適用する変換。キーは変換「元」の MAJOR */
const migrations: Record<number, (input: Record<string, unknown>) => Record<string, unknown>> = {
  // 例: 1: (v1) => ({ ...v1, schemaVersion: "2.0" }),
};

function parseVersion(v: unknown): { major: number; minor: number } | null {
  if (typeof v !== "string") return null;
  const m = VERSION_RE.exec(v);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]) };
}

/**
 * 旧い MAJOR のスキーマを現行 MAJOR へ変換する（ADR-0010）。
 * - 現行 MAJOR 以下の MINOR 差は後方互換なので変換しない
 * - 現行より新しいバージョンは扱えないためエラー
 * - schemaVersion が無い・形式が違う場合は何もせず返し、判定は validate に任せる
 */
export function migrate(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const from = parseVersion((input as Record<string, unknown>).schemaVersion);
  const current = parseVersion(CURRENT_SCHEMA_VERSION)!;
  if (!from) return input;

  if (from.major > current.major || (from.major === current.major && from.minor > current.minor)) {
    throw new SchemaValidationError([
      {
        path: "/schemaVersion",
        message: `unsupported: ${String((input as Record<string, unknown>).schemaVersion)} is newer than ${CURRENT_SCHEMA_VERSION}`,
      },
    ]);
  }

  let out = input as Record<string, unknown>;
  for (let major = from.major; major < current.major; major++) {
    const step = migrations[major];
    if (!step) {
      throw new SchemaValidationError([
        { path: "/schemaVersion", message: `no migration from ${major}.x` },
      ]);
    }
    out = step(out);
  }
  return out;
}
