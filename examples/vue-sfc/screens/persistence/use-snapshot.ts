import { useExternalStore } from '../use-external-store';
import { createSnapshotStore } from './snapshot-store';

// Outside the screen on purpose: a restore is tried after the stack moved and this screen unmounted
export const snapshotStore = createSnapshotStore();

export function useSnapshot() {
  return useExternalStore(snapshotStore.subscribe, snapshotStore.get);
}
