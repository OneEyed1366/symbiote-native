// Native loop offload: Animated.loop over a SINGLE native-driver timing must hand the whole loop
// to native (one startAnimatingNode carrying `iterations`), so zero JS runs per cycle. A finite
// loop passes its count; an infinite loop passes -1. A loop over a SEQUENCE, or one without
// useNativeDriver, can't offload and falls back to JS restart.
//
// No Negative group: loop()/timing() accept any config and never validate it; the "cannot
// offload" scenarios below are a normal ALTERNATE branch (canOffloadLoop returning false), not
// a rejected input, so they're grouped as their own "falls back to JS" behavior rather than
// mislabeled Negative.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AnimatedValue, timing, loop, sequence } from '@symbiote-native/engine';

interface INativeCall {
  method: string;
  args: unknown[];
}
const nativeCalls: INativeCall[] = [];

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args });
  };
}

function startsOf(): INativeCall[] {
  return nativeCalls.filter(call => call.method === 'startAnimatingNode');
}
function configOf(call: INativeCall): Record<string, unknown> {
  const config = call.args[2];
  if (typeof config !== 'object' || config === null)
    throw new Error('start config missing');
  return { ...config };
}

beforeAll(() => {
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
    startListeningToAnimatedNodeValue: record(
      'startListeningToAnimatedNodeValue',
    ),
    stopListeningToAnimatedNodeValue: record(
      'stopListeningToAnimatedNodeValue',
    ),
    getValue: record('getValue'),
    addAnimatedEventToView: record('addAnimatedEventToView'),
    removeAnimatedEventFromView: record('removeAnimatedEventFromView'),
  };
  Object.assign(globalThis, {
    nativeModuleProxy: { NativeAnimatedTurboModule: fakeNativeAnimated },
  });
});

beforeEach(() => {
  nativeCalls.length = 0;
});

describe('Animated.loop native offload — Positive', () => {
  // why: an infinite loop (the common "pulse forever" case, e.g. a spinner) must ride ONE native
  // animation carrying iterations:-1 — starting a fresh native animation per cycle would mean
  // JS wakes up every cycle just to restart native, defeating the whole point of offloading.
  it('an infinite loop of a single native timing issues one start with iterations -1', () => {
    const opacity = new AnimatedValue(0);
    loop(
      timing(opacity, { toValue: 1, duration: 100, useNativeDriver: true }),
    ).start();

    const starts = startsOf();
    expect(starts).toHaveLength(1);
    expect(configOf(starts[0]).iterations).toBe(-1);
  });

  it('a finite loop rides its iteration count on the same single start', () => {
    const scale = new AnimatedValue(0);
    loop(timing(scale, { toValue: 1, duration: 100, useNativeDriver: true }), {
      iterations: 3,
    }).start();

    const starts = startsOf();
    expect(starts).toHaveLength(1);
    expect(configOf(starts[0]).iterations).toBe(3);
  });

  // why: iterations:0 means "run zero times" — the completion callback must fire IMMEDIATELY
  // with finished:true, and no native (or JS) animation should ever start, matching the
  // composition layer's own early-return.
  it('iterations:0 finishes immediately without starting any animation, native or JS', () => {
    const opacity = new AnimatedValue(0);
    let finished: boolean | undefined;
    loop(
      timing(opacity, { toValue: 1, duration: 100, useNativeDriver: true }),
      {
        iterations: 0,
      },
    ).start(result => {
      finished = result.finished;
    });

    expect(finished).toBe(true);
    expect(startsOf()).toHaveLength(0);
  });
});

describe('Animated.loop — falls back to JS restart when it cannot offload', () => {
  // why: a sequence/parallel has no single native curve to hand to native (no `_nativeLoop`), so
  // `loop()` must fall back to restarting it in JS on each iteration — provable here as "no
  // single start carries an infinite -1 count", since the JS-restart path issues one native
  // start PER inner timing instead.
  it('a loop over a SEQUENCE cannot offload: it JS-restarts and does not carry an infinite count', () => {
    const seq = new AnimatedValue(0);
    loop(
      sequence([
        timing(seq, { toValue: 1, duration: 100, useNativeDriver: true }),
        timing(seq, { toValue: 0, duration: 100, useNativeDriver: true }),
      ]),
    ).start();

    const seqStarts = startsOf();
    expect(seqStarts).toHaveLength(1);
    expect(configOf(seqStarts[0]).iterations).not.toBe(-1);
  });

  // why: canOffloadLoop requires BOTH useNativeDriver AND the native module — a single timing
  // WITHOUT useNativeDriver has a `_nativeLoop` method but it must decline (return false) so the
  // loop restarts in JS instead of silently running on native the caller never asked for.
  it('a single timing WITHOUT useNativeDriver cannot offload: no native start is issued at all', () => {
    const opacity = new AnimatedValue(0);
    loop(timing(opacity, { toValue: 1, duration: 0 }), {
      iterations: 2,
    }).start();

    // The JS-restart path drives the value via AnimatedValue.animate(), never through native.
    expect(startsOf()).toHaveLength(0);
    expect(opacity.__getValue()).toBe(1);
  });
});
