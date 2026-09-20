// Proves the imperative host-component ref API libraries like
// reanimated / gesture-handler reach through: ref.current.measure / measureInWindow /
// measureLayout / setNativeProps, plus findNodeHandle(ref). A host ref hands back the
// public instance (the engine node itself, `toPublicInstance` is the identity — see
// `core/engine/src/host-instance`); its methods route through `treeHost().measure` /
// `.measureInWindow` / `.measureLayout`, so canned geometry grafts onto the RECORDING HOST's own
// fields rather than the global Fabric slot, which those calls never reach.
//
// `setNativeProps` no longer bypasses to a raw clone call (`core/engine/src/imperative.ts`'s
// header records the correction): it writes ordinary ops through the normal commit path, so the
// recording host's incremental `OP_SET_PROP` handling already merges a partial style onto the
// node's standing props — nothing to model here.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, findNodeHandle } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { isSymbioteNode } from '@symbiote-native/engine';

const ROOT_TAG = 180;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

// Canned geometry. `measureLayout` records the `relativeTo` handle it was called WITH so a test
// can prove the RIGHT node was forwarded — `relativeTo` is the anchor's own host instance (the
// engine node itself), so identity compares directly rather than through a committed tag.
let lastMeasureLayoutRelativeTo: unknown;
fabric.measure = (_handle, callback) => callback(1, 2, 100, 50, 11, 22);
fabric.measureInWindow = (_handle, callback) => callback(11, 22, 100, 50);
fabric.measureLayout = (_handle, relativeTo, _onFail, onSuccess) => {
  lastMeasureLayoutRelativeTo = relativeTo;
  onSuccess(9, 6, 100, 50);
};

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function mountApp(): { box: unknown; anchor: unknown } {
  let box: unknown;
  let anchor: unknown;
  function App(): ReactElement {
    return (
      <view style={{ flex: 1 }}>
        <view
          ref={instance => {
            anchor = instance;
          }}
          style={{ width: 10, height: 10 }}
        />
        <view
          ref={instance => {
            box = instance;
          }}
          style={{ width: 50, height: 50 }}
        />
      </view>
    );
  }
  mount(ROOT_TAG, <App />);
  if (box == null || anchor == null)
    throw new Error('host refs handed back nothing');
  return { box, anchor };
}

function method(
  instance: unknown,
  name: string,
): (...args: unknown[]) => unknown {
  const candidate = Reflect.get(Object(instance), name);
  if (typeof candidate !== 'function')
    throw new Error(`ref instance has no ${name}() method`);
  return (...args: unknown[]) => Reflect.apply(candidate, instance, args);
}

describe('React imperative host-component ref API', () => {
  // Positive only: every method here reads geometry off an already-mounted, already-measured
  // node — there is no invalid-ref / not-yet-mounted branch exercised by this file (that would
  // be a separate unmounted-ref scenario, not covered here — see the report).
  describe('Positive', () => {
    // why: `measure` must key off the box's OWN current Fabric handle and hand back the exact
    // 6-tuple libraries like reanimated read positionally — a wrong node or a shuffled arg order
    // both fail silently on device.
    it('delivers measure (x, y, width, height, pageX, pageY)', () => {
      const { box } = mountApp();
      let seen = '';
      method(
        box,
        'measure',
      )(
        (
          x: number,
          y: number,
          w: number,
          h: number,
          px: number,
          py: number,
        ) => {
          seen = `${x},${y},${w},${h},${px},${py}`;
        },
      );
      expect(seen).toBe('1,2,100,50,11,22');
    });

    // why: measureInWindow is a DIFFERENT 4-arg shape (no relative pageX/pageY) than measure's
    // 6-arg one — proves the ref wires it to its own slot method, not a truncated `measure`.
    it('delivers measureInWindow (x, y, width, height)', () => {
      const { box } = mountApp();
      let seen = '';
      method(
        box,
        'measureInWindow',
      )((x: number, y: number, w: number, h: number) => {
        seen = `${x},${y},${w},${h}`;
      });
      expect(seen).toBe('11,22,100,50');
    });

    // why: measureLayout measures relative to a DIFFERENT node's handle (the anchor), not the
    // box's own — this is the one call that must forward a second ref through to the host.
    it('delivers measureLayout(relative, onSuccess) measured against the anchor', () => {
      const { box, anchor } = mountApp();
      let seen = '';
      method(box, 'measureLayout')(
        anchor,
        (left: number, top: number, w: number, h: number) => {
          seen = `${left},${top},${w},${h}`;
        },
      );
      expect(lastMeasureLayoutRelativeTo, 'forwarded the anchor itself').toBe(
        anchor,
      );
      expect(seen).toBe('9,6,100,50');
    });

    // why: findNodeHandle is the seam third-party libraries use to convert a ref to a plain
    // reactTag — it must be idempotent on an already-numeric tag (so callers can pass either
    // shape interchangeably) and return null for null rather than throwing, since a ref can
    // legitimately be null before mount.
    it('resolves findNodeHandle to the reactTag, idempotent on a number, null on null', () => {
      const { anchor } = mountApp();
      const anchorTag = findNodeHandle(anchor);
      expect(typeof anchorTag).toBe('number');
      expect(findNodeHandle(anchorTag)).toBe(anchorTag);
      expect(findNodeHandle(null)).toBeNull();
    });

    // why: setNativeProps is a PARTIAL update (the reanimated/gesture-handler fast path) — it
    // must merge onto the node's committed props, not replace them, or every declarative style
    // not named in the patch would vanish on the next native-driven frame.
    it('merges a partial setNativeProps style onto the box instead of replacing it', async () => {
      const { box } = mountApp();
      if (!isSymbioteNode(box)) throw new Error('box ref is not a host node');
      method(box, 'setNativeProps')({ style: { opacity: 0.25 } });
      // The write is coalesced to the microtask boundary (core/engine/src/commit.ts).
      await Promise.resolve();
      const payload = live.nodeOf(box).payload;
      expect(payload.opacity, 'setNativeProps re-committed the box').toBe(0.25);
      // opacity is added while the declarative width/height survive the merge.
      expect(payload.width).toBe(50);
      expect(payload.height).toBe(50);
    });
  });
});
