// Co-located unit test: PanResponder gesture math, pure JS, no mounting.
// PanResponder.create produces panHandlers (responder props); we call them directly with
// synthetic touch events (the shape the engine synthesizes onto event.nativeEvent), driving one
// finger through grant -> moves -> release, and assert the gestureState: dx/dy is the total delta
// from the grant point, numberActiveTouches tracks the live count, and vx/vy is a plausible
// non-zero velocity. Ported from the headless `pan-responder.smoke.tsx`.

import { beforeAll, describe, expect, it } from 'vitest';
import PanResponder, { type IPanResponderGestureState } from './index';
import { createElement, type ISymbioteEvent } from '@symbiote-native/engine';

const TOUCH_IDENTIFIER = 1;
const TARGET_TAG = 1;
// One touch is "located" at a fixed offset inside the element; page coords drive the gesture,
// location coords ride along to prove the event shape is realistic.
const LOCATION_OFFSET = 5;

interface ISyntheticTouch {
  pageX: number;
  pageY: number;
  locationX: number;
  locationY: number;
  identifier: number;
  timestamp: number;
}

function makeTouch(pageX: number, pageY: number, timestamp: number): ISyntheticTouch {
  return {
    pageX,
    pageY,
    locationX: pageX - LOCATION_OFFSET,
    locationY: pageY - LOCATION_OFFSET,
    identifier: TOUCH_IDENTIFIER,
    timestamp,
  };
}

// A real branded RCTView node so no cast is needed; the gesture never reads it.
const targetNode = createElement('RCTView');

function buildEvent(pageX: number, pageY: number, timestamp: number): ISymbioteEvent {
  const touch = makeTouch(pageX, pageY, timestamp);
  const nativeEvent: Record<string, unknown> = {
    touches: [touch],
    changedTouches: [touch],
    target: TARGET_TAG,
    timestamp,
  };
  return {
    type: 'touch',
    target: targetNode,
    currentTarget: targetNode,
    nativeEvent,
    stopPropagation: () => {},
  };
}

interface ISnapshot {
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  numberActiveTouches: number;
}

function snapshot(gestureState: IPanResponderGestureState): ISnapshot {
  return {
    dx: gestureState.dx,
    dy: gestureState.dy,
    vx: gestureState.vx,
    vy: gestureState.vy,
    numberActiveTouches: gestureState.numberActiveTouches,
  };
}

const GRANT_X = 100;
const GRANT_Y = 200;
const GRANT_T = 1_000;
const FRAME_MS = 16;
const STEP_X = 10;
const STEP_Y = 15;
const MOVE_COUNT = 3;
const PRECISION = 9;

let gateResult: boolean;
let grantSnapshot: ISnapshot | undefined;
const moveSnapshots: ISnapshot[] = [];
let releaseSnapshot: ISnapshot | undefined;

beforeAll(() => {
  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (_event, gestureState) => {
      grantSnapshot = snapshot(gestureState);
    },
    onPanResponderMove: (_event, gestureState) => {
      moveSnapshots.push(snapshot(gestureState));
    },
    onPanResponderRelease: (_event, gestureState) => {
      releaseSnapshot = snapshot(gestureState);
    },
  });
  const { panHandlers } = responder;

  gateResult = panHandlers.onStartShouldSetResponder(buildEvent(GRANT_X, GRANT_Y, GRANT_T));
  panHandlers.onResponderGrant(buildEvent(GRANT_X, GRANT_Y, GRANT_T));

  for (let frame = 1; frame <= MOVE_COUNT; frame++) {
    const x = GRANT_X + STEP_X * frame;
    const y = GRANT_Y + STEP_Y * frame;
    const t = GRANT_T + FRAME_MS * frame;
    panHandlers.onResponderMove(buildEvent(x, y, t));
  }

  const releaseX = GRANT_X + STEP_X * MOVE_COUNT;
  const releaseY = GRANT_Y + STEP_Y * MOVE_COUNT;
  const releaseT = GRANT_T + FRAME_MS * (MOVE_COUNT + 1);
  panHandlers.onResponderRelease(buildEvent(releaseX, releaseY, releaseT));
});

