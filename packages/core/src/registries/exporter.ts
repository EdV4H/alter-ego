import type { ExporterRegistry } from "../types.js";

export class ExporterRegistryImpl implements ExporterRegistry {
  private items: unknown[] = [];

  add(exporter: unknown): void {
    this.items.push(exporter);
  }
}
