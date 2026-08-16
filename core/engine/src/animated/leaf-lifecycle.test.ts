// REGRESSION: the reconcile no-op skip must survive a caller that reuses one props object.
//
// Svelte hands a component the SAME rest-props object on every reactive tick, mutating what its
// keys resolve to instead of allocating a new one - and it is not alone in that shape. The skip
// therefore cannot store that object as its "previous" state: the next call would compare it
// against itself, read the same current values through both sides, and conclude nothing changed -
// permanently. reconcile then never runs again, and a sticky header's rebuilt AnimatedInterpolation
// (a brand-new node on every 'rebuild-interpolation') never reaches the native graph. On device
// that looked like the header ignoring scroll entirely: the view stayed wired to the first,
// pre-measurement interpolation whose range is [-1,0] -> [0,0] - one pixel of travel.
//
// The observable used here is graph attachment: AnimatedProps.__attach() registers the leaf as a
// CHILD of every animated node in its props. So "did reconcile actually rebuild" == "the attached
// leaf object at __getChildren()[0] changed identity" (rebuild swaps the object; skip leaves it
// alone) and, for the fix itself, "did the new node gain a child". `wantsNative: true` is
// load-bearing in most cases below - the skip is gated on the leaf already being native, so a
// JS-only reconcile never skips (pinned explicitly by its own test). A stable-identity object with
// mutating contents is a real caller shape, not a contrived one.
//
// This pins core/engine's own leaf-lifecycle policy, which every adapter drives. It used to live
// four times, once per adapter, and only the Svelte copy ever grew this guard - see
// leaf-lifecycle.ts's header for why it moved here.
//
// No Negative group: reconcile()/teardown() have no throwing path (props is a permissive
// Record<string, unknown>, `node` is nullable by contract) - every scenario below is a Positive
// "does it rebuild or correctly skip" claim.

import { beforeEach, describe, expect, it } from 'vitest';
import { AnimatedValue } from './value';
import { createElement } from '../node';
import { createAnimatedLeafLifecycle } from './leaf-lifecycle';

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

