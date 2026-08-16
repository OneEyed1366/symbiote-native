// Co-located unit test for the Keyboard module. A fake __turboModuleProxy returns
// a KeyboardObserver (observe-counters only) and a UIManager (configureNextLayoutAnimation,
// for scheduleLayoutAnimation); a fake RN$registerCallableModule captures the device hub so
// the test can play "native" and emit keyboardDidShow / keyboardDidHide. dismiss() is driven
// through the real text-input-state + a committed Fabric node, since that is the actual
// mechanism RN's dismissKeyboard() uses (blur the focused input).
//
// Keyboard never throws: every public method degrades to a documented no-op (dismiss with
// nothing focused, removeAllListeners for an event nobody's listening to, scheduleLayoutAnimation
// with a zero duration). So there is no Negative (toThrow) group; every scenario is Positive.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import type { IKeyboardEvent } from './index';

interface IDeviceHub {
  emit: (eventType: string, ...args: unknown[]) => void;
}
interface ILayoutAnimationCall {
  duration: number;
  updateType: unknown;
}

const ROOT_TAG = 88;

// vi.resetModules() in beforeEach discards the ENTIRE module registry, not just
// './index' -- Keyboard's own imports of '../text-input-state' and '../commit'
// (via createSurface/createElement) get fresh instances too. A statically
// top-level-imported binding for any of these would point at a stale module
// instance disconnected from the one Keyboard resolves internally after reset, so
// everything Keyboard touches is re-imported fresh, in beforeEach, same as Keyboard itself.
let Keyboard: typeof import('./index').Keyboard;
let createElement: typeof import('@symbiote-native/engine').createElement;
let createSurface: typeof import('@symbiote-native/engine').createSurface;
let currentlyFocusedInput: typeof import('../text-input-state').currentlyFocusedInput;
let setInputFocused: typeof import('../text-input-state').setInputFocused;

let observerAdded: number;
let observerRemoved: number;
let deviceHub: IDeviceHub | undefined;
let layoutAnimationCalls: ILayoutAnimationCall[];

const showEvent: IKeyboardEvent = {
  duration: 250,
  easing: 'keyboard',
  endCoordinates: { screenX: 0, screenY: 300, width: 390, height: 346 },
};

const fabric = installFabric();

