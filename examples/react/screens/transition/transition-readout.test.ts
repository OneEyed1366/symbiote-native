import { describe, expect, it, vi } from 'vitest';
import { createTransitionReadout } from './transition-readout';

const OPENING = { closing: 0, goingForward: 1 };
const CLOSING = { closing: 1, goingForward: 0 };

describe('transition readout', () => {
  describe('Positive', () => {
    it('starts empty, so the screen can say nothing has run yet', () => {
      expect(createTransitionReadout().snapshot()).toEqual({
        transitions: 0,
        ticks: 0,
        direction: 'none',
        headerHeight: null,
      });
    });

    it('keeps quiet while an opening transition is still running', () => {
      const readout = createTransitionReadout();
      const listener = vi.fn();
      readout.subscribe(listener);

      readout.recordProgress({ progress: 0, ...OPENING });
      readout.recordProgress({ progress: 0.4, ...OPENING });

      expect(listener).not.toHaveBeenCalled();
      expect(readout.snapshot().transitions).toBe(0);
    });

    it('publishes once when an opening reaches 1, with how many ticks it took', () => {
      const readout = createTransitionReadout();
      const listener = vi.fn();
      readout.subscribe(listener);

      readout.recordProgress({ progress: 0, ...OPENING });
      readout.recordProgress({ progress: 0.5, ...OPENING });
      readout.recordProgress({ progress: 1, ...OPENING });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(readout.snapshot()).toMatchObject({
        transitions: 1,
        ticks: 3,
        direction: 'opening',
      });
    });

    it('publishes a closing transition when it reaches 0', () => {
      const readout = createTransitionReadout();

      readout.recordProgress({ progress: 0.6, ...CLOSING });
      readout.recordProgress({ progress: 0, ...CLOSING });

      expect(readout.snapshot()).toMatchObject({
        transitions: 1,
        ticks: 2,
        direction: 'closing',
      });
    });

    it('counts ticks per transition, not across them', () => {
      const readout = createTransitionReadout();

      readout.recordProgress({ progress: 1, ...OPENING });
      readout.recordProgress({ progress: 0.5, ...CLOSING });
      readout.recordProgress({ progress: 0.2, ...CLOSING });
      readout.recordProgress({ progress: 0, ...CLOSING });

      expect(readout.snapshot()).toMatchObject({ transitions: 2, ticks: 3 });
    });

    it('records the header height and tells listeners when it changes', () => {
      const readout = createTransitionReadout();
      const listener = vi.fn();
      readout.subscribe(listener);

      readout.recordHeaderHeight(96);

      expect(readout.snapshot().headerHeight).toBe(96);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('stays silent when the header height did not change', () => {
      const readout = createTransitionReadout();
      readout.recordHeaderHeight(96);
      const listener = vi.fn();
      readout.subscribe(listener);

      readout.recordHeaderHeight(96);

      expect(listener).not.toHaveBeenCalled();
    });

    it('hands the same snapshot back until something is published', () => {
      const readout = createTransitionReadout();
      readout.recordProgress({ progress: 0.3, ...OPENING });

      expect(readout.snapshot()).toBe(readout.snapshot());
    });

    it('stops notifying a listener that unsubscribed', () => {
      const readout = createTransitionReadout();
      const listener = vi.fn();
      const unsubscribe = readout.subscribe(listener);
      unsubscribe();

      readout.recordHeaderHeight(64);

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
