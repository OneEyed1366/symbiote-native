// Vue lifecycle of `KeyboardAvoidingView`: the keyboard events it subscribes to, what it feeds
// `computeInset` on each, the live previous inset read off the reactive cell and teardown
// Headless `Platform` is iOS so the will* pair is expected; the inset math is tested in core

import { defineComponent, h, ref, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KeyboardAvoidingView, mount, unmount } from '@symbiote-native/vue';
import { Keyboard, KEYBOARD_EVENT } from '@symbiote-native/engine';
import {
  createLiveTree,
  emitRnDeviceEvent,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

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
});

// The Keyboard module self-subscribes to didShow/didHide ONCE, when its emitter is first created,
// to feed the isVisible()/metrics() cache. Force that here so those two never land inside a test's
// own recording (beforeEach clears it).
Keyboard.addListener(KEYBOARD_EVENT.didShow, () => {}).remove();

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

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
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
          h('view'),
        ),
    }),
  );
}

// The current committed wrapper (the outer RCTView KeyboardAvoidingView renders).
function currentWrapper(): ILiveNode {
  const wrapper = live.nodeOf(live.appRoot()).children[0];
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
  emitRnDeviceEvent(KEYBOARD_EVENT.willShow, {
    endCoordinates: { height, screenY },
  });
}
function hideKeyboard(): void {
  emitRnDeviceEvent(KEYBOARD_EVENT.willHide, {
    endCoordinates: { height: 0, screenY: SCREEN_HEIGHT },
  });
}

describe('Vue KeyboardAvoidingView on the engine', () => {
  describe('Positive — the subscription is the host pair, and only the pair', () => {
    // RN subscribes to two notifications per host and never to change-frame, which an undocked
    // iOS keyboard emits BEFORE the hide; iOS takes the will* pair to ride up WITH the keyboard
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
      expect(currentWrapper().payload.paddingBottom).toBe(EXPECTED_INSET);

      hideKeyboard();
      await tick();
      expect(currentWrapper().payload.paddingBottom).toBe(0);
    });

    // Vue does not `camelCase` `$attrs`, so `:keyboard-vertical-offset` arrives kebab-keyed
    // The handler must normalize it too, or the offset that clears a header is silently dropped
    it('resolves a kebab-case keyboardVerticalOffset inside the handler', async () => {
      const OFFSET = 40;
      mountKav({ behavior: 'padding', 'keyboard-vertical-offset': OFFSET });
      await tick();
      measureWrapper();

      showKeyboard();
      await tick();
      expect(currentWrapper().payload.paddingBottom).toBe(
        EXPECTED_INSET + OFFSET,
      );
    });
  });

  describe('Positive — what the handler reads at event time (previousInset, behavior)', () => {
    // 'height' mode shrinks the wrapper by the inset, so the next `onLayout` reports less height
    // Feeding `computeInset` the applied inset cancels the shrink, read at EVENT time off the cell
    it('behavior="height": holds the inset when the shrunk wrapper re-reports a shorter frame', async () => {
      mountKav({ behavior: 'height' });
      await tick();
      measureWrapper();

      showKeyboard();
      await tick();
      expect(currentWrapper().payload.height).toBe(SHRUNK_HEIGHT);
      expect(currentWrapper().payload.flex).toBe(0);

      // The shrunk wrapper lays out again and reports its NEW, shorter height.
      measureWrapper(SHRUNK_HEIGHT);
      showKeyboard();
      await tick();
      expect(
        currentWrapper().payload.height,
        'the inset must stay put, not shrink again',
      ).toBe(SHRUNK_HEIGHT);
    });

    // `behavior` is read inside a subscription that outlives every render, same staleness risk as
    // the previous inset; after switching to 'height' the second event must hold the inset
    it('applies a behavior changed after mount, without re-subscribing', async () => {
      const behavior = ref('padding');
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => (): VNode =>
            h(
              KeyboardAvoidingView,
              { style: { flex: 1 }, behavior: behavior.value },
              () => h('view'),
            ),
        }),
      );
      await tick();
      measureWrapper();

      showKeyboard();
      await tick();
      expect(currentWrapper().payload.paddingBottom).toBe(EXPECTED_INSET);

      behavior.value = 'height';
      await tick();
      expect(
        currentWrapper().payload.height,
        'the new behavior reaches the render',
      ).toBe(SHRUNK_HEIGHT);

      // The now-shrunk wrapper lays out again and reports its shorter height.
      measureWrapper(SHRUNK_HEIGHT);
      showKeyboard();
      await tick();
      expect(
        currentWrapper().payload.height,
        'the handler must read the CURRENT behavior',
      ).toBe(SHRUNK_HEIGHT);
      expect(
        subscribedEvents,
        'a behavior change must not re-subscribe',
      ).toHaveLength(2);
    });
  });

  describe('Positive — the iOS Prefer-Cross-Fade setting', () => {
    // With that setting on, iOS reports `screenY` 0, which the plain math turns into a lift by
    // the whole y + height; core answers 0 only if the adapter passes the flag read in `onMounted`
    it('lifts nothing when screenY is 0 and the setting is on', async () => {
      prefersCrossFade = true;
      mountKav({ behavior: 'padding' });
      await tick();
      measureWrapper();

      showKeyboard(0, SCREEN_HEIGHT);
      await tick();
      const padding = currentWrapper().payload.paddingBottom;
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
      expect(currentWrapper().payload.paddingBottom).toBe(SCREEN_HEIGHT);
    });
  });
});