describe('AnimatedProps reconcile against a stable-identity props object (Positive)', () => {
  // why: this IS the bug this file exists to pin — see the file header. A prior version of
  // reconcile() snapshotted `rest` by reference, so this scenario silently orphaned the rebuilt
  // interpolation node forever.
  it('attaches a replaced interpolation node even though rest is the same reference', () => {
    const lifecycle = createAnimatedLeafLifecycle('test');
    const scroll = new AnimatedValue(0);

    // The pre-measurement interpolation a sticky header starts with.
    const firstNode = scroll.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    // ONE object for the whole test — Svelte's rest-props proxy.
    const rest: Record<string, unknown> = { style: { transform: [{ translateY: firstNode }] } };

    lifecycle.reconcile(rest, null, true);
    expect(firstNode.__getChildren().length, 'first node wired into the graph').toBeGreaterThan(0);

    // 'rebuild-interpolation' after measurement: a brand-new node, carried by a fresh style object
    // (sticky-header keeps `animatedStyle` in its own derived precisely so this identity changes),
    // while `rest` itself stays the very same reference.
    const secondNode = scroll.interpolate({ inputRange: [0, 240], outputRange: [0, 240] });
    rest.style = { transform: [{ translateY: secondNode }] };
    lifecycle.reconcile(rest, null, true);

    // The assertion that fails before the fix: the skip fired, so the runtime never rebuilt its
    // leaf and the new node stayed orphaned — the view kept animating off `firstNode`.
    expect(
      secondNode.__getChildren().length,
      'the rebuilt interpolation reached the graph',
    ).toBeGreaterThan(0);

    lifecycle.teardown();
  });

  // why: the regression fix must not defeat the ORIGINAL optimization it sits next to — the
  // collision-disappearance bug (leaf-lifecycle.ts's own comment) where every unrelated
  // scroll tick reconnected a brand new native node even though nothing animated-relevant changed.
  it('does not re-wire on genuinely unchanged calls', () => {
    const lifecycle = createAnimatedLeafLifecycle('test');
    const scroll = new AnimatedValue(0);
    const node = scroll.interpolate({ inputRange: [0, 240], outputRange: [0, 240] });
    const rest: Record<string, unknown> = { style: { transform: [{ translateY: node }] } };

    lifecycle.reconcile(rest, null, true);
    const attachedFirst = node.__getChildren()[0];

    // Same content, repeatedly — the skip that stops the native node being torn down and
    // reconnected on every passthrough tick must still hold, and must not stack up leaves either.
    lifecycle.reconcile(rest, null, true);
    lifecycle.reconcile(rest, null, true);

    expect(node.__getChildren().length, 'no leaf accumulation on repeat calls').toBe(1);
    expect(node.__getChildren()[0], 'the SAME leaf instance stays attached — no rebuild').toBe(
      attachedFirst,
    );

    lifecycle.teardown();
  });

  // why: the skip is explicitly gated on `!nodeChanged` (leaf-lifecycle.ts's own
  // comment) — rebinding an already-native leaf to a DIFFERENT host (e.g. the component's
  // `bind:this` target swaps) must not be mistaken for "nothing changed" just because the props
  // content is byte-identical.
  it('rebuilds when the host node identity changes, even with unchanged rest content', () => {
    const lifecycle = createAnimatedLeafLifecycle('test');
    const scroll = new AnimatedValue(0);
    const styleNode = scroll.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    const rest: Record<string, unknown> = { style: { transform: [{ translateY: styleNode }] } };
    const hostA = createElement('RCTView');
    const hostB = createElement('RCTView');

    lifecycle.reconcile(rest, hostA, true);
    const attachedForHostA = styleNode.__getChildren()[0];

    lifecycle.reconcile(rest, hostB, true);

    expect(
      styleNode.__getChildren()[0],
      'a new leaf replaces the old one when the bound host changes',
    ).not.toBe(attachedForHostA);

    lifecycle.teardown();
  });

  // why: the skip is also gated on `!wantsNativeChanged` — a component whose native opt-in
  // flips (e.g. `passthroughAnimatedPropExplicitValues` becomes/stops being present) must rebuild
  // even though nothing else about the call differs, or the leaf keeps whatever native/JS mode it
  // happened to be built with.
  it('rebuilds when wantsNative flips, even with unchanged rest and node', () => {
    const lifecycle = createAnimatedLeafLifecycle('test');
    const scroll = new AnimatedValue(0);
    const styleNode = scroll.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    const rest: Record<string, unknown> = { style: { transform: [{ translateY: styleNode }] } };
    const host = createElement('RCTView');

    lifecycle.reconcile(rest, host, true);
    const attachedNative = styleNode.__getChildren()[0];

    lifecycle.reconcile(rest, host, false);

    expect(
      styleNode.__getChildren()[0],
      'a new leaf replaces the old one when wantsNative changes',
    ).not.toBe(attachedNative);

    lifecycle.teardown();
  });

  // why: the skip is gated on the leaf ALREADY being native, and that gate is load-bearing in the
  // opposite direction from the rest of this file. Before the first native connection, reconcile
  // must run on every call - that cadence is what wires a rebuilt interpolation into the shared
  // value's children. Skipping there would leave a fresh interpolation never attached, so its
  // listener never fires and the debounce that promotes the chain to native never settles: the
  // exact bootstrap deadlock the gate exists to avoid.
  it('never skips while still JS-driven, even on byte-identical repeat calls', () => {
    const lifecycle = createAnimatedLeafLifecycle('test');
    const scroll = new AnimatedValue(0);
    const styleNode = scroll.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    const props: Record<string, unknown> = { style: { transform: [{ translateY: styleNode }] } };

    lifecycle.reconcile(props, null, false);
    const attachedFirst = styleNode.__getChildren()[0];

    lifecycle.reconcile(props, null, false);

    expect(
      styleNode.__getChildren()[0],
      'a JS-only reconcile rebuilds regardless of unchanged props',
    ).not.toBe(attachedFirst);

    lifecycle.teardown();
  });

  // why: teardown() is the only path that runs on unmount ($effect(() => () => lifecycle.teardown())
  // in every Animated.* component) — if it left the leaf attached, an unmounted component would
  // keep receiving native/graph updates and leak a child edge on the shared Value forever.
  it('teardown detaches the attached leaf from the graph', () => {
    const lifecycle = createAnimatedLeafLifecycle('test');
    const scroll = new AnimatedValue(0);
    const styleNode = scroll.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    const rest: Record<string, unknown> = { style: { transform: [{ translateY: styleNode }] } };

    lifecycle.reconcile(rest, null, true);
    expect(styleNode.__getChildren().length).toBeGreaterThan(0);

    lifecycle.teardown();

    expect(styleNode.__getChildren().length, 'teardown removes the leaf as a child').toBe(0);
  });
});
