// The inset math itself (computeInset / resolveKeyboardAvoidingLayout, behavior ->
// style/structure) is framework-agnostic core logic (@symbiote-native/components,
// render-keyboard-avoiding-view.ts) shared verbatim with React/Vue — this file does not
// re-derive its edge cases. What is Angular-specific and exercised here: ngOnInit's Keyboard
// subscription driving markForCheck (the zoneless twin of React's setState / Vue's reactive
// ref), which two events that subscription picks and tears down, the once-per-mount
// prefersCrossFadeTransitions read it feeds into every computeInset call, handleLayout
// measuring the wrapper frame before forwarding to the caller's onLayout, the
// `enabled === false` gate, and the anchor `class=` resolution (mirrors pressable.test.ts's
// "resolves a class=" case).
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearGlobalStyles,
  registerStyles,
  Keyboard,
  KEYBOARD_EVENT,
  type IEventSubscription,
  type IKeyboardEventName,
} from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { KeyboardAvoidingView, type IKeyboardAvoidingBehavior } from './index';

const ROOT_TAG = 911;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type IDeviceHub = { emit: (eventType: string, ...args: unknown[]) => void };

// ngOnInit subscribes to the Keyboard module, which installs the bridgeless device-event hub on
// first use (core/engine/src/native-events.ts). Capturing the hub — the same fake
// core/engine/src/keyboard/keyboard.test.ts uses — lets these tests play "native" and fire
// keyboardWillShow/keyboardWillHide, instead of stubbing the registration away as a no-op.
//
// ngOnInit ALSO reads the iOS Prefer-Cross-Fade accessibility setting once, so the fake
// __turboModuleProxy below answers for AccessibilityManager (the module name the engine's iOS
// AccessibilityInfo resolves) with a getter reading `prefersCrossFade`, which each test sets
// BEFORE mounting. Every other module name resolves null, exactly as with no proxy installed.
let deviceHub: IDeviceHub | undefined;
let prefersCrossFade = false;

const fakeAccessibilityManager = {
  getCurrentPrefersCrossFadeTransitionsState: (
    onSuccess: (enabled: boolean) => void,
  ): void => {
    onSuccess(prefersCrossFade);
  },
};

// The proxy's contract is generic-by-name; the caller owns the shape. Same guard the React
// adapter's accessibility-info test uses, so the fake needs no `as`.
function isModule<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

Object.assign(globalThis, {
  __turboModuleProxy: <T>(name: string): T | null => {
    if (name !== 'AccessibilityManager') return null;
    return isModule<T>(fakeAccessibilityManager)
      ? fakeAccessibilityManager
      : null;
  },
  RN$registerCallableModule: (
    name: string,
    factory: () => IDeviceHub,
  ): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  },
});

// The hub is registered ONCE per module (installDeviceEventHub's `installed` flag), so a
// per-test reset of `deviceHub` would silently turn every later emit into a no-op — and a test
// asserting "no inset" would then pass for the wrong reason. Throwing instead keeps every
// emit-driven assertion honest.
function deviceEmit(eventType: string, payload: unknown): void {
  if (deviceHub === undefined)
    throw new Error('the device event hub was never registered');
  deviceHub.emit(eventType, payload);
}

function emitKeyboardShow(
  screenY: number,
  height: number,
  eventType = KEYBOARD_EVENT.willShow,
) {
  deviceEmit(eventType, {
    duration: 250,
    easing: 'keyboard',
    endCoordinates: { screenX: 0, screenY, width: 390, height },
  });
}

function emitKeyboardHide(eventType = KEYBOARD_EVENT.willHide): void {
  deviceEmit(eventType, {});
}

function fireLayout(testID: string, y: number, height: number): void {
  fabric.fireEvent(committedWrapper(testID).instanceHandle, 'topLayout', {
    layout: { x: 0, y, width: 390, height },
  });
}

// `fabric.find` only ever sees a node's FIRST-created props (createNode, never re-run on
// update); a prop that changes after mount — like paddingBottom growing on keyboardWillShow —
// only shows up on the current CLONE living in `fabric.committed`, so every lookup here walks
// the live committed tree instead.
function committedWrapper(testID: string): IFakeNode {
  const visit = (node: IFakeNode): IFakeNode | undefined => {
    if (node.props.testID === testID) return node;
    for (const child of node.children) {
      const found = visit(child);
      if (found) return found;
    }
    return undefined;
  };
  for (const node of fabric.committed) {
    const found = visit(node);
    if (found) return found;
  }
  throw new Error(`no wrapper with testID "${testID}" was committed`);
}

@Component({
  selector: 'symbiote-kav-host',
  standalone: true,
  imports: [KeyboardAvoidingView],
  template: `
    <KeyboardAvoidingView [testID]="'kav'" behavior="padding" class="panel">
      <symbiote-text>Hello</symbiote-text>
    </KeyboardAvoidingView>
  `,
})
class KeyboardAvoidingViewHostFixture {}

