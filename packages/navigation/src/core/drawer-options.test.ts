// Co-located unit test (ADR 0025) for the pure drawer geometry/swipe math — sibling to
// drawer-router-state.test.ts. Everything here is a plain predicate/fold over numbers and the
// IDrawerOptions surface, so the full matrix (4 drawerTypes x 2 drawerPositions for the geometry,
// both edges for the swipe gates) is exercised directly, without the fake-touch-event plumbing
// react/drawer.test.tsx needs to drive the same math through a live gesture.

import { describe, expect, it } from 'vitest';
import type { IPanResponderGestureState } from '@symbiote-native/engine';
import {
  DRAWER_DEFAULT_WIDTH,
  isHorizontalDrag,
  isSwipeStartInEdge,
  resolveDrawerGeometry,
  resolveSwipeIntent,
} from './drawer-options';
import type { IDrawerOptions } from './drawer-options';

function gestureState(overrides: Partial<IPanResponderGestureState>): IPanResponderGestureState {
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

describe('resolveDrawerGeometry', () => {
  const WIDTH = DRAWER_DEFAULT_WIDTH;

  it('front + left: only the panel moves off/on screen, content stays put', () => {
    expect(resolveDrawerGeometry({ drawerType: 'front', drawerPosition: 'left' })).toEqual({
      panelTranslateXClosed: -WIDTH,
      panelTranslateXOpen: 0,
      contentTranslateXClosed: 0,
      contentTranslateXOpen: 0,
      overlayOpacityClosed: 0,
      overlayOpacityOpen: 1,
    });
  });

  it('front + right: the panel closes toward the opposite edge from left', () => {
    expect(resolveDrawerGeometry({ drawerType: 'front', drawerPosition: 'right' })).toEqual({
      panelTranslateXClosed: WIDTH,
      panelTranslateXOpen: 0,
      contentTranslateXClosed: 0,
      contentTranslateXOpen: 0,
      overlayOpacityClosed: 0,
      overlayOpacityOpen: 1,
    });
  });

  it('back + left: only the content slides away; the panel never translates', () => {
    expect(resolveDrawerGeometry({ drawerType: 'back', drawerPosition: 'left' })).toEqual({
      panelTranslateXClosed: 0,
      panelTranslateXOpen: 0,
      contentTranslateXClosed: 0,
      contentTranslateXOpen: WIDTH,
      overlayOpacityClosed: 0,
      overlayOpacityOpen: 0,
    });
  });

  it('back + right: content slides the mirrored way, still no overlay', () => {
    expect(resolveDrawerGeometry({ drawerType: 'back', drawerPosition: 'right' })).toEqual({
      panelTranslateXClosed: 0,
      panelTranslateXOpen: 0,
      contentTranslateXClosed: 0,
      contentTranslateXOpen: -WIDTH,
      overlayOpacityClosed: 0,
      overlayOpacityOpen: 0,
    });
  });

  it('slide + left: panel and content move together by the same delta', () => {
    expect(resolveDrawerGeometry({ drawerType: 'slide', drawerPosition: 'left' })).toEqual({
      panelTranslateXClosed: -WIDTH,
      panelTranslateXOpen: 0,
      contentTranslateXClosed: 0,
      contentTranslateXOpen: WIDTH,
      overlayOpacityClosed: 0,
      overlayOpacityOpen: 1,
    });
  });

  it('slide + right: both translate toward the mirrored side', () => {
    expect(resolveDrawerGeometry({ drawerType: 'slide', drawerPosition: 'right' })).toEqual({
      panelTranslateXClosed: WIDTH,
      panelTranslateXOpen: 0,
      contentTranslateXClosed: 0,
      contentTranslateXOpen: -WIDTH,
      overlayOpacityClosed: 0,
      overlayOpacityOpen: 1,
    });
  });

  // The file's own header comment claims "permanent: static, all zero", but the switch falls
  // through to the SAME branch as 'front' — panelTranslateXClosed/overlayOpacityOpen are NOT
  // zero here. Harmless at runtime only because every call site (react/drawer.ts) gates the
  // animated interpolation behind isDrawerAnimated() and never reads these numbers for
  // 'permanent' — but the comment is inaccurate about what this function itself returns.
  it('permanent + left: falls through to front\'s non-zero offsets, not "all zero"', () => {
    expect(resolveDrawerGeometry({ drawerType: 'permanent', drawerPosition: 'left' })).toEqual({
      panelTranslateXClosed: -WIDTH,
      panelTranslateXOpen: 0,
      contentTranslateXClosed: 0,
      contentTranslateXOpen: 0,
      overlayOpacityClosed: 0,
      overlayOpacityOpen: 1,
    });
  });

  it('permanent + right: mirrors front + right', () => {
    expect(resolveDrawerGeometry({ drawerType: 'permanent', drawerPosition: 'right' })).toEqual({
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

describe('isSwipeStartInEdge', () => {
  const SCREEN_WIDTH = 375;

  it('left position, closed: a start within the edge zone counts', () => {
    expect(isSwipeStartInEdge(20, SCREEN_WIDTH, false, { drawerPosition: 'left' })).toBe(true);
  });

  it('left position, closed: a start past the edge zone does not count', () => {
    expect(isSwipeStartInEdge(40, SCREEN_WIDTH, false, { drawerPosition: 'left' })).toBe(false);
  });

  it('right position, closed: a start within the edge zone (measured from the right) counts', () => {
    expect(isSwipeStartInEdge(360, SCREEN_WIDTH, false, { drawerPosition: 'right' })).toBe(true);
  });

  it('right position, closed: a start past the edge zone does not count', () => {
    expect(isSwipeStartInEdge(300, SCREEN_WIDTH, false, { drawerPosition: 'right' })).toBe(false);
  });

  it('open: any start position counts, regardless of position or distance from the edge', () => {
    expect(isSwipeStartInEdge(-9_999, SCREEN_WIDTH, true, { drawerPosition: 'left' })).toBe(true);
    expect(isSwipeStartInEdge(9_999, SCREEN_WIDTH, true, { drawerPosition: 'right' })).toBe(true);
  });

  it('honors a custom swipeEdgeWidth over the default', () => {
    const options: IDrawerOptions = { drawerPosition: 'left', swipeEdgeWidth: 100 };
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
    // swipeMinVelocity) still opens — matches the source comment's "a fast flick can reverse a
    // short drag".
    const intent = resolveSwipeIntent(gestureState({ dx: -10, vx: 1 }), false, {
      drawerPosition: 'left',
    });
    expect(intent).toBe('open');
  });

  it('neither threshold met snaps back to the current closed state', () => {
    const intent = resolveSwipeIntent(gestureState({ dx: 10, vx: 0.1 }), false, {
      drawerPosition: 'left',
    });
    expect(intent).toBe('close');
  });

  it('neither threshold met snaps back to the current open state', () => {
    const intent = resolveSwipeIntent(gestureState({ dx: -10, vx: -0.1 }), true, {
      drawerPosition: 'left',
    });
    expect(intent).toBe('open');
  });

  it('right position: the physical drag direction that opens is mirrored', () => {
    const intent = resolveSwipeIntent(gestureState({ dx: -100, vx: 0 }), false, {
      drawerPosition: 'right',
    });
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
    expect(resolveSwipeIntent(gestureState({ dx: 15, vx: 0 }), false, options)).toBe('open');
  });
});
