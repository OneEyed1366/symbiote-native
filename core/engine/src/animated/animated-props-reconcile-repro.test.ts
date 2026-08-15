// Reproduction for the 2026-08-13 Svelte sticky-header crash (effect_update_depth_exceeded):
// device logs showed `native: connect node=X -> view=586` immediately followed by
// `native: restoreDefaultValues node=X` in an unbounded, rapidly-climbing loop. This test
// exercises the EXACT pattern the crash traced back to — createAnimatedReconcileRuntime's
// "recreate the whole AnimatedProps leaf every reconcile, attach new before detach old" — in
// isolation, with a fake native module, so the failure mode can be inspected without a device.
//
// Mirrors adapters/svelte/src/modules/animated/animated-props-runtime.ts's reconcile() exactly:
// a fresh AnimatedProps (wrapping a fresh AnimatedStyle wrapping a fresh AnimatedTransform) is
// built and attached BEFORE the previous leaf is detached, over a long-lived interpolation node
// shared across every cycle (the sticky header's own `animatedTranslateY`).

import { beforeEach, describe, expect, it } from 'vitest';
import { AnimatedValue, AnimatedProps } from '@symbiote-native/engine';
import type { AnimatedInterpolation } from '@symbiote-native/engine';

interface INativeCall {
  method: string;
  args: unknown[];
}

let nativeCalls: INativeCall[];

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args });
  };
}

beforeEach(() => {
  nativeCalls = [];
  const fakeNativeAnimated = {
    createAnimatedNode: record('createAnimatedNode'),
    connectAnimatedNodes: record('connectAnimatedNodes'),
    disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
    connectAnimatedNodeToView: record('connectAnimatedNodeToView'),
    disconnectAnimatedNodeFromView: record('disconnectAnimatedNodeFromView'),
    restoreDefaultValues: record('restoreDefaultValues'),
    dropAnimatedNode: record('dropAnimatedNode'),
    startAnimatingNode: record('startAnimatingNode'),
    stopAnimation: record('stopAnimation'),
    setAnimatedNodeValue: record('setAnimatedNodeValue'),
    setAnimatedNodeOffset: record('setAnimatedNodeOffset'),
    flattenAnimatedNodeOffset: record('flattenAnimatedNodeOffset'),
    extractAnimatedNodeOffset: record('extractAnimatedNodeOffset'),
    startListeningToAnimatedNodeValue: record('startListeningToAnimatedNodeValue'),
    stopListeningToAnimatedNodeValue: record('stopListeningToAnimatedNodeValue'),
    getValue: record('getValue'),
    addAnimatedEventToView: record('addAnimatedEventToView'),
    removeAnimatedEventFromView: record('removeAnimatedEventFromView'),
  };
  Object.assign(globalThis, {
    nativeModuleProxy: { NativeAnimatedTurboModule: fakeNativeAnimated },
  });
});

// The exact shape createAnimatedReconcileRuntime.reconcile() drives, minus the Svelte lifecycle:
// a fresh leaf every call, attached before the old one detaches, both made native.
function reconcileCycle(
  attached: AnimatedProps | null,
  translateY: AnimatedInterpolation,
): AnimatedProps {
  const newLeaf = new AnimatedProps({
    style: { transform: [{ translateY }], zIndex: 10 },
    collapsable: false,
  });
  newLeaf.__attach();
  if (attached !== null && attached !== newLeaf) attached.__detach();
  newLeaf.__makeNative();
  return newLeaf;
}

describe('AnimatedProps reconcile-every-render over a shared long-lived interpolation', () => {
  it('does not grow the interpolation node children array across repeated reconciles', () => {
    const scroll = new AnimatedValue(0);
    const translateY = scroll.interpolate({ inputRange: [-1, 0], outputRange: [0, 0] });

    let attached: AnimatedProps | null = null;
    for (let i = 0; i < 20; i++) {
      attached = reconcileCycle(attached, translateY);
    }

    expect(translateY.__getChildren().length).toBe(1);
  });

  it('costs a constant, non-growing number of native calls per reconcile once steady-state', () => {
    const scroll = new AnimatedValue(0);
    const translateY = scroll.interpolate({ inputRange: [-1, 0], outputRange: [0, 0] });

    let attached: AnimatedProps | null = null;
    // Warm up: the first couple of cycles cost more (first-ever native creation of the shared
    // interpolation node). Steady-state cost is whatever a cycle costs once that's amortized.
    for (let i = 0; i < 3; i++) {
      attached = reconcileCycle(attached, translateY);
    }
    nativeCalls.length = 0;
    attached = reconcileCycle(attached, translateY);
    const costOfOneCycle = nativeCalls.length;

    nativeCalls.length = 0;
    for (let i = 0; i < 20; i++) {
      attached = reconcileCycle(attached, translateY);
    }
    // 20 more identical cycles must cost 20x one cycle, not more — a leak shows up as
    // super-linear growth (each cycle reconnecting nodes accumulated by every prior cycle).
    expect(nativeCalls.length).toBe(costOfOneCycle * 20);
    expect(attached).not.toBeNull();
  });
});
