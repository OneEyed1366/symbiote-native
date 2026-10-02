import type { IIncomingShareStore } from './incoming-share-store';
import type { IIncomingShareSnapshot, IUseIncomingShareResult } from './types';

// Every adapter's `useIncomingShare` reports its own reactive snapshot, the two actions come
// from the store so they are written once
export function withShareActions(
  snapshot: IIncomingShareSnapshot,
  store: IIncomingShareStore,
): IUseIncomingShareResult {
  return {
    ...snapshot,
    clearSharedPayloads: store.clear,
    refreshSharePayloads: () => {
      void store.refresh();
    },
  };
}
