// Solid twin of adapters/react/src/components/keyboard-avoiding-view/keyboard-avoiding-view.test.tsx.
// Drives REAL compiled Solid JSX through the universal renderer into the fake Fabric slot: every
// `behavior` branch, the enabled / keyboardVerticalOffset gates, the subscription lifecycle, and the
// malformed-payload degradation.
//
// The Keyboard module's own subscribe/cache/unsubscribe contract is exhaustively unit-tested in
// core/engine/src/keyboard/keyboard.test.ts, and the inset math itself in
// core/components/src/view/render-keyboard-avoiding-view.ts — not duplicated here beyond what the
// adapter's own wiring proves.
//
// Three cases have NO counterpart in the React file, because Solid's lifecycle is the one thing not
// shared with it: props are getters read once unless every read sits inside an accessor, and there
// is no reconciler between this component's output and the host nodes — `insert` REPLACES a subtree
// rather than diffing one. So "a keyboard cycle must create nothing" and "a prop changed after mount
// still lands" are real, silently-breakable claims here.
//
// Everything asserted after a second commit is read off `fabric.committed`, never `fabric.created`:
// clone-on-write hands back new node objects, so the created snapshot would read as passing forever.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { KEYBOARD_EVENT } from '@symbiote-native/engine';
import type { IKeyboardAvoidingBehavior } from '@symbiote-native/components';
import type { JSX } from '../jsx-runtime';
import { mount, unmount } from '../render';
import {
  KeyboardAvoidingView,
  type IKeyboardAvoidingViewProps,
} from './keyboard-avoiding-view';
import { Text } from './text';

const ROOT_TAG = 817;

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
// The iOS "Prefer Cross-Fade Transitions" accessibility setting, which KAV reads once per mount
// through AccessibilityInfo. Flipped per test BEFORE the mount; the native getter is callback-based,
// exactly like the real AccessibilityManager's.
let prefersCrossFade = false;
// The native getter's error callback, which the engine turns into a REJECTED promise (RN parity).
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

interface IDeviceHub {
  emit: (eventType: string, ...args: unknown[]) => void;
}

// The device hub our code registers, captured so the test can act as "native".
let deviceHub: IDeviceHub | undefined;

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
    factory: () => IDeviceHub,
  ): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  },
});

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
const WRAPPER_FRAME = { x: 0, y: FRAME_Y, width: 400, height: SCREEN_HEIGHT };

const fabric = installFabric();
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
    <KeyboardAvoidingView style={{ flex: 1 }} {...props}>
      <Text>type here</Text>
    </KeyboardAvoidingView>
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

function measureWrapper(): void {
  fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', {
    layout: WRAPPER_FRAME,
  });
}

// The WILL pair, because the headless Platform resolves to iOS (core/engine/src/platform/index.ts
// re-exports index.ios) and keyboardAvoidingEventNamesFor picks willShow/willHide there. Android's
// DID pair is unit-tested on the helper itself in core; here only the wiring is under test.
function showKeyboard(screenY: number = KEYBOARD_SCREEN_Y): void {
  hub().emit(KEYBOARD_EVENT.willShow, {
    endCoordinates: { height: KEYBOARD_HEIGHT, screenY },
  });
}
function hideKeyboard(): void {
  hub().emit(KEYBOARD_EVENT.willHide, {
    endCoordinates: { height: 0, screenY: SCREEN_HEIGHT },
  });
}

