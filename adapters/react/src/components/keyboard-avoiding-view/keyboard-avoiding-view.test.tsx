// Co-located React-driven test.
//
// The Keyboard module's own subscribe/cache/unsubscribe contract (addListener, isVisible,
// metrics, malformed-payload handling, removeAllListeners) is already exhaustively unit-tested
// in core/engine/src/keyboard/keyboard.test.ts — N/A here, not duplicated.
//
// resolveKeyboardAvoidingLayout / computeInset / readKeyboardFrame / readLayoutFrame
// (core/components/src/view/render-keyboard-avoiding-view.ts) are the framework-agnostic
// inset math + behavior->layout decision, but have NO core-level unit test of their own yet —
// this file is currently the only place that exercises them, so it deliberately covers every
// `behavior` branch and the `enabled` gate, not just the one the file happened to smoke before.
//
// The shared fake-Fabric slot records the committed tree; a fake __turboModuleProxy returns
// a KeyboardObserver with observe-counters; a fake RN$registerCallableModule captures the
// device hub so the test can play "native". Each scenario mounts a KeyboardAvoidingView, gives
// the wrapper a frame via topLayout, then emits keyboardDidShow/Hide and asserts the wrapper's
// style tracks the computed inset (the engine HOISTS paddingBottom/height/flex to top-level
// props).
//
// No Negative group: KeyboardAvoidingView (adapters/react/.../keyboard-avoiding-view/index.ts)
// and resolveKeyboardAvoidingLayout have no guard clause and no branch that throws — every
// unrecognized `behavior` value and every malformed native payload is designed to degrade to a
// safe default rather than reject, so there is no contract-accurate throwing scenario here.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KeyboardAvoidingView, Text, mount, unmount } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 290;

// ---- fake native-module + device-hub globals ----------------------------

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
const registeredModules: Record<string, unknown> = { KeyboardObserver: fakeKeyboardObserver };

// The device hub our code registers, captured so the test can act as "native".
let deviceHub: { emit: (eventType: string, ...args: unknown[]) => void } | undefined;

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
  RN$registerCallableModule: (
    name: string,
    factory: () => { emit: (eventType: string, ...args: unknown[]) => void },
  ): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  },
});

// ---- inset geometry -----------------------------------------------------

const SCREEN_HEIGHT = 800;
const FRAME_Y = 0;
const KEYBOARD_HEIGHT = 300;
// Keyboard top edge sits KEYBOARD_HEIGHT up from the screen bottom.
const KEYBOARD_SCREEN_Y = SCREEN_HEIGHT - KEYBOARD_HEIGHT; // 500
// inset = max(0, frameY + frameHeight - keyboardY) = 0 + 800 - 500 = 300.
const EXPECTED_INSET = FRAME_Y + SCREEN_HEIGHT - KEYBOARD_SCREEN_Y;
const WRAPPER_FRAME = { x: 0, y: FRAME_Y, width: 400, height: SCREEN_HEIGHT };

function App(
  props: Partial<
    Pick<
      Parameters<typeof KeyboardAvoidingView>[0],
      'behavior' | 'enabled' | 'keyboardVerticalOffset'
    >
  >,
): ReactElement {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} {...props}>
      <Text>type here</Text>
    </KeyboardAvoidingView>
  );
}

const fabric = installFabric();
beforeEach(() => {
  fabric.reset();
  keyboardAdded = 0;
  keyboardRemoved = 0;
});
afterEach(() => unmount(ROOT_TAG));

// The current committed wrapper (the outer RCTView KeyboardAvoidingView renders).
// Re-read after each commit since clone-on-write hands back new nodes.
function currentWrapper(): IFakeNode {
  const wrapper = fabric.appRoot().children[0];
  expect(wrapper, 'an RCTView wrapper sits under the root').toBeDefined();
  expect(wrapper.viewName).toBe('RCTView');
  return wrapper;
}

