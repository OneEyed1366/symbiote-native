// Co-located React-driven test.
//
// The Keyboard module's own subscribe/cache/unsubscribe contract (addListener, isVisible,
// metrics, malformed-payload handling, removeAllListeners) is already exhaustively unit-tested
// in core/engine/src/keyboard/keyboard.test.ts — N/A here, not duplicated.
//
// resolveKeyboardAvoidingLayout / computeInset / readKeyboardFrame / readLayoutFrame /
// keyboardAvoidingEventNamesFor (core/components/src/view/render-keyboard-avoiding-view.ts) are
// the framework-agnostic inset math + behavior->layout decision, unit-tested on their own in
// render-keyboard-avoiding-view.test.ts. What THIS file owns is the React lifecycle around them:
// which events the effect subscribes to, that the LIVE inset (not a stale closure) is fed back
// as previousInset, that the cross-fade setting is read once and passed through, and cleanup.
//
// The shared fake-Fabric slot records the committed tree; a fake __turboModuleProxy returns
// a KeyboardObserver with observe-counters plus an AccessibilityManager whose cross-fade getter
// reads a per-test flag; a fake RN$registerCallableModule captures the device hub so the test can
// play "native". Each scenario mounts a KeyboardAvoidingView, gives the wrapper a frame via
// topLayout, then emits the host's show/hide notifications and asserts the wrapper's style tracks
// the computed inset (the engine HOISTS paddingBottom/height/flex to top-level props).
//
// Headless Platform resolves to iOS (core/engine/src/platform/index.ts re-exports index.ios), so
// the subscribed pair here is the WILL pair. The Android branch of keyboardAvoidingEventNamesFor
// is covered by the core unit test, which passes the host in as an argument — N/A here, since a
// mounted component can only ever see this process's one host.
//
// No Negative group: KeyboardAvoidingView (adapters/react/.../keyboard-avoiding-view/index.ts)
// and resolveKeyboardAvoidingLayout have no guard clause and no branch that throws — every
// unrecognized `behavior` value and every malformed native payload is designed to degrade to a
// safe default rather than reject, so there is no contract-accurate throwing scenario here.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  KeyboardAvoidingView,
  Text,
  mount,
  unmount,
} from '@symbiote-native/react';
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
// The iOS "Prefer Cross-Fade Transitions" setting the component reads once per mount. The native
// module is resolved and CACHED on first lookup (createDeviceEventModule), so the flag has to be
// mutable behind a stable getter rather than swapped module-for-module between tests.
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

// The device hub our code registers, captured so the test can act as "native".
let deviceHub:
  { emit: (eventType: string, ...args: unknown[]) => void } | undefined;

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

// The two notifications the effect must subscribe to on this host, spelled out rather than
// re-derived from keyboardAvoidingEventNamesFor — a test that recomputes the value it checks
// would follow the component into any rename.
const SHOW_EVENT = 'keyboardWillShow';
const HIDE_EVENT = 'keyboardWillHide';

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
  prefersCrossFade = false;
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

function showKeyboard(
  hub: { emit: (eventType: string, ...args: unknown[]) => void },
  screenY: number = KEYBOARD_SCREEN_Y,
): void {
  hub.emit(SHOW_EVENT, {
    endCoordinates: { height: KEYBOARD_HEIGHT, screenY },
  });
}
function hideKeyboard(hub: {
  emit: (eventType: string, ...args: unknown[]) => void;
}): void {
  hub.emit(HIDE_EVENT, {
    endCoordinates: { height: 0, screenY: SCREEN_HEIGHT },
  });
}

