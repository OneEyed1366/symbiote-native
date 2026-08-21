// Co-located smoke for the ONLY half of KeyboardAvoidingView this adapter owns: the lifecycle.
// Compiles the REAL index.svelte through svelte/compiler and mounts it on a fake-Fabric recorder
// (same harness shape as switch.smoke.test.ts / modal.smoke.test.ts), then plays "native" through
// the device-event hub: a fake KeyboardObserver records which notifications were subscribed to and
// a fake AccessibilityManager answers the Prefer-Cross-Fade getter.
//
// Coverage ledger (per CLAUDE.md's <components_split_logic_view_lifecycle>):
//   - computeInset's own branches (the offset math, the 'height' fixpoint term, the cross-fade
//     early return, the undefined-frame/undefined-keyboard guards) and
//     resolveKeyboardAvoidingLayout's behavior -> style/nesting fold — N/A: covered directly by
//     core/components/src/view/render-keyboard-avoiding-view.test.ts. This file instead proves the
//     Svelte lifecycle FEEDS those functions the right arguments, which a pure-function test of
//     them cannot: which two notifications the $effect subscribes to, that the LIVE `inset` and
//     `behavior` (not values frozen when the handler was built) reach the math, that the once-per-
//     mount readPrefersCrossFadeTransitions() answer does too, and that both subscriptions are
//     torn down on unmount.
//   - the Keyboard module's own subscribe/cache/removeAllListeners contract — N/A: covered by
//     core/engine/src/keyboard/keyboard.test.ts.
//   - the behavior='position' nesting and the `enabled` gate — N/A: pure $derived pass-throughs of
//     resolveKeyboardAvoidingLayout's output, exercised by the core test and by React's own
//     keyboard-avoiding-view.test.tsx; nothing Svelte-specific happens on those paths.
//
// No Negative group: index.svelte has no throwing path — every malformed native payload degrades
// through readKeyboardFrame/readLayoutFrame's `undefined` returns to "leave the inset alone".
//
// Headless Platform.OS is 'ios' (core/engine/src/platform/index.ts re-exports the iOS build), so
// this file asserts the iOS pair; the Android branch of keyboardAvoidingEventNamesFor is unit-
// tested in core, where the host is an argument rather than a module resolution.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_005;
// Co-located with the real source (not an isolated temp dir) — same reason as
// switch.smoke.test.ts: a compiled component's own relative imports (`../../runes/attachments`,
// `../../dom-shim`) resolve relative to where the compiled FILE lives.
const KAV_OUT = join(__dirname, '.smoke-compiled-keyboard-avoiding-view.mjs');
const BEHAVIOR_PARENT_OUT = join(
  __dirname,
  '.smoke-compiled-behavior-parent.mjs',
);

// ---- fake native modules + device hub -----------------------------------

// Every event type the component's subscriptions pinged the native observe-counter with, in
// order. NativeEventEmitter.addListener forwards the event type to the module's own addListener
// (RN's observe-counter contract), so this is what the component actually subscribed to.
const subscribedEvents: string[] = [];
let removedListeners = 0;
const fakeKeyboardObserver = {
  addListener: (eventType: string): void => {
    subscribedEvents.push(eventType);
  },
  removeListeners: (count: number): void => {
    removedListeners += count;
  },
};

// The iOS "Prefer Cross-Fade Transitions" setting, flipped per test. Read through the module
// OBJECT (which AccessibilityInfo caches on first resolve) rather than swapped module, so a later
// test still sees its own value.
let prefersCrossFade = false;
const fakeAccessibilityManager = {
  getCurrentPrefersCrossFadeTransitionsState: (
    onSuccess: (enabled: boolean) => void,
  ): void => {
    onSuccess(prefersCrossFade);
  },
  addListener: (): void => {},
  removeListeners: (): void => {},
};

const registeredModules: Record<string, unknown> = {
  KeyboardObserver: fakeKeyboardObserver,
  AccessibilityManager: fakeAccessibilityManager,
};

interface IDeviceHub {
  emit(eventType: string, ...args: unknown[]): void;
}

