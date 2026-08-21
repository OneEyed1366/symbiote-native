// Co-located Vue-driven pipeline test for the KeyboardAvoidingView lifecycle half
// (adapters/vue/src/components/keyboard-avoiding-view.ts): which keyboard notifications it
// subscribes to, what it feeds computeInset on each of them, and that it tears the
// subscriptions down.
//
// The inset math itself (computeInset / resolveKeyboardAvoidingLayout / the cross-fade early
// return) is unit-tested in core/components/src/view/render-keyboard-avoiding-view.test.ts, and
// the Keyboard module's own subscribe/cache/unsubscribe contract in
// core/engine/src/keyboard/keyboard.test.ts — neither is re-derived here. What IS Vue's own is
// the wiring: the event pair comes from the host, the previous inset is read live off the
// reactive cell at event time, and the cross-fade flag is a plain non-reactive variable resolved
// once in onMounted.
//
// Platform.OS resolves to 'ios' headless (core/engine/src/platform/index.ts re-exports index.ios),
// so the expected pair is the will* one; the android did* branch is covered at the core level.
//
// The fake __turboModuleProxy answers with a KeyboardObserver (whose observe-counters record the
// subscribed event NAMES) and an AccessibilityManager whose cross-fade getter is switchable per
// test; the fake RN$registerCallableModule captures the device hub so the test can play "native".

import { defineComponent, h, ref, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KeyboardAvoidingView, mount, unmount } from '@symbiote-native/vue';
import { Keyboard, KEYBOARD_EVENT } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 517;

// ---- fake native-module + device-hub globals ----------------------------

// Every event type the Keyboard module told native to observe, in order.
const subscribedEvents: string[] = [];
let keyboardRemoved = 0;
const fakeKeyboardObserver = {
  addListener: (eventType: string): void => {
    subscribedEvents.push(eventType);
  },
  removeListeners: (count: number): void => {
    keyboardRemoved += count;
  },
};

// The iOS "Prefer Cross-Fade Transitions" setting, flipped per test before mount.
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
  emit: (eventType: string, ...args: unknown[]) => void;
}

let deviceHub: IDeviceHub | undefined;

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

Object.assign(globalThis, {
  __turboModuleProxy: <T>(name: string): T | null => {
    const module = registeredModules[name];
    if (module === undefined || module === null) return null;
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

// The Keyboard module self-subscribes to didShow/didHide ONCE, when its emitter is first created,
// to feed the isVisible()/metrics() cache. Force that here so those two never land inside a test's
// own recording (beforeEach clears it).
Keyboard.addListener(KEYBOARD_EVENT.didShow, () => {}).remove();

function hub(): IDeviceHub {
  if (deviceHub === undefined)
    throw new Error('the device hub was never registered');
  return deviceHub;
}

// ---- inset geometry -----------------------------------------------------

const SCREEN_HEIGHT = 800;
const FRAME_Y = 0;
const KEYBOARD_HEIGHT = 300;
// Keyboard top edge sits KEYBOARD_HEIGHT up from the screen bottom.
const KEYBOARD_SCREEN_Y = SCREEN_HEIGHT - KEYBOARD_HEIGHT;
// inset = max(0, frameY + frameHeight - keyboardY) = 0 + 800 - 500 = 300.
const EXPECTED_INSET = FRAME_Y + SCREEN_HEIGHT - KEYBOARD_SCREEN_Y;
// What 'height' mode shrinks the wrapper to, and therefore what its NEXT onLayout reports.
const SHRUNK_HEIGHT = SCREEN_HEIGHT - EXPECTED_INSET;

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  subscribedEvents.length = 0;
  keyboardRemoved = 0;
  prefersCrossFade = false;
});
afterEach(() => unmount(ROOT_TAG));

function mountKav(props: Record<string, unknown>): void {
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => (): VNode =>
        h(KeyboardAvoidingView, { style: { flex: 1 }, ...props }, () =>
          h('symbiote-view'),
        ),
    }),
  );
}

