// One text value outside React with a subscription, for `useSyncExternalStore`
export function createSnapshotStore() {
  let snapshot: string | undefined;
  const listeners = new Set<() => void>();

  return {
    get: (): string | undefined => snapshot,
    set(next: string | undefined): void {
      snapshot = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
