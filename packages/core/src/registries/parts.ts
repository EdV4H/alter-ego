import type { Asset, Part } from "@edv4h/alter-ego-schema";
import { FragmentConflictError } from "../errors.js";
import type { PartsFragment, PartsRegistry } from "../types.js";

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, (b as unknown[])[i]));
  }
  if (typeof a === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => deepEqual(ao[k], bo[k]));
  }
  return false;
}

export class PartsRegistryImpl implements PartsRegistry {
  readonly parts: Part[] = [];
  readonly assets: Asset[] = [];

  addFragment(fragment: PartsFragment): void {
    if (fragment.parts) {
      for (const p of fragment.parts) this.upsertPart(p);
    }
    if (fragment.assets) {
      for (const a of fragment.assets) this.upsertAsset(a);
    }
  }

  private upsertPart(p: Part): void {
    const existing = this.parts.find((x) => x.id === p.id);
    if (!existing) {
      this.parts.push(p);
      return;
    }
    if (!deepEqual(existing, p)) {
      throw new FragmentConflictError("parts", p.id, existing, p);
    }
  }

  private upsertAsset(a: Asset): void {
    const existing = this.assets.find((x) => x.id === a.id);
    if (!existing) {
      this.assets.push(a);
      return;
    }
    if (!deepEqual(existing, a)) {
      throw new FragmentConflictError("assets", a.id, existing, a);
    }
  }

  findAsset(id: string): Asset | undefined {
    return this.assets.find((a) => a.id === id);
  }
}
