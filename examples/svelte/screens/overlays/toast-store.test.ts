import { describe, expect, it, vi } from 'vitest';
import { createToastStore } from './toast-store';

describe('toast store', () => {
  describe('Positive', () => {
    it('shows no toast until one is asked for', () => {
      expect(createToastStore().snapshot()).toBeNull();
    });

    it('shows the kind of toast that was asked for', () => {
      const store = createToastStore();
      store.show('overlay');
      expect(store.snapshot()?.kind).toBe('overlay');
    });

    it('gives a repeated toast a new id so its timer starts over', () => {
      const store = createToastStore();
      store.show('tree');
      const first = store.snapshot();
      store.show('tree');
      expect(store.snapshot()?.id).not.toBe(first?.id);
    });

    it('hides the toast', () => {
      const store = createToastStore();
      store.show('tree');
      store.hide();
      expect(store.snapshot()).toBeNull();
    });

    it('hands out the same snapshot until something changes', () => {
      const store = createToastStore();
      store.show('tree');
      expect(store.snapshot()).toBe(store.snapshot());
    });

    it('tells a subscriber about each change and stops after unsubscribe', () => {
      const store = createToastStore();
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);
      store.show('tree');
      unsubscribe();
      store.hide();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