// The device hub the engine registers on the first Keyboard.addListener, captured so this test
// can act as "native".
let deviceHub: IDeviceHub | undefined;

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

Object.assign(globalThis, {
  __turboModuleProxy: <T>(name: string): T | null => {
    const module = registeredModules[name];
    if (!isType<T>(module)) return null;
    return module;
  },
  RN$registerCallableModule: (
    name: string,
    factory: () => IDeviceHub,
  ): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  },
});

function hub(): IDeviceHub {
  if (deviceHub === undefined)
    throw new Error('the device event hub was never installed');
  return deviceHub;
}

// ---- geometry -----------------------------------------------------------

const SCREEN_HEIGHT = 800;
const FRAME_Y = 0;
const KEYBOARD_HEIGHT = 300;
// The keyboard's top edge sits KEYBOARD_HEIGHT up from the screen bottom.
const KEYBOARD_SCREEN_Y = SCREEN_HEIGHT - KEYBOARD_HEIGHT;
// inset = max(0, frameY + frameHeight - keyboardY) = 0 + 800 - 500 = 300.
const EXPECTED_INSET = FRAME_Y + SCREEN_HEIGHT - KEYBOARD_SCREEN_Y;
const FULL_FRAME = { x: 0, y: FRAME_Y, width: 400, height: SCREEN_HEIGHT };
// What onLayout reports on the NEXT pass in 'height' mode: the wrapper was shrunk by the inset.
const SHRUNK_FRAME = {
  x: 0,
  y: FRAME_Y,
  width: 400,
  height: SCREEN_HEIGHT - EXPECTED_INSET,
};

// The two notifications keyboardAvoidingEventNamesFor('ios') resolves to, spelled out so the
// assertions read as the contract rather than as an echo of the helper they check.
const SHOW_EVENT = 'keyboardWillShow';
const HIDE_EVENT = 'keyboardWillHide';

const WRAPPER_TEST_ID = 'kav-wrapper';

// ---- harness ------------------------------------------------------------

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settle = async (rounds = 4): Promise<void> => {
  for (let index = 0; index < rounds; index += 1) await tick();
};

beforeEach(() => {
  fabric.reset();
  prefersCrossFade = false;
});

afterEach(async () => {
  unmount(ROOT_TAG);
  await settle();
  rmSync(KAV_OUT, { force: true });
  rmSync(BEHAVIOR_PARENT_OUT, { force: true });
});

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

async function compileAndImport(
  source: string,
  filename: string,
  outPath: string,
): Promise<Component> {
  writeFileSync(
    outPath,
    compile(source, { ...COMPILE_OPTIONS, filename }).js.code,
  );
  const module: unknown = await import(`file://${outPath}`);
  if (module === null || typeof module !== 'object' || !('default' in module)) {
    throw new Error(`${filename} produced no default export`);
  }
  const component: unknown = module.default;
  if (typeof component !== 'function')
    throw new Error(`${filename}'s default export is not a component`);
  return component;
}

function loadKeyboardAvoidingView(): Promise<Component> {
  return compileAndImport(
    readFileSync(join(__dirname, 'index.svelte'), 'utf8'),
    'KeyboardAvoidingView.svelte',
    KAV_OUT,
  );
}

// A parent that owns `behavior` as its OWN $state and hands the test a setter for it, so a prop
// change AFTER mount can be driven from a .ts file (runes only exist inside .svelte). Written on
// one physical line so the compiler emits no incidental whitespace-only text nodes.
async function loadBehaviorParent(): Promise<Component> {
  await loadKeyboardAvoidingView();
  return compileAndImport(
    `<script>import KeyboardAvoidingView from './.smoke-compiled-keyboard-avoiding-view.mjs';let { bindSetBehavior, testID } = $props();let behavior = $state('padding');bindSetBehavior(next => { behavior = next; });</script><KeyboardAvoidingView {behavior} {testID} />`,
    'BehaviorParent.svelte',
    BEHAVIOR_PARENT_OUT,
  );
}