@Component({
  selector: 'symbiote-kav-disabled-host',
  standalone: true,
  imports: [KeyboardAvoidingView],
  template: `
    <KeyboardAvoidingView [testID]="'kav'" behavior="padding" [enabled]="false">
      <symbiote-text>Hello</symbiote-text>
    </KeyboardAvoidingView>
  `,
})
class KeyboardAvoidingViewDisabledHostFixture {}

@Component({
  selector: 'symbiote-kav-height-host',
  standalone: true,
  imports: [KeyboardAvoidingView],
  template: `
    <KeyboardAvoidingView [testID]="'kav'" behavior="height">
      <symbiote-text>Hello</symbiote-text>
    </KeyboardAvoidingView>
  `,
})
class KeyboardAvoidingViewHeightHostFixture {}

// `mount` hands back the surface, not the root instance, so the bound behavior lives in a
// module-level object the fixture reads through — that is the only handle a test has on an input
// it wants to change after init.
const boundBehavior: { value: IKeyboardAvoidingBehavior } = {
  value: 'padding',
};

@Component({
  selector: 'symbiote-kav-behavior-host',
  standalone: true,
  imports: [KeyboardAvoidingView],
  template: `
    <KeyboardAvoidingView [testID]="'kav'" [behavior]="behavior.value">
      <symbiote-text>Hello</symbiote-text>
    </KeyboardAvoidingView>
  `,
})
class KeyboardAvoidingViewBehaviorHostFixture {
  readonly behavior = boundBehavior;
}

beforeEach(() => {
  fabric.reset();
  prefersCrossFade = false;
  boundBehavior.value = 'padding';
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
  vi.restoreAllMocks();
});

