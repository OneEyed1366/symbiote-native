import { describe, expect, it, vi } from 'vitest';
import { createEventLog } from './event-log';

describe('event log', () => {
  describe('Positive', () => {
    it('lists the newest event first', () => {
      const log = createEventLog(10);
      log.append('focus', 'focus');
      log.append('blur', 'blur');
      expect(log.snapshot().map(line => line.text)).toEqual(['blur', 'focus']);
    });

    it('keeps only the latest lines up to its limit', () => {
      const log = createEventLog(2);
      log.append('a', 'one');
      log.append('b', 'two');
      log.append('c', 'three');
      expect(log.snapshot().map(line => line.text)).toEqual(['three', 'two']);
    });

    it('folds a run of ticks of one kind into a single line that counts them', () => {
      const log = createEventLog(10);
      log.append('progress', 'progress 0.10', { isTick: true });
      log.append('progress', 'progress 0.55', { isTick: true });
      log.append('progress', 'progress 1.00', { isTick: true });
      const lines = log.snapshot();
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ text: 'progress 1.00', count: 3 });
    });

    it('starts a new line when another event interrupts the ticks', () => {
      const log = createEventLog(10);
      log.append('progress', 'progress 0.10', { isTick: true });
      log.append('focus', 'focus');
      log.append('progress', 'progress 0.20', { isTick: true });
      expect(log.snapshot()).toHaveLength(3);
    });

    it('hands out the same snapshot until something is added', () => {
      const log = createEventLog(10);
      log.append('focus', 'focus');
      expect(log.snapshot()).toBe(log.snapshot());
    });

    it('tells a subscriber about each change and stops after unsubscribe', () => {
      const log = createEventLog(10);
      const listener = vi.fn();
      const unsubscribe = log.subscribe(listener);
      log.append('focus', 'focus');
      unsubscribe();
      log.append('blur', 'blur');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('empties on clear', () => {
      const log = createEventLog(10);
      log.append('focus', 'focus');
      log.clear();
      expect(log.snapshot()).toEqual([]);
    });
  });

  describe('Negative', () => {
    it('rejects a limit below one, which could hold no line', () => {
      expect(() => createEventLog(0)).toThrow(
        'event log limit must be at least 1',
      );
    });
  });
});
