// React lifecycle of `KeyboardAvoidingView`: events the effect subscribes to, the live inset fed
// back as `previousInset`, the one-off cross-fade read and cleanup; inset math lives in core
// Headless `Platform` is iOS, so the will* pair is subscribed; no Negative group, nothing throws

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KeyboardAvoidingView, mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  emitRnDeviceEvent,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 290;

let keyboardAdded = 0;
let keyboardRemoved = 0;
const fakeKeyboardObserver = {
  addListener: (): void => {
    keyboardAdded += 1;
  },
  removeListeners: (count: number): void => {
    keyboardRemoved += count;
  },
};
// The iOS cross-fade setting is read once per mount and the module is cached on first lookup
// So the flag stays mutable behind a stable getter instead of swapping modules between tests
let prefersCrossFade = false;
const fakeAccessibilityManager = {
  getCurrentPrefersCrossFadeTransitionsState: (
    onSuccess: (enabled: boolean) => void,
    _onError: (error: unknown) => void,
  ): void => {
    onSuccess(prefersCrossFade);
  },
};

const registeredModules: Record<string, unknown> = {
  KeyboardObserver: fakeKeyboardObserver,
  AccessibilityManager: fakeAccessibilityManager,
};

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

Object.assign(globalThis, {
  __turboModuleProxy: <T,>(name: string): T | null => {
    const module = registeredModules[name];
    if (module === undefined || module === null) return null;
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
const WRAPPER_FRAME = { x: 0, y: FRAME_Y, width: 400, height: SCREEN_HEIGHT };

// Spelled out instead of derived from `keyboardAvoidingEventNamesFor`, or a rename would pass
const SHOW_EVENT = 'keyboardWillShow';
const HIDE_EVENT = 'keyboardWillHide';

const FILL_STYLE = { flex: 1 };

function App(
  props: Partial<
    Pick<
      Parameters<typeof KeyboardAvoidingView>[0],
      'behavior' | 'enabled' | 'keyboardVerticalOffset'
    >
  >,
): ReactElement {
  return (
    <KeyboardAvoidingView style={FILL_STYLE} {...props}>
      <text>type here</text>
    </KeyboardAvoidingView>
  );
}

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => {
  fabric.reset();
  keyboardAdded = 0;
  keyboardRemoved = 0;
  prefersCrossFade = false;
});
afterEach(() => unmount(ROOT_TAG));

// The outer RCTView that `KeyboardAvoidingView` renders, re-read after each commit
function currentWrapper(): ILiveNode {
  const wrapper = live.nodeOf(live.appRoot()).children[0];
  expect(wrapper, 'an RCTView wrapper sits under the root').toBeDefined();
  expect(wrapper.viewName).toBe('RCTView');
  return wrapper;
}

function showKeyboard(screenY: number = KEYBOARD_SCREEN_Y): void {
  emitRnDeviceEvent(SHOW_EVENT, {
    endCoordinates: { height: KEYBOARD_HEIGHT, screenY },
  });
}
function hideKeyboard(): void {
  emitRnDeviceEvent(HIDE_EVENT, {
    endCoordinates: { height: 0, screenY: SCREEN_HEIGHT },
  });
}

// The cross-fade setting arrives through a promise, let it land before the math runs
async function settleCrossFadeRead(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

// The fake slot does not re-lay out after a commit like native does, so each scenario says so
function measureWrapper(height: number): void {
  fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', {
    layout: { ...WRAPPER_FRAME, height },
  });
}

describe('KeyboardAvoidingView', () => {
  describe('Positive: behavior branches resolve to the documented wrapper or nested layout', () => {
    // RN's 'padding' mode adjusts `paddingBottom` of the single wrapper, the common usage
    it('behavior="padding": tracks the keyboard inset on paddingBottom across show/hide', () => {
      mount(ROOT_TAG, <App behavior="padding" />);
      expect(keyboardAdded, 'mount subscribes to the keyboard').toBeGreaterThan(
        0,
      );

      // `handleLayout` writes a ref, so no recommit happens here
      measureWrapper(SCREEN_HEIGHT);
      const before = currentWrapper().payload.paddingBottom;
      expect(before === undefined || before === 0).toBe(true);

      showKeyboard();
      expect(currentWrapper().payload.paddingBottom).toBe(EXPECTED_INSET);

      hideKeyboard();
      expect(currentWrapper().payload.paddingBottom).toBe(0);
    });

    // Only 'position' nests content in an inner view pushed up by `bottom: inset`
    it('behavior="position": nests children in an inner view whose bottom tracks the inset', () => {
      mount(ROOT_TAG, <App behavior="position" />);
      measureWrapper(SCREEN_HEIGHT);

      const inner = currentWrapper().children[0];
      expect(inner, 'position mode nests an inner RCTView').toBeDefined();
      expect(inner.viewName).toBe('RCTView');
      expect(inner.payload.bottom).toBe(0);

      showKeyboard();
      expect(currentWrapper().children[0].payload.bottom).toBe(EXPECTED_INSET);
    });

    // 'height' shrinks the wrapper only with the keyboard up AND a measured initial height
    // Before that it stays untouched, matching RN's no-op guard
    it('behavior="height": shrinks height only once measured and only while the keyboard is up', () => {
      mount(ROOT_TAG, <App behavior="height" />);

      // The keyboard shows before any layout was measured, so `initialHeight` is still undefined
      showKeyboard();
      expect(currentWrapper().payload.height).toBeUndefined();

      hideKeyboard();
      measureWrapper(SCREEN_HEIGHT);
      showKeyboard();
      expect(currentWrapper().payload.height).toBe(
        SCREEN_HEIGHT - EXPECTED_INSET,
      );
      expect(currentWrapper().payload.flex).toBe(0);

      // A removed prop clones through as an explicit `null`, the engine's native-removal signal
      hideKeyboard();
      const height = currentWrapper().payload.height;
      expect(height === undefined || height === null).toBe(true);
    });

    // The wrapper shrinks by the inset, so the next `onLayout` reports a frame shorter by that much
    // `computeInset` adds the previous inset back, which makes the second event a fixpoint
    // A stale or missing inset computes overlap 0 and the content drops under the keyboard
    it('behavior="height": a second keyboard event on the SHRUNK frame holds the inset put', () => {
      mount(ROOT_TAG, <App behavior="height" />);

      measureWrapper(SCREEN_HEIGHT);
      showKeyboard();
      const shrunkHeight = SCREEN_HEIGHT - EXPECTED_INSET;
      expect(currentWrapper().payload.height).toBe(shrunkHeight);

      // Native re-lays out the now-shorter wrapper, then the keyboard reports its frame again
      measureWrapper(shrunkHeight);
      showKeyboard();
      expect(currentWrapper().payload.height).toBe(shrunkHeight);
      expect(currentWrapper().payload.flex).toBe(0);
    });

    // An unset `behavior` must keep the caller's `style` and never inject an inset
    it('behavior=undefined: renders the wrapper untouched by any inset', () => {
      mount(ROOT_TAG, <App />);
      measureWrapper(SCREEN_HEIGHT);
      showKeyboard();
      expect(currentWrapper().payload.paddingBottom).toBeUndefined();
      expect(currentWrapper().payload.height).toBeUndefined();
      expect(currentWrapper().payload.flex).toBe(1);
    });
  });

  describe('Positive: the enabled and keyboardVerticalOffset gates', () => {
    // RN gates every inset on `enabled ?? true`, so false renders as if the keyboard never showed
    it('enabled=false forces the inset to 0 even while the keyboard is shown', () => {
      mount(ROOT_TAG, <App behavior="padding" enabled={false} />);
      measureWrapper(SCREEN_HEIGHT);
      showKeyboard();
      const padding = currentWrapper().payload.paddingBottom;
      expect(padding === undefined || padding === 0).toBe(true);
    });

    // The offset moves the keyboard top edge up before the overlap math, for a view below a header
    it('keyboardVerticalOffset shifts the computed inset by exactly the offset', () => {
      const OFFSET = 40;
      mount(
        ROOT_TAG,
        <App behavior="padding" keyboardVerticalOffset={OFFSET} />,
      );
      measureWrapper(SCREEN_HEIGHT);
      showKeyboard();
      expect(currentWrapper().payload.paddingBottom).toBe(
        EXPECTED_INSET + OFFSET,
      );
    });
  });

  describe('Positive: the platform-correct event pair', () => {
    // This host takes the will* pair so the view rides up WITH the keyboard animation
    // Asserted on the wire names, since a subscription to the wrong events is silent
    it(`applies the inset on ${SHOW_EVENT} and clears it on ${HIDE_EVENT}`, () => {
      mount(ROOT_TAG, <App behavior="padding" />);
      measureWrapper(SCREEN_HEIGHT);

      showKeyboard();
      expect(currentWrapper().payload.paddingBottom).toBe(EXPECTED_INSET);

      hideKeyboard();
      expect(currentWrapper().payload.paddingBottom).toBe(0);
    });

    // An undocked, split or floating iOS keyboard emits change-frame BEFORE the hide
    // So a frame captured mid-dismissal would apply, and the did* pair fires one animation too late
    it('ignores the events it no longer subscribes to (didChangeFrame, didShow)', () => {
      mount(ROOT_TAG, <App behavior="padding" />);
      measureWrapper(SCREEN_HEIGHT);

      const frame = {
        endCoordinates: { height: KEYBOARD_HEIGHT, screenY: KEYBOARD_SCREEN_Y },
      };
      emitRnDeviceEvent('keyboardDidChangeFrame', frame);
      emitRnDeviceEvent('keyboardWillChangeFrame', frame);
      emitRnDeviceEvent('keyboardDidShow', frame);

      const padding = currentWrapper().payload.paddingBottom;
      expect(padding === undefined || padding === 0).toBe(true);
    });
  });

  describe('Positive: the iOS Prefer-Cross-Fade setting', () => {
    // With the setting on, iOS reports `screenY` 0, which reads as a keyboard covering everything
    // The component passes the setting down so core can take its early return
    it('screenY=0 with the setting ON lifts nothing', async () => {
      prefersCrossFade = true;
      mount(ROOT_TAG, <App behavior="padding" />);
      await settleCrossFadeRead();
      measureWrapper(SCREEN_HEIGHT);

      showKeyboard(0);
      const padding = currentWrapper().payload.paddingBottom;
      expect(padding === undefined || padding === 0).toBe(true);
    });

    // The early return is gated on the setting, not on `screenY` alone
    it('screenY=0 with the setting OFF still lifts by the full overlap', async () => {
      mount(ROOT_TAG, <App behavior="padding" />);
      await settleCrossFadeRead();
      measureWrapper(SCREEN_HEIGHT);

      showKeyboard(0);
      expect(currentWrapper().payload.paddingBottom).toBe(
        FRAME_Y + SCREEN_HEIGHT,
      );
    });
  });

  describe('Positive: keyboard subscription lifecycle', () => {
    // The effect must clean up on unmount, or every remount leaks two more listeners
    // A delta, not an absolute count, since `Keyboard` sets up its cache feed once and lazily
    it('subscribes exactly 2 keyboard listeners on mount and removes exactly 2 on unmount', () => {
      const addedBefore = keyboardAdded;
      mount(ROOT_TAG, <App behavior="padding" />);
      expect(keyboardAdded - addedBefore).toBe(2);

      const removedBefore = keyboardRemoved;
      unmount(ROOT_TAG);
      expect(keyboardRemoved - removedBefore).toBe(2);
    });
  });

  describe('Positive: race and malformed-payload safety', () => {
    // A keyboard can show before the first `onLayout`, the missing frame must hold the inset at 0
    it('keyboard shows before the wrapper has measured a layout: inset stays 0, no crash', () => {
      mount(ROOT_TAG, <App behavior="padding" />);
      showKeyboard();
      const padding = currentWrapper().payload.paddingBottom;
      expect(padding === undefined || padding === 0).toBe(true);
    });

    // `readKeyboardFrame` returns undefined on a malformed shape, so the inset stays unaffected
    it('ignores a malformed show payload missing endCoordinates', () => {
      mount(ROOT_TAG, <App behavior="padding" />);
      measureWrapper(SCREEN_HEIGHT);
      emitRnDeviceEvent(SHOW_EVENT, { duration: 250, easing: 'keyboard' });
      const padding = currentWrapper().payload.paddingBottom;
      expect(padding === undefined || padding === 0).toBe(true);
    });
  });
});
