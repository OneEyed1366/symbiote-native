import { createExternalStore } from '../use-external-store';
import { createSnapshotStore } from './snapshot-store';

// Outside the screen on purpose: a restore is tried after the stack moved and this screen unmounted
export const snapshotStore = createSnapshotStore();

export function createSnapshot() {
  return createExternalStore(snapshotStore.subscribe, snapshotStore.get);
}
