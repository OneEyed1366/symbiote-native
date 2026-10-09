// Smoke test of the lifecycle half of `KeyboardAvoidingView`, on the compiled `index.svelte`
// A fake `KeyboardObserver` records the subscribed events, `emitRnDeviceEvent` plays "native"

// Inset math, `position` nesting and the `enabled` gate are tested in core and in React
// No Negative group, a malformed payload leaves the inset alone; headless `Platform` is iOS

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createLiveTree,
  emitRnDeviceEvent,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_005;
// Beside the real source, since a compiled file resolves its relative imports from where it lives
const KAV_OUT = join(__dirname, '.smoke-compiled-keyboard-avoiding-view.mjs');
const BEHAVIOR_PARENT_OUT = join(
  __dirname,
  '.smoke-compiled-behavior-parent.mjs',
);

// Every event type pinged on the observe counter, which is what the component subscribed to
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

// The iOS cross-fade setting, flipped per test
// `AccessibilityInfo` caches the module object, so the flag is read through it
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

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

Object.assign(globalThis, {
  __turboModuleProxy: <T>(name: string): T | null => {
    const module = registeredModules[name];
    if (!isType<T>(module)) return null;
    return module;
  },
});

const SCREEN_HEIGHT = 800;
const FRAME_Y = 0;
const KEYBOARD_HEIGHT = 300;
// The keyboard top edge sits KEYBOARD_HEIGHT up from the screen bottom
const KEYBOARD_SCREEN_Y = SCREEN_HEIGHT - KEYBOARD_HEIGHT;
// inset = max(0, frameY + frameHeight - keyboardY) = 0 + 800 - 500 = 300
const EXPECTED_INSET = FRAME_Y + SCREEN_HEIGHT - KEYBOARD_SCREEN_Y;
const FULL_FRAME = { x: 0, y: FRAME_Y, width: 400, height: SCREEN_HEIGHT };
// The next `onLayout` in 'height' mode reports the wrapper shrunk by the inset
const SHRUNK_FRAME = {
  x: 0,
  y: FRAME_Y,
  width: 400,
  height: SCREEN_HEIGHT - EXPECTED_INSET,
};

// Spelled out, not derived from `keyboardAvoidingEventNamesFor`, or the test echoes its helper
const SHOW_EVENT = 'keyboardWillShow';
const HIDE_EVENT = 'keyboardWillHide';

const WRAPPER_TEST_ID = 'kav-wrapper';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settle = (rounds = 4): Promise<void> =>
  Array.from({ length: rounds }).reduce<Promise<void>>(
    pending => pending.then(tick),
    Promise.resolve(),
  );

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

// A parent owning `behavior` as `$state` with a setter, since runes live only in .svelte files
// It sits on one physical line so the compiler emits no whitespace-only text nodes
async function loadBehaviorParent(): Promise<Component> {
  await loadKeyboardAvoidingView();
  return compileAndImport(
    `<script>import KeyboardAvoidingView from './.smoke-compiled-keyboard-avoiding-view.mjs';let { bindSetBehavior, testID } = $props();let behavior = $state('padding');bindSetBehavior(next => { behavior = next; });</script><KeyboardAvoidingView {behavior} {testID} />`,
    'BehaviorParent.svelte',
    BEHAVIOR_PARENT_OUT,
  );
}

// No children snippet is passed, the committed props of the wrapper are the whole subject here
async function mountKeyboardAvoidingView(props: object): Promise<void> {
  const KeyboardAvoidingView = await loadKeyboardAvoidingView();
  mount(ROOT_TAG, KeyboardAvoidingView, { testID: WRAPPER_TEST_ID, ...props });
  await settle();
}

