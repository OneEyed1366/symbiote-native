import {
  createIncomingShareStore,
  INCOMING_SHARE_CHANGE,
} from './incoming-share-store';
import { withShareActions } from './incoming-share-result';
import type { IIncomingShareStore } from './incoming-share-store';
import type { IIncomingShareSnapshot, IUseIncomingShareResult } from './types';

// Getter-shaped `useIncomingShare` for the adapters whose event-value hook takes a source getter
// (Vue, Solid, Svelte, Angular). `readBox` unwraps that adapter's reactive box and `derive` wraps
// the result in its own computed, React keeps its own wiring since it passes the source directly
export function createIncomingShareHook<TSnapshotBox, TResultBox>(
  createEventValueHook: (
    event: typeof INCOMING_SHARE_CHANGE,
    getValue: (store: IIncomingShareStore) => IIncomingShareSnapshot,
  ) => (getSource: () => IIncomingShareStore) => TSnapshotBox,
  readBox: (box: TSnapshotBox) => IIncomingShareSnapshot,
  derive: (compute: () => IUseIncomingShareResult) => TResultBox,
): () => TResultBox {
  const useShareSnapshot = createEventValueHook(INCOMING_SHARE_CHANGE, store =>
    store.getSnapshot(),
  );
  return function useIncomingShare(): TResultBox {
    const store = createIncomingShareStore();
    const snapshotBox = useShareSnapshot(() => store);
    return derive(() => withShareActions(readBox(snapshotBox), store));
  };
}
