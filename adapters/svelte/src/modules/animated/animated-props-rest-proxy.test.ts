// REGRESSION: the reconcile no-op skip must survive Svelte's rest-props proxy.
//
// Svelte hands a component the SAME rest-props object on every reactive tick, mutating what its
// keys resolve to instead of allocating a new one. The runtime's skip therefore cannot store that
// object as its "previous" state: the next call would compare the proxy against itself, read the
// same current values through both sides, and conclude nothing changed — permanently. reconcile
// then never runs again, and a sticky header's rebuilt AnimatedInterpolation (a brand-new node on
// every 'rebuild-interpolation') never reaches the native graph. On device that looked like the
// header ignoring scroll entirely: the view stayed wired to the first, pre-measurement
// interpolation whose range is [-1,0,0,1] -> [0,0,0,1] — one pixel of travel.
//
// The observable used here is graph attachment: AnimatedProps.__attach() registers the leaf as a
// CHILD of every animated node in its props. So "did reconcile actually run" == "did the new node
// gain a child". `wantsNative: true` is load-bearing — the skip is deliberately gated on the leaf
// already being native, so a JS-only reconcile never skips and would not reproduce this at all.
// A stable-identity object with mutating contents is exactly what Svelte produces, so the fake
// below IS the production shape, not a contrived one.

import { beforeEach, describe, expect, it } from 'vitest';
import { AnimatedValue } from '@symbiote-native/engine';
import { createAnimatedReconcileRuntime } from './animated-props-runtime';

function noop(): void {}

beforeEach(() => {
  Object.assign(globalThis, {
    nativeModuleProxy: {
      NativeAnimatedTurboModule: {
        createAnimatedNode: noop,
        connectAnimatedNodes: noop,
        disconnectAnimatedNodes: noop,
        connectAnimatedNodeToView: noop,
        disconnectAnimatedNodeFromView: noop,
        restoreDefaultValues: noop,
        dropAnimatedNode: noop,
        startAnimatingNode: noop,
        stopAnimation: noop,
        setAnimatedNodeValue: noop,
        setAnimatedNodeOffset: noop,
        flattenAnimatedNodeOffset: noop,
        extractAnimatedNodeOffset: noop,
        startListeningToAnimatedNodeValue: noop,
        stopListeningToAnimatedNodeValue: noop,
        addAnimatedEventToView: noop,
        removeAnimatedEventFromView: noop,
      },
    },
  });
});

describe('AnimatedProps reconcile against a stable-identity rest object', () => {
  it('attaches a replaced interpolation node even though rest is the same reference', () => {
    const runtime = createAnimatedReconcileRuntime();
    const scroll = new AnimatedValue(0);

    // The pre-measurement interpolation a sticky header starts with.
    const firstNode = scroll.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    // ONE object for the whole test — Svelte's rest-props proxy.
    const rest: Record<string, unknown> = { style: { transform: [{ translateY: firstNode }] } };

    runtime.reconcile(rest, null, true);
    expect(firstNode.__getChildren().length, 'first node wired into the graph').toBeGreaterThan(0);

    // 'rebuild-interpolation' after measurement: a brand-new node, carried by a fresh style object
    // (sticky-header keeps `animatedStyle` in its own derived precisely so this identity changes),
    // while `rest` itself stays the very same reference.
    const secondNode = scroll.interpolate({ inputRange: [0, 240], outputRange: [0, 240] });
    rest.style = { transform: [{ translateY: secondNode }] };
    runtime.reconcile(rest, null, true);

    // The assertion that fails before the fix: the skip fired, so the runtime never rebuilt its
    // leaf and the new node stayed orphaned — the view kept animating off `firstNode`.
    expect(
      secondNode.__getChildren().length,
      'the rebuilt interpolation reached the graph',
    ).toBeGreaterThan(0);

    runtime.teardown();
  });

  it('does not re-wire on genuinely unchanged calls', () => {
    const runtime = createAnimatedReconcileRuntime();
    const scroll = new AnimatedValue(0);
    const node = scroll.interpolate({ inputRange: [0, 240], outputRange: [0, 240] });
    const rest: Record<string, unknown> = { style: { transform: [{ translateY: node }] } };

    runtime.reconcile(rest, null, true);
    const childrenAfterFirst = node.__getChildren().length;

    // Same content, repeatedly — the skip that stops the native node being torn down and
    // reconnected on every passthrough tick (the collision-disappearance bug) must still hold, and
    // must not stack up leaves on the node either.
    runtime.reconcile(rest, null, true);
    runtime.reconcile(rest, null, true);

    expect(node.__getChildren().length, 'no leaf accumulation on repeat calls').toBe(
      childrenAfterFirst,
    );

    runtime.teardown();
  });
});
