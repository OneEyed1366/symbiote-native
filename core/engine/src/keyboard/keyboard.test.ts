// Fakes: `__turboModuleProxy` for `KeyboardObserver`, a Fabric slot recording layout animations
// and `RN$registerCallableModule` capturing the device hub, so the test emits keyboard events
// Keyboard degrades to no-ops instead of throwing, so every scenario is Positive

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IKeyboardEvent } from './index';

type IDeviceHub = {
  emit: (eventType: string, ...args: unknown[]) => void;
};
type ILayoutAnimationCall = {
  duration: number;
  updateType: unknown;
};

const ROOT_TAG = 88;
const RN_LAYOUT_ANIMATION =
  'react-native/Libraries/LayoutAnimation/LayoutAnimation';
const RN_DEVICE_BUS =
  'react-native/Libraries/EventEmitter/RCTDeviceEventEmitter';
const RN_NATIVE_EVENT_EMITTER =
  'react-native/Libraries/EventEmitter/NativeEventEmitter';

// `resetModules` drops the whole registry, so everything Keyboard touches is imported fresh
// A tree host installed before the reset leaves the fresh engine with no tree to blur
let Keyboard: typeof import('./index').Keyboard;
let fabric: ReturnType<
  typeof import('@symbiote-native/test-utils').installRecordingFabric
>;
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

// A fresh module registry gets fresh RN modules, wired into the fresh host
async function wireHost(): Promise<void> {
  const { default: layoutAnimation } = await import(
    /* @vite-ignore */ RN_LAYOUT_ANIMATION
  );
  const { default: bus } = await import(/* @vite-ignore */ RN_DEVICE_BUS);
  const { default: nativeEventEmitter } = await import(
    /* @vite-ignore */ RN_NATIVE_EVENT_EMITTER
  );
  deviceHub = {
    emit: (eventType, ...args) =>
      Reflect.apply(Reflect.get(bus, 'emit'), bus, [eventType, ...args]),
  };
  (await import('../react-native-host')).setReactNativeHost({
    LayoutAnimation: layoutAnimation,
    DeviceEventEmitter: bus,
    NativeEventEmitter: nativeEventEmitter,
  });
}

