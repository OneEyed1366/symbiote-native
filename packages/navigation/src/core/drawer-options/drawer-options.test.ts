// Co-located unit test (ADR 0025) for the pure drawer geometry/swipe math - sibling to
// drawer-router-state.test.ts. Everything here is a plain predicate/fold over numbers and the
// IDrawerOptions surface, so the full matrix (4 drawerTypes x 2 drawerPositions for the geometry,
// both edges for the swipe gates) is exercised directly, without the fake-touch-event plumbing
// react/drawer.test.tsx needs to drive the same math through a live gesture.
//
// No Negative group anywhere in this file: every symbol here is a total function over its input
// type (no guard clause, no throw). A "rejected" gesture/geometry situation surfaces as a `false`/
// zero return, not an exception, so it is asserted inline within that symbol's own describe block
// rather than split into a separate Negative section.

import { describe, expect, it } from 'vitest';
import { createElement } from '@symbiote-native/engine';
import type {
  IPanResponderGestureState,
  ISymbioteEvent,
} from '@symbiote-native/engine';
import {
  DRAWER_DEFAULT_POSITION,
  DRAWER_DEFAULT_TYPE,
  DRAWER_DEFAULT_WIDTH,
  clamp01,
  isDrawerAnimated,
  isDrawerOverlayVisible,
  isHorizontalDrag,
  isSwipeStartInEdge,
  resolveDragProgress,
  resolveDrawerGeometry,
  resolveDrawerPosition,
  resolveDrawerSlotInterpolation,
  resolveDrawerType,
  resolveDrawerWidth,
  resolveSwipeIntent,
  shouldClaimDrawerSwipe,
  startPageXOf,
} from './index';
import type { IDrawerGeometry, IDrawerOptions } from './index';

// A real branded RCTView node so no cast is needed (mirrors
// core/engine/src/pan-responder/pan-responder.test.ts's own targetNode) - the gesture math here
// never reads target/currentTarget, only nativeEvent.
const fakeTarget = createElement('RCTView');

function fakeEvent(nativeEvent: Record<string, unknown>): ISymbioteEvent {
  return {
    type: 'test',
    target: fakeTarget,
    currentTarget: fakeTarget,
    nativeEvent,
    stopPropagation: () => {},
  };
}

function gestureState(
  overrides: Partial<IPanResponderGestureState>,
): IPanResponderGestureState {
  return {
    stateID: 1,
    moveX: 0,
    moveY: 0,
    x0: 0,
    y0: 0,
    dx: 0,
    dy: 0,
    vx: 0,
    vy: 0,
    numberActiveTouches: 1,
    _accountsForMovesUpTo: 0,
    ...overrides,
  };
}

describe('resolveDrawerWidth / resolveDrawerType / resolveDrawerPosition', () => {
  // why: geometry, swipe-edge and drag-progress math all read these through the same `?? DEFAULT`
  // fallback (resolveDrawerWidth etc.) instead of each re-deriving its own default, so a caller
  // that omits an option gets the SAME behavior everywhere - proven directly here rather than only
  // implied by every other describe block passing a full IDrawerOptions.
  it('resolveDrawerWidth falls back to the documented default (280) when unset', () => {
    expect(resolveDrawerWidth({})).toBe(DRAWER_DEFAULT_WIDTH);
  });

  it('resolveDrawerWidth honors an explicit width over the default', () => {
    expect(resolveDrawerWidth({ drawerWidth: 320 })).toBe(320);
  });

  it('resolveDrawerType falls back to the documented default ("front") when unset', () => {
    expect(resolveDrawerType({})).toBe(DRAWER_DEFAULT_TYPE);
  });

  it('resolveDrawerType honors an explicit type over the default', () => {
    expect(resolveDrawerType({ drawerType: 'slide' })).toBe('slide');
  });

  it('resolveDrawerPosition falls back to the documented default ("left") when unset', () => {
    expect(resolveDrawerPosition({})).toBe(DRAWER_DEFAULT_POSITION);
  });

  it('resolveDrawerPosition honors an explicit position over the default', () => {
    expect(resolveDrawerPosition({ drawerPosition: 'right' })).toBe('right');
  });
});