// No children snippet is passed: the wrapper's own committed props are the whole subject here, and
// `{@render children?.()}` renders nothing when the snippet is absent.
async function mountKeyboardAvoidingView(props: object): Promise<void> {
  const KeyboardAvoidingView = await loadKeyboardAvoidingView();
  mount(ROOT_TAG, KeyboardAvoidingView, { testID: WRAPPER_TEST_ID, ...props });
  await settle();
}

// Walks the CURRENTLY COMMITTED tree: `fabric.find` walks the creation log, whose `.props` are
// frozen at first commit (clone-on-write hands back a new object on every update).
function findInCommittedTree(
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  function walk(nodes: IFakeNode[]): IFakeNode | undefined {
    for (const node of nodes) {
      if (predicate(node)) return node;
      const found = walk(node.children);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  return walk(fabric.appRoot().children);
}

function committedWrapper(): IFakeNode {
  const node = findInCommittedTree(
    candidate => candidate.props.testID === WRAPPER_TEST_ID,
  );
  if (node === undefined)
    throw new Error('the KeyboardAvoidingView wrapper is not committed');
  return node;
}

async function measure(frame: Record<string, number>): Promise<void> {
  fabric.fireEvent(committedWrapper().instanceHandle, 'topLayout', {
    layout: frame,
  });
  await settle();
}

async function emitKeyboard(
  eventType: string,
  screenY = KEYBOARD_SCREEN_Y,
): Promise<void> {
  hub().emit(eventType, {
    endCoordinates: { height: KEYBOARD_HEIGHT, screenY },
  });
  await settle();
}

describe('KeyboardAvoidingView (real compiled index.svelte)', () => {
  describe('Positive — subscribes to this host’s two keyboard notifications', () => {
    // why: RN subscribes to the will* pair on iOS so the view rides up WITH the keyboard
    // animation, and deliberately never to a change-frame notification (its own comment: with an
    // undocked/split/floating keyboard, change-frame arrives BEFORE hide, so its frame is captured
    // mid-dismissal). Asserted behaviourally — which events actually move the inset — rather than
    // only by the subscription record, so a future refactor that re-adds a change-frame listener
    // cannot pass by keeping the counter happy.
    it('reacts to keyboardWillShow/Hide and ignores the did* and change-frame notifications', async () => {
      await mountKeyboardAvoidingView({ behavior: 'padding' });
      await measure(FULL_FRAME);

      await emitKeyboard('keyboardDidShow');
      expect(committedWrapper().props.paddingBottom).toBe(0);
      await emitKeyboard('keyboardDidChangeFrame');
      expect(committedWrapper().props.paddingBottom).toBe(0);
      await emitKeyboard('keyboardWillChangeFrame');
      expect(committedWrapper().props.paddingBottom).toBe(0);

      await emitKeyboard(SHOW_EVENT);
      expect(committedWrapper().props.paddingBottom).toBe(EXPECTED_INSET);

      // The keyboard finishing its dismissal animation must not be what lowers the view either.
      await emitKeyboard('keyboardDidHide');
      expect(committedWrapper().props.paddingBottom).toBe(EXPECTED_INSET);
      await emitKeyboard(HIDE_EVENT);
      expect(committedWrapper().props.paddingBottom).toBe(0);
    });

    // why: TWO listeners per mount, never three, and both removed on unmount — a leak here means
    // every remount adds another stale closure onto an unmounted component. A DELTA (not an
    // absolute count) because the Keyboard module installs its own untracked cache-feed
    // subscription lazily, on whichever addListener call in the process comes first.
    it('adds exactly the show/hide pair on mount and removes both on unmount', async () => {
      await mountKeyboardAvoidingView({ behavior: 'padding' });
      unmount(ROOT_TAG);
      await settle();

      const addedBefore = subscribedEvents.length;
      const removedBefore = removedListeners;
      await mountKeyboardAvoidingView({ behavior: 'padding' });
      expect(subscribedEvents.slice(addedBefore)).toEqual([
        SHOW_EVENT,
        HIDE_EVENT,
      ]);

      unmount(ROOT_TAG);
      await settle();
      expect(removedListeners - removedBefore).toBe(2);
    });
  });

  describe('Positive — the arguments the lifecycle feeds computeInset', () => {
    // why: THE regression this whole change exists for. In 'height' mode the wrapper is shrunk by
    // the inset, so its next onLayout reports a frame shorter by exactly that much; without
    // feeding the currently-applied inset back in as `previousInset`, the second keyboard event
    // computes a smaller overlap and the view walks back down under the keyboard. Reading `inset`
    // at event time (not when the handler was built) is what keeps that term live.
    it('behavior="height": holds the inset when a second event arrives after the wrapper shrank', async () => {
      await mountKeyboardAvoidingView({ behavior: 'height' });
      await measure(FULL_FRAME);

      await emitKeyboard(SHOW_EVENT);
      expect(committedWrapper().props.height).toBe(
        SCREEN_HEIGHT - EXPECTED_INSET,
      );
      expect(committedWrapper().props.flex).toBe(0);

      // The shrunk wrapper re-measures itself, then the keyboard reports the same frame again.
      await measure(SHRUNK_FRAME);
      await emitKeyboard(SHOW_EVENT);

      expect(committedWrapper().props.height).toBe(
        SCREEN_HEIGHT - EXPECTED_INSET,
      );
      expect(committedWrapper().props.flex).toBe(0);
    });

    // why: `behavior` carries the same staleness risk as `previousInset` — it is a prop read from
    // inside a subscription that outlives the render it was created in, so a handler that captured
    // it at mount would keep applying the OLD behavior's math forever. Svelte compiles a
    // destructured prop into a live getter, which this proves end to end rather than by trusting
    // the compiler: switch to 'height' AFTER mount and the next event must take the fixpoint
    // branch (a captured 'padding' computes 0 instead and drops the view back down).
    it('applies a behavior changed after mount on the very next keyboard event', async () => {
      let setBehavior: ((next: string) => void) | undefined;
      const BehaviorParent = await loadBehaviorParent();
      mount(ROOT_TAG, BehaviorParent, {
        testID: WRAPPER_TEST_ID,
        bindSetBehavior: (setter: (next: string) => void): void => {
          setBehavior = setter;
        },
      });
      await settle();
      await measure(FULL_FRAME);

      await emitKeyboard(SHOW_EVENT);
      expect(committedWrapper().props.paddingBottom).toBe(EXPECTED_INSET);

      if (setBehavior === undefined)
        throw new Error('the parent never handed back its setter');
      setBehavior('height');
      await settle();
      // The already-applied inset now shrinks the wrapper, which re-measures itself.
      expect(committedWrapper().props.height).toBe(
        SCREEN_HEIGHT - EXPECTED_INSET,
      );
      await measure(SHRUNK_FRAME);

      await emitKeyboard(SHOW_EVENT);
      expect(committedWrapper().props.height).toBe(
        SCREEN_HEIGHT - EXPECTED_INSET,
      );
    });

    // why: with the iOS Prefer-Cross-Fade setting on, the keyboard reports screenY as 0, which the
    // ordinary math turns into "lift the view by its entire y + height" — the content goes clean
    // off screen. The flag only reaches computeInset if this adapter's once-per-mount
    // AccessibilityInfo read resolved and was passed through.
    it('a screenY=0 frame lifts nothing when Prefer Cross-Fade is on', async () => {
      prefersCrossFade = true;
      await mountKeyboardAvoidingView({ behavior: 'padding' });
      await measure(FULL_FRAME);

      await emitKeyboard(SHOW_EVENT, 0);
      expect(committedWrapper().props.paddingBottom).toBe(0);
    });

    // why: the boundary that proves the test above is about the SETTING and not about screenY=0
    // being inert on its own — with the setting off, the very same frame lifts the view by its
    // whole height (RN's behaviour, and the bug users see when the flag is dropped on the floor).
    it('the same frame lifts the whole view when Prefer Cross-Fade is off', async () => {
      prefersCrossFade = false;
      await mountKeyboardAvoidingView({ behavior: 'padding' });
      await measure(FULL_FRAME);

      await emitKeyboard(SHOW_EVENT, 0);
      expect(committedWrapper().props.paddingBottom).toBe(
        FRAME_Y + SCREEN_HEIGHT,
      );
    });
  });
});
