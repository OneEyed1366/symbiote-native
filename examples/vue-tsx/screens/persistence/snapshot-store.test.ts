import { describe, expect, it } from 'vitest';
import { createSnapshotStore } from './snapshot-store';

describe('snapshot store', () => {
  describe('Positive', () => {
    it('holds nothing until a snapshot is set', () => {
      expect(createSnapshotStore().get()).toBeUndefined();
    });

    it('tells a subscriber when the snapshot changes', () => {
      const store = createSnapshotStore();
      let calls = 0;
      store.subscribe(() => {
        calls += 1;
      });
      store.set('{}');
      expect(store.get()).toBe('{}');
      expect(calls).toBe(1);
    });

    it('stops telling a subscriber that unsubscribed', () => {
      const store = createSnapshotStore();
      let calls = 0;
      const unsubscribe = store.subscribe(() => {
        calls += 1;
      });
      unsubscribe();
      store.set('{}');
      expect(calls).toBe(0);
    });

    it('keeps two stores apart', () => {
      const first = createSnapshotStore();
      const second = createSnapshotStore();
      first.set('a');
      expect(second.get()).toBeUndefined();
    });
  });
});