describe('Solid KeyboardAvoidingView on the engine', () => {
  describe('Positive — behavior branches resolve to the documented wrapper/nested layout', () => {
    // why: RN's 'padding' mode adjusts the single wrapper's paddingBottom
    // (resolveKeyboardAvoidingLayout's 'wrapper' branch) — the most common usage, and the one that
    // proves the inset actually reaches the host rather than only living in a signal.
    it('behavior="padding": tracks the keyboard inset on paddingBottom across show/hide', async () => {
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();

      measureWrapper();
      const before = currentWrapper().props.paddingBottom;
      expect(before === undefined || before === 0).toBe(true);

      showKeyboard();
      await tick();
      expect(currentWrapper().props.paddingBottom).toBe(EXPECTED_INSET);

      hideKeyboard();
      await tick();
      expect(currentWrapper().props.paddingBottom).toBe(0);
    });

    // why: 'position' is the only behavior that NESTS the children in an inner view pushed up by
    // `bottom: inset` instead of resizing the wrapper — this proves the component actually builds
    // that second View, not just picks a different style.
    it('behavior="position": nests children in an inner view whose bottom tracks the inset', async () => {
      mount(ROOT_TAG, () => <App behavior="position" />);
      await tick();
      measureWrapper();

      const inner = currentWrapper().children[0];
      expect(inner, 'position mode nests an inner RCTView').toBeDefined();
      expect(inner.viewName).toBe('RCTView');
      expect(inner.props.bottom).toBe(0);

      showKeyboard();
      await tick();
      expect(currentWrapper().children[0].props.bottom).toBe(EXPECTED_INSET);
    });

    // why: 'height' shrinks the wrapper (height = initialHeight - inset, flex collapsed to 0) only
    // once BOTH the keyboard is up AND an initial measured height exists — otherwise it must render
    // untouched, matching RN's "no-op until we know the starting height" guard. It also pins that
    // `initialHeight` is captured from the FIRST layout only.
    it('behavior="height": shrinks height only once measured and only while the keyboard is up', async () => {
      mount(ROOT_TAG, () => <App behavior="height" />);
      await tick();

      // The keyboard shows before any layout was measured: initialHeight is still undefined, so the
      // guard must hold the wrapper untouched rather than compute a bogus height.
      showKeyboard();
      await tick();
      expect(currentWrapper().props.height).toBeUndefined();

      hideKeyboard();
      await tick();
      measureWrapper();
      showKeyboard();
      await tick();
      expect(currentWrapper().props.height).toBe(
        SCREEN_HEIGHT - EXPECTED_INSET,
      );
      expect(currentWrapper().props.flex).toBe(0);

      // Once removed, a previously-present prop clones through as an explicit `null` (the engine's
      // native-removal signal), not `undefined` — the engine's contract, not this component's.
      hideKeyboard();
      await tick();
      const height = currentWrapper().props.height;
      expect(height === undefined || height === null).toBe(true);
    });

    // why: THE regression the previousInset fix exists for (RN's _relativeKeyboardHeight:100-105).
    // 'height' mode SHRINKS the wrapper by the inset, so the wrapper's next onLayout reports a frame
    // shorter by exactly that much — and a second keyboard event computed off that shorter frame
    // finds no overlap left and drops the inset to 0, letting the view walk back down under the
    // keyboard. Adding the currently-applied inset back cancels the shrink; it is a fixpoint
    // correction, not an accumulation, which is why the number below stays put instead of doubling.
    it('behavior="height": a second keyboard event after the wrapper shrank holds the inset', async () => {
      mount(ROOT_TAG, () => <App behavior="height" />);
      await tick();
      measureWrapper();

      showKeyboard();
      await tick();
      const shrunkHeight = SCREEN_HEIGHT - EXPECTED_INSET;
      expect(currentWrapper().props.height).toBe(shrunkHeight);

      // The shrunk wrapper re-lays out: onLayout now reports the SHORTER frame, exactly as a device
      // does between two keyboard notifications.
      fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', {
        layout: { ...WRAPPER_FRAME, height: shrunkHeight },
      });
      showKeyboard();
      await tick();
      expect(
        currentWrapper().props.height,
        'the inset must not shrink itself away',
      ).toBe(shrunkHeight);
      expect(currentWrapper().props.flex).toBe(0);
    });

    // why: SOLID-SPECIFIC, and the second prop the long-lived keyboard subscription reads. `behavior`
    // decides which formula computeInset runs — only 'height' adds the previously-applied inset back
    // — so a `behavior` captured at setup keeps running the OLD mode's math after the prop changes.
    // The layout memo would still paint the NEW mode, which is what makes this silent: the shape is
    // right and only the number is wrong. Switching 'height' -> 'padding' is the direction that
    // shows it, because the stale 'height' branch then ADDS the applied inset to a full-height frame
    // and the padding doubles. A component body runs once here, so nothing re-subscribes to fix it
    // the way React's effect deps do.
    it('picks up a behavior changed after mount, without re-subscribing', async () => {
      const [behavior, setBehavior] =
        createSignal<IKeyboardAvoidingBehavior>('height');
      mount(ROOT_TAG, () => <App behavior={behavior()} />);
      await tick();
      const subscribedAtMount = keyboardAdded;
      measureWrapper();

      showKeyboard();
      await tick();
      expect(currentWrapper().props.height).toBe(
        SCREEN_HEIGHT - EXPECTED_INSET,
      );

      // 'padding' leaves the wrapper at its full height, so the next onLayout reports the ORIGINAL
      // frame again — and the previous-inset correction must not be applied to it.
      setBehavior('padding');
      await tick();
      measureWrapper();
      showKeyboard();
      await tick();

      expect(
        currentWrapper().props.paddingBottom,
        'the inset must not accumulate',
      ).toBe(EXPECTED_INSET);
      expect(keyboardAdded, 'the behavior change must not add listeners').toBe(
        subscribedAtMount,
      );
    });

    // why: an unset `behavior` must still apply the caller's own `style` untouched and never inject
    // an inset nobody asked for (resolveKeyboardAvoidingLayout's fallthrough).
    it('behavior=undefined: renders the wrapper untouched by any inset', async () => {
      mount(ROOT_TAG, () => <App />);
      await tick();
      measureWrapper();
      showKeyboard();
      await tick();

      expect(currentWrapper().props.paddingBottom).toBeUndefined();
      expect(currentWrapper().props.height).toBeUndefined();
      expect(currentWrapper().props.flex).toBe(1);
    });
  });

  describe('Positive — the enabled and keyboardVerticalOffset gates', () => {
    // why: RN gates every inset computation on `enabled ?? true` — enabled=false must render exactly
    // as if the keyboard never showed, even after a real keyboardDidShow fired.
    it('enabled={false} forces the inset to 0 even while the keyboard is shown', async () => {
      mount(ROOT_TAG, () => <App behavior="padding" enabled={false} />);
      await tick();
      measureWrapper();
      showKeyboard();
      await tick();

      const padding = currentWrapper().props.paddingBottom;
      expect(padding === undefined || padding === 0).toBe(true);
    });

    // why: keyboardVerticalOffset shifts the keyboard's effective top edge before the overlap math
    // runs (`keyboardY = screenY - verticalOffset`), so a view that starts below the screen top (a
    // header, a nav bar) still clears the keyboard exactly instead of under- or over-padding.
    it('keyboardVerticalOffset shifts the computed inset by exactly the offset', async () => {
      const OFFSET = 40;
      mount(ROOT_TAG, () => (
        <App behavior="padding" keyboardVerticalOffset={OFFSET} />
      ));
      await tick();
      measureWrapper();
      showKeyboard();
      await tick();

      expect(currentWrapper().props.paddingBottom).toBe(
        EXPECTED_INSET + OFFSET,
      );
    });

    // why: SOLID-SPECIFIC. A component body runs ONCE, so the offset is read at EVENT time rather
    // than captured at setup. A single destructure of `props` would freeze it at the mount-time
    // value and every other test in this file would still pass — React sidesteps this by listing the
    // offset in its effect deps and re-subscribing, a mechanism Solid has no equivalent of.
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
      expect(currentWrapper().props.paddingBottom).toBe(EXPECTED_INSET);

      const NEXT_OFFSET = 25;
      setOffset(NEXT_OFFSET);
      await tick();
      showKeyboard();
      await tick();

      expect(currentWrapper().props.paddingBottom).toBe(
        EXPECTED_INSET + NEXT_OFFSET,
      );
      expect(keyboardAdded, 'the offset change must not add listeners').toBe(
        subscribedAtMount,
      );
    });

    // why: SOLID-SPECIFIC, and the `enabled` counterpart of the test above — re-enabling a disabled
    // KAV must pick the live inset up. The layout memo does not even read `inset()` on the disabled
    // branch, so this is the one case where the memo has to re-subscribe to a signal it previously
    // skipped.
    it('applies the current inset when enabled flips from false to true', async () => {
      const [enabled, setEnabled] = createSignal(false);
      mount(ROOT_TAG, () => <App behavior="padding" enabled={enabled()} />);
      await tick();
      measureWrapper();

      showKeyboard();
      await tick();
      const padding = currentWrapper().props.paddingBottom;
      expect(padding === undefined || padding === 0).toBe(true);

      setEnabled(true);
      await tick();
      expect(currentWrapper().props.paddingBottom).toBe(EXPECTED_INSET);
    });
  });

  describe('Positive — the iOS Prefer Cross-Fade Transitions setting', () => {
    // why: with that accessibility setting on, iOS reports the keyboard's screenY as 0 instead of its
    // real top edge (RN KeyboardAvoidingView.js:88-96). The ordinary math then reads the overlap as
    // the view's ENTIRE y + height and pushes the content clean off screen. Core answers 0 — but only
    // if this adapter actually reads the setting and passes it down, which nothing else here proves.
    it('a screenY=0 keyboard lifts nothing while the setting is on', async () => {
      prefersCrossFade = true;
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();
      measureWrapper();

      showKeyboard(0);
      await tick();
      const padding = currentWrapper().props.paddingBottom;
      expect(padding === undefined || padding === 0).toBe(true);
    });

    // why: the other half — the early return must be gated on the setting, not on screenY alone. With
    // the setting off, screenY=0 is a real (if unusual) full-screen keyboard and the view still lifts
    // by its whole height. Without this, "always return 0 for screenY=0" would pass the test above.
    it('the same screenY=0 keyboard still lifts while the setting is off', async () => {
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();
      measureWrapper();

      showKeyboard(0);
      await tick();
      expect(currentWrapper().props.paddingBottom).toBe(
        FRAME_Y + SCREEN_HEIGHT,
      );
    });

    // why: the engine's getter REJECTS when native calls its error callback, and nothing here awaits
    // the read — so calling AccessibilityInfo directly would leave an unhandled promise on every
    // mount that hit a native error. Routing through readPrefersCrossFadeTransitions is what makes a
    // failed read answer "off", which is also the only honest answer: a caller cannot tell a failed
    // read from "the user does not prefer cross-fade". The unhandled-rejection half needs no
    // assertion — vitest fails the run on one.
    it('a failed native read degrades to "off" rather than an unhandled rejection', async () => {
      crossFadeReadFails = true;
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();
      measureWrapper();

      showKeyboard(0);
      await tick();
      expect(currentWrapper().props.paddingBottom).toBe(
        FRAME_Y + SCREEN_HEIGHT,
      );
    });
  });

  describe('Positive — keyboard subscription lifecycle', () => {
    // why: the setup body subscribes to exactly the host's show/hide pair and onCleanup MUST tear
    // them down on unmount, or every remount leaks 2 more native listeners whose closures call
    // setInset on a disposed signal. A DELTA, not an absolute count, so the module-level cache-feed
    // subscription Keyboard sets up once and lazily cannot skew it. The count is also the cheap half
    // of the RN-parity fix below: three listeners means changeFrame crept back in.
    it('subscribes exactly 2 keyboard listeners on mount and removes exactly 2 on unmount', async () => {
      const addedBefore = keyboardAdded;
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();
      expect(keyboardAdded - addedBefore).toBe(2);

      const removedBefore = keyboardRemoved;
      unmount(ROOT_TAG);
      expect(keyboardRemoved - removedBefore).toBe(2);
    });

    // why: RN subscribes per host and says why (KeyboardAvoidingView.js:198-215). On iOS — which is
    // what the headless Platform resolves to — it is the WILL pair, so the view rides up with the
    // keyboard animation instead of snapping into place a whole animation later. And changeFrame is
    // the listener RN's own comment warns AGAINST: an undocked, split or floating iOS keyboard emits
    // it BEFORE the hide notification, so a subscriber applies a frame captured mid-dismissal. Both
    // halves are asserted here because the count test above only proves there are two of something.
    it("reacts to this host's willShow/willHide only, never to didShow or changeFrame", async () => {
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();
      measureWrapper();

      const staleFrame = {
        endCoordinates: { height: KEYBOARD_HEIGHT, screenY: KEYBOARD_SCREEN_Y },
      };
      hub().emit(KEYBOARD_EVENT.didChangeFrame, staleFrame);
      hub().emit(KEYBOARD_EVENT.willChangeFrame, staleFrame);
      hub().emit(KEYBOARD_EVENT.didShow, staleFrame);
      await tick();
      const idle = currentWrapper().props.paddingBottom;
      expect(
        idle === undefined || idle === 0,
        'only willShow may move the inset',
      ).toBe(true);

      showKeyboard();
      await tick();
      expect(currentWrapper().props.paddingBottom).toBe(EXPECTED_INSET);

      hub().emit(KEYBOARD_EVENT.didHide, {
        endCoordinates: { height: 0, screenY: SCREEN_HEIGHT },
      });
      await tick();
      expect(
        currentWrapper().props.paddingBottom,
        'only willHide may clear the inset',
      ).toBe(EXPECTED_INSET);

      hideKeyboard();
      await tick();
      expect(currentWrapper().props.paddingBottom).toBe(0);
    });

    // why: the subscription lives in the setup body, so it must be re-established per MOUNT — the
    // bridgeless host stops and restarts a surface on Fast Refresh and on lifecycle changes, reusing
    // the rootTag (render.ts's teardown). Hoisting the subscribe out of the component body would
    // leave the remounted instance driven by the FIRST mount's closure, writing to a signal on a
    // disposed root, and the keyboard would move nothing at all on the second screen.
    //
    // Note this cannot be asserted by "a keyboard event after unmount commits nothing": a disposed
    // root drops mutations at the renderer, so that reads as passing even with the cleanup deleted.
    // The delta counter above is the real cleanup guard; this is the "the next mount still works"
    // half.
    it('re-subscribes on a remount of the same rootTag', async () => {
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();
      unmount(ROOT_TAG);

      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();
      measureWrapper();
      showKeyboard();
      await tick();

      expect(currentWrapper().props.paddingBottom).toBe(EXPECTED_INSET);
    });
  });

  describe('Positive — the children survive a keyboard cycle', () => {
    // why: SOLID-SPECIFIC, and the reason the nested/flat branch hangs off a memoized boolean. Solid
    // has no reconciler between the component's output and the host nodes: `insert` REPLACES a
    // subtree, so anything that puts the inset into the wrapper's insert render effect tears the
    // wrapped subtree down and rebuilds it on every show/hide — i.e. on every keystroke, destroying
    // the very TextInput the user is typing into (.claude/rules/solid-descriptor-bridge.md §4, which
    // cost a real device bug in Pressable). Measured: writing the same branch as a plain
    // `renderContent()` helper instead — the shape Pressable uses, and the obvious refactor — fails
    // this line at 6 created nodes against 4. The counter is the only headless trace of the focus
    // loss; nothing else in this file moves.
    it('creates no node across a full keyboard show/hide cycle', async () => {
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();
      measureWrapper();
      const createdAtMount = fabric.counts.createNode;

      showKeyboard();
      await tick();
      expect(
        currentWrapper().props.paddingBottom,
        'the inset must still land',
      ).toBe(EXPECTED_INSET);
      expect(
        fabric.counts.createNode,
        'the show rebuilt the child subtree',
      ).toBe(createdAtMount);

      hideKeyboard();
      await tick();
      expect(
        fabric.counts.createNode,
        'the hide rebuilt the child subtree',
      ).toBe(createdAtMount);
    });

    // why: the 'position' branch is the structurally riskiest one — it holds the children one level
    // deeper, behind the inner View whose own style is what the inset drives. A cycle must still
    // touch only that inner node's props.
    it('creates no node across a keyboard cycle in the nested position layout', async () => {
      mount(ROOT_TAG, () => <App behavior="position" />);
      await tick();
      measureWrapper();
      const createdAtMount = fabric.counts.createNode;

      showKeyboard();
      await tick();
      expect(
        currentWrapper().children[0].props.bottom,
        'the inset must still land',
      ).toBe(EXPECTED_INSET);
      expect(
        fabric.counts.createNode,
        'the show rebuilt the nested subtree',
      ).toBe(createdAtMount);

      hideKeyboard();
      await tick();
      expect(
        fabric.counts.createNode,
        'the hide rebuilt the nested subtree',
      ).toBe(createdAtMount);
    });
  });

  describe('Positive — pass-through of the props KAV does not consume', () => {
    // why: KAV composes View rather than painting its own host tag, so the aria/role fold and the
    // class+style merge must happen exactly once, in View. Splitting the wrong prop into HANDLED_PROPS
    // would silently swallow it — nothing else in this file would fail.
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
      expect(wrapper.props.testID).toBe('kav');
      expect(wrapper.props.accessibilityLabel).toBe('compose');

      measureWrapper();
      expect(layoutEvents, "the caller's onLayout still fires").toBe(1);
    });
  });

  describe('Negative — malformed payloads and races degrade instead of throwing', () => {
    // why: a keyboard can show before the wrapper's own onLayout has ever fired (slow layout, fast
    // keyboard). computeInset's `frame === undefined` guard must hold the inset at 0 rather than
    // throw or compute a negative padding from a missing frame.
    it('keyboard shows before the wrapper has measured a layout: inset stays 0, no crash', async () => {
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();

      showKeyboard();
      await tick();
      const padding = currentWrapper().props.paddingBottom;
      expect(padding === undefined || padding === 0).toBe(true);
    });

    // why: readKeyboardFrame narrows an untyped native payload and returns undefined on a malformed
    // shape rather than throwing; a bad show event must leave the wrapper untouched, not crash the
    // mount.
    it('ignores a malformed keyboard-show payload missing endCoordinates', async () => {
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();
      measureWrapper();

      hub().emit(KEYBOARD_EVENT.willShow, {
        duration: 250,
        easing: 'keyboard',
      });
      await tick();
      const padding = currentWrapper().props.paddingBottom;
      expect(padding === undefined || padding === 0).toBe(true);
    });

    // why: readLayoutFrame is the same guard on the other input. A layout payload without numeric
    // y/height must leave the previous frame in place rather than poison the next inset with NaN —
    // a NaN paddingBottom reaches Fabric and blanks the view on a device.
    it('ignores a malformed topLayout payload and keeps the previous frame', async () => {
      mount(ROOT_TAG, () => <App behavior="padding" />);
      await tick();
      measureWrapper();

      fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', {
        layout: { width: 400 },
      });
      showKeyboard();
      await tick();
      expect(currentWrapper().props.paddingBottom).toBe(EXPECTED_INSET);
    });
  });
});
