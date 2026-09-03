// TouchableOpacity over REAL compiled `.svelte` output — the Svelte twin of
// adapters/solid/src/components/touchable/touchable.test.tsx's TouchableOpacity group, written
// for the 2026-08-19 RN audit migration.
//
// SCOPE. The press-scheduling machine (computePressOutWait, createTouchableFeedback*) is
// unit-tested in core/components/src/state/touchable.test.ts, and the press lifecycle underneath
// it in ../pressable/pressable.smoke.test.ts. What is SVELTE-specific, and therefore what this
// file is for:
//   - the runes wiring actually drives a real Animated.Value through a real engine commit (the
//     component used to fake the fade with a setTimeout tween, which could never be native-driven);
//   - `restingOpacityFromStyle` reaches BOTH the seed and the deactivate target;
//   - the update `$effect` re-settles on `disabled` / resting-opacity changes, stays silent at
//     mount, and — the reason it reads two SEPARATE deriveds — does not fire on an unrelated prop;
//   - RN's minPressDuration: 0 override, pinned by the one test below that AWAITS NOTHING (a
//     flush helper burns straight past a timing threshold; .claude/rules/test-harness-false-greens.md §5).
//
// NOT covered, honestly: `useNativeDriver: true` (no native module is installed here, so the JS
// driver runs either way — the flag's effect is a native-thread property nothing headless can
// see) and `resetAnimation()` on teardown (see the "cancels" test's own note).
//
// No Negative group: TouchableOpacity has no rejecting path — a bad prop produces a different
// visual, never a throw.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  installFabric,
  waitUntil,
  type IFakeNode,
} from '@symbiote-native/test-utils';
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

const COMPONENTS_DIR = join(__dirname, '..');
// Every compiled artifact sits NEXT TO its real source: the compiled output's own relative
// imports ('../runes/attachments', './pressable-props') resolve from where the FILE lives, not
// from where it was compiled (svelte-adapter-dom-shim §15). The `-for-opacity` suffix and the
// `.smoke-compiled-` prefix are both load-bearing: View and Pressable are owned by other suites
// that run concurrently (.claude/rules/smoke-compiled-artifact-collisions.md), and only
// `.smoke-compiled-*.mjs` is gitignored.
const VIEW_OUT = join(COMPONENTS_DIR, '.smoke-compiled-view-for-opacity.mjs');
const PRESSABLE_OUT = join(
  COMPONENTS_DIR,
  'pressable',
  '.smoke-compiled-pressable-for-opacity.mjs',
);
const TOUCHABLE_OUT = join(
  __dirname,
  '.smoke-compiled-touchable-opacity-own.mjs',
);
const PARENT_OUT = join(
  __dirname,
  '.smoke-compiled-touchable-opacity-parent.mjs',
);

const fabric = installFabric();

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

