// CHARACTERIZATION TEST — this documents intended behavior that LOOKS like a bug. Do not "fix"
// the engine to make the second case tick; that would be a deliberate divergence from RN.
//
// A JS listener on an AnimatedInterpolation goes silent the moment its chain is promoted to the
// native driver. RN behaves identically and by the same mechanism:
//   - AnimatedWithChildren.js:74 — `__callListeners` cascades to children only `if (!this.__isNative)`
//     (our graph.ts carries the same gate), because a native subtree's JS values are stale.
//   - Native value streaming back to JS (startListeningToAnimatedNodeValue) exists ONLY on
//     AnimatedValue (RN AnimatedValue.js `__ensureUpdateSubscriptionExists`, our value.ts) — never
//     on an interpolation node.
//
// This matters because it is the trap the Svelte adapter fell into. Its sticky header listens on
// its interpolation, the listener went quiet once the pin went native, and that was read as a
// "deadlock" — so the adapter hardcoded `nativeStickyAvailable = false` to stay on the JS path and
// keep the listener alive. But the listener never drove the visible pin: the pin is the native
// transform, and the listener only feeds the DEBOUNCED COMMITTED transform used for hit-testing
// (RN's ScrollViewStickyHeader.js registers it solely `if (isFabric)`). Trading the native driver
// for that detail put the pin on the JS thread — drift on iOS, failure on Android.

import { beforeEach, describe, expect, it } from 'vitest';
import { AnimatedValue } from '@symbiote-native/engine';

function noop(): void {}

beforeEach(() => {
  const fakeNativeAnimated = {
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
  };
  Object.assign(globalThis, {
    nativeModuleProxy: { NativeAnimatedTurboModule: fakeNativeAnimated },
  });
});

// No Negative group: neither __attach() nor __makeNative() has a guard clause here — promotion
// silently changes what a listener receives, it never throws. Both scenarios below are Positive
// claims about what the listener DOES see, not error-path claims.
describe('a JS listener on an interpolation across native promotion', () => {
  describe('Positive', () => {
    // why: this is the control case — a JS-driven chain must still feed listeners, or the second
    // test below (silence after promotion) would be indistinguishable from "listeners are broken".
    it('receives ticks while the chain is still JS-driven', () => {
      const scroll = new AnimatedValue(0);
      const translateY = scroll.interpolate({ inputRange: [0, 100], outputRange: [0, -100] });
      // What AnimatedView does when it mounts this node into a style: attaching is what puts the
      // interpolation into its parent's children list, which is what makes the cascade reach it.
      translateY.__attach();
      const seen: number[] = [];
      translateY.addListener(({ value }) => {
        if (typeof value === 'number') seen.push(value);
      });

      scroll.setValue(50);
      expect(seen, 'JS-driven chain feeds the interpolation listener').toEqual([-50]);
    });

    // why: this is the exact trap the Svelte sticky header fell into (see file header) — the
    // listener going quiet on promotion is INTENDED, RN-matching behavior (AnimatedWithChildren.js
    // gates __callListeners cascade on `!this.__isNative`), not a deadlock to work around by
    // forcing the JS path. Confirmed against RN source, so this pins a verified product rule, not
    // an open question — it stays out of a characterization group.
    it('goes silent once the chain is promoted to the native driver — same as RN', () => {
      const scroll = new AnimatedValue(0);
      const translateY = scroll.interpolate({ inputRange: [0, 100], outputRange: [0, -100] });
      translateY.__attach();
      const seen: number[] = [];
      translateY.addListener(({ value }) => {
        if (typeof value === 'number') seen.push(value);
      });

      scroll.setValue(50);
      expect(seen.length, 'baseline tick before promotion').toBe(1);

      // AnimatedInterpolation.__makeNative promotes its PARENT first (graph.ts), so the shared
      // scroll value goes native too — after which JS sees no per-frame value at all.
      translateY.__makeNative();
      scroll.setValue(75);

      expect(seen.length, 'no further JS ticks once native owns the frames').toBe(1);
    });
  });
});
