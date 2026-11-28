// TouchableOpacity over real compiled `.svelte` output, the Svelte twin of the Solid touchable test
// The press-scheduling machine is unit-tested in `core/components/src/state/touchable.test.ts`
// The press lifecycle underneath it is in `../pressable/pressable.smoke.test.ts`

// Svelte-specific, and so the point of this file: the runes wiring drives a real Animated.Value
// through a real engine commit, and `restingOpacityFromStyle` reaches the seed and the target

// The update `$effect` re-settles on `disabled` and resting-opacity changes
// It stays silent at mount and on an unrelated prop, as it reads two separate deriveds

// RN's `minPressDuration: 0` override is pinned by the one test that awaits nothing

// Not covered: `useNativeDriver: true`, as no native module is installed here
// Nor `resetAnimation()` on teardown

// No Negative group, as a bad prop produces a different visual and never a throw

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createLiveTree,
  installRecordingFabric,
  waitUntil,
  type ILiveNode,
} from '@symbiote-native/test-utils';
// The press machine reaches a `pressable` TAG through the engine's behavior registry, so this
// suite is pressing nothing without the registration.
import '../../register';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}
// No NativeAnimatedTurboModule: isNativeAnimatedAvailable() stays false, so the fade runs on the
// plain JS driver. That is what makes `useNativeDriver: true` unobservable here (see header).
globalThis.nativeModuleProxy = undefined;

const ROOT_TAG = 91_201;
const TARGET = 'touchable-target';
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';
const ACTIVE_OPACITY = 0.3;
const BASE_WIDTH = 10;
const PRESS_DELAY_MS = 30;

// The compiled file sits next to its source, as its relative imports resolve from the file's place
// The `.smoke-compiled-` prefix is what gitignores it, and a name shared by two suites races
const PARENT_OUT = join(
  __dirname,
  '.smoke-compiled-touchable-opacity-parent.mjs',
);

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

// The drivers read requestAnimationFrame off the host at call time and THROW when it is absent
// (core/engine/src/animated/animations/raf.ts). A setTimeout-backed clock advancing 16ms a frame
// runs a real timing animation to completion in macrotasks. `frameRequests` is also the only
// headless trace of "an animation was started at all", which is what pins the mount guard below.
let frameClock = 0;
let nextFrameId = 1;
let frameRequests = 0;
const pendingFrames = new Map<number, (time: number) => void>();

function installRequestAnimationFrame(): void {
  Object.assign(globalThis, {
    requestAnimationFrame(callback: (time: number) => void): number {
      const id = nextFrameId++;
      frameRequests += 1;
      pendingFrames.set(id, callback);
      setTimeout(() => {
        const frame = pendingFrames.get(id);
        if (frame === undefined) return;
        pendingFrames.delete(id);
        frameClock += 16;
        frame(frameClock);
      }, 0);
      return id;
    },
    cancelAnimationFrame(id: number): void {
      pendingFrames.delete(id);
    },
  });
}

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// A leading tick first, as Svelte flushes effects on a microtask
// An update that starts an animation has not requested a frame yet, and a bare loop would exit
async function flushFrames(guard = 1_000): Promise<void> {
  await tick();
  if (pendingFrames.size > 0 && guard > 0) {
    await flushFrames(guard - 1);
    return;
  }
  await tick();
}

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

function compileToFile(
  source: string,
  filename: string,
  outPath: string,
  rewrites: ReadonlyArray<readonly [string, string]> = [],
): void {
  let code = compile(source, { ...COMPILE_OPTIONS, filename }).js.code;
  for (const [from, to] of rewrites) code = code.replace(from, to);
  writeFileSync(outPath, code);
}

type ILoaded = {
  Parent: Component;
  control: Record<string, unknown>;
};

