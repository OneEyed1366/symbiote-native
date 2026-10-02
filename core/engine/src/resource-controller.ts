// Generic twin of expo-modules-core's `useReleasingSharedObject`. `resolve()` never disposes
// inline - the stale resource waits in `flushDispose()`, called from each adapter's own
// commit/effect phase, matching upstream's own "release outside of render" invariant

export type IResourceController<TKey, TResource> = {
  resolve: (key: TKey) => TResource;
  flushDispose: () => void;
  dispose: () => void;
};

export function createResourceController<TKey, TResource>(
  create: (key: TKey) => TResource,
  dispose: (resource: TResource) => void,
  isSameKey: (a: TKey, b: TKey) => boolean = Object.is,
): IResourceController<TKey, TResource> {
  let current: { key: TKey; resource: TResource } | null = null;
  let pendingDispose: TResource | null = null;

  function resolve(key: TKey): TResource {
    if (current && isSameKey(current.key, key)) return current.resource;
    if (current) pendingDispose = current.resource;
    const resource = create(key);
    current = { key, resource };
    return resource;
  }

  function flushDispose(): void {
    if (pendingDispose) {
      dispose(pendingDispose);
      pendingDispose = null;
    }
  }

  function disposeAll(): void {
    flushDispose();
    if (current) {
      dispose(current.resource);
      current = null;
    }
  }

  return { resolve, flushDispose, dispose: disposeAll };
}
