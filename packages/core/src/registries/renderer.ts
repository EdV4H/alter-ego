import type { Renderer, RendererRegistry } from "../types.js";

export class RendererRegistryImpl implements RendererRegistry {
  readonly renderers: Renderer[] = [];

  add(renderer: Renderer): void {
    this.renderers.push(renderer);
  }
}