describe('resolveDrawerGeometry', () => {
  const WIDTH = DRAWER_DEFAULT_WIDTH;

  it('front + left: only the panel moves off/on screen, content stays put', () => {
    expect(
      resolveDrawerGeometry({ drawerType: 'front', drawerPosition: 'left' }),
    ).toEqual({
      panelTranslateXClosed: -WIDTH,
      panelTranslateXOpen: 0,
      contentTranslateXClosed: 0,
      contentTranslateXOpen: 0,
      overlayOpacityClosed: 0,
      overlayOpacityOpen: 1,
    });
  });

  it('front + right: the panel closes toward the opposite edge from left', () => {
    expect(
      resolveDrawerGeometry({ drawerType: 'front', drawerPosition: 'right' }),
    ).toEqual({
      panelTranslateXClosed: WIDTH,
      panelTranslateXOpen: 0,
      contentTranslateXClosed: 0,
      contentTranslateXOpen: 0,
      overlayOpacityClosed: 0,
      overlayOpacityOpen: 1,
    });
  });

  it('back + left: only the content slides away; the panel never translates', () => {
    expect(
      resolveDrawerGeometry({ drawerType: 'back', drawerPosition: 'left' }),
    ).toEqual({
      panelTranslateXClosed: 0,
      panelTranslateXOpen: 0,
      contentTranslateXClosed: 0,
      contentTranslateXOpen: WIDTH,
      overlayOpacityClosed: 0,
      overlayOpacityOpen: 0,
    });
  });

  it('back + right: content slides the mirrored way, still no overlay', () => {
    expect(
      resolveDrawerGeometry({ drawerType: 'back', drawerPosition: 'right' }),
    ).toEqual({
      panelTranslateXClosed: 0,
      panelTranslateXOpen: 0,
      contentTranslateXClosed: 0,
      contentTranslateXOpen: -WIDTH,
      overlayOpacityClosed: 0,
      overlayOpacityOpen: 0,
    });
  });

  it('slide + left: panel and content move together by the same delta', () => {
    expect(
      resolveDrawerGeometry({ drawerType: 'slide', drawerPosition: 'left' }),
    ).toEqual({
      panelTranslateXClosed: -WIDTH,
      panelTranslateXOpen: 0,
      contentTranslateXClosed: 0,
      contentTranslateXOpen: WIDTH,
      overlayOpacityClosed: 0,
      overlayOpacityOpen: 1,
    });
  });

  it('slide + right: both translate toward the mirrored side', () => {
    expect(
      resolveDrawerGeometry({ drawerType: 'slide', drawerPosition: 'right' }),
    ).toEqual({
      panelTranslateXClosed: WIDTH,
      panelTranslateXOpen: 0,
      contentTranslateXClosed: 0,
      contentTranslateXOpen: -WIDTH,
      overlayOpacityClosed: 0,
      overlayOpacityOpen: 1,
    });
  });

  // The file's own header comment claims "permanent: static, all zero", but the switch falls
  // through to the SAME branch as 'front' - panelTranslateXClosed/overlayOpacityOpen are NOT
  // zero here. Harmless at runtime only because every call site (react/drawer.ts) gates the
  // animated interpolation behind isDrawerAnimated() and never reads these numbers for
  // 'permanent' - but the comment is inaccurate about what this function itself returns.
  it('permanent + left: falls through to front\'s non-zero offsets, not "all zero"', () => {
    expect(
      resolveDrawerGeometry({
        drawerType: 'permanent',
        drawerPosition: 'left',
      }),
    ).toEqual({
      panelTranslateXClosed: -WIDTH,
      panelTranslateXOpen: 0,
      contentTranslateXClosed: 0,
      contentTranslateXOpen: 0,
      overlayOpacityClosed: 0,
      overlayOpacityOpen: 1,
    });
  });

  it('permanent + right: mirrors front + right', () => {
    expect(
      resolveDrawerGeometry({
        drawerType: 'permanent',
        drawerPosition: 'right',
      }),
    ).toEqual({
      panelTranslateXClosed: WIDTH,
      panelTranslateXOpen: 0,
      contentTranslateXClosed: 0,
      contentTranslateXOpen: 0,
      overlayOpacityClosed: 0,
      overlayOpacityOpen: 1,
    });
  });

  it('honors an explicit drawerWidth instead of the default', () => {
    const options: IDrawerOptions = {
      drawerType: 'front',
      drawerPosition: 'left',
      drawerWidth: 200,
    };
    expect(resolveDrawerGeometry(options).panelTranslateXClosed).toBe(-200);
  });
});