describe('PanResponder', () => {
  it('only becomes responder when onStartShouldSetPanResponder returns true', () => {
    expect(gateResult).toBe(true);
  });

  it('zeroes dx/dy with one active touch on grant', () => {
    expect(grantSnapshot).toBeDefined();
    expect(grantSnapshot?.dx).toBeCloseTo(0, PRECISION);
    expect(grantSnapshot?.dy).toBeCloseTo(0, PRECISION);
    expect(grantSnapshot?.numberActiveTouches).toBe(1);
  });

  it('reports the total delta from the grant point after every move', () => {
    expect(moveSnapshots).toHaveLength(MOVE_COUNT);
    moveSnapshots.forEach((snap, index) => {
      const frame = index + 1;
      expect(snap.dx).toBeCloseTo(STEP_X * frame, PRECISION);
      expect(snap.dy).toBeCloseTo(STEP_Y * frame, PRECISION);
      expect(snap.numberActiveTouches).toBe(1);
    });
  });

  it('reports a non-zero velocity in the dragged direction', () => {
    const lastMove = moveSnapshots[moveSnapshots.length - 1];
    expect(lastMove).toBeDefined();
    expect(lastMove.vx).toBeCloseTo(STEP_X / FRAME_MS, PRECISION);
    expect(lastMove.vy).toBeCloseTo(STEP_Y / FRAME_MS, PRECISION);
    expect(lastMove.vx).toBeGreaterThan(0);
    expect(lastMove.vy).toBeGreaterThan(0);
  });

  it('still reflects the full drag on release', () => {
    expect(releaseSnapshot).toBeDefined();
    expect(releaseSnapshot?.dx).toBeCloseTo(STEP_X * MOVE_COUNT, PRECISION);
    expect(releaseSnapshot?.dy).toBeCloseTo(STEP_Y * MOVE_COUNT, PRECISION);
  });

  it('re-initializes the accumulator for a fresh gesture', () => {
    let secondGrant: ISnapshot | undefined;
    const second = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (_event, gestureState) => {
        secondGrant = snapshot(gestureState);
      },
    });
    second.panHandlers.onStartShouldSetResponderCapture(buildEvent(0, 0, 2_000));
    second.panHandlers.onResponderGrant(buildEvent(0, 0, 2_000));
    expect(secondGrant).toBeDefined();
    expect(secondGrant?.dx).toBeCloseTo(0, PRECISION);
    expect(secondGrant?.dy).toBeCloseTo(0, PRECISION);
  });

  it('getInteractionHandle() always returns null (deprecated, kept for shape parity)', () => {
    const responder = PanResponder.create({});
    expect(responder.getInteractionHandle()).toBeNull();
  });
});

describe('PanResponder should-set defaults (no callback configured)', () => {
  // why: an omitted onStartShouldSetPanResponder/onMoveShouldSetPanResponder must
  // deny the gesture by default -- a View spreading bare panHandlers with only
  // (say) onPanResponderMove configured must not silently start claiming touches.
  it('onStartShouldSetResponder / onMoveShouldSetResponder default to false', () => {
    const { panHandlers } = PanResponder.create({});
    expect(panHandlers.onStartShouldSetResponder(buildEvent(0, 0, 0))).toBe(false);
    expect(panHandlers.onMoveShouldSetResponder(buildEvent(0, 0, 0))).toBe(false);
  });

  // why: RN's documented default is implicit consent to a termination request --
  // a responder with no opinion must let another claimant take over.
  it('onResponderTerminationRequest defaults to true', () => {
    const { panHandlers } = PanResponder.create({});
    expect(panHandlers.onResponderTerminationRequest(buildEvent(0, 0, 0))).toBe(true);
  });

  it('onResponderTerminationRequest returns the configured callback result', () => {
    const { panHandlers } = PanResponder.create({ onPanResponderTerminationRequest: () => false });
    expect(panHandlers.onResponderTerminationRequest(buildEvent(0, 0, 0))).toBe(false);
  });

  // why: RN blocks the native responder by default once a PanResponder gesture is
  // granted (DEFAULT_BLOCK_NATIVE_RESPONDER) -- onResponderGrant's return value IS
  // this gate, read by the event layer to decide whether native gets to compete.
  it('onResponderGrant returns true (blocks native) by default', () => {
    const { panHandlers } = PanResponder.create({});
    expect(panHandlers.onResponderGrant(buildEvent(0, 0, 0))).toBe(true);
  });

  it('onResponderGrant returns the configured onShouldBlockNativeResponder result', () => {
    const { panHandlers } = PanResponder.create({ onShouldBlockNativeResponder: () => false });
    expect(panHandlers.onResponderGrant(buildEvent(0, 0, 0))).toBe(false);
  });
});