// The component reads the cross-fade setting through a promise; let that microtask land before
// playing a keyboard event, or the flag is still at its default when the math runs.
async function settleCrossFadeRead(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

// Re-measure the wrapper. Real native re-lays out after every commit; the fake slot does not, so
// each scenario that depends on a NEW frame states it explicitly.
function measureWrapper(height: number): void {
  fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', {
    layout: { ...WRAPPER_FRAME, height },
  });
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
      fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', {
        layout: WRAPPER_FRAME,
      });
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
      fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', {
        layout: WRAPPER_FRAME,
      });

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
      fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', {
        layout: WRAPPER_FRAME,
      });
      showKeyboard(hub);
      expect(currentWrapper().props.height).toBe(
        SCREEN_HEIGHT - EXPECTED_INSET,
      );
      expect(currentWrapper().props.flex).toBe(0);

      // Once removed, a previously-present prop clones through as an explicit `null` (the
      // engine's native-removal signal), not `undefined` — that distinction is the engine's
      // own contract, not this component's; either way means "no longer applied".
      hideKeyboard(hub);
      const height = currentWrapper().props.height;
      expect(height === undefined || height === null).toBe(true);
    });

    // why: THE regression this fix exists for. In 'height' mode the wrapper is shrunk by the
    // inset, so native's next onLayout reports a frame shorter by exactly that much. computeInset
    // adds the PREVIOUS inset back (RN's `this.state.bottom + …`), which makes the second event a
    // fixpoint. Feed it a stale inset — or none — and the shrunk frame computes an overlap of 0,
    // the wrapper springs back to full height, and the content drops under the keyboard.
    // Two events, deliberately: one alone cannot tell a live inset from a frozen closure.
    it('behavior="height": a second keyboard event on the SHRUNK frame holds the inset put', () => {
      mount(ROOT_TAG, <App behavior="height" />);
      const hub = deviceHub!;

      measureWrapper(SCREEN_HEIGHT);
      showKeyboard(hub);
      const shrunkHeight = SCREEN_HEIGHT - EXPECTED_INSET;
      expect(currentWrapper().props.height).toBe(shrunkHeight);

      // Native re-lays out the now-shorter wrapper, then the keyboard reports its frame again.
      measureWrapper(shrunkHeight);
      showKeyboard(hub);
      expect(currentWrapper().props.height).toBe(shrunkHeight);
      expect(currentWrapper().props.flex).toBe(0);
    });

    // why: an unset `behavior` (RN allows it — defaults to no-op on iOS in RN itself, here
    // resolveKeyboardAvoidingLayout's fallthrough) must still apply the caller's own `style`
    // untouched and never inject an inset the caller didn't ask for.
    it('behavior=undefined: renders the wrapper untouched by any inset', () => {
      mount(ROOT_TAG, <App />);
      const hub = deviceHub!;
      fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', {
        layout: WRAPPER_FRAME,
      });
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
      fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', {
        layout: WRAPPER_FRAME,
      });
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
      mount(
        ROOT_TAG,
        <App behavior="padding" keyboardVerticalOffset={OFFSET} />,
      );
      const hub = deviceHub!;
      fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', {
        layout: WRAPPER_FRAME,
      });
      showKeyboard(hub);
      expect(currentWrapper().props.paddingBottom).toBe(
        EXPECTED_INSET + OFFSET,
      );
    });
  });

  describe('Positive — the platform-correct event pair', () => {
    // why: RN subscribes to exactly TWO notifications, chosen per host, and this host (headless
    // = iOS) takes the WILL pair so the view rides up WITH the keyboard animation instead of
    // snapping into place after it. Asserting on the wire names, not on a spy, because the name
    // is the whole contract — a subscription to the right count of the wrong events is silent.
    it(`applies the inset on ${SHOW_EVENT} and clears it on ${HIDE_EVENT}`, () => {
      mount(ROOT_TAG, <App behavior="padding" />);
      const hub = deviceHub!;
      measureWrapper(SCREEN_HEIGHT);

      hub.emit(SHOW_EVENT, {
        endCoordinates: { height: KEYBOARD_HEIGHT, screenY: KEYBOARD_SCREEN_Y },
      });
      expect(currentWrapper().props.paddingBottom).toBe(EXPECTED_INSET);

      hub.emit(HIDE_EVENT, {
        endCoordinates: { height: 0, screenY: SCREEN_HEIGHT },
      });
      expect(currentWrapper().props.paddingBottom).toBe(0);
    });

    // why: keyboardDidChangeFrame is the listener RN's own comment warns against — with an
    // undocked, split or floating iOS keyboard it is emitted BEFORE the hide notification, so a
    // frame captured mid-dismissal would be applied as if the keyboard were still up. Dropping it
    // is part of the fix. The did* pair goes with it on this host: it fires only once the keyboard
    // has finished animating, one animation too late.
    it('ignores the events it no longer subscribes to (didChangeFrame, didShow)', () => {
      mount(ROOT_TAG, <App behavior="padding" />);
      const hub = deviceHub!;
      measureWrapper(SCREEN_HEIGHT);

      const frame = {
        endCoordinates: { height: KEYBOARD_HEIGHT, screenY: KEYBOARD_SCREEN_Y },
      };
      hub.emit('keyboardDidChangeFrame', frame);
      hub.emit('keyboardWillChangeFrame', frame);
      hub.emit('keyboardDidShow', frame);

      const padding = currentWrapper().props.paddingBottom;
      expect(padding === undefined || padding === 0).toBe(true);
    });
  });

  describe('Positive — the iOS Prefer-Cross-Fade setting', () => {
    // why: with that accessibility setting on, iOS reports the keyboard's screenY as 0 instead of
    // its real top edge. The ordinary overlap math then reads that as "the keyboard covers
    // everything" and lifts the view by its whole y + height — the content leaves the screen. The
    // component must read the setting once through AccessibilityInfo and pass it down, or core
    // cannot take its early return.
    it('screenY=0 with the setting ON lifts nothing', async () => {
      prefersCrossFade = true;
      mount(ROOT_TAG, <App behavior="padding" />);
      const hub = deviceHub!;
      await settleCrossFadeRead();
      measureWrapper(SCREEN_HEIGHT);

      showKeyboard(hub, 0);
      const padding = currentWrapper().props.paddingBottom;
      expect(padding === undefined || padding === 0).toBe(true);
    });

    // why: the paired half — the early return is gated on the setting, not on screenY alone. With
    // it OFF (the ordinary device, and the fallback when the native getter is absent) the very
    // same payload must still lift the view, or the guard would have swallowed a real keyboard.
    it('screenY=0 with the setting OFF still lifts by the full overlap', async () => {
      mount(ROOT_TAG, <App behavior="padding" />);
      const hub = deviceHub!;
      await settleCrossFadeRead();
      measureWrapper(SCREEN_HEIGHT);

      showKeyboard(hub, 0);
      expect(currentWrapper().props.paddingBottom).toBe(
        FRAME_Y + SCREEN_HEIGHT,
      );
    });
  });

  describe('Positive — keyboard subscription lifecycle', () => {
    // why: the useEffect subscribes to the host's show/hide pair on mount and MUST clean up on
    // unmount, or every remount leaks 2 more native listeners onto an already-unmounted
    // component's stale closures. Asserting a DELTA (not an absolute count) keeps this robust
    // against the module-level cache-feed subscription that Keyboard sets up once, lazily, on
    // whichever test happens to call addListener first.
    it('subscribes exactly 2 keyboard listeners on mount and removes exactly 2 on unmount', () => {
      const addedBefore = keyboardAdded;
      mount(ROOT_TAG, <App behavior="padding" />);
      expect(keyboardAdded - addedBefore).toBe(2);

      const removedBefore = keyboardRemoved;
      unmount(ROOT_TAG);
      expect(keyboardRemoved - removedBefore).toBe(2);
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
    it('ignores a malformed show payload missing endCoordinates', () => {
      mount(ROOT_TAG, <App behavior="padding" />);
      const hub = deviceHub!;
      fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', {
        layout: WRAPPER_FRAME,
      });
      hub.emit(SHOW_EVENT, { duration: 250, easing: 'keyboard' });
      const padding = currentWrapper().props.paddingBottom;
      expect(padding === undefined || padding === 0).toBe(true);
    });
  });
});