describe('isDrawerAnimated', () => {
  // why: 'permanent' is the ONLY type with no gesture/animation - callers gate the whole
  // interpolation + PanResponder setup behind this before touching resolveDrawerGeometry's
  // (comment-flagged-inaccurate, see above) non-zero permanent output.
  it('is true for every animated type (front/back/slide)', () => {
    expect(isDrawerAnimated({ drawerType: 'front' })).toBe(true);
    expect(isDrawerAnimated({ drawerType: 'back' })).toBe(true);
    expect(isDrawerAnimated({ drawerType: 'slide' })).toBe(true);
  });

  it('is false for permanent', () => {
    expect(isDrawerAnimated({ drawerType: 'permanent' })).toBe(false);
  });

  it('defaults to animated ("front") when drawerType is unset', () => {
    expect(isDrawerAnimated({})).toBe(true);
  });
});

describe('isDrawerOverlayVisible', () => {
  // why: matches resolveDrawerGeometry's own overlayOpacityOpen split - front/slide fade in an
  // overlay, back/permanent never do (back's stationary panel sits fully behind the content, so
  // nothing needs dimming).
  it('is true for front and slide (the overlay-fading types)', () => {
    expect(isDrawerOverlayVisible({ drawerType: 'front' })).toBe(true);
    expect(isDrawerOverlayVisible({ drawerType: 'slide' })).toBe(true);
  });

  it('is false for back and permanent (no overlay)', () => {
    expect(isDrawerOverlayVisible({ drawerType: 'back' })).toBe(false);
    expect(isDrawerOverlayVisible({ drawerType: 'permanent' })).toBe(false);
  });
});

describe('resolveDrawerSlotInterpolation', () => {
  // A hand-built geometry (not routed through resolveDrawerGeometry) with every field distinct,
  // so a slot that reads the WRONG field of the geometry fails loudly instead of coincidentally
  // matching thanks to two fields sharing a value.
  const geometry: IDrawerGeometry = {
    panelTranslateXClosed: -280,
    panelTranslateXOpen: 0,
    contentTranslateXClosed: 0,
    contentTranslateXOpen: 140,
    overlayOpacityClosed: 0,
    overlayOpacityOpen: 1,
  };

  it('content slot interpolates its own translateX field only', () => {
    expect(resolveDrawerSlotInterpolation(geometry, 'content')).toEqual({
      translateX: { inputRange: [0, 1], outputRange: [0, 140] },
    });
  });

  it('panel slot interpolates its own translateX field only', () => {
    expect(resolveDrawerSlotInterpolation(geometry, 'panel')).toEqual({
      translateX: { inputRange: [0, 1], outputRange: [-280, 0] },
    });
  });

  // why: the file's own header comment calls out this asymmetry - overlay's translateX tracks
  // CONTENT's delta, not its own (there is no "overlay" field on IDrawerGeometry at all), because
  // for `slide` the content itself moves away and an overlay pinned full-screen would stop
  // covering it. Asserting against panelTranslateX* (140 vs -280) proves it is content's number,
  // not a coincidence of the fixture.
  it('overlay slot interpolates opacity AND a translateX that tracks CONTENT, not panel', () => {
    expect(resolveDrawerSlotInterpolation(geometry, 'overlay')).toEqual({
      opacity: { inputRange: [0, 1], outputRange: [0, 1] },
      translateX: { inputRange: [0, 1], outputRange: [0, 140] },
    });
  });
});

describe('isSwipeStartInEdge', () => {
  const SCREEN_WIDTH = 375;

  it('left position, closed: a start within the edge zone counts', () => {
    expect(
      isSwipeStartInEdge(20, SCREEN_WIDTH, false, { drawerPosition: 'left' }),
    ).toBe(true);
  });

  it('left position, closed: a start past the edge zone does not count', () => {
    expect(
      isSwipeStartInEdge(40, SCREEN_WIDTH, false, { drawerPosition: 'left' }),
    ).toBe(false);
  });

  it('right position, closed: a start within the edge zone (measured from the right) counts', () => {
    expect(
      isSwipeStartInEdge(360, SCREEN_WIDTH, false, { drawerPosition: 'right' }),
    ).toBe(true);
  });

  it('right position, closed: a start past the edge zone does not count', () => {
    expect(
      isSwipeStartInEdge(300, SCREEN_WIDTH, false, { drawerPosition: 'right' }),
    ).toBe(false);
  });

  it('open: any start position counts, regardless of position or distance from the edge', () => {
    expect(
      isSwipeStartInEdge(-9_999, SCREEN_WIDTH, true, {
        drawerPosition: 'left',
      }),
    ).toBe(true);
    expect(
      isSwipeStartInEdge(9_999, SCREEN_WIDTH, true, {
        drawerPosition: 'right',
      }),
    ).toBe(true);
  });

  it('honors a custom swipeEdgeWidth over the default', () => {
    const options: IDrawerOptions = {
      drawerPosition: 'left',
      swipeEdgeWidth: 100,
    };
    expect(isSwipeStartInEdge(80, SCREEN_WIDTH, false, options)).toBe(true);
  });
});