describe('PanResponder reject / terminate', () => {
  // why: onResponderReject is how a claimant that LOST the responder negotiation
  // finds out -- it must reach the app's onPanResponderReject, not be swallowed.
  it('onResponderReject calls onPanResponderReject', () => {
    let rejected = false;
    const { panHandlers } = PanResponder.create({
      onPanResponderReject: () => {
        rejected = true;
      },
    });
    panHandlers.onResponderReject(buildEvent(0, 0, 0));
    expect(rejected).toBe(true);
  });

  // why: a terminated gesture (responder taken away, e.g. a ScrollView claiming a
  // drag) must both notify the app AND reset the accumulator, so a later,
  // unrelated grant doesn't inherit a stale dx/dy from the cut-short gesture.
  it('onResponderTerminate calls onPanResponderTerminate and resets the accumulator', () => {
    let terminated = false;
    let grantAfterTerminate: ISnapshot | undefined;
    const { panHandlers } = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminate: () => {
        terminated = true;
      },
      onPanResponderGrant: (_event, gestureState) => {
        grantAfterTerminate = snapshot(gestureState);
      },
    });

    panHandlers.onResponderGrant(buildEvent(GRANT_X, GRANT_Y, GRANT_T));
    panHandlers.onResponderMove(buildEvent(GRANT_X + STEP_X, GRANT_Y + STEP_Y, GRANT_T + FRAME_MS));
    panHandlers.onResponderTerminate(
      buildEvent(GRANT_X + STEP_X, GRANT_Y + STEP_Y, GRANT_T + FRAME_MS),
    );
    expect(terminated).toBe(true);

    // A later grant (e.g. a new gesture after the previous one was cut short) must
    // start from a clean dx/dy=0, not the terminated gesture's leftover delta.
    panHandlers.onResponderGrant(buildEvent(0, 0, GRANT_T + FRAME_MS * 2));
    expect(grantAfterTerminate?.dx).toBeCloseTo(0, PRECISION);
    expect(grantAfterTerminate?.dy).toBeCloseTo(0, PRECISION);
  });
});

describe('PanResponder duplicate-frame guard', () => {
  // why: the responder system can dispatch the SAME touch frame twice (two
  // touches changing at once fires the handler twice) -- the second call must be
  // a no-op so the geometry isn't folded in twice, which would double dx for one
  // real movement.
  it('onResponderMove ignores a second call for the same frame timestamp', () => {
    let moveCount = 0;
    let lastDx = 0;
    const { panHandlers } = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_event, gestureState) => {
        moveCount += 1;
        lastDx = gestureState.dx;
      },
    });
    panHandlers.onResponderGrant(buildEvent(GRANT_X, GRANT_Y, GRANT_T));
    const moveEvent = buildEvent(GRANT_X + STEP_X, GRANT_Y + STEP_Y, GRANT_T + FRAME_MS);
    panHandlers.onResponderMove(moveEvent);
    panHandlers.onResponderMove(moveEvent);
    expect(moveCount).toBe(1);
    expect(lastDx).toBeCloseTo(STEP_X, PRECISION);
  });
});

describe('PanResponder multi-touch (no touch-history store)', () => {
  // why: the headless-direct-call centroid fallback must average ALL simultaneous
  // touches, and numberActiveTouches must reflect the true concurrent count --
  // this is the plain-centroid path's own multi-touch behavior, not just the
  // single-finger drag the main describe block exercises.
  it('centroids two simultaneous touches and reports numberActiveTouches = 2', () => {
    let grantSnap: ISnapshot | undefined;
    const { panHandlers } = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (_event, gestureState) => {
        grantSnap = snapshot(gestureState);
      },
    });

    const touchA = makeTouch(100, 200, 1_000);
    const touchB = makeTouch(300, 400, 1_000);
    const event: ISymbioteEvent = {
      type: 'touch',
      target: targetNode,
      currentTarget: targetNode,
      nativeEvent: {
        touches: [touchA, touchB],
        changedTouches: [touchA, touchB],
        timestamp: 1_000,
      },
      stopPropagation: () => {},
    };
    panHandlers.onResponderGrant(event);

    expect(grantSnap?.numberActiveTouches).toBe(2);
    // x0/y0 (read via a subsequent move's dx=0 baseline) is the centroid of both touches.
    expect(grantSnap?.dx).toBeCloseTo(0, PRECISION);
  });
});

