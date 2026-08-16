// Unit test for the Settings module: the snapshot seeds from native
// getConstants().settings, `set` writes through to native setValues AND updates the snapshot,
// and a `watchKeys` watcher fires only when its key's value actually changes. A fake
// nativeModuleProxy (bridgeless host-object form) provides SettingsManager; a fake
// RN$registerCallableModule captures the device hub. Settings' public API (get/set/watchKeys/
// clearWatch) never throws, so there is no Negative group — the "robustness" describe below
// covers the module-absent and malformed-payload paths instead.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface INativeCall {
  method: string;
  args: unknown[];
}
interface IDeviceHub {
  emit: (eventType: string, ...args: unknown[]) => void;
}

let Settings: typeof import('./index').Settings;

let nativeCalls: INativeCall[];
let deviceHub: IDeviceHub | undefined;

function fakeSettingsManager(seed: unknown): {
  getConstants: () => { settings: unknown };
  setValues: (values: Record<string, unknown>) => void;
  deleteValues: (keys: string[]) => void;
  addListener: () => void;
  removeListeners: () => void;
} {
  return {
    getConstants() {
      return { settings: seed };
    },
    setValues(values: Record<string, unknown>) {
      nativeCalls.push({ method: 'setValues', args: [values] });
    },
    deleteValues(keys: string[]) {
      nativeCalls.push({ method: 'deleteValues', args: [keys] });
    },
    addListener() {},
    removeListeners() {},
  };
}

beforeEach(async () => {
  nativeCalls = [];
  deviceHub = undefined;

  globalThis.nativeModuleProxy = { SettingsManager: fakeSettingsManager({ foo: 1 }) };
  globalThis.RN$registerCallableModule = (name: string, factory: () => IDeviceHub): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  };

  vi.resetModules();
  ({ Settings } = await import('./index'));
});

afterEach(() => {
  globalThis.nativeModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
});

function setValuesCalls(): INativeCall[] {
  return nativeCalls.filter(call => call.method === 'setValues');
}

describe('Settings', () => {
  it('seeds the snapshot from native getConstants().settings', () => {
    expect(Settings.get('foo')).toBe(1);
  });

  it('set writes through to native setValues and updates the snapshot', () => {
    Settings.set({ foo: 2 });

    const calls = setValuesCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0]).toEqual({ foo: 2 });
    expect(Settings.get('foo')).toBe(2);
  });

  it('a watcher fires only when its key changes, never for an unrelated key or an unchanged value', () => {
    let fooFires = 0;
    Settings.watchKeys('foo', () => {
      fooFires += 1;
    });

    Settings.set({ bar: 'x' });
    expect(fooFires).toBe(0);

    Settings.set({ foo: 3 });
    expect(fooFires).toBe(1);
    expect(Settings.get('foo')).toBe(3);

    // Setting the SAME value again is not a change.
    Settings.set({ foo: 3 });
    expect(fooFires).toBe(1);
  });

  // why: watchKeys accepts a key ARRAY, not just a single key — a real component often
  // watches several related settings with one callback.
  it('a watcher registered for multiple keys fires when any one of them changes', () => {
    let fires = 0;
    Settings.watchKeys(['foo', 'bar'], () => {
      fires += 1;
    });

    Settings.set({ bar: 'x' });
    expect(fires).toBe(1);

    Settings.set({ foo: 99 });
    expect(fires).toBe(2);
  });

  it('a native settingsUpdated event feeds the snapshot and fires watchers', () => {
    let fooFires = 0;
    Settings.watchKeys('foo', () => {
      fooFires += 1;
    });
    expect(deviceHub).toBeDefined();

    deviceHub?.emit('settingsUpdated', { foo: 4 });
    expect(Settings.get('foo')).toBe(4);
    expect(fooFires).toBe(1);
  });

  describe('clearWatch', () => {
    // why: clearWatch is the only way to stop a watcher — a watcher that keeps firing after
    // its owner unmounted would leak work into a dead callback.
    it('a cleared watcher no longer fires', () => {
      let fires = 0;
      const watchId = Settings.watchKeys('foo', () => {
        fires += 1;
      });

      Settings.clearWatch(watchId);
      Settings.set({ foo: 5 });

      expect(fires).toBe(0);
    });

    // why: watchIds are registry indices that are never reused (the array only ever grows) —
    // clearing an id that was never issued, or was already cleared, must be a safe no-op, not
    // a crash from indexing past the array.
    it('clearing an out-of-range watchId is a no-op, never throws', () => {
      expect(() => Settings.clearWatch(999)).not.toThrow();
      expect(() => Settings.clearWatch(-1)).not.toThrow();
    });

    it('clearing one watcher does not affect a different watcher on the same key', () => {
      let fires = 0;
      const watchId = Settings.watchKeys('foo', () => undefined);
      Settings.watchKeys('foo', () => {
        fires += 1;
      });

      Settings.clearWatch(watchId);
      Settings.set({ foo: 6 });

      expect(fires).toBe(1);
    });
  });

  describe('robustness — malformed or absent native state never crashes', () => {
    // why: `settingsUpdated`'s payload crosses the native bridge untyped — a non-record
    // payload must be dropped silently (isRecord guard) rather than corrupt the snapshot or
    // throw inside the event callback.
    it('a non-record settingsUpdated payload is ignored', () => {
      let fires = 0;
      Settings.watchKeys('foo', () => {
        fires += 1;
      });

      expect(() => deviceHub?.emit('settingsUpdated', 'not-an-object')).not.toThrow();
      expect(Settings.get('foo')).toBe(1); // unchanged
      expect(fires).toBe(0);
    });

    // why: getSnapshot's isRecord guard is what stops a malformed native constants payload
    // from crashing the very first Settings.get() call — worth proving directly, not just
    // trusting the guard exists.
    it('seeds an empty snapshot when getConstants().settings is not a record', async () => {
      globalThis.nativeModuleProxy = {
        SettingsManager: fakeSettingsManager('not-a-record'),
      };
      vi.resetModules();
      const fresh = await import('./index');

      expect(fresh.Settings.get('foo')).toBeUndefined();
    });

    // why: headless / a host without SettingsManager linked must still let get/set/watchKeys
    // work as pure JS state — documented explicitly in the module header ("Without a native
    // module (headless) only JS state updates").
    it('without a native module, get/set/watchKeys operate purely in JS', async () => {
      globalThis.nativeModuleProxy = undefined;
      globalThis.__turboModuleProxy = undefined;
      vi.resetModules();
      const fresh = await import('./index');

      let fires = 0;
      fresh.Settings.watchKeys('foo', () => {
        fires += 1;
      });

      expect(() => fresh.Settings.set({ foo: 1 })).not.toThrow();
      expect(fresh.Settings.get('foo')).toBe(1);
      expect(fires).toBe(1);
    });
  });
});