describe('isHorizontalDrag', () => {
  it('claims a drag once dx clears the threshold and dominates dy', () => {
    expect(isHorizontalDrag(gestureState({ dx: 10, dy: 2 }))).toBe(true);
  });

  it('does not claim a drag at the threshold boundary', () => {
    expect(isHorizontalDrag(gestureState({ dx: 5, dy: 0 }))).toBe(false);
  });

  it('claims a drag one unit past the threshold', () => {
    expect(isHorizontalDrag(gestureState({ dx: 6, dy: 0 }))).toBe(true);
  });

  it('does not claim a diagonal drag where the vertical component dominates', () => {
    expect(isHorizontalDrag(gestureState({ dx: 10, dy: 20 }))).toBe(false);
  });
});

describe('resolveSwipeIntent', () => {
  it('left position: distance past the threshold opens a closed drawer', () => {
    const intent = resolveSwipeIntent(gestureState({ dx: 100, vx: 0 }), false, {
      drawerPosition: 'left',
    });
    expect(intent).toBe('open');
  });

  it('left position: distance past the threshold in reverse closes an open drawer', () => {
    const intent = resolveSwipeIntent(gestureState({ dx: -100, vx: 0 }), true, {
      drawerPosition: 'left',
    });
    expect(intent).toBe('close');
  });

  it('velocity past its threshold overrides a short reverse-direction drag', () => {
    // dx alone (-10) is both too short and points the wrong way, but a fast flick (vx clears
    // swipeMinVelocity) still opens - matches the source comment's "a fast flick can reverse a
    // short drag".
    const intent = resolveSwipeIntent(gestureState({ dx: -10, vx: 1 }), false, {
      drawerPosition: 'left',
    });
    expect(intent).toBe('open');
  });

  it('neither threshold met snaps back to the current closed state', () => {
    const intent = resolveSwipeIntent(
      gestureState({ dx: 10, vx: 0.1 }),
      false,
      {
        drawerPosition: 'left',
      },
    );
    expect(intent).toBe('close');
  });

  it('neither threshold met snaps back to the current open state', () => {
    const intent = resolveSwipeIntent(
      gestureState({ dx: -10, vx: -0.1 }),
      true,
      {
        drawerPosition: 'left',
      },
    );
    expect(intent).toBe('open');
  });

  it('right position: the physical drag direction that opens is mirrored', () => {
    const intent = resolveSwipeIntent(
      gestureState({ dx: -100, vx: 0 }),
      false,
      {
        drawerPosition: 'right',
      },
    );
    expect(intent).toBe('open');
  });

  it('right position: the physical drag direction that closes is mirrored', () => {
    const intent = resolveSwipeIntent(gestureState({ dx: 100, vx: 0 }), true, {
      drawerPosition: 'right',
    });
    expect(intent).toBe('close');
  });

  it('honors custom swipeMinDistance/swipeMinVelocity over the defaults', () => {
    const options: IDrawerOptions = {
      drawerPosition: 'left',
      swipeMinDistance: 10,
      swipeMinVelocity: 5,
    };
    expect(
      resolveSwipeIntent(gestureState({ dx: 15, vx: 0 }), false, options),
    ).toBe('open');
  });
});

describe('clamp01', () => {
  it('passes a value already inside [0, 1] through unchanged', () => {
    expect(clamp01(0.5)).toBe(0.5);
  });

  it('clamps below zero up to zero', () => {
    expect(clamp01(-0.3)).toBe(0);
  });

  it('clamps above one down to one', () => {
    expect(clamp01(1.3)).toBe(1);
  });
});

