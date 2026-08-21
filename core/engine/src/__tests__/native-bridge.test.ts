// Co-located unit test: the native-module bridge primitives, both directions, no
// simulator. JS->native: a fake __turboModuleProxy returns fake modules; assert getNativeModule /
// getEnforcingNativeModule. native->JS: a fake RN$registerCallableModule captures the hub
// installDeviceEventHub registers; play "native" by calling hub.emit and assert NativeEventEmitter
// delivers the payload and drives the module's addListener/removeListeners counters.

import { beforeAll, describe, expect, it } from 'vitest';
import {
  getNativeModule,
  getEnforcingNativeModule,
  installDeviceEventHub,
  NativeEventEmitter,
  setDeviceEventSource,
  type IEventSubscription,
} from '../index';

interface IFakeStatusBar {
  setHidden(hidden: boolean): void;
}

type IDeviceHub = { emit: (eventType: string, ...args: unknown[]) => void };

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

// The device hub our code registers, captured so a test can act as "native".
let deviceHub: IDeviceHub | undefined;
let registerCallCount = 0;

function installRegisterCallableModule(): void {
  Object.assign(globalThis, {
    RN$registerCallableModule: (
      name: string,
      factory: () => IDeviceHub,
    ): void => {
      if (name !== 'RCTDeviceEventEmitter') return;
      registerCallCount += 1;
      deviceHub = factory();
    },
  });
}

beforeAll(() => {
  Object.assign(globalThis, {
    __turboModuleProxy: <T>(name: string): T | null => {
      const module = registeredModules[name];
      return isType<T>(module) ? module : null;
    },
  });
  installRegisterCallableModule();
});

describe('getNativeModule', () => {
  describe('resolves a registered module', () => {
    // why: symbiote's own modules (StatusBarManager, ...) go through this exact JSI
    // read path, so a resolved module must come back with its real methods intact.
    it('returns the module registered under that name via __turboModuleProxy', () => {
      const statusBar = getNativeModule<IFakeStatusBar>('StatusBarManager');
      expect(statusBar).toBe(fakeStatusBar);
      expect(typeof statusBar?.setHidden).toBe('function');
    });
  });

  describe('reports an unavailable module (no throwing path — getNativeModule never throws)', () => {
    // why: a feature that can degrade gracefully (module not linked in this binary)
    // must see `null`, not an exception, so it can fall back instead of crashing.
    it('returns null for a name no proxy has registered', () => {
      expect(getNativeModule('NopeManager')).toBeNull();
    });

    // why: bridgeless (RCTHost) hosts have no __turboModuleProxy function at all —
    // only global.nativeModuleProxy — so the fallback must resolve a real module too,
    // not just silently return null on every bridgeless host.
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

    // why: the source comment on getNativeModule notes a bridgeless HostObject "may
    // throw for an unlinked name" and guards it with try/catch specifically so one
    // bad lookup can't blank the whole render tree — that guard needs its own proof.
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
    // why: StatusBar (and similar hard-dependents) call the enforcing variant
    // precisely so a present module reaches them unchanged, not wrapped or copied.
    it('returns the module when it is registered', () => {
      expect(getEnforcingNativeModule<IFakeStatusBar>('StatusBarManager')).toBe(
        fakeStatusBar,
      );
    });
  });

  describe('Negative', () => {
    // why: a feature with a hard native dependency (no reasonable JS fallback) must
    // fail loudly and name the missing module, instead of a silent no-op that hides
    // a missing autolink until a user reports the feature "does nothing".
    it('throws naming the missing module', () => {
      expect(() => getEnforcingNativeModule('NopeManager')).toThrow(
        /NopeManager.*not registered/,
      );
    });
  });
});

