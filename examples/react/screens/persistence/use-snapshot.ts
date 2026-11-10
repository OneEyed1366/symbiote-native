import { useSyncExternalStore } from 'react';
import { createSnapshotStore } from './snapshot-store';

// Outside the screen on purpose: a restore is tried after the stack moved and this screen unmounted
export const snapshotStore = createSnapshotStore();

export function useSnapshot(): string | undefined {
  return useSyncExternalStore(snapshotStore.subscribe, snapshotStore.get);
}
