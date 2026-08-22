// Exercises the touch-history store's public surface directly: record a touch, check
// bank/history state, shift on move/end, reset. Independent of the event-routing layer
// that consumes it (events.test.ts covers that indirectly). recordTouchTrack/attachTouchHistory
// never throw — a malformed or coordinate-less touch is silently skipped rather than
// rejected loudly (see normalizeTouch's own comment: "must not perturb the responder
// negotiation") — so the "malformed input" scenarios below are grouped as "ignores", not
// Negative.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  attachTouchHistory,
  recordTouchTrack,
  resetTouchHistory,
  touchHistory,
} from './touch-history';

describe('touch-history store', () => {
  beforeEach(() => {
    resetTouchHistory();
  });

  it('starts empty', () => {
    expect(touchHistory.numberActiveTouches).toBe(0);
    expect(touchHistory.indexOfSingleActiveTouch).toBe(-1);
    expect(touchHistory.mostRecentTimeStamp).toBe(0);
  });

  describe('single-touch lifecycle', () => {
    it('records a touch start into the bank and tracks it as the single active touch', () => {
      recordTouchTrack('start', {
        changedTouches: [
          { identifier: 0, pageX: 10, pageY: 20, timestamp: 100 },
        ],
        touches: [{ identifier: 0, pageX: 10, pageY: 20, timestamp: 100 }],
      });
      expect(touchHistory.numberActiveTouches).toBe(1);
      expect(touchHistory.indexOfSingleActiveTouch).toBe(0);
      expect(touchHistory.mostRecentTimeStamp).toBe(100);

      const record = touchHistory.touchBank[0];
      expect(record?.touchActive).toBe(true);
      expect(record?.startPageX).toBe(10);
      expect(record?.currentPageX).toBe(10);
    });

    it('shifts previous<-current on a move without deactivating the touch', () => {
      recordTouchTrack('start', {
        changedTouches: [
          { identifier: 0, pageX: 10, pageY: 20, timestamp: 100 },
        ],
        touches: [{ identifier: 0, pageX: 10, pageY: 20, timestamp: 100 }],
      });
      recordTouchTrack('move', {
        changedTouches: [
          { identifier: 0, pageX: 15, pageY: 25, timestamp: 110 },
        ],
        touches: [{ identifier: 0, pageX: 15, pageY: 25, timestamp: 110 }],
      });

      const record = touchHistory.touchBank[0];
      expect(record?.touchActive).toBe(true);
      expect(record?.previousPageX).toBe(10);
      expect(record?.currentPageX).toBe(15);
    });

    it('deactivates the touch on end and clears numberActiveTouches', () => {
      recordTouchTrack('start', {
        changedTouches: [
          { identifier: 0, pageX: 10, pageY: 20, timestamp: 100 },
        ],
        touches: [{ identifier: 0, pageX: 10, pageY: 20, timestamp: 100 }],
      });
      recordTouchTrack('end', {
        changedTouches: [
          { identifier: 0, pageX: 10, pageY: 20, timestamp: 120 },
        ],
        touches: [],
      });

      const record = touchHistory.touchBank[0];
      expect(record?.touchActive).toBe(false);
      expect(touchHistory.numberActiveTouches).toBe(0);
    });

    // why: a touch that starts again reuses the SAME bank slot (touch identifiers are
    // stable per gesture) — the reused-slot branch of recordTouchStart is distinct code
    // from the fresh-slot branch and must reset start/current/previous identically.
    it('a touch that starts again on the same identifier resets the existing bank slot', () => {
      recordTouchTrack('start', {
        changedTouches: [
          { identifier: 0, pageX: 10, pageY: 20, timestamp: 100 },
        ],
        touches: [{ identifier: 0, pageX: 10, pageY: 20, timestamp: 100 }],
      });
      recordTouchTrack('end', {
        changedTouches: [
          { identifier: 0, pageX: 10, pageY: 20, timestamp: 120 },
        ],
        touches: [],
      });
      recordTouchTrack('start', {
        changedTouches: [
          { identifier: 0, pageX: 50, pageY: 60, timestamp: 200 },
        ],
        touches: [{ identifier: 0, pageX: 50, pageY: 60, timestamp: 200 }],
      });

      const record = touchHistory.touchBank[0];
      expect(record?.touchActive).toBe(true);
      expect(record?.startPageX).toBe(50);
      expect(record?.previousPageX).toBe(50);
      expect(touchHistory.numberActiveTouches).toBe(1);
      expect(touchHistory.indexOfSingleActiveTouch).toBe(0);
    });
  });

  describe('multi-touch bookkeeping', () => {
    // why: PanResponder's centroid math needs indexOfSingleActiveTouch to stay -1 while
    // MORE than one finger is down — the "exactly one touch" gate on both the start and
    // end paths is the product rule that lets consumers skip the bank scan in the common
    // one-finger case.
    it('indexOfSingleActiveTouch stays -1 while two touches are simultaneously active', () => {
      recordTouchTrack('start', {
        changedTouches: [
          { identifier: 0, pageX: 10, pageY: 20, timestamp: 100 },
          { identifier: 1, pageX: 30, pageY: 40, timestamp: 100 },
        ],
        touches: [
          { identifier: 0, pageX: 10, pageY: 20, timestamp: 100 },
          { identifier: 1, pageX: 30, pageY: 40, timestamp: 100 },
        ],
      });

      expect(touchHistory.numberActiveTouches).toBe(2);
      expect(touchHistory.indexOfSingleActiveTouch).toBe(-1);
    });

    // why: when a second finger lifts, PanResponder needs to resume single-touch dx/vx math
    // for the REMAINING finger — the end-path bank scan must find it even though it was
    // never the one that changed in this frame.
    it('ending one of two touches resolves indexOfSingleActiveTouch to the remaining touch', () => {
      recordTouchTrack('start', {
        changedTouches: [
          { identifier: 0, pageX: 10, pageY: 20, timestamp: 100 },
          { identifier: 1, pageX: 30, pageY: 40, timestamp: 100 },
        ],
        touches: [
          { identifier: 0, pageX: 10, pageY: 20, timestamp: 100 },
          { identifier: 1, pageX: 30, pageY: 40, timestamp: 100 },
        ],
      });
      recordTouchTrack('end', {
        changedTouches: [
          { identifier: 1, pageX: 30, pageY: 40, timestamp: 150 },
        ],
        touches: [{ identifier: 0, pageX: 10, pageY: 20, timestamp: 150 }],
      });

      expect(touchHistory.numberActiveTouches).toBe(1);
      expect(touchHistory.indexOfSingleActiveTouch).toBe(0);
      expect(touchHistory.touchBank[1]?.touchActive).toBe(false);
    });
  });

  describe('resetTouchHistory', () => {
    it('clears the bank and history back to the initial state', () => {
      recordTouchTrack('start', {
        changedTouches: [
          { identifier: 0, pageX: 10, pageY: 20, timestamp: 100 },
        ],
        touches: [{ identifier: 0, pageX: 10, pageY: 20, timestamp: 100 }],
      });
      resetTouchHistory();

      expect(touchHistory.touchBank.length).toBe(0);
      expect(touchHistory.numberActiveTouches).toBe(0);
      expect(touchHistory.indexOfSingleActiveTouch).toBe(-1);
      expect(touchHistory.mostRecentTimeStamp).toBe(0);
    });
  });

  describe('attachTouchHistory', () => {
    it('puts the live touchHistory object onto nativeEvent', () => {
      const nativeEvent: Record<string, unknown> = {};
      attachTouchHistory(nativeEvent);
      expect(nativeEvent.touchHistory).toBe(touchHistory);
    });
  });

  describe('malformed or coordinate-less touches are ignored, never thrown', () => {
    // why: the negotiation smoke sends `{ target }`-only touches with no geometry at all —
    // recording must not perturb responder negotiation, so an ungeometried touch is simply
    // never banked.
    it('a changedTouches entry missing pageX/pageY leaves the bank untouched', () => {
      expect(() =>
        recordTouchTrack('start', {
          changedTouches: [{ identifier: 0, target: 42 }],
          touches: [{ identifier: 0, target: 42 }],
        }),
      ).not.toThrow();

      expect(touchHistory.touchBank[0]).toBeUndefined();
    });

    // why: an identifier outside the sane bank range (RN's MAX_TOUCH_BANK) must not grow the
    // array to an absurd length or crash indexing — it is simply not recordable.
    it('an out-of-range identifier is skipped without growing the bank', () => {
      recordTouchTrack('start', {
        changedTouches: [{ identifier: 999, pageX: 1, pageY: 1, timestamp: 1 }],
        touches: [{ identifier: 999, pageX: 1, pageY: 1, timestamp: 1 }],
      });

      expect(touchHistory.touchBank.length).toBe(0);
    });

    it('a non-array changedTouches/touches is treated as empty, not thrown', () => {
      expect(() =>
        recordTouchTrack('start', { changedTouches: 'nope', touches: 'nope' }),
      ).not.toThrow();
      expect(touchHistory.numberActiveTouches).toBe(0);
    });

    // why: a move for an identifier that never started must be a no-op — shiftTouchRecord
    // must not create a bank entry out of thin air, or a stray/duplicate move event would
    // fabricate touch history for a finger that was never recorded down.
    it('a move for an unrecorded identifier does not create a bank entry', () => {
      recordTouchTrack('move', {
        changedTouches: [{ identifier: 5, pageX: 1, pageY: 1, timestamp: 1 }],
        touches: [{ identifier: 5, pageX: 1, pageY: 1, timestamp: 1 }],
      });

      expect(touchHistory.touchBank[5]).toBeUndefined();
    });
  });
});