async function loadParent(): Promise<ILoaded> {
  // The bare tag is the only spelling, and the fade and press scheduling live on the engine node
  // One parent file serves every scenario, as Node caches `import()` by path
  // Props handed to `mount()` are not reactive, so later prop changes go through a `$state` bag
  compileToFile(
    `<script module>
       export const control = $state({ disabled: undefined, label: undefined });
     </script>
     <script>
       let props = $props();
     </script>
     <touchable-opacity
       p={{ ...props, disabled: control.disabled, accessibilityLabel: control.label }}
     />`,
    'Parent.svelte',
    PARENT_OUT,
  );

  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (!isRecord(mod) || !('default' in mod) || !('control' in mod)) {
    throw new Error('Parent.svelte produced no default export / control');
  }
  const control = mod.control;
  if (!isRecord(control)) throw new Error('control is not an object');
  // The module is import()-cached across tests in this file, so its state is too.
  control.disabled = undefined;
  control.label = undefined;
  return { Parent: mod.default as Component, control };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

beforeEach(() => {
  fabric.reset();
  frameClock = 0;
  nextFrameId = 1;
  frameRequests = 0;
  pendingFrames.clear();
  installRequestAnimationFrame();
});

afterEach(() => {
  unmount(ROOT_TAG);
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
  rmSync(PARENT_OUT, { force: true });
});

// The responder is Pressable's own host view, identified by the `testID` every mount sets
// Read live, not off the creation log, as an Animated frame lands on the committed tree only
function responderNode(): ILiveNode {
  const node = live.findLive(live.appRoot(), n => n.payload.testID === TARGET);
  if (node === undefined) throw new Error(`no committed node testID=${TARGET}`);
  return node;
}

function responderHandle(): unknown {
  return responderNode().instanceHandle;
}

// The responder is the feedback node, as in RN's single `<Animated.View>` (TouchableOpacity.js:302)
// The fade lands on it through the engine's `touchable-opacity` behavior
// `opacity` and `width` travel through the style slot, so they show only in the flattened payload
function feedbackProps(): Record<string, unknown> {
  return responderNode().payload;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== 'number') {
    throw new Error(
      `${label} should be a number, got ${JSON.stringify(value)}`,
    );
  }
  return value;
}