function showKeyboard(hub: { emit: (eventType: string, ...args: unknown[]) => void }): void {
  hub.emit('keyboardDidShow', {
    endCoordinates: { height: KEYBOARD_HEIGHT, screenY: KEYBOARD_SCREEN_Y },
  });
}
function hideKeyboard(hub: { emit: (eventType: string, ...args: unknown[]) => void }): void {
  hub.emit('keyboardDidHide', { endCoordinates: { height: 0, screenY: SCREEN_HEIGHT } });
}

describe('KeyboardAvoidingView', () => {
  describe('Positive — behavior branches resolve to the documented wrapper/nested layout', () => {
    // why: RN's 'padding' mode adjusts the single wrapper's paddingBottom directly
    // (resolveKeyboardAvoidingLayout's 'wrapper' branch) — the most common usage.
    it('behavior="padding": tracks the keyboard inset on paddingBottom across show/hide', () => {
      mount(ROOT_TAG, <App behavior="padding" />);
      const hub = deviceHub!;
      expect(hub, 'device hub is installed by mount').toBeDefined();

      // handleLayout writes a ref (no state), so no recommit happens here.
      fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', { layout: WRAPPER_FRAME });
      const before = currentWrapper().props.paddingBottom;
      expect(before === undefined || before === 0).toBe(true);

      showKeyboard(hub);
      expect(currentWrapper().props.paddingBottom).toBe(EXPECTED_INSET);

      hideKeyboard(hub);
      expect(currentWrapper().props.paddingBottom).toBe(0);
    });

    // why: 'position' is the only behavior that NESTS content in an inner view pushed up by
    // `bottom: inset`, instead of resizing the wrapper itself (resolveKeyboardAvoidingLayout's
    // 'nested' branch) — this proves the React FC actually builds that extra inner View
    // (`createElement(View, { style: layout.innerStyle }, children)`), not just picks the
    // style.
    it('behavior="position": nests children in an inner view whose bottom tracks the inset', () => {
      mount(ROOT_TAG, <App behavior="position" />);
      const hub = deviceHub!;
      fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', { layout: WRAPPER_FRAME });

      const inner = currentWrapper().children[0];
      expect(inner, 'position mode nests an inner RCTView').toBeDefined();
      expect(inner.viewName).toBe('RCTView');
      expect(inner.props.bottom).toBe(0);

      showKeyboard(hub);
      expect(currentWrapper().children[0].props.bottom).toBe(EXPECTED_INSET);
    });

    // why: 'height' only shrinks the wrapper (height = initialHeight - inset, flex collapsed
    // to 0) once BOTH the keyboard is up AND an initial measured height exists
    // (resolveKeyboardAvoidingLayout: `behavior === 'height' && effectiveInset > 0 &&
    // initialHeight !== undefined`) — otherwise it renders untouched, matching RN's "no-op
    // until we know the starting height" guard.
    it('behavior="height": shrinks height only once measured and only while the keyboard is up', () => {
      mount(ROOT_TAG, <App behavior="height" />);
      const hub = deviceHub!;

      // Keyboard shows before any layout was measured: initialHeight is still undefined, so
      // the guard must hold the wrapper untouched rather than compute a bogus height.
      showKeyboard(hub);
      expect(currentWrapper().props.height).toBeUndefined();

      hideKeyboard(hub);
      fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', { layout: WRAPPER_FRAME });
      showKeyboard(hub);
      expect(currentWrapper().props.height).toBe(SCREEN_HEIGHT - EXPECTED_INSET);
      expect(currentWrapper().props.flex).toBe(0);

      // Once removed, a previously-present prop clones through as an explicit `null` (the
      // engine's native-removal signal), not `undefined` — that distinction is the engine's
      // own contract, not this component's; either way means "no longer applied".
      hideKeyboard(hub);
      const height = currentWrapper().props.height;
      expect(height === undefined || height === null).toBe(true);
    });

    // why: an unset `behavior` (RN allows it — defaults to no-op on iOS in RN itself, here
    // resolveKeyboardAvoidingLayout's fallthrough) must still apply the caller's own `style`
    // untouched and never inject an inset the caller didn't ask for.
    it('behavior=undefined: renders the wrapper untouched by any inset', () => {
      mount(ROOT_TAG, <App />);
      const hub = deviceHub!;
      fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', { layout: WRAPPER_FRAME });
      showKeyboard(hub);
      expect(currentWrapper().props.paddingBottom).toBeUndefined();
      expect(currentWrapper().props.height).toBeUndefined();
      expect(currentWrapper().props.flex).toBe(1);
    });
  });

  describe('Positive — the enabled and keyboardVerticalOffset gates', () => {
    // why: RN gates every inset computation on `enabled ?? true` (KeyboardAvoidingView.js) —
    // enabled=false must render the view exactly as if the keyboard never showed, even after a
    // real keyboardDidShow event fires.
    it('enabled=false forces the inset to 0 even while the keyboard is shown', () => {
      mount(ROOT_TAG, <App behavior="padding" enabled={false} />);
      const hub = deviceHub!;
      fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', { layout: WRAPPER_FRAME });
      showKeyboard(hub);
      const padding = currentWrapper().props.paddingBottom;
      expect(padding === undefined || padding === 0).toBe(true);
    });

    // why: keyboardVerticalOffset shifts the keyboard's effective top edge up before the
    // overlap math runs (`keyboardY = keyboard.screenY - verticalOffset`) — a view that starts
    // below the screen's top (a header, a nav bar) passes this so its own inset still clears
    // the keyboard exactly, rather than under- or over-padding by the offset amount.
    it('keyboardVerticalOffset shifts the computed inset by exactly the offset', () => {
      const OFFSET = 40;
      mount(ROOT_TAG, <App behavior="padding" keyboardVerticalOffset={OFFSET} />);
      const hub = deviceHub!;
      fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', { layout: WRAPPER_FRAME });
      showKeyboard(hub);
      expect(currentWrapper().props.paddingBottom).toBe(EXPECTED_INSET + OFFSET);
    });
  });

  describe('Positive — keyboard subscription lifecycle', () => {
    // why: the useEffect subscribes to didShow/didChangeFrame/didHide on mount and MUST clean
    // up on unmount, or every remount leaks 3 more native listeners onto an already-unmounted
    // component's stale closures. Asserting a DELTA (not an absolute count) keeps this robust
    // against the module-level cache-feed subscription that Keyboard sets up once, lazily, on
    // whichever test happens to call addListener first.
    it('subscribes exactly 3 keyboard listeners on mount and removes exactly 3 on unmount', () => {
      const addedBefore = keyboardAdded;
      mount(ROOT_TAG, <App behavior="padding" />);
      expect(keyboardAdded - addedBefore).toBe(3);

      const removedBefore = keyboardRemoved;
      unmount(ROOT_TAG);
      expect(keyboardRemoved - removedBefore).toBe(3);
    });
  });

  describe('Positive — race and malformed-payload safety', () => {
    // why: a keyboard can show before the wrapper's own onLayout has ever fired (slow layout,
    // fast keyboard). computeInset's `frame === undefined` guard must hold the inset at 0
    // rather than throw or compute NaN/negative padding from a missing frame.
    it('keyboard shows before the wrapper has measured a layout: inset stays 0, no crash', () => {
      mount(ROOT_TAG, <App behavior="padding" />);
      const hub = deviceHub!;
      showKeyboard(hub);
      const padding = currentWrapper().props.paddingBottom;
      expect(padding === undefined || padding === 0).toBe(true);
    });

    // why: readKeyboardFrame narrows an untyped native payload and returns undefined on a
    // malformed shape rather than throwing; computeInset then takes its `keyboard === undefined`
    // branch. A malformed show event must leave the wrapper's inset unaffected, not crash the
    // mount.
    it('ignores a malformed keyboardDidShow payload missing endCoordinates', () => {
      mount(ROOT_TAG, <App behavior="padding" />);
      const hub = deviceHub!;
      fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', { layout: WRAPPER_FRAME });
      hub.emit('keyboardDidShow', { duration: 250, easing: 'keyboard' });
      const padding = currentWrapper().props.paddingBottom;
      expect(padding === undefined || padding === 0).toBe(true);
    });
  });
});
