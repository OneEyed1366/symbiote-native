// Does anything CYCLIC reach a prop write?
//
// On device every prop value is converted by `jsi::dynamicFromValue`, which walks an object graph
// with an explicit stack and NO visited set (JSIDynamic.cpp). A cycle is not a stack overflow —
// it's an endless `while (!stack.empty())` loop inside `applyOps` the JS thread never returns from.
//
// NOTHING ELSE IN THE REPO CAN SEE THIS. The headless applier assigns `node.props[key] = value` by
// reference and walks nothing (`core/test-utils/src/tree-applier.ts`), so a cyclic value is a
// silent pass headless and a hang on device. That asymmetry is the whole reason this file exists,
// and it is why the assertion is about the SHAPE of what was committed rather than its value.
//
// An AnimatedNode graph is circular by construction — `leaf-lifecycle.ts` says so where it refuses
// to deep-compare props — so one live node reaching a prop is enough to hang the thread.
//
// The three shapes below are the ones `examples/solid`'s Animated screens actually mount.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import { PanResponder } from '@symbiote-native/engine';
import { mount, unmount } from '../../render';
import { Animated } from './index';

const ROOT_TAG = 617;
const fabric = installRecordingFabric();
// Animated writes through the engine's own prop path, so what an app can observe is the PAYLOAD.
const live = createLiveTree(fabric);

// The surface commits on a microtask (requestCommit), so every assertion waits one macrotask.
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function appView(): ILiveNode {
  return live.nodeOf(live.appRoot()).children[0];
}

// Depth cap, so a runaway walk fails this test rather than hanging the runner the way the device
// hangs — the failure mode under test must not be the failure mode of its own probe.
const MAX_DEPTH = 24;

/**
 * The path to the first value reachable twice down ONE branch, or undefined.
 *
 * Ancestors only, never a global seen-set: the same style object under two keys is a DAG, which
 * `dynamicFromValue` expands twice and finishes. Only a real cycle hangs it, so only a real cycle
 * is reported.
 */
function cyclicPath(
  value: unknown,
  ancestors: readonly object[] = [],
  path = 'props',
): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  if (ancestors.includes(value)) return path;
  if (ancestors.length >= MAX_DEPTH)
    return `${path} (deeper than ${MAX_DEPTH})`;
  const next = [...ancestors, value];
  for (const key of Object.keys(value)) {
    const found = cyclicPath(Reflect.get(value, key), next, `${path}.${key}`);
    if (found !== undefined) return found;
  }
  return undefined;
}

describe('Solid Animated: nothing cyclic reaches a prop write', () => {
  describe('Positive', () => {
    // why: the xy-box in AnimatedParityDemo — a PanResponder bag spread onto a `<view>`
    // whose style carries a ValueXY translate transform. The handler bag is functions, which
    // `writeProp` stashes rather than sending; the transform is what has to rasterize.
    it('commits no cyclic value for a ValueXY drag box', async () => {
      const xy = new Animated.ValueXY({ x: 0, y: 0 });
      const panResponder = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: () => {},
      });

      mount(ROOT_TAG, () => (
        <view
          {...panResponder.panHandlers}
          style={{ transform: xy.getTranslateTransform() }}
        />
      ));
      await tick();

      expect(cyclicPath(appView().payload)).toBeUndefined();
    });

    // why: the tracking follower — `toValue` is itself an Animated.Value, not a number, so the
    // animation holds a live node. This is the shape no other adapter's test mounts.
    it('commits no cyclic value for a tracking follower', async () => {
      const lead = new Animated.Value(0);
      const follow = new Animated.Value(0);
      Animated.spring(follow, {
        toValue: lead,
        useNativeDriver: false,
      }).start();

      mount(ROOT_TAG, () => (
        <view style={{ transform: [{ translateX: follow }] }} />
      ));
      await tick();

      expect(cyclicPath(appView().payload)).toBeUndefined();
    });

    // why: the collapsing header — an interpolation over a diffClamp, i.e. two derived graph
    // nodes deep. `AnimatedTransform.from` only walks the first level of a transform entry.
    it('commits no cyclic value for a diffClamp interpolation', async () => {
      const scroll = new Animated.Value(0);
      const offset = Animated.diffClamp(scroll, 0, 48).interpolate({
        inputRange: [0, 48],
        outputRange: [0, -48],
      });

      mount(ROOT_TAG, () => (
        <view style={{ transform: [{ translateY: offset }] }} />
      ));
      await tick();

      expect(cyclicPath(appView().payload)).toBeUndefined();
    });

    // why: a leaf only flushes through setNativeProps once a FRAME runs, and that path skips
    // `routeProp` entirely (`imperative.ts`), so it is the one write with no normalisation in
    // front of it. Mount-time cleanliness says nothing about it.
    it('commits no cyclic value on a driven frame', async () => {
      const scroll = new Animated.Value(0);
      const offset = Animated.diffClamp(scroll, 0, 48).interpolate({
        inputRange: [0, 48],
        outputRange: [0, -48],
      });

      mount(ROOT_TAG, () => (
        <view style={{ transform: [{ translateY: offset }] }} />
      ));
      await tick();

      scroll.setValue(24);
      await tick();

      expect(cyclicPath(appView().payload)).toBeUndefined();
    });

    // why: THE BUG. RN's babel preset annotates every JSX element with `__self` (cyclic) whenever
    // dev=true. `routeProp` strips it declaratively, but `AnimatedProps` re-sends its whole raw
    // bag every frame via `setNativeProps`, with no `routeProp` in front — so both paths need it.
    it('drops a JSX dev prop on the FRAME path, not only the declarative one', async () => {
      const scroll = new Animated.Value(0);
      const offset = Animated.diffClamp(scroll, 0, 48).interpolate({
        inputRange: [0, 48],
        outputRange: [0, -48],
      });
      // Shaped like what the transform actually injects: a module object that names itself.
      const moduleSelf: Record<string, unknown> = {};
      moduleSelf.exports = moduleSelf;

      mount(ROOT_TAG, () => (
        <view
          __self={moduleSelf}
          style={{ transform: [{ translateY: offset }] }}
        />
      ));
      await tick();

      scroll.setValue(24);
      await tick();

      expect(appView().payload.__self).toBeUndefined();
      expect(cyclicPath(appView().payload)).toBeUndefined();
    });
  });

  describe('Negative', () => {
    // why: a probe that reports "no cycle" because it walks nothing is the exact false green this
    // file exists to prevent. Hand it a known cycle and require it to be named.
    it('the probe names a real cycle', () => {
      const parent: Record<string, unknown> = {};
      const child: Record<string, unknown> = { parent };
      parent.child = child;

      expect(cyclicPath(parent)).toBe('props.child.parent');
    });
  });
});