describe('Svelte TouchableOpacity (real compiled index.svelte)', () => {
  // RN drives this feedback with a real `Animated.timing`, not a discrete style swap
  // The fade must reach the committed node, and the caller's base style must survive each diff
  it('animates opacity to activeOpacity on press-in and back on release', async () => {
    const { Parent } = await loadParent();
    let pressIns = 0;
    let pressOuts = 0;
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      activeOpacity: ACTIVE_OPACITY,
      style: { width: BASE_WIDTH },
      onPressIn: () => {
        pressIns += 1;
      },
      onPressOut: () => {
        pressOuts += 1;
      },
    });
    await tick();
    await tick();

    // At rest no `opacity` key is published at all, and the base style is untouched
    expect(feedbackProps().opacity).toBeUndefined();
    expect(feedbackProps().width).toBe(BASE_WIDTH);

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'pressed')).toBeCloseTo(
      ACTIVE_OPACITY,
      6,
    );
    expect(feedbackProps().width, 'base style survived the diff').toBe(
      BASE_WIDTH,
    );

    fabric.fireEvent(handle, TOUCH_END);
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'released')).toBeCloseTo(1, 6);
    expect(pressIns).toBe(1);
    expect(pressOuts).toBe(1);
  });

  // An ordinary tap is the responder GRANT branch, duration 0 (TouchableOpacity.js:215-220).
  // Nothing is awaited after the touch on purpose: a 0ms timing lands inside `.start()` with no
  // frame, where a flush helper would burn past both (test-harness-false-greens §5)
  it('snaps to activeOpacity on press-in with no fade, as the grant branch does', async () => {
    const { Parent } = await loadParent();
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      activeOpacity: ACTIVE_OPACITY,
    });
    await tick();
    await tick();
    expect(feedbackProps().opacity).toBeUndefined();

    fabric.fireEvent(responderHandle(), TOUCH_START);
    // One microtask is the coalesced setNativeProps flush, not a frame: a real fade would still be
    // near the resting 1 here, which is exactly what this row failed with when it was introduced.
    await Promise.resolve();
    expect(
      asNumber(feedbackProps().opacity, 'immediately after touch-down'),
      'a non-zero duration would still be fading here',
    ).toBeCloseTo(ACTIVE_OPACITY, 6);
  });

  // RN's `_getChildStyleOpacityWithDefault` seeds and settles at the CALLER's own style opacity,
  // so a Touchable styled `opacity: 0.6` neither flashes opaque on first paint nor brightens later
  it('seeds and settles at the style opacity, not at 1', async () => {
    const { Parent } = await loadParent();
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      activeOpacity: ACTIVE_OPACITY,
      style: { width: BASE_WIDTH, opacity: 0.6 },
    });
    await tick();
    await tick();
    expect(asNumber(feedbackProps().opacity, 'seed')).toBeCloseTo(0.6, 6);

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'pressed')).toBeCloseTo(
      ACTIVE_OPACITY,
      6,
    );

    fabric.fireEvent(handle, TOUCH_END);
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'released')).toBeCloseTo(0.6, 6);
  });

  // RN's Touchables pass `minPressDuration: 0`, so Pressability's own 130ms floor
  // (Pressability.js:264) never reaches them. Nothing is awaited after the release on purpose: a
  // flush helper burns past the threshold and passes either way (test-harness-false-greens §5)
  it('deactivates synchronously — no minPressDuration floor by default', async () => {
    const { Parent } = await loadParent();
    let pressOuts = 0;
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      onPressOut: () => {
        pressOuts += 1;
      },
    });
    await tick();
    await tick();

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    expect(pressOuts, 'a floor would have deferred this past the tick').toBe(1);
  });

  // RN re-settles the view when `disabled` flips, so a Touchable disabled mid-press is not frozen
  it('re-settles the opacity when disabled flips after a press-in', async () => {
    const { Parent, control } = await loadParent();
    control.disabled = false;
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      activeOpacity: ACTIVE_OPACITY,
    });
    await tick();
    await tick();

    fabric.fireEvent(responderHandle(), TOUCH_START);
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'held')).toBeCloseTo(
      ACTIVE_OPACITY,
      6,
    );

    control.disabled = true;
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'after disabling')).toBeCloseTo(
      1,
      6,
    );
  });

  // The update effect reads `disabled` and the resting opacity as two SEPARATE deriveds: folding
  // them into one object rebuilds it every tick and cancels the fade the user is looking at
  it('does not re-settle a held press when an unrelated prop changes', async () => {
    const { Parent, control } = await loadParent();
    control.label = 'before';
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      activeOpacity: ACTIVE_OPACITY,
    });
    await tick();
    await tick();

    fabric.fireEvent(responderHandle(), TOUCH_START);
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'held')).toBeCloseTo(
      ACTIVE_OPACITY,
      6,
    );

    control.label = 'after';
    await flushFrames();
    expect(
      asNumber(feedbackProps().opacity, 'still held'),
      'an unrelated prop re-settled the opacity',
    ).toBeCloseTo(ACTIVE_OPACITY, 6);
  });

  // RN re-settles on update only, and a first-run animation over the seed shows in no value
  // So the only headless trace is that an animation started at all
  it('starts no animation at mount', async () => {
    const { Parent } = await loadParent();
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      style: { opacity: 0.6 },
    });
    await tick();
    await tick();
    expect(frameRequests, 'the update effect fired at mount').toBe(0);
  });

  // `delayPressIn` defers the pressed feedback past a quick swipe-through
  // This is the wiring into the shared machine, whose timing math is unit-tested in core
  it('defers onPressIn past touch-down with delayPressIn', async () => {
    const { Parent } = await loadParent();
    let pressIns = 0;
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      delayPressIn: PRESS_DELAY_MS,
      onPressIn: () => {
        pressIns += 1;
      },
    });
    await tick();
    await tick();

    fabric.fireEvent(responderHandle(), TOUCH_START);
    expect(pressIns, 'fired before the delay elapsed').toBe(0);
    await waitUntil(() => pressIns === 1, 'onPressIn after delayPressIn');
  });

  // A press must re-prop the feedback node, never rebuild it, as a rebuild kills the gesture
  // The node identity is the only headless trace, as a fake Fabric has no grant to lose
  it('creates no node across a full press cycle', async () => {
    const { Parent } = await loadParent();
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      activeOpacity: ACTIVE_OPACITY,
    });
    await tick();
    await tick();
    const nodeAtMount = responderNode().handle;

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flushFrames();
    expect(responderNode().handle, 'press-in rebuilt a subtree').toBe(
      nodeAtMount,
    );

    fabric.fireEvent(handle, TOUCH_END);
    await flushFrames();
    expect(responderNode().handle, 'release rebuilt a subtree').toBe(
      nodeAtMount,
    );
  });
});