describe('PanResponder touch-history store (RN-faithful multitouch)', () => {
  // Minimal ITouchHistory-shaped fakes, hand-built (not via the real touch-history
  // module) so the exact boundary timestamps that exercise centroidDimension's
  // branches are fully controlled.
  function historyEvent(
    touches: ISyntheticTouch[],
    touchHistory: Record<string, unknown>,
  ): ISymbioteEvent {
    return {
      type: 'touch',
      target: targetNode,
      currentTarget: targetNode,
      nativeEvent: { touches, changedTouches: touches, touchHistory },
      stopPropagation: () => {},
    };
  }

  // why: this IS the reason touch-history-based geometry exists (per the source's
  // own comment) -- a finger that stops moving must stop contributing to dx,
  // rather than diluting the centroid average with its unchanged position.
  it('a stationary touch does not dilute dx once another touch moves', () => {
    const grantHistory = {
      touchBank: [
        {
          touchActive: true,
          currentPageX: 100,
          currentPageY: 0,
          currentTimeStamp: 1_000,
          previousPageX: 100,
          previousPageY: 0,
        },
        {
          touchActive: true,
          currentPageX: 300,
          currentPageY: 0,
          currentTimeStamp: 1_000,
          previousPageX: 300,
          previousPageY: 0,
        },
      ],
      numberActiveTouches: 2,
      indexOfSingleActiveTouch: -1,
      mostRecentTimeStamp: 1_000,
    };

    let grantSnap: ISnapshot | undefined;
    let moveSnap: ISnapshot | undefined;
    const { panHandlers } = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (_e, gestureState) => {
        grantSnap = snapshot(gestureState);
      },
      onPanResponderMove: (_e, gestureState) => {
        moveSnap = snapshot(gestureState);
      },
    });
    panHandlers.onResponderGrant(
      historyEvent([makeTouch(100, 0, 1_000), makeTouch(300, 0, 1_000)], grantHistory),
    );
    expect(grantSnap?.numberActiveTouches).toBe(2);

    // Move frame: touch A moved +50 to x=150 at t=1016; touch B's record is
    // UNCHANGED and its currentTimeStamp is left at 500 -- BEFORE the grant's
    // accounted-for time (1000), so the `>= touchesChangedAfter` scan excludes it,
    // exactly modeling "B never reported a move after the gesture was granted".
    const moveHistory = {
      touchBank: [
        {
          touchActive: true,
          currentPageX: 150,
          currentPageY: 0,
          currentTimeStamp: 1_016,
          previousPageX: 100,
          previousPageY: 0,
        },
        {
          touchActive: true,
          currentPageX: 300,
          currentPageY: 0,
          currentTimeStamp: 500,
          previousPageX: 300,
          previousPageY: 0,
        },
      ],
      numberActiveTouches: 2,
      indexOfSingleActiveTouch: -1,
      mostRecentTimeStamp: 1_016,
    };
    panHandlers.onResponderMove(
      historyEvent([makeTouch(150, 0, 1_016), makeTouch(300, 0, 1_016)], moveHistory),
    );

    // Only A's +50 delta counts -- if B's stale-but-included position had diluted
    // the centroid average, dx would be 25 (the two-touch average) instead of 50.
    expect(moveSnap?.dx).toBeCloseTo(50, PRECISION);
    expect(moveSnap?.numberActiveTouches).toBe(2);
  });

  // why: centroidDimension takes a DIFFERENT fast path (a strict `>`, not `>=`)
  // when exactly one touch is active, reading touchBank[indexOfSingleActiveTouch]
  // directly instead of scanning -- this is a genuinely separate branch from both
  // the plain-centroid (no touchHistory) path and the multi-touch scan above.
  it('uses the single-active-touch fast path when touchHistory reports exactly one touch', () => {
    const grantHistory = {
      touchBank: [
        {
          touchActive: true,
          currentPageX: 100,
          currentPageY: 200,
          currentTimeStamp: 1_000,
          previousPageX: 100,
          previousPageY: 200,
        },
      ],
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: 1_000,
    };
    const moveHistory = {
      touchBank: [
        {
          touchActive: true,
          currentPageX: 130,
          currentPageY: 200,
          currentTimeStamp: 1_016,
          previousPageX: 100,
          previousPageY: 200,
        },
      ],
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: 1_016,
    };

    let moveSnap: ISnapshot | undefined;
    const { panHandlers } = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_e, gestureState) => {
        moveSnap = snapshot(gestureState);
      },
    });
    panHandlers.onResponderGrant(historyEvent([makeTouch(100, 200, 1_000)], grantHistory));
    panHandlers.onResponderMove(historyEvent([makeTouch(130, 200, 1_016)], moveHistory));

    expect(moveSnap?.dx).toBeCloseTo(30, PRECISION);
    expect(moveSnap?.numberActiveTouches).toBe(1);
  });
});
