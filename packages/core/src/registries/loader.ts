import type { Asset } from "@edv4h/alter-ego-schema";
import { LoaderConflictError } from "../errors.js";
import type { Loader, LoaderRegistry, Resource } from "../types.js";

const SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

function extractScheme(src: string): string {
  const m = SCHEME_RE.exec(src);
  return m != null && m[1] != null ? m[1].toLowerCase() : "";
}

export class LoaderRegistryImpl implements LoaderRegistry {
  private bySchemes = new Map<string, Loader>();

  add(loader: Loader): void {
    for (const raw of loader.schemes) {
      const scheme = raw.toLowerCase();
      if (this.bySchemes.has(scheme)) {
        throw new LoaderConflictError(scheme);
      }
      this.bySchemes.set(scheme, loader);
    }
  }

  async resolve(asset: Asset): Promise<Resource> {
    const scheme = extractScheme(asset.src);
    const loader = this.bySchemes.get(scheme);
    if (!loader) {
      throw new Error(
        `No loader for scheme "${scheme}" (asset="${asset.id}", src="${asset.src}")`,
      );
    }
    if (loader.canHandle && !loader.canHandle(asset)) {
      throw new Error(
        `Loader rejected asset "${asset.id}" via canHandle (scheme="${scheme}")`,
      );
    }
    return loader.load(asset);
  }
}