async function flushFrames(): Promise<void> {
  // A leading tick before the loop: Svelte flushes effects on a MICROtask, so an update that
  // starts an animation has not requested its first frame yet when this is called, and a bare
  // `while (pending)` loop would exit immediately and read the pre-update value.
  await tick();
  let guard = 0;
  while (pendingFrames.size > 0 && guard < 1_000) {
    guard += 1;
    await tick();
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

interface ILoaded {
  Parent: Component;
  control: Record<string, unknown>;
}

async function loadParent(): Promise<ILoaded> {
  compileToFile(
    readFileSync(join(COMPONENTS_DIR, 'View.svelte'), 'utf8'),
    'View.svelte',
    VIEW_OUT,
  );
  compileToFile(
    readFileSync(join(COMPONENTS_DIR, 'pressable', 'index.svelte'), 'utf8'),
    'Pressable.svelte',
    PRESSABLE_OUT,
  );
  compileToFile(
    readFileSync(join(__dirname, 'index.svelte'), 'utf8'),
    'TouchableOpacity.svelte',
    TOUCHABLE_OUT,
    [
      [
        "from '../View.svelte'",
        "from '../.smoke-compiled-view-for-opacity.mjs'",
      ],
      [
        "from '../pressable/index.svelte'",
        "from '../pressable/.smoke-compiled-pressable-for-opacity.mjs'",
      ],
    ],
  );
  // ONE parent file for every scenario — Node's import() cache would hand back a stale module for
  // a rewritten path anyway (svelte-adapter-dom-shim §15). Props handed to `mount()` are a plain
  // object and are NOT reactive, so the two tests that change a prop AFTER mount drive it through
  // this module-scope `$state` bag instead.
  compileToFile(
    `<script module>
       export const control = $state({ disabled: undefined, label: undefined });
     </script>
     <script>
       import TouchableOpacity from './.smoke-compiled-touchable-opacity-own.mjs';
       let props = $props();
     </script>
     <TouchableOpacity
       {...props}
       disabled={control.disabled}
       accessibilityLabel={control.label}
     />`,
    'Parent.svelte',
    PARENT_OUT,
  );

  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (
    mod === null ||
    typeof mod !== 'object' ||
    !('default' in mod) ||
    !('control' in mod)
  ) {
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
  rmSync(VIEW_OUT, { force: true });
  rmSync(PRESSABLE_OUT, { force: true });
  rmSync(TOUCHABLE_OUT, { force: true });
  rmSync(PARENT_OUT, { force: true });
});

function findCommitted(
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  function walk(node: IFakeNode): IFakeNode | undefined {
    if (predicate(node)) return node;
    for (const child of node.children) {
      const hit = walk(child);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }
  return walk(fabric.appRoot());
}

// The responder is Pressable's own host view, identified by the testID every mount below sets.
function responderNode(): IFakeNode {
  const node = findCommitted(n => n.props.testID === TARGET);
  if (node === undefined) throw new Error(`no committed node testID=${TARGET}`);
  return node;
}

// `fabric.find` walks the CREATION log, whose props never reflect a later clone — an Animated
// frame lands through setNativeProps on the COMMITTED tree only (svelte-adapter-dom-shim §15).
function responderHandle(): unknown {
  const node = fabric.find(n => n.props.testID === TARGET);
  if (node === undefined) throw new Error(`no node created testID=${TARGET}`);
  return node.instanceHandle;
}

// The feedback node is the AnimatedView's own host view: the single RCTView child of the
// responder (no android_ripple on this platform, so nothing sits between them).
function feedbackProps(): Record<string, unknown> {
  const feedback = responderNode().children.find(n => n.viewName === 'RCTView');
  if (feedback === undefined)
    throw new Error('the responder committed no feedback child');
  return feedback.props;
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
  // why: RN drives this feedback with a real Animated.timing, not a discrete style swap. Proves
  // the fade runs through the engine's Animated graph onto the committed native node and that the
  // caller's base style survives the per-frame opacity-only diff.
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

    expect(asNumber(feedbackProps().opacity, 'resting')).toBe(1);
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

  // why: RN picks the press-in duration by where the event came from — 0 for the responder GRANT
  // (TouchableOpacity.js:215-220), which is what an ordinary tap is here, since Pressability
  // re-dispatches the grant event as the delay signal when delayPressIn is 0. Every adapter used
  // 150ms, so every tap darkened visibly slower than RN. THIS TEST AWAITS NOTHING AFTER THE
  // TOUCH ON PURPOSE: a duration-0 timing lands its value inside `.start()` with no frame at all,
  // while 150ms needs frames — and a flush helper burns past both
  // (.claude/rules/test-harness-false-greens.md §5).
  it('snaps to activeOpacity on press-in with no fade, as the grant branch does', async () => {
    const { Parent } = await loadParent();
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      activeOpacity: ACTIVE_OPACITY,
    });
    await tick();
    await tick();
    expect(asNumber(feedbackProps().opacity, 'resting')).toBe(1);

    fabric.fireEvent(responderHandle(), TOUCH_START);
    // One microtask is the coalesced setNativeProps flush, not a frame: a real fade would still be
    // near the resting 1 here, which is exactly what this row failed with when it was introduced.
    await Promise.resolve();
    expect(
      asNumber(feedbackProps().opacity, 'immediately after touch-down'),
      'a non-zero duration would still be fading here',
    ).toBeCloseTo(ACTIVE_OPACITY, 6);
  });

  // why: RN's _getChildStyleOpacityWithDefault settles the fade at the opacity the CALLER's style
  // asks for and SEEDS the Animated.Value with it, so a Touchable styled `opacity: 0.6` neither
  // flashes fully opaque on first paint nor brightens after its first press. A port hardcoding
  // RESTING_OPACITY passes every other test in this file.
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

  // why: RN's Touchables pass minPressDuration: 0 — Pressability's own 130ms floor
  // (Pressability.js:264) never reaches them, so defaulting to it delays EVERY press-out by an
  // eighth of a second. THIS TEST AWAITS NOTHING AFTER THE RELEASE ON PURPOSE: any flush helper
  // burns straight past a 130ms threshold and the assertion passes either way
  // (.claude/rules/test-harness-false-greens.md §5).
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

  // why: RN's componentDidUpdate re-settles the view when `disabled` flips, so a Touchable
  // disabled mid-press does not stay frozen at its active opacity.
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

  // why: the update effect reads `disabled` and the resting opacity as two SEPARATE deriveds
  // rather than one object, so an unrelated prop change cannot re-settle a live press. Folding
  // them into one `$derived` object (or reading `rest` wholesale) rebuilds a fresh object every
  // tick and cancels the fade the user is currently looking at.
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

  // why: RN re-settles on UPDATE only. Without the first-run guard the effect animates over the
  // value the Animated.Value was just seeded with — invisible in the committed value (it settles
  // where it started), so the only headless trace is that an animation was STARTED at all.
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

  // why: delayPressIn defers the pressed feedback past a quick swipe-through. Proves the adapter
  // threads the prop into the shared machine (the machine's own timing math is unit-tested at
  // core; this is the wiring).
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

  // why: a press must RE-PROP the feedback node, never rebuild it. A rebuilt subtree lands
  // between pressIn and the native responder grant and kills the gesture; the node counter is the
  // only headless trace of that (a fake Fabric has no grant to lose).
  it('creates no node across a full press cycle', async () => {
    const { Parent } = await loadParent();
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      activeOpacity: ACTIVE_OPACITY,
    });
    await tick();
    await tick();
    const createdAtMount = fabric.counts.createNode;

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flushFrames();
    expect(fabric.counts.createNode, 'press-in rebuilt a subtree').toBe(
      createdAtMount,
    );

    fabric.fireEvent(handle, TOUCH_END);
    await flushFrames();
    expect(fabric.counts.createNode, 'release rebuilt a subtree').toBe(
      createdAtMount,
    );
  });
});
