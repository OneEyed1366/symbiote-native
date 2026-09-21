// Proves the responder system end-to-end: a View carrying
// PanResponder's panHandlers, driven through the REAL event layer
// (topTouchStart/Move/End on the node's instanceHandle, exactly how Fabric delivers
// touches). The negotiation grants the responder, routes a move with the correct
// gestureState deltas, and releases on end, the path a device drag exercises.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, PanResponder } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 150;

const fabric = installRecordingFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// One finger: touches carry pageX/pageY/timestamp, the shape PanResponder reads for
// centroid + velocity.
function touch(
  pageX: number,
  pageY: number,
  timestamp: number,
  target: unknown,
): Record<string, unknown> {
  const point = {
    pageX,
    pageY,
    locationX: pageX,
    locationY: pageY,
    identifier: 1,
    timestamp,
  };
  return { touches: [point], changedTouches: [point], target, timestamp };
}

describe('React responder system through the event layer', () => {
  // Positive only: PanResponder always resolves to a granted/moved/released sequence on a
  // consented gesture — no invalid-input branch for a Negative group to reject.
  describe('Positive', () => {
    // why: PanResponder.panHandlers must wire onto the SAME negotiation the raw responder props
    // use (proven separately in responder-negotiation.test.tsx) — this is the integration check
    // that the public PanResponder API, not just the low-level callbacks, drives a real drag,
    // and that gestureState.dx/dy are computed from the GRANT point, not the previous move.
    it('grants, routes a move with dx/dy from the grant point, and releases', () => {
      const seen: string[] = [];
      let moveDx = 0;
      let moveDy = 0;
      const responder = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          seen.push('grant');
        },
        onPanResponderMove: (_event, gesture) => {
          seen.push('move');
          moveDx = gesture.dx;
          moveDy = gesture.dy;
        },
        onPanResponderRelease: () => {
          seen.push('release');
        },
      });

      function App(): ReactElement {
        return (
          <view {...responder.panHandlers} style={{ width: 50, height: 50 }} />
        );
      }

      mount(ROOT_TAG, <App />);

      // The app's own View is the non-box-none RCTView (the box-none one is the AppContainer).
      const viewNode = fabric.find(
        n => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none',
      );
      expect(viewNode, 'PanResponder View was committed').toBeDefined();
      const handle = viewNode!.instanceHandle;

      // One finger: down at (10,10), drag to (40,55), lift. `target` is per-touch (the
      // instanceHandle Fabric would deliver), not an outer event field nothing reads.
      fabric.fireEvent(handle, 'topTouchStart', touch(10, 10, 1_000, handle));
      fabric.fireEvent(handle, 'topTouchMove', touch(40, 55, 1_016, handle));
      fabric.fireEvent(handle, 'topTouchEnd', touch(40, 55, 1_032, handle));

      expect(seen.join(',')).toBe('grant,move,release');
      // dx/dy are the delta from the grant point: 40-10=30, 55-10=45.
      expect(moveDx).toBe(30);
      expect(moveDy).toBe(45);
    });
  });
});