describe('startPageXOf', () => {
  it('reads pageX directly off the event when present', () => {
    expect(startPageXOf(fakeEvent({ pageX: 42 }))).toBe(42);
  });

  it('falls back to touches[0].pageX when the event carries no direct pageX', () => {
    expect(startPageXOf(fakeEvent({ touches: [{ pageX: 7 }] }))).toBe(7);
  });

  it('returns undefined when neither shape carries a usable number', () => {
    expect(startPageXOf(fakeEvent({}))).toBeUndefined();
  });
});

describe('resolveDragProgress', () => {
  const WIDTH = DRAWER_DEFAULT_WIDTH;

  it('left position: a rightward drag adds toward open', () => {
    const progress = resolveDragProgress(gestureState({ dx: WIDTH / 2 }), 0, {
      drawerPosition: 'left',
    });
    expect(progress).toBeCloseTo(0.5);
  });

  it('right position: the same rightward drag subtracts (mirrored sign)', () => {
    const progress = resolveDragProgress(gestureState({ dx: WIDTH / 2 }), 1, {
      drawerPosition: 'right',
    });
    expect(progress).toBeCloseTo(0.5);
  });

  it('clamps the result to [0, 1] past either end', () => {
    expect(
      resolveDragProgress(gestureState({ dx: WIDTH * 2 }), 0, {
        drawerPosition: 'left',
      }),
    ).toBe(1);
    expect(
      resolveDragProgress(gestureState({ dx: -WIDTH * 2 }), 1, {
        drawerPosition: 'left',
      }),
    ).toBe(0);
  });
});

describe('shouldClaimDrawerSwipe', () => {
  const SCREEN_WIDTH = 375;

  it('claims a start-phase edge swipe on a closed left drawer', () => {
    const claimed = shouldClaimDrawerSwipe(
      fakeEvent({ pageX: 20 }),
      gestureState({}),
      SCREEN_WIDTH,
      false,
      { drawerPosition: 'left' },
      'start',
    );
    expect(claimed).toBe(true);
  });

  it('rejects a start-phase swipe that begins outside the edge zone', () => {
    const claimed = shouldClaimDrawerSwipe(
      fakeEvent({ pageX: 200 }),
      gestureState({}),
      SCREEN_WIDTH,
      false,
      { drawerPosition: 'left' },
      'start',
    );
    expect(claimed).toBe(false);
  });

  it('rejects when swipeEnabled is false, regardless of edge/direction', () => {
    const claimed = shouldClaimDrawerSwipe(
      fakeEvent({ pageX: 20 }),
      gestureState({}),
      SCREEN_WIDTH,
      false,
      { drawerPosition: 'left', swipeEnabled: false },
      'start',
    );
    expect(claimed).toBe(false);
  });

  it('rejects a permanent drawer (never animated, never swipeable)', () => {
    const claimed = shouldClaimDrawerSwipe(
      fakeEvent({ pageX: 20 }),
      gestureState({}),
      SCREEN_WIDTH,
      false,
      { drawerPosition: 'left', drawerType: 'permanent' },
      'start',
    );
    expect(claimed).toBe(false);
  });

  it('move phase additionally requires a dominant horizontal drag', () => {
    const verticalDrag = gestureState({ dx: 10, dy: 20 });
    const claimed = shouldClaimDrawerSwipe(
      fakeEvent({ pageX: 20 }),
      verticalDrag,
      SCREEN_WIDTH,
      false,
      { drawerPosition: 'left' },
      'move',
    );
    expect(claimed).toBe(false);
  });

  it('move phase claims once the drag is dominantly horizontal, from an edge start', () => {
    const horizontalDrag = gestureState({ dx: 10, dy: 2 });
    const claimed = shouldClaimDrawerSwipe(
      fakeEvent({ pageX: 20 }),
      horizontalDrag,
      SCREEN_WIDTH,
      false,
      { drawerPosition: 'left' },
      'move',
    );
    expect(claimed).toBe(true);
  });

  it('an open drawer accepts a swipe-to-close start from anywhere, not just the edge', () => {
    const claimed = shouldClaimDrawerSwipe(
      fakeEvent({ pageX: 200 }),
      gestureState({}),
      SCREEN_WIDTH,
      true,
      { drawerPosition: 'left' },
      'start',
    );
    expect(claimed).toBe(true);
  });
});