beforeEach(async () => {
  observerAdded = 0;
  observerRemoved = 0;
  deviceHub = undefined;
  layoutAnimationCalls = [];
  fabric.reset();

  const fakeKeyboardObserver = {
    addListener: (): void => {
      observerAdded += 1;
    },
    removeListeners: (count: number): void => {
      observerRemoved += count;
    },
  };
  const fakeUIManager = {
    configureNextLayoutAnimation: (
      config: { duration: number; update?: { type?: unknown } },
      onSuccess: () => void,
    ): void => {
      layoutAnimationCalls.push({ duration: config.duration, updateType: config.update?.type });
      onSuccess();
    },
  };
  const registeredModules: Record<string, unknown> = {
    KeyboardObserver: fakeKeyboardObserver,
    UIManager: fakeUIManager,
  };

  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module = registeredModules[name];
    return isPresent<T>(module) ? module : null;
  };
  globalThis.RN$registerCallableModule = (name: string, factory: () => IDeviceHub): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  };

  vi.resetModules();
  ({ Keyboard } = await import('./index'));
  ({ createElement, createSurface } = await import('@symbiote-native/engine'));
  ({ currentlyFocusedInput, setInputFocused } = await import('../text-input-state'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

describe('Keyboard', () => {
  describe('addListener / cache / isVisible / metrics', () => {
    it('a tracked listener fires and the cache tracks show then hide; remove() pings the observer', () => {
      let received: unknown;
      const sub = Keyboard.addListener('keyboardDidShow', payload => {
        received = payload;
      });
      expect(deviceHub).toBeDefined();
      expect(observerAdded).toBeGreaterThanOrEqual(1);
      expect(Keyboard.isVisible()).toBe(false);

      deviceHub?.emit('keyboardDidShow', showEvent);
      expect(received).toBe(showEvent);
      expect(Keyboard.isVisible()).toBe(true);

      const metrics = Keyboard.metrics();
      expect(metrics?.height).toBe(346);
      expect(metrics?.screenY).toBe(300);

      deviceHub?.emit('keyboardDidHide', showEvent);
      expect(Keyboard.isVisible()).toBe(false);
      expect(Keyboard.metrics()).toBeUndefined();

      const removedBefore = observerRemoved;
      sub.remove();
      expect(observerRemoved).toBe(removedBefore + 1);
    });

    // why: isKeyboardEvent guards a malformed native payload (missing
    // endCoordinates) -- the cache must not be corrupted by garbage, so isVisible()
    // must not flip on a bad event.
    it('ignores a malformed keyboardDidShow payload missing endCoordinates', () => {
      Keyboard.addListener('keyboardDidShow', () => {});
      deviceHub?.emit('keyboardDidShow', { duration: 250, easing: 'keyboard' });
      expect(Keyboard.isVisible()).toBe(false);
    });

    it('removeAllListeners tears down callers but the cache self-subscription survives', () => {
      let firstCount = 0;
      let secondCount = 0;
      Keyboard.addListener('keyboardDidShow', () => {
        firstCount += 1;
      });
      Keyboard.addListener('keyboardDidShow', () => {
        secondCount += 1;
      });
      expect(deviceHub).toBeDefined();

      deviceHub?.emit('keyboardDidShow', showEvent);
      expect(firstCount).toBe(1);
      expect(secondCount).toBe(1);

      Keyboard.removeAllListeners('keyboardDidShow');
      deviceHub?.emit('keyboardDidShow', showEvent);
      expect(firstCount).toBe(1);
      expect(secondCount).toBe(1);

      // The internal cache feed is untracked, so it still updated on that last emit.
      expect(Keyboard.isVisible()).toBe(true);
    });

    // why: removeAllListeners for an event type nobody ever subscribed to (e.g. an
    // app that calls it defensively on unmount) must not throw on the missing set.
    it('removeAllListeners is a no-op for an event type with no subscriptions', () => {
      expect(() => Keyboard.removeAllListeners('keyboardWillHide')).not.toThrow();
    });
  });

  describe('scheduleLayoutAnimation', () => {
    // why: this is how a keyboard accessory view syncs its own layout animation to
    // the keyboard's real transition -- duration/easing must be forwarded verbatim
    // (through coerceType) to LayoutAnimation.configureNext, reaching native.
    it('configures the next commit with the keyboard event duration and coerced easing type', () => {
      Keyboard.scheduleLayoutAnimation(showEvent);
      expect(layoutAnimationCalls).toEqual([{ duration: 250, updateType: 'keyboard' }]);
    });

    // why: a zero-duration event is documented as a no-op (an instant keyboard
    // change has nothing to animate) -- it must not reach native at all.
    it('is a no-op when duration is 0', () => {
      Keyboard.scheduleLayoutAnimation({ ...showEvent, duration: 0 });
      expect(layoutAnimationCalls).toHaveLength(0);
    });
  });

  describe('dismiss', () => {
    // why: this is the actual mechanism RN's dismissKeyboard() uses -- blurring the
    // focused input is what retracts the soft keyboard, so dismiss() must drive a
    // real native blur command at the currently-focused node.
    it('blurs the currently-focused input and clears the tracked focus', () => {
      const surface = createSurface(ROOT_TAG);
      const input = createElement('AndroidTextInput');
      surface.appendChild(input);
      surface.commit();
      setInputFocused(input);

      Keyboard.dismiss();

      expect(fabric.commands.map(command => command.commandName)).toEqual(['blur']);
      expect(currentlyFocusedInput()).toBeNull();
    });

    // why: dismiss() with nothing focused (no input ever reported focus) must not
    // throw or dispatch a stray blur command.
    it('is a no-op when nothing is focused', () => {
      expect(() => Keyboard.dismiss()).not.toThrow();
      expect(fabric.commands).toHaveLength(0);
    });
  });
});