// The current committed wrapper (the outer RCTView KeyboardAvoidingView renders). Re-read after
// every commit, since clone-on-write hands back new nodes.
function currentWrapper(): IFakeNode {
  const wrapper = fabric.appRoot().children[0];
  expect(wrapper, 'an RCTView wrapper sits under the root').toBeDefined();
  expect(wrapper.viewName).toBe('RCTView');
  return wrapper;
}

function measureWrapper(height = SCREEN_HEIGHT): void {
  fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', {
    layout: { x: 0, y: FRAME_Y, width: 400, height },
  });
}

function showKeyboard(
  screenY = KEYBOARD_SCREEN_Y,
  height = KEYBOARD_HEIGHT,
): void {
  hub().emit(KEYBOARD_EVENT.willShow, { endCoordinates: { height, screenY } });
}
function hideKeyboard(): void {
  hub().emit(KEYBOARD_EVENT.willHide, {
    endCoordinates: { height: 0, screenY: SCREEN_HEIGHT },
  });
}

describe('Vue KeyboardAvoidingView on the engine', () => {
  describe('Positive — the subscription is the host pair, and only the pair', () => {
    // why: RN subscribes to exactly TWO notifications, chosen per host, and its own comment says
    // changeFrame must not be one of them — with an undocked/split/floating iOS keyboard it is
    // emitted BEFORE the hide notification, so a change-frame listener applies a frame captured
    // mid-dismissal. iOS additionally takes the will* pair so the view rides up WITH the keyboard
    // animation instead of snapping into place after it.
    it('subscribes to this host two keyboard events and never to changeFrame', async () => {
      mountKav({ behavior: 'padding' });
      await tick();

      expect(subscribedEvents).toEqual([
        KEYBOARD_EVENT.willShow,
        KEYBOARD_EVENT.willHide,
      ]);
      expect(subscribedEvents).not.toContain(KEYBOARD_EVENT.didChangeFrame);
    });

    // why: onUnmounted must drop both, or every remount leaks native observers whose closures
    // write an inset into a disposed component's ref. A delta from a per-test-zeroed counter, so
    // the module-level cache feed (warmed above) can never skew it.
    it('removes both subscriptions on unmount', async () => {
      mountKav({ behavior: 'padding' });
      await tick();
      expect(subscribedEvents).toHaveLength(2);

      unmount(ROOT_TAG);
      expect(keyboardRemoved).toBe(2);
    });
  });

  describe('Positive — the inset reaches the host through the will* pair', () => {
    // why: the baseline the rest of the file leans on — the events actually named above drive the
    // inset all the way onto the wrapper's paddingBottom, and a hide zeroes it.
    it('behavior="padding": tracks the keyboard inset across show/hide', async () => {
      mountKav({ behavior: 'padding' });
      await tick();
      measureWrapper();

      showKeyboard();
      await tick();
      expect(currentWrapper().props.paddingBottom).toBe(EXPECTED_INSET);

      hideKeyboard();
      await tick();
      expect(currentWrapper().props.paddingBottom).toBe(0);
    });

    // why: Vue does NOT camelCase $attrs, so a template's `:keyboard-vertical-offset` arrives
    // kebab-keyed. The render path already normalized; the keyboard handler read rawAttrs
    // directly, silently dropping the offset for every SFC that writes the prop idiomatically —
    // the offset is what keeps a view under a header clear of the keyboard.
    it('resolves a kebab-case keyboardVerticalOffset inside the handler', async () => {
      const OFFSET = 40;
      mountKav({ behavior: 'padding', 'keyboard-vertical-offset': OFFSET });
      await tick();
      measureWrapper();

      showKeyboard();
      await tick();
      expect(currentWrapper().props.paddingBottom).toBe(
        EXPECTED_INSET + OFFSET,
      );
    });
  });

  describe('Positive — what the handler reads at event time (previousInset, behavior)', () => {
    // why: THE regression this change exists for. In 'height' mode the wrapper is SHRUNK by the
    // inset, so its next onLayout reports a frame shorter by exactly that much. Feeding
    // computeInset the currently-applied inset cancels the shrink; without it the second keyboard
    // event computes 0 and the view walks straight back down under the keyboard. The previous
    // inset must be read at EVENT time off the reactive cell, not captured when the handler was
    // created.
    it('behavior="height": holds the inset when the shrunk wrapper re-reports a shorter frame', async () => {
      mountKav({ behavior: 'height' });
      await tick();
      measureWrapper();

      showKeyboard();
      await tick();
      expect(currentWrapper().props.height).toBe(SHRUNK_HEIGHT);
      expect(currentWrapper().props.flex).toBe(0);

      // The shrunk wrapper lays out again and reports its NEW, shorter height.
      measureWrapper(SHRUNK_HEIGHT);
      showKeyboard();
      await tick();
      expect(
        currentWrapper().props.height,
        'the inset must stay put, not shrink again',
      ).toBe(SHRUNK_HEIGHT);
    });

    // why: `behavior` carries the same staleness risk as the previous inset — it is a prop read
    // from inside a subscription that outlives every render, so a handler that captured it in
    // setup would keep applying the OLD behavior's math forever. The tell is the same fixpoint:
    // once switched to 'height', the second event must hold the inset; a handler still on
    // 'padding' skips the correction and drops the wrapper back to full height.
    it('applies a behavior changed after mount, without re-subscribing', async () => {
      const behavior = ref('padding');
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => (): VNode =>
            h(
              KeyboardAvoidingView,
              { style: { flex: 1 }, behavior: behavior.value },
              () => h('symbiote-view'),
            ),
        }),
      );
      await tick();
      measureWrapper();

      showKeyboard();
      await tick();
      expect(currentWrapper().props.paddingBottom).toBe(EXPECTED_INSET);

      behavior.value = 'height';
      await tick();
      expect(
        currentWrapper().props.height,
        'the new behavior reaches the render',
      ).toBe(SHRUNK_HEIGHT);

      // The now-shrunk wrapper lays out again and reports its shorter height.
      measureWrapper(SHRUNK_HEIGHT);
      showKeyboard();
      await tick();
      expect(
        currentWrapper().props.height,
        'the handler must read the CURRENT behavior',
      ).toBe(SHRUNK_HEIGHT);
      expect(
        subscribedEvents,
        'a behavior change must not re-subscribe',
      ).toHaveLength(2);
    });
  });

  describe('Positive — the iOS Prefer-Cross-Fade setting', () => {
    // why: with that accessibility setting on, iOS reports the keyboard screenY as 0 rather than
    // its real top edge, and the ordinary math turns that into "lift the view by its whole
    // y + height" — the content goes clean off screen. Core answers 0, but only if the adapter
    // passes the flag it read in onMounted.
    it('lifts nothing when screenY is 0 and the setting is on', async () => {
      prefersCrossFade = true;
      mountKav({ behavior: 'padding' });
      await tick();
      measureWrapper();

      showKeyboard(0, SCREEN_HEIGHT);
      await tick();
      const padding = currentWrapper().props.paddingBottom;
      expect(
        padding === undefined || padding === 0,
        `nothing lifted, got paddingBottom ${String(padding)}`,
      ).toBe(true);
    });

    // why: the other half — the same screenY 0 with the setting OFF is an ordinary (if extreme)
    // frame and must still lift, so the guard above cannot be a blanket "screenY 0 means nothing".
    it('still lifts when screenY is 0 and the setting is off', async () => {
      mountKav({ behavior: 'padding' });
      await tick();
      measureWrapper();

      showKeyboard(0, SCREEN_HEIGHT);
      await tick();
      expect(currentWrapper().props.paddingBottom).toBe(SCREEN_HEIGHT);
    });
  });
});
