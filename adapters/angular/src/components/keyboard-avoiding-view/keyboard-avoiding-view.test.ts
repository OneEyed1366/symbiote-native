// Angular-only part of `KeyboardAvoidingView`: the `Keyboard` subscription driving `markForCheck`
// and the event pair it picks and tears down, the one-off `prefersCrossFadeTransitions` read,
// the `enabled === false` gate and the anchor `class=` resolution; the inset math lives in core
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearGlobalStyles,
  registerRules,
  Keyboard,
  KEYBOARD_EVENT,
  type IEventSubscription,
  type IKeyboardEventName,
} from '@symbiote-native/engine';
import {
  emitRnDeviceEvent,
  installRecordingFabric,
  payloadOf,
} from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { KeyboardAvoidingView, type IKeyboardAvoidingBehavior } from './index';

const ROOT_TAG = 911;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// `ngOnInit` also reads the iOS cross-fade setting once, through `AccessibilityManager`
// The fake proxy answers it from `prefersCrossFade`, which each test sets BEFORE mounting
let prefersCrossFade = false;

const fakeAccessibilityManager = {
  getCurrentPrefersCrossFadeTransitionsState: (
    onSuccess: (enabled: boolean) => void,
  ): void => {
    onSuccess(prefersCrossFade);
  },
};

// The proxy's contract is generic by name, the caller owns the shape
// Same guard as the React adapter's accessibility-info test, so the fake needs no `as`
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
});

// `Keyboard` listens on RN's device bus, so `emitRnDeviceEvent` plays "native" for these tests
function emitKeyboardShow(
  screenY: number,
  height: number,
  eventType: string = KEYBOARD_EVENT.willShow,
) {
  emitRnDeviceEvent(eventType, {
    duration: 250,
    easing: 'keyboard',
    endCoordinates: { screenX: 0, screenY, width: 390, height },
  });
}

function emitKeyboardHide(eventType: string = KEYBOARD_EVENT.willHide): void {
  emitRnDeviceEvent(eventType, {});
}

function fireLayout(testID: string, y: number, height: number): void {
  fabric.fireEvent(committedWrapper(testID).instanceHandle, 'topLayout', {
    layout: { x: 0, y, width: 390, height },
  });
}

// The recording host mutates props in place, so `fabric.find` also sees props set after mount
function committedWrapper(testID: string): {
  handle: object;
  instanceHandle: unknown;
} {
  const node = fabric.find(n => n.props.testID === testID);
  if (node === undefined)
    throw new Error(`no wrapper with testID "${testID}" was committed`);
  return node;
}

// Inset values and the `backgroundColor` from a class are computed into the PAYLOAD
function committedPayload(testID: string): Record<string, unknown> {
  return payloadOf(committedWrapper(testID).handle);
}

@Component({
  selector: 'symbiote-kav-host',
  standalone: true,
  imports: [KeyboardAvoidingView],
  template: `
    <KeyboardAvoidingView [testID]="'kav'" behavior="padding" class="panel">
      <text>Hello</text>
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
      <text>Hello</text>
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
      <text>Hello</text>
    </KeyboardAvoidingView>
  `,
})
class KeyboardAvoidingViewHeightHostFixture {}

// `mount` hands back the surface, not the root instance, so the bound behavior sits in a module
// object the fixture reads through, the only handle on an input changed after init
const boundBehavior: { value: IKeyboardAvoidingBehavior } = {
  value: 'padding',
};

