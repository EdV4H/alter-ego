import type { Resource } from "./types.js";

/** ロード済みアセットをメモリにキャッシュする。assetId をキーとする Map。 */
export class ResourceCache {
  private map = new Map<string, Resource>();

  get(assetId: string): Resource | undefined {
    return this.map.get(assetId);
  }

  set(resource: Resource): void {
    this.map.set(resource.assetId, resource);
  }

  asReadonlyMap(): ReadonlyMap<string, Resource> {
    return this.map;
  }
}
