// Unit test for AnimatedValue's native-driver seam: __startNativeAnimation (the "start"
// handshake this value owns end-to-end: make itself native, mint its tag, hand the curve to the
// native module, sync the JS value back on completion) plus the addListener/__makeNative
// interplay that starts/stops streaming native value updates back to JS listeners. Extracted out
// of BaseAnimation.startNativeIfNeeded (animations/base.ts) so a driver never reaches into
// __makeNative / __getNativeTag / __onNativeUpdate / flushValue directly — Information Expert:
// this value is the one object that actually owns those internals. Native module mocked the same
// way animated-operators.test.ts / animated-native-loop.test.ts do (a fake
// nativeModuleProxy.NativeAnimatedTurboModule).

import { beforeEach, describe, expect, it } from 'vitest';
import { AnimatedValue } from '@symbiote-native/engine';
import type { INativeAnimationConfig } from '@symbiote-native/engine';

interface INativeCall {
  method: string;
  args: unknown[];
}

interface INativeEndResult {
  finished: boolean;
  value?: number;
  offset?: number;
}

let nativeCalls: INativeCall[];
let deliverResult: ((result: INativeEndResult) => void) | undefined;

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args });
  };
}

beforeEach(() => {
  nativeCalls = [];
  deliverResult = undefined;
  const fakeNativeAnimated = {
    createAnimatedNode: record('createAnimatedNode'),
    connectAnimatedNodes: record('connectAnimatedNodes'),
    disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
    connectAnimatedNodeToView: record('connectAnimatedNodeToView'),
    disconnectAnimatedNodeFromView: record('disconnectAnimatedNodeFromView'),
    restoreDefaultValues: record('restoreDefaultValues'),
    dropAnimatedNode: record('dropAnimatedNode'),
    startAnimatingNode(
      animationId: number,
      nodeTag: number,
      config: INativeAnimationConfig,
      endCallback: (result: INativeEndResult) => void,
    ): void {
      nativeCalls.push({ method: 'startAnimatingNode', args: [animationId, nodeTag, config] });
      deliverResult = endCallback;
    },
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

describe('AnimatedValue.__startNativeAnimation — Positive', () => {
  // why: a native-driven animation must exist as a native node BEFORE native is asked to
  // animate it (create-then-start), and the animation must run on THIS value's own tag with the
  // caller's id/config passed through verbatim — the driver owns the curve, the value owns the
  // native handshake.
  it('makes the value native and starts the native animation on its own tag with the given id/config', () => {
    const value = new AnimatedValue(0);

    value.__startNativeAnimation({ type: 'frames', frames: [0, 1] }, 7, () => {});

    expect(nativeCalls.map(call => call.method)).toContain('createAnimatedNode');
    const start = nativeCalls.find(call => call.method === 'startAnimatingNode');
    expect(start).toBeDefined();
    expect(start?.args[0]).toBe(7);
    expect(start?.args[1]).toBe(value.__getNativeTag());
    expect(start?.args[2]).toEqual({ type: 'frames', frames: [0, 1] });
  });

  // why: when native reports back a resting `value`, the JS side must sync to it (so a
  // subsequent JS read/animation continues from where native actually landed) WITHOUT issuing
  // any further native call — native already moved the view, re-flushing to native would be a
  // redundant round-trip.
  it('on native completion with a value, reports finished via the callback and syncs the JS value, without a further native call', () => {
    const value = new AnimatedValue(0);
    let finished: boolean | undefined;

    value.__startNativeAnimation({ type: 'frames', frames: [0, 1] }, 9, result => {
      finished = result;
    });
    nativeCalls.length = 0; // only interested in what happens after native reports back

    deliverResult?.({ finished: true, value: 42 });

    expect(finished).toBe(true);
    expect(value.__getValue()).toBe(42);
    expect(nativeCalls).toHaveLength(0);
  });

  // why: `result.value` is optional (native may report completion without a resting value,
  // e.g. a native-driver stop with nothing to resync) — the JS value must be left UNTOUCHED in
  // that branch rather than jumping to `undefined`, which would corrupt every bound prop.
  it('on native completion WITHOUT a value, reports finished but leaves the JS value untouched', () => {
    const value = new AnimatedValue(5);

    value.__startNativeAnimation({ type: 'frames', frames: [0, 1] }, 11, () => {});
    deliverResult?.({ finished: false });

    expect(value.__getValue()).toBe(5);
  });
});

describe('AnimatedValue.resetAnimation — native sync', () => {
  // why: the native graph keeps its OWN copy of the value, so a reset written only to the JS side
  // leaves a native-driven view sitting wherever the animation stopped - visible on device, and
  // invisible to every JS-driven test. setValue pushes for exactly this reason.
  it('pushes the starting value to native when the value is native-driven', () => {
    const value = new AnimatedValue(5);
    value.__startNativeAnimation({ type: 'frames', frames: [0, 1] }, 7, () => {});
    nativeCalls.length = 0;

    value.resetAnimation();

    const push = nativeCalls.find(call => call.method === 'setAnimatedNodeValue');
    expect(push).toBeDefined();
    expect(push?.args[0]).toBe(value.__getNativeTag());
    expect(push?.args[1]).toBe(5);
  });

  // why: a JS-driven value has no native node to address, so the reset must stay in JS rather
  // than fabricate a call against a tag native has never been told about.
  it('issues no native call when resetting a value that never went native', () => {
    const value = new AnimatedValue(5);

    value.resetAnimation();

    expect(nativeCalls).toEqual([]);
  });
});

describe('AnimatedValue — native value-listener streaming (Positive)', () => {
  // why: a JS listener on a NATIVE-driven value sees nothing per frame unless native is asked to
  // stream updates back — adding the first listener while already native must start that
  // stream immediately (there is no other trigger once the value is already native).
  it('addListener on an already-native value starts streaming to native', () => {
    const value = new AnimatedValue(0);
    value.__makeNative();
    nativeCalls.length = 0;

    value.addListener(() => {});

    expect(nativeCalls.map(call => call.method)).toContain('startListeningToAnimatedNodeValue');
  });

  // why: __makeNative must retroactively start streaming for listeners that were registered
  // BEFORE the value became native — the order (listener first, then made native) must not
  // silently skip the stream.
  it('__makeNative on a value that already has listeners starts streaming too', () => {
    const value = new AnimatedValue(0);
    value.addListener(() => {});
    nativeCalls.length = 0;

    value.__makeNative();

    expect(nativeCalls.map(call => call.method)).toContain('startListeningToAnimatedNodeValue');
  });

  // why: removing the LAST listener must stop the native stream — an app that unsubscribes
  // fully should not keep the native side pushing per-frame updates nobody reads.
  it('removeListener that empties all listeners stops streaming', () => {
    const value = new AnimatedValue(0);
    value.__makeNative();
    const id = value.addListener(() => {});
    nativeCalls.length = 0;

    value.removeListener(id);

    expect(nativeCalls.map(call => call.method)).toContain('stopListeningToAnimatedNodeValue');
  });

  // why: a non-native value must NEVER talk to the native module — addListener/removeListener
  // on it are pure JS bookkeeping (this is the branch every other value in the graph takes).
  it('addListener on a value that never went native issues no native calls', () => {
    const value = new AnimatedValue(0);
    value.addListener(() => {});
    expect(nativeCalls).toHaveLength(0);
  });
});

// No Negative group: __startNativeAnimation and the listener-streaming methods have no guard
// clause of their own — every native call is optional-chained (`module()?.foo(...)`) so a
// missing native module degrades to a silent no-op rather than a throw. The gate that decides
// whether native SHOULD be used at all (isNativeAnimatedAvailable) lives one level up in
// animations/base.ts, outside this file's scope.
