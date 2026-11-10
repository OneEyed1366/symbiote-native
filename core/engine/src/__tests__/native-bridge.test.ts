// The native-module bridge primitives, both directions, no simulator
// JS -> native: a fake `__turboModuleProxy` returns modules
// native -> JS: events go through RN's device bus and `NativeEventEmitter` drives the counters

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { emitRnDeviceEvent } from '@symbiote-native/test-utils';
import {
  getNativeModule,
  getEnforcingNativeModule,
  NativeEventEmitter,
  setEventDispatcher,
} from '../index';

type IFakeStatusBar = {
  setHidden(hidden: boolean): void;
};

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const fakeStatusBar: IFakeStatusBar = { setHidden: () => {} };
const registeredModules: Record<string, unknown> = {
  StatusBarManager: fakeStatusBar,
};

beforeAll(() => {
  Object.assign(globalThis, {
    __turboModuleProxy: <T>(name: string): T | null => {
      const module = registeredModules[name];
      return isType<T>(module) ? module : null;
    },
  });
});

describe('getNativeModule', () => {
  describe('resolves a registered module', () => {
    // Our own modules (`StatusBarManager`, ...) go through this JSI read path with methods intact
    it('returns the module registered under that name via __turboModuleProxy', () => {
      const statusBar = getNativeModule<IFakeStatusBar>('StatusBarManager');
      expect(statusBar).toBe(fakeStatusBar);
      expect(typeof statusBar?.setHidden).toBe('function');
    });
  });

  describe('reports an unavailable module (no throwing path, getNativeModule never throws)', () => {
    // A feature that can degrade gracefully must see `null`, not an exception
    it('returns null for a name no proxy has registered', () => {
      expect(getNativeModule('NopeManager')).toBeNull();
    });

    // Bridgeless hosts have no `__turboModuleProxy` function, only `global.nativeModuleProxy`
    it('falls back to global.nativeModuleProxy when __turboModuleProxy is absent (bridgeless host)', () => {
      const savedTurbo = globalThis.__turboModuleProxy;
      Object.assign(globalThis, {
        __turboModuleProxy: undefined,
        nativeModuleProxy: { StatusBarManager: fakeStatusBar },
      });

      expect(getNativeModule<IFakeStatusBar>('StatusBarManager')).toBe(
        fakeStatusBar,
      );
      expect(getNativeModule('NopeManager')).toBeNull();

      Object.assign(globalThis, {
        __turboModuleProxy: savedTurbo,
        nativeModuleProxy: undefined,
      });
    });

    // A bridgeless HostObject may throw for an unlinked name, one lookup must not blank the tree
    it('returns null (not throw) when the bridgeless proxy throws on access', () => {
      const savedTurbo = globalThis.__turboModuleProxy;
      const throwingProxy = new Proxy(
        {},
        {
          get(): never {
            throw new Error('unlinked native module');
          },
        },
      );
      Object.assign(globalThis, {
        __turboModuleProxy: undefined,
        nativeModuleProxy: throwingProxy,
      });

      expect(() => getNativeModule('AnyManager')).not.toThrow();
      expect(getNativeModule('AnyManager')).toBeNull();

      Object.assign(globalThis, {
        __turboModuleProxy: savedTurbo,
        nativeModuleProxy: undefined,
      });
    });
  });
});

describe('getEnforcingNativeModule', () => {
  describe('Positive', () => {
    // A hard dependent such as `StatusBar` gets a present module unchanged, not wrapped or copied
    it('returns the module when it is registered', () => {
      expect(getEnforcingNativeModule<IFakeStatusBar>('StatusBarManager')).toBe(
        fakeStatusBar,
      );
    });
  });

  describe('Negative', () => {
    // A hard native dependency fails loudly and names the module, a no-op hides a missing link
    it('throws naming the missing module', () => {
      expect(() => getEnforcingNativeModule('NopeManager')).toThrow(
        /NopeManager.*could not be found/,
      );
    });
  });
});

describe('NativeEventEmitter', () => {
  afterEach(() => setEventDispatcher(run => run()));

  // RN pings `addListener` and `removeListeners` of the module so native observes while heard
  it('delivers a native payload through the device bus and drives observe-counters', () => {
    let added = 0;
    let removed = 0;
    const observer = {
      addListener: () => {
        added += 1;
      },
      removeListeners: (count: number) => {
        removed += count;
      },
    };
    const emitter = new NativeEventEmitter(observer);

    let received: unknown;
    const sub = emitter.addListener('keyboardDidShow', payload => {
      received = payload;
    });
    expect(added).toBe(1);

    emitRnDeviceEvent('keyboardDidShow', { endCoordinates: { height: 336 } });
    expect(isRecord(received) && isRecord(received.endCoordinates)).toBe(true);
    if (isRecord(received) && isRecord(received.endCoordinates)) {
      expect(received.endCoordinates.height).toBe(336);
    }

    received = undefined;
    sub.remove();
    expect(removed).toBe(1);
    emitRnDeviceEvent('keyboardDidShow', { endCoordinates: { height: 0 } });
    expect(received).toBeUndefined();
  });

  // An unmount can race a parent's cleanup, a second `remove()` must not double-ping native
  it('pings removeListeners only once even if remove() is called twice', () => {
    let removed = 0;
    const observer = {
      addListener: () => {},
      removeListeners: (count: number) => {
        removed += count;
      },
    };
    const emitter = new NativeEventEmitter(observer);
    const sub = emitter.addListener('someEvent', () => {});

    sub.remove();
    sub.remove();

    expect(removed).toBe(1);
  });

  // Several device-event modules build the emitter with no module bound, the bus still delivers
  it('still delivers events when constructed without a module', () => {
    const emitter = new NativeEventEmitter();
    let received: unknown;
    const sub = emitter.addListener('didUpdateDimensions', payload => {
      received = payload;
    });

    emitRnDeviceEvent('didUpdateDimensions', { window: { width: 1 } });
    expect(isRecord(received)).toBe(true);

    sub.remove();
  });

  // A listener's `setState` must land on the framework's sync lane, like a Fabric event
  it('runs a listener inside the adapter event dispatcher', () => {
    const order: string[] = [];
    setEventDispatcher(run => {
      order.push('dispatcher');
      run();
    });
    const sub = new NativeEventEmitter().addListener('laneEvent', () => {
      order.push('listener');
    });

    emitRnDeviceEvent('laneEvent', {});

    expect(order).toEqual(['dispatcher', 'listener']);
    sub.remove();
  });
});
