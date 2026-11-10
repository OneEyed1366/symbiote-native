// Solid twin of the React `KeyboardAvoidingView` test, driving compiled Solid JSX into the host
// Three cases have no React counterpart: props are getters read once outside an accessor, and
// `insert` replaces a subtree instead of diffing it; assertions after a recommit read the LIVE tree

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  emitRnDeviceEvent,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import { KEYBOARD_EVENT } from '@symbiote-native/engine';
import type { IKeyboardAvoidingBehavior } from '@symbiote-native/components';
import type { JSX } from '../jsx-runtime';
import { mount, unmount } from '../render';
import {
  KeyboardAvoidingView,
  type IKeyboardAvoidingViewProps,
} from './keyboard-avoiding-view';

const ROOT_TAG = 817;

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
// The iOS cross-fade setting is read once per mount through `AccessibilityInfo`
// Flipped per test BEFORE the mount, the native getter is callback-based like the real one
let prefersCrossFade = false;
// The error callback of the native getter, which the engine turns into a REJECTED promise
let crossFadeReadFails = false;
const fakeAccessibilityManager = {
  getCurrentPrefersCrossFadeTransitionsState: (
    success: (enabled: boolean) => void,
    fail: (error: unknown) => void,
  ): void => {
    if (crossFadeReadFails) fail(new Error('native getter failed'));
    else success(prefersCrossFade);
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

const FILL_STYLE = { flex: 1 };

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  keyboardAdded = 0;
  keyboardRemoved = 0;
  prefersCrossFade = false;
  crossFadeReadFails = false;
});
afterEach(() => unmount(ROOT_TAG));

function App(props: IKeyboardAvoidingViewProps): JSX.Element {
  return (
    <KeyboardAvoidingView style={FILL_STYLE} {...props}>
      <text>type here</text>
    </KeyboardAvoidingView>
  );
}

// The outer RCTView of `KeyboardAvoidingView`, re-read per commit since `children` is a getter
function currentWrapper(): ILiveNode {
  const wrapper = live.nodeOf(live.appRoot()).children[0];
  expect(wrapper, 'an RCTView wrapper sits under the root').toBeDefined();
  expect(wrapper?.viewName).toBe('RCTView');
  if (wrapper === undefined) throw new Error('unreachable: asserted above');
  return wrapper;
}

function measureWrapper(): void {
  fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', {
    layout: WRAPPER_FRAME,
  });
}

// The will* pair, since the headless `Platform` is iOS; the Android did* pair is tested in core
function showKeyboard(screenY: number = KEYBOARD_SCREEN_Y): void {
  emitRnDeviceEvent(KEYBOARD_EVENT.willShow, {
    endCoordinates: { height: KEYBOARD_HEIGHT, screenY },
  });
}
function hideKeyboard(): void {
  emitRnDeviceEvent(KEYBOARD_EVENT.willHide, {
    endCoordinates: { height: 0, screenY: SCREEN_HEIGHT },
  });
}

