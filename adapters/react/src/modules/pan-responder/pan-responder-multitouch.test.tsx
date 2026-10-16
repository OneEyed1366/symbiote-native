// Co-located React-driven pipeline test, ported from the headless
// `pan-responder-multitouch.smoke`. Proves PanResponder's dx/dy/vx/vy track the
// touch-history bank (the engine's ResponderTouchHistoryStore), not a grant-relative
// centroid of ALL live touches. Two fingers move, then one lifts: each touch's own
// previous->current delta drives the gesture. Expected values cross-checked against a
// faithful RN port; the inline notes mark what a naive single-centroid would report.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, PanResponder } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 170;

const fabric = installRecordingFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

type ISnapshot = {
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  numberActiveTouches: number;
};

type IPoint = {
  pageX: number;
  pageY: number;
  identifier: number;
  timestamp: number;
  // Цель касания это `instanceHandle`, как отдаёт Fabric
  target: unknown;
};

const TOUCH_A = 1;
const TOUCH_B = 2;
const BOX_STYLE = { width: 200, height: 200 };

describe('React PanResponder multitouch through the event layer', () => {
  it('tracks per-touch deltas across two fingers, one lifting mid-gesture', () => {
    const moves: ISnapshot[] = [];
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_event, gesture) => {
        moves.push({
          dx: gesture.dx,
          dy: gesture.dy,
          vx: gesture.vx,
          vy: gesture.vy,
          numberActiveTouches: gesture.numberActiveTouches,
        });
      },
    });

    function App(): ReactElement {
      return <view {...responder.panHandlers} style={BOX_STYLE} />;
    }

    mount(ROOT_TAG, <App />);

    // Вью приложения это RCTView без box-none, box-none у AppContainer
    const viewNode = fabric.find(
      n => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none',
    );
    expect(viewNode, 'PanResponder View was committed').toBeDefined();
    const handle = viewNode?.instanceHandle;
    if (typeof handle !== 'object' || handle === null)
      throw new Error('PanResponder View has no instance handle');

    const point = (
      identifier: number,
      pageX: number,
      pageY: number,
      timestamp: number,
    ): IPoint => ({
      pageX,
      pageY,
      identifier,
      timestamp,
      target: handle,
    });
    const frame = (
      type: string,
      touches: IPoint[],
      changedTouches: IPoint[],
      timestamp: number,
    ): void => {
      fabric.fireEvent(handle, type, {
        touches,
        changedTouches,
        target: handle,
        timestamp,
      });
    };

    // A down at (0,0) t=1000 -> granted (one finger).
    frame(
      'topTouchStart',
      [point(TOUCH_A, 0, 0, 1_000)],
      [point(TOUCH_A, 0, 0, 1_000)],
      1_000,
    );
    // B down at (200,0) t=1000 -> two fingers, A keeps the responder (LCA skip).
    frame(
      'topTouchStart',
      [point(TOUCH_A, 0, 0, 1_000), point(TOUCH_B, 200, 0, 1_000)],
      [point(TOUCH_B, 200, 0, 1_000)],
      1_000,
    );
    // frame 1, t=1010: BOTH fingers move +10 in x. Centroid moves +10 -> dx=10.
    frame(
      'topTouchMove',
      [point(TOUCH_A, 10, 0, 1_010), point(TOUCH_B, 210, 0, 1_010)],
      [point(TOUCH_A, 10, 0, 1_010), point(TOUCH_B, 210, 0, 1_010)],
      1_010,
    );
    // frame 2, t=1020: двигается только A (10 -> 60), dx растёт до 40, а не до 135
    frame(
      'topTouchMove',
      [point(TOUCH_A, 60, 0, 1_020), point(TOUCH_B, 210, 0, 1_010)],
      [point(TOUCH_A, 60, 0, 1_020)],
      1_020,
    );
    // B lifts at t=1030 -> onResponderEnd, not a move; dx unchanged, active touches drop.
    frame(
      'topTouchEnd',
      [point(TOUCH_A, 60, 0, 1_020)],
      [point(TOUCH_B, 210, 0, 1_030)],
      1_030,
    );
    // frame 3, t=1040: A один сдвигается 60 -> 160, dx растёт на 100 до 140, а не до 160
    frame(
      'topTouchMove',
      [point(TOUCH_A, 160, 0, 1_040)],
      [point(TOUCH_A, 160, 0, 1_040)],
      1_040,
    );
    // Release A.
    frame('topTouchEnd', [], [point(TOUCH_A, 160, 0, 1_050)], 1_050);

    expect(moves.length).toBe(3);

    // frame 1: dx=10 with two active touches, dt as in RN counts from 0, vx=10/1010
    expect(moves[0].dx).toBeCloseTo(10, 9);
    expect(moves[0].dy).toBeCloseTo(0, 9);
    expect(moves[0].vx).toBeCloseTo(10 / 1_010, 9);
    expect(moves[0].numberActiveTouches).toBe(2);

    // frame 2: only A moved -> dx tracks the moved-touch centroid delta, NOT 135.
    expect(moves[1].dx).toBeCloseTo(40, 9);
    expect(moves[1].dy).toBeCloseTo(0, 9);
    expect(moves[1].numberActiveTouches).toBe(2);

    // frame 3: B lifted, only A active and moving -> dx=140 (NOT 160), one active touch,
    // vx = (140-40)/(1040-1020) = 100/20 = 5.
    expect(moves[2].dx).toBeCloseTo(140, 9);
    expect(moves[2].dy).toBeCloseTo(0, 9);
    expect(moves[2].vx).toBeCloseTo(5, 9);
    expect(moves[2].numberActiveTouches).toBe(1);
  });
});
