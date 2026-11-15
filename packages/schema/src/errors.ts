import type { SchemaError } from "./types.js";

export class SchemaValidationError extends Error {
  readonly errors: readonly SchemaError[];

  constructor(errors: readonly SchemaError[]) {
    const summary = errors
      .map((e) => `${e.path}: ${e.message}`)
      .join("; ");
    super(`Schema validation failed: ${summary}`);
    this.name = "SchemaValidationError";
    this.errors = errors;
  }
}