// `paddingBottom`, `height` and `flex` travel in the style slot, so only a live read sees a clone
function committedWrapper(): ILiveNode {
  const node = live.findLive(
    live.appRoot(),
    candidate => candidate.payload.testID === WRAPPER_TEST_ID,
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
  emitRnDeviceEvent(eventType, {
    endCoordinates: { height: KEYBOARD_HEIGHT, screenY },
  });
  await settle();
}

describe('KeyboardAvoidingView (real compiled index.svelte)', () => {
  describe("Positive: subscribes to this host's two keyboard notifications", () => {
    // RN takes the will* pair on iOS so the view rides up WITH the keyboard, never change-frame
    // Asserted by which events move the inset, so a re-added change-frame listener cannot pass
    it('reacts to keyboardWillShow/Hide and ignores the did* and change-frame notifications', async () => {
      await mountKeyboardAvoidingView({ behavior: 'padding' });
      await measure(FULL_FRAME);

      await emitKeyboard('keyboardDidShow');
      expect(committedWrapper().payload.paddingBottom).toBe(0);
      await emitKeyboard('keyboardDidChangeFrame');
      expect(committedWrapper().payload.paddingBottom).toBe(0);
      await emitKeyboard('keyboardWillChangeFrame');
      expect(committedWrapper().payload.paddingBottom).toBe(0);

      await emitKeyboard(SHOW_EVENT);
      expect(committedWrapper().payload.paddingBottom).toBe(EXPECTED_INSET);

      // The end of the dismissal animation must not lower the view either
      await emitKeyboard('keyboardDidHide');
      expect(committedWrapper().payload.paddingBottom).toBe(EXPECTED_INSET);
      await emitKeyboard(HIDE_EVENT);
      expect(committedWrapper().payload.paddingBottom).toBe(0);
    });

    // Two listeners per mount, never three, both removed on unmount, or a remount leaks a closure
    // A delta, since `Keyboard` installs its untracked cache feed lazily on the first `addListener`
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

  describe('Positive: the arguments the lifecycle feeds computeInset', () => {
    // 'height' mode shrinks the wrapper by the inset, so the next `onLayout` reports less height
    // The applied inset fed back as `previousInset` keeps the second event from sinking the view
    it('behavior="height": holds the inset when a second event arrives after the wrapper shrank', async () => {
      await mountKeyboardAvoidingView({ behavior: 'height' });
      await measure(FULL_FRAME);

      await emitKeyboard(SHOW_EVENT);
      expect(committedWrapper().payload.height).toBe(
        SCREEN_HEIGHT - EXPECTED_INSET,
      );
      expect(committedWrapper().payload.flex).toBe(0);

      // The shrunk wrapper re-measures itself, then the keyboard reports the same frame again
      await measure(SHRUNK_FRAME);
      await emitKeyboard(SHOW_EVENT);

      expect(committedWrapper().payload.height).toBe(
        SCREEN_HEIGHT - EXPECTED_INSET,
      );
      expect(committedWrapper().payload.flex).toBe(0);
    });

    // `behavior` is read inside a subscription that outlives the render, same staleness risk
    // Svelte compiles a destructured prop into a live getter, proven here instead of trusted
    // After switching to 'height' the next event must take the fixpoint branch
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
      expect(committedWrapper().payload.paddingBottom).toBe(EXPECTED_INSET);

      if (setBehavior === undefined)
        throw new Error('the parent never handed back its setter');
      setBehavior('height');
      await settle();
      // The applied inset now shrinks the wrapper, which re-measures itself
      expect(committedWrapper().payload.height).toBe(
        SCREEN_HEIGHT - EXPECTED_INSET,
      );
      await measure(SHRUNK_FRAME);

      await emitKeyboard(SHOW_EVENT);
      expect(committedWrapper().payload.height).toBe(
        SCREEN_HEIGHT - EXPECTED_INSET,
      );
    });

    // With the iOS cross-fade setting on `screenY` is 0, which the plain math lifts by y + height
    // The flag reaches `computeInset` only if the once-per-mount accessibility read is passed on
    it('a screenY=0 frame lifts nothing when Prefer Cross-Fade is on', async () => {
      prefersCrossFade = true;
      await mountKeyboardAvoidingView({ behavior: 'padding' });
      await measure(FULL_FRAME);

      await emitKeyboard(SHOW_EVENT, 0);
      expect(committedWrapper().payload.paddingBottom).toBe(0);
    });

    // With the setting off the same frame lifts the whole view, which isolates the setting
    it('the same frame lifts the whole view when Prefer Cross-Fade is off', async () => {
      prefersCrossFade = false;
      await mountKeyboardAvoidingView({ behavior: 'padding' });
      await measure(FULL_FRAME);

      await emitKeyboard(SHOW_EVENT, 0);
      expect(committedWrapper().payload.paddingBottom).toBe(
        FRAME_Y + SCREEN_HEIGHT,
      );
    });
  });
});