describe('installDeviceEventHub', () => {
  // why: on a non-bridgeless host RN$registerCallableModule is never installed, so
  // native events genuinely cannot arrive — that must surface as a loud failure at
  // bootstrap, not a hub that silently never receives anything. This must run before
  // any other test in the file successfully installs the hub, since `installed` is a
  // module-level singleton and the early-return would otherwise mask this branch.
  it('throws when RN$registerCallableModule is not installed on the host', () => {
    const saved = globalThis.RN$registerCallableModule;
    Object.assign(globalThis, { RN$registerCallableModule: undefined });

    expect(() => installDeviceEventHub()).toThrow(/RN\$registerCallableModule/);

    Object.assign(globalThis, { RN$registerCallableModule: saved });
  });

  // why: install is called from every lazy device-event module's first subscribe
  // (Dimensions, AppState, ...) — with several modules subscribing independently it
  // must register the native callable exactly once, not once per caller.
  it('registers the hub once and is idempotent on repeat calls', () => {
    const callsBefore = registerCallCount;
    installDeviceEventHub();
    installDeviceEventHub();
    expect(registerCallCount).toBe(callsBefore + 1);
    expect(deviceHub).toBeDefined();
  });
});

describe('NativeEventEmitter', () => {
  // why: RN's own NativeEventEmitter pings the module's addListener/removeListeners
  // counters so native can start/stop observing lazily — losing that wiring means a
  // native side that never emits because it thinks nobody is listening.
  it('delivers a native payload through the fallback hub and drives observe-counters', () => {
    if (deviceHub === undefined) throw new Error('hub not registered');

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

    deviceHub.emit('keyboardDidShow', { endCoordinates: { height: 336 } });
    expect(isRecord(received) && isRecord(received.endCoordinates)).toBe(true);
    if (isRecord(received) && isRecord(received.endCoordinates)) {
      expect(received.endCoordinates.height).toBe(336);
    }

    received = undefined;
    sub.remove();
    expect(removed).toBe(1);
    deviceHub.emit('keyboardDidShow', { endCoordinates: { height: 0 } });
    expect(received).toBeUndefined();
  });

  // why: a listener's own cleanup (unmount) can race a parent's cleanup calling
  // remove() again — double-unsubscribe must not double-ping native's counter, which
  // would desync native's observe count from the real number of JS listeners.
  it('pings removeListeners only once even if remove() is called twice', () => {
    if (deviceHub === undefined) throw new Error('hub not registered');

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

  // why: several device-event modules (Dimensions' DeviceInfo among them) deliberately
  // construct the emitter with no module bound (bindModuleToEmitter: false) — delivery
  // must still work through the fallback hub without crashing on the unset module.
  it('still delivers events when constructed without a module', () => {
    if (deviceHub === undefined) throw new Error('hub not registered');

    const emitter = new NativeEventEmitter();
    let received: unknown;
    const sub = emitter.addListener('didUpdateDimensions', payload => {
      received = payload;
    });

    deviceHub.emit('didUpdateDimensions', { window: { width: 1 } });
    expect(isRecord(received)).toBe(true);

    sub.remove();
  });

  // why: on a real RN host the built-in fallback hub is unused — the app injects RN's
  // own DeviceEventEmitter via setDeviceEventSource, and delivery must switch to that
  // bus transparently. Declared last: setDeviceEventSource has no unset API, so once
  // called it permanently redirects every later addListener in this module instance.
  it('delivers through an injected host bus and forwards remove() to it', () => {
    const hostListeners = new Map<string, (payload: unknown) => void>();
    let hostSubscriptionRemoved = false;
    setDeviceEventSource({
      addListener: (eventType, listener): IEventSubscription => {
        hostListeners.set(eventType, listener);
        return {
          remove: () => {
            hostSubscriptionRemoved = true;
          },
        };
      },
    });

    let moduleRemoved = 0;
    const observer = {
      addListener: () => {},
      removeListeners: (count: number) => {
        moduleRemoved += count;
      },
    };
    const emitter = new NativeEventEmitter(observer);

    let received: unknown;
    const sub = emitter.addListener('appStateDidChange', payload => {
      received = payload;
    });

    hostListeners.get('appStateDidChange')?.({ app_state: 'background' });
    expect(isRecord(received) && received.app_state).toBe('background');

    sub.remove();
    expect(hostSubscriptionRemoved).toBe(true);
    expect(moduleRemoved).toBe(1);
  });
});