@Component({
  selector: 'symbiote-kav-behavior-host',
  standalone: true,
  imports: [KeyboardAvoidingView],
  template: `
    <KeyboardAvoidingView [testID]="'kav'" [behavior]="behavior.value">
      <text>Hello</text>
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

describe('KeyboardAvoidingView (no throwing path)', () => {
  it('measures its own frame, then pushes the wrapper down by the keyboard overlap on show, and clears it on hide', async () => {
    mount(ROOT_TAG, KeyboardAvoidingViewHostFixture);
    await tick();

    fireLayout('kav', 100, 500);
    await tick();

    // The inset is how far the view must move to clear the keyboard: 100 + 500 - 300 = 300
    emitKeyboardShow(300, 346);
    await tick();
    expect(committedPayload('kav').paddingBottom).toBe(300);

    emitKeyboardHide();
    await tick();
    expect(committedPayload('kav').paddingBottom).toBe(0);
  });

  it("subscribes to exactly this host's show/hide pair and tears both down on unmount", async () => {
    // RN subscribes to the will* pair on iOS and the did* pair on Android, never to change-frame
    // The headless `Platform` resolves to iOS, so the will* pair is expected
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

  it.each([
    KEYBOARD_EVENT.didShow,
    KEYBOARD_EVENT.didChangeFrame,
    KEYBOARD_EVENT.willChangeFrame,
  ])('ignores %s, which this host does not subscribe to', async eventType => {
    mount(ROOT_TAG, KeyboardAvoidingViewHostFixture);
    await tick();
    fireLayout('kav', 100, 500);
    await tick();

    emitKeyboardShow(300, 346, eventType);
    await tick();
    expect(committedPayload('kav').paddingBottom).toBe(0);
  });

  it('keeps the inset when the did* twin of the subscribed hide arrives', async () => {
    mount(ROOT_TAG, KeyboardAvoidingViewHostFixture);
    await tick();
    fireLayout('kav', 100, 500);
    await tick();

    emitKeyboardShow(300, 346);
    await tick();
    expect(committedPayload('kav').paddingBottom).toBe(300);

    emitKeyboardHide(KEYBOARD_EVENT.didHide);
    await tick();
    expect(committedPayload('kav').paddingBottom).toBe(300);
  });

  it('holds the height-mode inset when the shrunk wrapper re-measures shorter', async () => {
    // 'height' mode shrinks the wrapper by the inset, so the next layout reports a shorter frame
    // Without adding the applied inset back, each event computes less overlap and the view sinks
    mount(ROOT_TAG, KeyboardAvoidingViewHeightHostFixture);
    await tick();

    fireLayout('kav', 0, 600);
    await tick();
    emitKeyboardShow(300, 346);
    await tick();
    // 0 + 600 - 300 = 300 of overlap, so the wrapper shrinks from 600 to 300
    expect(committedPayload('kav').height).toBe(300);

    // Native re-measures the now-shrunk wrapper
    fireLayout('kav', 0, 300);
    await tick();
    emitKeyboardShow(300, 346);
    await tick();
    // 300 (applied) + 0 + 300 - 300 = 300, the same inset; without the correction it is 0
    expect(committedPayload('kav').height).toBe(300);
  });

  it('uses the behavior in force at event time, not the one bound when it subscribed', async () => {
    // `behavior` is read inside a long-lived subscription, a handler capturing it at subscribe
    // time would keep applying the old mode's math, the same trap as `previousInset`
    mount(ROOT_TAG, KeyboardAvoidingViewBehaviorHostFixture);
    await tick();

    fireLayout('kav', 0, 600);
    await tick();
    emitKeyboardShow(300, 346);
    await tick();
    expect(committedPayload('kav').paddingBottom).toBe(300);

    // Nothing else ticks change detection under zoneless, so the event's own `markForCheck`
    // carries the new input down, and this emit still resolves the old behavior
    boundBehavior.value = 'height';
    emitKeyboardShow(300, 346);
    await tick();
    expect(committedPayload('kav').height).toBe(300);

    // Only a handler reading `behavior` live sees 'height' here and adds the applied inset back
    fireLayout('kav', 0, 300);
    await tick();
    emitKeyboardShow(300, 346);
    await tick();
    expect(committedPayload('kav').height).toBe(300);
  });

  it('lifts nothing when the keyboard reports screenY 0 and Prefer Cross-Fade Transitions is on', async () => {
    // With that iOS setting on the keyboard reports `screenY` 0, which the plain math turns into
    // a lift by the whole y + height, so the content leaves the screen
    prefersCrossFade = true;

    mount(ROOT_TAG, KeyboardAvoidingViewHostFixture);
    await tick();
    fireLayout('kav', 100, 500);
    await tick();

    emitKeyboardShow(0, 346);
    await tick();
    expect(committedPayload('kav').paddingBottom).toBe(0);
  });

  it('still lifts on a screenY 0 keyboard when Prefer Cross-Fade Transitions is off', async () => {
    // The cross-fade early return is gated on the setting, not on `screenY` alone
    mount(ROOT_TAG, KeyboardAvoidingViewHostFixture);
    await tick();
    fireLayout('kav', 100, 500);
    await tick();

    emitKeyboardShow(0, 346);
    await tick();
    expect(committedPayload('kav').paddingBottom).toBe(600);
  });

  it('does not apply an inset when enabled is explicitly false', async () => {
    // RN gates every inset on `enabled ?? true`, only an explicit false disables it
    mount(ROOT_TAG, KeyboardAvoidingViewDisabledHostFixture);
    await tick();

    fireLayout('kav', 100, 500);
    await tick();
    emitKeyboardShow(300, 346);
    await tick();

    expect(committedPayload('kav').paddingBottom).toBe(0);
  });

  it('resolves a class= on the KeyboardAvoidingView use site onto the real committed view, not the anchor', async () => {
    registerRules([
      {
        tokens: ['panel'],
        specificity: [0, 1, 0],
        order: 0,
        style: { backgroundColor: 'teal' },
      },
    ]);

    mount(ROOT_TAG, KeyboardAvoidingViewHostFixture);
    await tick();

    expect(committedPayload('kav').backgroundColor).toBe('teal');
  });
});