beforeEach(async () => {
  observerAdded = 0;
  observerRemoved = 0;
  deviceHub = undefined;
  layoutAnimationCalls = [];

  const fakeKeyboardObserver = {
    addListener: (): void => {
      observerAdded += 1;
    },
    removeListeners: (count: number): void => {
      observerRemoved += count;
    },
  };
  const registeredModules: Record<string, unknown> = {
    KeyboardObserver: fakeKeyboardObserver,
  };

  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module = registeredModules[name];
    return isPresent<T>(module) ? module : null;
  };
  vi.resetModules();
  fabric = (
    await import('@symbiote-native/test-utils')
  ).installRecordingFabric();
  const slot = globalThis.nativeFabricUIManager;
  if (slot === undefined) throw new Error('no Fabric slot installed');
  Object.assign(slot, {
    configureNextLayoutAnimation(
      config: { duration: number; update?: { type?: unknown } },
      onSuccess: () => void,
    ): void {
      layoutAnimationCalls.push({
        duration: config.duration,
        updateType: config.update?.type,
      });
      onSuccess();
    },
  });
  await wireHost();
  ({ Keyboard } = await import('./index'));
  ({ createElement, createSurface } = await import('@symbiote-native/engine'));
  ({ currentlyFocusedInput, setInputFocused } =
    await import('../text-input-state'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
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

    // A payload without `endCoordinates` must not flip `isVisible`
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

      // The internal cache feed is untracked, so it still updated on that last emit
      expect(Keyboard.isVisible()).toBe(true);
    });

    // An app may call `removeAllListeners` on unmount with nothing subscribed
    it('removeAllListeners is a no-op for an event type with no subscriptions', () => {
      expect(() =>
        Keyboard.removeAllListeners('keyboardWillHide'),
      ).not.toThrow();
    });
  });

  describe('scheduleLayoutAnimation', () => {
    // An accessory view syncs to the keyboard transition, duration and easing reach native verbatim
    it('configures the next commit with the keyboard event duration and coerced easing type', () => {
      Keyboard.scheduleLayoutAnimation(showEvent);
      expect(layoutAnimationCalls).toEqual([
        { duration: 250, updateType: 'keyboard' },
      ]);
    });

    // An instant keyboard change has nothing to animate
    it('is a no-op when duration is 0', () => {
      Keyboard.scheduleLayoutAnimation({ ...showEvent, duration: 0 });
      expect(layoutAnimationCalls).toHaveLength(0);
    });

    // A known `LayoutAnimation` easing passes through, anything else becomes `keyboard`
    it.each(['spring', 'linear'])(
      'keeps the known easing %s as the update type',
      easing => {
        Keyboard.scheduleLayoutAnimation({
          ...showEvent,
          duration: 12,
          easing,
        });
        expect(layoutAnimationCalls).toEqual([
          { duration: 12, updateType: easing },
        ]);
      },
    );

    it('falls back to the keyboard update type for an unknown easing', () => {
      Keyboard.scheduleLayoutAnimation({
        ...showEvent,
        duration: 12,
        easing: 'some-unknown-animation-type',
      });
      expect(layoutAnimationCalls).toEqual([
        { duration: 12, updateType: 'keyboard' },
      ]);
    });
  });

  describe('dismiss', () => {
    // Blurring the focused input is what retracts the soft keyboard, as in RN
    it('blurs the currently-focused input and clears the tracked focus', () => {
      const surface = createSurface(ROOT_TAG);
      const input = createElement('AndroidTextInput');
      surface.appendChild(input);
      surface.commit();
      setInputFocused(input);

      Keyboard.dismiss();

      expect(fabric.commands.map(command => command.commandName)).toEqual([
        'blur',
      ]);
      expect(currentlyFocusedInput()).toBeNull();
    });

    // Nothing focused means no throw and no stray blur command
    it('is a no-op when nothing is focused', () => {
      expect(() => Keyboard.dismiss()).not.toThrow();
      expect(fabric.commands).toHaveLength(0);
    });
  });

  describe('RN parity (Keyboard.js)', () => {
    function emit(eventType: string, payload?: unknown): void {
      if (deviceHub === undefined) throw new Error('no device hub');
      deviceHub.emit(eventType, payload);
    }

    // RN tracks show and hide from the first touch of Keyboard, with no listener of the app's own
    it('tracks the keyboard from the first Keyboard call, with no app listener', () => {
      expect(Keyboard.isVisible()).toBe(false);
      emit('keyboardDidShow', showEvent);
      expect(Keyboard.isVisible()).toBe(true);
      expect(Keyboard.metrics()).toEqual(showEvent.endCoordinates);
    });

    // RN animates only when `duration != null && duration !== 0`
    it('schedules no layout animation for an event without a duration', () => {
      const noDuration: IKeyboardEvent = JSON.parse(
        '{"easing":"keyboard","endCoordinates":{"screenX":0,"screenY":0,"width":1,"height":1}}',
      );
      Keyboard.scheduleLayoutAnimation(noDuration);
      expect(layoutAnimationCalls).toHaveLength(0);
    });

    // RN берет тип `keyboard`, если `easing` равен null или его нет в `Types`
    it.each([
      ['null', 'null', 'keyboard'],
      ['linear', '"linear"', 'linear'],
      ['unknown', '"no-such-type"', 'keyboard'],
    ])(
      'maps a %s easing onto the layout animation type',
      (_label, easing, type) => {
        const event: IKeyboardEvent = JSON.parse(
          `{"duration":12,"easing":${easing},"endCoordinates":{"screenX":0,"screenY":0,"width":1,"height":1}}`,
        );
        Keyboard.scheduleLayoutAnimation(event);
        expect(layoutAnimationCalls).toEqual([
          { duration: 12, updateType: type },
        ]);
      },
    );

    // RN goes to the device emitter itself, so the tracking subscription goes too
    it('removeAllListeners drops every listener of the event, the tracking one included', () => {
      const seen: unknown[] = [];
      Keyboard.addListener('keyboardDidShow', payload => seen.push(payload));
      Keyboard.removeAllListeners('keyboardDidShow');
      emit('keyboardDidShow', showEvent);
      expect(seen).toEqual([]);
      expect(Keyboard.isVisible()).toBe(false);
    });

    // RN передаёт модуль эмиттеру только на iOS, поэтому на Android счётчики не пингуются
    it('pings the observe counters on iOS and leaves them alone on Android', async () => {
      Keyboard.addListener('keyboardDidShow', () => {}).remove();
      const iosPings = observerAdded + observerRemoved;

      observerAdded = 0;
      observerRemoved = 0;
      vi.resetModules();
      vi.doMock('../platform', () => import('../platform/index.android'));
      await wireHost();
      ({ Keyboard } = await import('./index'));
      Keyboard.addListener('keyboardDidShow', () => {}).remove();

      expect(iosPings).toBeGreaterThan(0);
      expect(observerAdded + observerRemoved).toBe(0);
      vi.doUnmock('../platform');
    });
  });
});