describe('Solid KeyboardAvoidingView on the engine', () => {
  describe('Positive: behavior branches resolve to the documented wrapper or nested layout', () => {
    // RN's 'padding' mode adjusts `paddingBottom` of the single wrapper, the common usage
    // It also proves the inset reaches the host and does not only live in a signal
    it('behavior="padding": tracks the keyboard inset on paddingBottom across show/hide', async () => {
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();

      measureWrapper();
      const before = currentWrapper().payload.paddingBottom;
      expect(before === undefined || before === 0).toBe(true);

      showKeyboard();
      await tick();
      expect(currentWrapper().payload.paddingBottom).toBe(EXPECTED_INSET);

      hideKeyboard();
      await tick();
      expect(currentWrapper().payload.paddingBottom).toBe(0);
    });

    // Only 'position' nests the children in an inner view pushed up by `bottom: inset`
    it('behavior="position": nests children in an inner view whose bottom tracks the inset', async () => {
      mount(ROOT_TAG, () => <App behavior="position" />);
      await tick();
      measureWrapper();

      const inner = currentWrapper().children[0];
      expect(inner, 'position mode nests an inner RCTView').toBeDefined();
      expect(inner?.viewName).toBe('RCTView');
      expect(inner?.payload.bottom).toBe(0);

      showKeyboard();
      await tick();
      expect(currentWrapper().children[0]?.payload.bottom).toBe(EXPECTED_INSET);
    });

    // 'height' shrinks the wrapper only with the keyboard up AND a measured initial height
    // `initialHeight` is captured from the FIRST layout only
    it('behavior="height": shrinks height only once measured and only while the keyboard is up', async () => {
      mount(ROOT_TAG, () => <App behavior="height" />);
      await tick();

      // The keyboard shows before any layout was measured, so the guard keeps the wrapper untouched
      showKeyboard();
      await tick();
      expect(currentWrapper().payload.height).toBeUndefined();

      hideKeyboard();
      await tick();
      measureWrapper();
      showKeyboard();
      await tick();
      expect(currentWrapper().payload.height).toBe(
        SCREEN_HEIGHT - EXPECTED_INSET,
      );
      expect(currentWrapper().payload.flex).toBe(0);

      // A removed prop is cleared with the engine's NO_VALUE op, the recording deletes the key
      hideKeyboard();
      await tick();
      expect(Object.hasOwn(currentWrapper().payload, 'height')).toBe(false);
    });

    // The wrapper shrinks by the inset, so the next `onLayout` reports a frame shorter by that much
    // Adding the applied inset back is a fixpoint correction, so the number stays put
    it('behavior="height": a second keyboard event after the wrapper shrank holds the inset', async () => {
      mount(ROOT_TAG, () => <App behavior="height" />);
      await tick();
      measureWrapper();

      showKeyboard();
      await tick();
      const shrunkHeight = SCREEN_HEIGHT - EXPECTED_INSET;
      expect(currentWrapper().payload.height).toBe(shrunkHeight);

      // The shrunk wrapper re-lays out and reports the SHORTER frame, as a device does
      fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', {
        layout: { ...WRAPPER_FRAME, height: shrunkHeight },
      });
      showKeyboard();
      await tick();
      expect(
        currentWrapper().payload.height,
        'the inset must not shrink itself away',
      ).toBe(shrunkHeight);
      expect(currentWrapper().payload.flex).toBe(0);
    });

    // `behavior` picks the formula `computeInset` runs, so one captured at setup keeps the OLD math
    // The layout memo still paints the new mode, which makes the stale number silent
    // 'height' to 'padding' shows it, since the stale branch ADDS the applied inset and doubles it
    it('picks up a behavior changed after mount, without re-subscribing', async () => {
      const [behavior, setBehavior] =
        createSignal<IKeyboardAvoidingBehavior>('height');
      mount(ROOT_TAG, () => <App behavior={behavior()} />);
      await tick();
      measureWrapper();
      const subscribedAtMount = keyboardAdded;

      showKeyboard();
      await tick();
      expect(currentWrapper().payload.height).toBe(
        SCREEN_HEIGHT - EXPECTED_INSET,
      );

      // 'padding' keeps the full height, so the next layout reports the ORIGINAL frame again
      setBehavior('padding');
      await tick();
      measureWrapper();
      showKeyboard();
      await tick();

      expect(
        currentWrapper().payload.paddingBottom,
        'the inset must not accumulate',
      ).toBe(EXPECTED_INSET);
      expect(keyboardAdded, 'the behavior change must not add listeners').toBe(
        subscribedAtMount,
      );
    });

    // An unset `behavior` keeps the caller's `style` and never injects an inset
    it('behavior=undefined: renders the wrapper untouched by any inset', async () => {
      mount(ROOT_TAG, () => <App />);
      await tick();
      measureWrapper();
      showKeyboard();
      await tick();

      expect(currentWrapper().payload.paddingBottom).toBeUndefined();
      expect(currentWrapper().payload.height).toBeUndefined();
      expect(currentWrapper().payload.flex).toBe(1);
    });
  });

  describe('Positive: the enabled and keyboardVerticalOffset gates', () => {
    // RN gates every inset on `enabled ?? true`, so false renders as if the keyboard never showed
    it('enabled={false} forces the inset to 0 even while the keyboard is shown', async () => {
      mount(ROOT_TAG, () => <App behavior="padding" enabled={false} />);
      await tick();
      measureWrapper();
      showKeyboard();
      await tick();

      const padding = currentWrapper().payload.paddingBottom;
      expect(padding === undefined || padding === 0).toBe(true);
    });

    // The offset moves the keyboard top edge before the overlap math, for a view below a header
    it('keyboardVerticalOffset shifts the computed inset by exactly the offset', async () => {
      const OFFSET = 40;
      mount(ROOT_TAG, () => (
        <App behavior="padding" keyboardVerticalOffset={OFFSET} />
      ));
      await tick();
      measureWrapper();
      showKeyboard();
      await tick();

      expect(currentWrapper().payload.paddingBottom).toBe(
        EXPECTED_INSET + OFFSET,
      );
    });

    // A component body runs ONCE, so the offset is read at EVENT time and not captured at setup
    // A single destructure of `props` would freeze it, React re-subscribes through effect deps
    it('picks up a keyboardVerticalOffset changed after mount, without re-subscribing', async () => {
      const [offset, setOffset] = createSignal(0);
      mount(ROOT_TAG, () => (
        <App behavior="padding" keyboardVerticalOffset={offset()} />
      ));
      await tick();
      const subscribedAtMount = keyboardAdded;
      measureWrapper();

      showKeyboard();
      await tick();
      expect(currentWrapper().payload.paddingBottom).toBe(EXPECTED_INSET);

      const NEXT_OFFSET = 25;
      setOffset(NEXT_OFFSET);
      await tick();
      showKeyboard();
      await tick();

      expect(currentWrapper().payload.paddingBottom).toBe(
        EXPECTED_INSET + NEXT_OFFSET,
      );
      expect(keyboardAdded, 'the offset change must not add listeners').toBe(
        subscribedAtMount,
      );
    });

    // Re-enabling a disabled view must pick the live inset up
    // The layout memo skips `inset()` while disabled, so it has to re-subscribe to that signal
    it('applies the current inset when enabled flips from false to true', async () => {
      const [enabled, setEnabled] = createSignal(false);
      mount(ROOT_TAG, () => <App behavior="padding" enabled={enabled()} />);
      await tick();
      measureWrapper();

      showKeyboard();
      await tick();
      const padding = currentWrapper().payload.paddingBottom;
      expect(padding === undefined || padding === 0).toBe(true);

      setEnabled(true);
      await tick();
      expect(currentWrapper().payload.paddingBottom).toBe(EXPECTED_INSET);
    });
  });

  describe('Positive: the iOS Prefer Cross-Fade Transitions setting', () => {
    // With the setting on, iOS reports `screenY` 0 (KeyboardAvoidingView.js:88-96)
    // The plain math reads that as the whole y + height, so the adapter must pass the setting down
    it('a screenY=0 keyboard lifts nothing while the setting is on', async () => {
      prefersCrossFade = true;
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();
      measureWrapper();

      showKeyboard(0);
      await tick();
      const padding = currentWrapper().payload.paddingBottom;
      expect(padding === undefined || padding === 0).toBe(true);
    });

    // The early return is gated on the setting, or "always return 0 for screenY=0" would pass above
    it('the same screenY=0 keyboard still lifts while the setting is off', async () => {
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();
      measureWrapper();

      showKeyboard(0);
      await tick();
      expect(currentWrapper().payload.paddingBottom).toBe(
        FRAME_Y + SCREEN_HEIGHT,
      );
    });

    // The getter REJECTS on a native error and nothing awaits the read, hence the safe wrapper
    // A failed read answers "off", the only honest answer; an unhandled rejection fails the run
    it('a failed native read degrades to "off" rather than an unhandled rejection', async () => {
      crossFadeReadFails = true;
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();
      measureWrapper();

      showKeyboard(0);
      await tick();
      expect(currentWrapper().payload.paddingBottom).toBe(
        FRAME_Y + SCREEN_HEIGHT,
      );
    });
  });

  describe('Positive: keyboard subscription lifecycle', () => {
    // Cleanup must run on unmount, or every remount leaks two listeners onto a disposed signal
    // A delta, not an absolute count, since `Keyboard` sets up its cache feed once and lazily
    // Three listeners would mean change-frame crept back in
    it('subscribes exactly 2 keyboard listeners on mount and removes exactly 2 on unmount', async () => {
      const addedBefore = keyboardAdded;
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();
      expect(keyboardAdded - addedBefore).toBe(2);

      const removedBefore = keyboardRemoved;
      unmount(ROOT_TAG);
      expect(keyboardRemoved - removedBefore).toBe(2);
    });

    // On iOS RN takes the will* pair, so the view rides up with the keyboard animation
    // It never takes change-frame, which an undocked iOS keyboard emits BEFORE the hide
    it("reacts to this host's willShow/willHide only, never to didShow or changeFrame", async () => {
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();
      measureWrapper();

      const staleFrame = {
        endCoordinates: { height: KEYBOARD_HEIGHT, screenY: KEYBOARD_SCREEN_Y },
      };
      emitRnDeviceEvent(KEYBOARD_EVENT.didChangeFrame, staleFrame);
      emitRnDeviceEvent(KEYBOARD_EVENT.willChangeFrame, staleFrame);
      emitRnDeviceEvent(KEYBOARD_EVENT.didShow, staleFrame);
      await tick();
      const idle = currentWrapper().payload.paddingBottom;
      expect(
        idle === undefined || idle === 0,
        'only willShow may move the inset',
      ).toBe(true);

      showKeyboard();
      await tick();
      expect(currentWrapper().payload.paddingBottom).toBe(EXPECTED_INSET);

      emitRnDeviceEvent(KEYBOARD_EVENT.didHide, {
        endCoordinates: { height: 0, screenY: SCREEN_HEIGHT },
      });
      await tick();
      expect(
        currentWrapper().payload.paddingBottom,
        'only willHide may clear the inset',
      ).toBe(EXPECTED_INSET);

      hideKeyboard();
      await tick();
      expect(currentWrapper().payload.paddingBottom).toBe(0);
    });

    // The subscription lives in the setup body, so it is re-established per MOUNT
    // The host restarts a surface on Fast Refresh and reuses the `rootTag`, see render.ts
    // The cleanup guard is the delta counter above, an event after unmount reads as passing anyway
    it('re-subscribes on a remount of the same rootTag', async () => {
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();
      unmount(ROOT_TAG);
      // `live.appRoot()` searches the CREATION log, which would resolve to the FIRST surface
      fabric.reset();

      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();
      measureWrapper();
      showKeyboard();
      await tick();

      expect(currentWrapper().payload.paddingBottom).toBe(EXPECTED_INSET);
    });
  });

  describe('Positive: the children survive a keyboard cycle', () => {
    // Solid has no reconciler, `insert` REPLACES a subtree, so an inset in the insert effect
    // would rebuild the children on every keystroke and destroy the focused `TextInput`
    // The wrapper handle is the only headless trace of that focus loss
    it('creates no node across a full keyboard show/hide cycle', async () => {
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();
      measureWrapper();
      const wrapperAtMount = currentWrapper().handle;

      showKeyboard();
      await tick();
      expect(
        currentWrapper().payload.paddingBottom,
        'the inset must still land',
      ).toBe(EXPECTED_INSET);
      expect(
        currentWrapper().handle,
        'the show rebuilt the child subtree',
      ).toBe(wrapperAtMount);

      hideKeyboard();
      await tick();
      expect(
        currentWrapper().handle,
        'the hide rebuilt the child subtree',
      ).toBe(wrapperAtMount);
    });

    // The 'position' branch holds the children one level deeper, behind the inner View
    // A cycle must still touch only the props of that inner node
    it('creates no node across a keyboard cycle in the nested position layout', async () => {
      mount(ROOT_TAG, () => <App behavior="position" />);
      await tick();
      measureWrapper();
      const innerAtMount = currentWrapper().children[0]?.handle;

      showKeyboard();
      await tick();
      expect(
        currentWrapper().children[0]?.payload.bottom,
        'the inset must still land',
      ).toBe(EXPECTED_INSET);
      expect(
        currentWrapper().children[0]?.handle,
        'the show rebuilt the nested subtree',
      ).toBe(innerAtMount);

      hideKeyboard();
      await tick();
      expect(
        currentWrapper().children[0]?.handle,
        'the hide rebuilt the nested subtree',
      ).toBe(innerAtMount);
    });
  });

  describe('Positive: pass-through of the props KAV does not consume', () => {
    // KAV composes View, so a prop it does not consume must reach the wrapper host untouched
    // `aria-label` keeps its authored name, the engine owns the fold into `accessibilityLabel`
    it('forwards accessibility, testID and the caller onLayout onto the wrapper host', async () => {
      let layoutEvents = 0;
      mount(ROOT_TAG, () => (
        <App
          behavior="padding"
          testID="kav"
          aria-label="compose"
          onLayout={() => {
            layoutEvents += 1;
          }}
        />
      ));
      await tick();

      const wrapper = currentWrapper();
      expect(wrapper.payload.testID).toBe('kav');
      expect(wrapper.payload['aria-label']).toBe('compose');

      measureWrapper();
      expect(layoutEvents, "the caller's onLayout still fires").toBe(1);
    });
  });

  describe('Negative: malformed payloads and races degrade instead of throwing', () => {
    // A keyboard can show before the first `onLayout`, the missing frame must hold the inset at 0
    it('keyboard shows before the wrapper has measured a layout: inset stays 0, no crash', async () => {
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();

      showKeyboard();
      await tick();
      const padding = currentWrapper().payload.paddingBottom;
      expect(padding === undefined || padding === 0).toBe(true);
    });

    // `readKeyboardFrame` returns undefined on a malformed shape, so the wrapper stays untouched
    it('ignores a malformed keyboard-show payload missing endCoordinates', async () => {
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();
      measureWrapper();

      emitRnDeviceEvent(KEYBOARD_EVENT.willShow, {
        duration: 250,
        easing: 'keyboard',
      });
      await tick();
      const padding = currentWrapper().payload.paddingBottom;
      expect(padding === undefined || padding === 0).toBe(true);
    });

    // `readLayoutFrame` guards the other input, a NaN `paddingBottom` would blank a device view
    it('ignores a malformed topLayout payload and keeps the previous frame', async () => {
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();
      measureWrapper();

      fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', {
        layout: { width: 400 },
      });
      showKeyboard();
      await tick();
      expect(currentWrapper().payload.paddingBottom).toBe(EXPECTED_INSET);
    });
  });
});