// why: contract-accurate group name — nothing here throws. ngOnInit's Keyboard subscription,
// the inset gate, and the anchor merge all resolve to a value or a no-op, never a rejection.
describe('KeyboardAvoidingView (no throwing path — see file header)', () => {
  it('measures its own frame, then pushes the wrapper down by the keyboard overlap on show, and clears it on hide', async () => {
    mount(ROOT_TAG, KeyboardAvoidingViewHostFixture);
    await tick();

    fireLayout('kav', 100, 500);
    await tick();

    // why: RN's inset is "how far the view must move so it no longer overlaps the keyboard" —
    // wrapper bottom edge (100 + 500 = 600) minus the keyboard's top edge (300) = 300.
    emitKeyboardShow(300, 346);
    await tick();
    expect(committedWrapper('kav').props.paddingBottom).toBe(300);

    emitKeyboardHide();
    await tick();
    expect(committedWrapper('kav').props.paddingBottom).toBe(0);
  });

  it("subscribes to exactly this host's show/hide pair and tears both down on unmount", async () => {
    // why: RN picks TWO events per host — iOS the will* pair, Android the did* pair — and
    // deliberately never listens to change-frame (with an undocked/split/floating iOS keyboard
    // it fires BEFORE the hide, so it would apply a frame captured mid-dismissal). The headless
    // Platform module resolves to iOS, so the will* pair is the expected set here.
    const subscribed: IKeyboardEventName[] = [];
    const removed: IKeyboardEventName[] = [];
    const addListener = Keyboard.addListener.bind(Keyboard);
    vi.spyOn(Keyboard, 'addListener').mockImplementation(
      (eventType, listener) => {
        subscribed.push(eventType);
        const subscription: IEventSubscription = addListener(
          eventType,
          listener,
        );
        return {
          remove: (): void => {
            removed.push(eventType);
            subscription.remove();
          },
        };
      },
    );

    mount(ROOT_TAG, KeyboardAvoidingViewHostFixture);
    await tick();
    expect(subscribed).toEqual([
      KEYBOARD_EVENT.willShow,
      KEYBOARD_EVENT.willHide,
    ]);

    unmount(ROOT_TAG);
    expect(removed).toEqual([KEYBOARD_EVENT.willShow, KEYBOARD_EVENT.willHide]);
  });

  it('ignores the did* and change-frame notifications this host does not subscribe to', async () => {
    mount(ROOT_TAG, KeyboardAvoidingViewHostFixture);
    await tick();
    fireLayout('kav', 100, 500);
    await tick();

    for (const eventType of [
      KEYBOARD_EVENT.didShow,
      KEYBOARD_EVENT.didChangeFrame,
      KEYBOARD_EVENT.willChangeFrame,
    ]) {
      emitKeyboardShow(300, 346, eventType);
      await tick();
      expect(committedWrapper('kav').props.paddingBottom).toBe(0);
    }

    emitKeyboardShow(300, 346);
    await tick();
    expect(committedWrapper('kav').props.paddingBottom).toBe(300);

    // The did* twin of the subscribed hide must not clear it either.
    emitKeyboardHide(KEYBOARD_EVENT.didHide);
    await tick();
    expect(committedWrapper('kav').props.paddingBottom).toBe(300);
  });

  it('holds the height-mode inset when the shrunk wrapper re-measures shorter', async () => {
    // why: the regression the previousInset correction exists for. 'height' mode SHRINKS the
    // wrapper by the inset, so the next onLayout reports a frame shorter by exactly that much;
    // without adding the applied inset back, each further keyboard event computes a smaller
    // overlap and the view walks back down under the keyboard.
    mount(ROOT_TAG, KeyboardAvoidingViewHeightHostFixture);
    await tick();

    fireLayout('kav', 0, 600);
    await tick();
    emitKeyboardShow(300, 346);
    await tick();
    // 0 + 600 - 300 = 300 of overlap, so the wrapper shrinks from 600 to 300.
    expect(committedWrapper('kav').props.height).toBe(300);

    // Native re-measures the now-shrunk wrapper.
    fireLayout('kav', 0, 300);
    await tick();
    emitKeyboardShow(300, 346);
    await tick();
    // 300 (applied) + 0 + 300 - 300 = 300 — the same inset, so the height stays put. Without the
    // correction it computes 0 and the shrink is dropped entirely.
    expect(committedWrapper('kav').props.height).toBe(300);
  });

  it('uses the behavior in force at event time, not the one bound when it subscribed', async () => {
    // why: `behavior` is read inside a subscription that outlives any number of input changes,
    // and it is what gates 'height' mode's previous-inset correction — a handler capturing it at
    // subscribe time keeps applying the old mode's math forever. Same trap as previousInset, one
    // field over.
    mount(ROOT_TAG, KeyboardAvoidingViewBehaviorHostFixture);
    await tick();

    fireLayout('kav', 0, 600);
    await tick();
    emitKeyboardShow(300, 346);
    await tick();
    expect(committedWrapper('kav').props.paddingBottom).toBe(300);

    // Nothing else ticks change detection under zoneless, so the keyboard event's own
    // markForCheck is what carries the new input down: this emit still resolves the OLD
    // behavior, and the assertions that matter are on the one after it.
    boundBehavior.value = 'height';
    emitKeyboardShow(300, 346);
    await tick();
    expect(committedWrapper('kav').props.height).toBe(300);

    // Native re-measures the now-shrunk wrapper. Only a handler reading `behavior` live sees
    // 'height' here and adds the applied inset back; a captured 'padding' computes 0 and drops
    // the shrink.
    fireLayout('kav', 0, 300);
    await tick();
    emitKeyboardShow(300, 346);
    await tick();
    expect(committedWrapper('kav').props.height).toBe(300);
  });

  it('lifts nothing when the keyboard reports screenY 0 and Prefer Cross-Fade Transitions is on', async () => {
    // why: with that iOS accessibility setting on, the keyboard reports screenY as 0 instead of
    // its real top edge, and the ordinary math turns that into "lift the view by its whole
    // y + height" — the content goes clean off screen.
    prefersCrossFade = true;

    mount(ROOT_TAG, KeyboardAvoidingViewHostFixture);
    await tick();
    fireLayout('kav', 100, 500);
    await tick();

    emitKeyboardShow(0, 346);
    await tick();
    expect(committedWrapper('kav').props.paddingBottom).toBe(0);
  });

  it('still lifts on a screenY 0 keyboard when Prefer Cross-Fade Transitions is off', async () => {
    // why: the cross-fade early return must be gated on the setting, not on screenY alone —
    // otherwise a genuinely full-height keyboard would stop being avoided.
    mount(ROOT_TAG, KeyboardAvoidingViewHostFixture);
    await tick();
    fireLayout('kav', 100, 500);
    await tick();

    emitKeyboardShow(0, 346);
    await tick();
    expect(committedWrapper('kav').props.paddingBottom).toBe(600);
  });

  it('does not apply an inset when enabled is explicitly false', async () => {
    // why: source contract — "RN gates every inset on enabled ?? true; only an explicit false
    // disables" (index.ts's effectiveInset getter). Undefined/true must still avoid the keyboard.
    mount(ROOT_TAG, KeyboardAvoidingViewDisabledHostFixture);
    await tick();

    fireLayout('kav', 100, 500);
    await tick();
    emitKeyboardShow(300, 346);
    await tick();

    expect(committedWrapper('kav').props.paddingBottom).toBe(0);
  });

  it('resolves a class= on the KeyboardAvoidingView use site onto the real committed view, not the anchor', async () => {
    registerStyles({ panel: { backgroundColor: 'teal' } });

    mount(ROOT_TAG, KeyboardAvoidingViewHostFixture);
    await tick();

    expect(committedWrapper('kav').props.backgroundColor).toBe('teal');
  });
});
