// Co-located unit test for the Appearance module. A fake __turboModuleProxy
// returns an Appearance native module (getColorScheme -> 'light' plus observe-counters); a
// fake RN$registerCallableModule captures the device hub so the test can play "native" and
// emit `appearanceChanged`.
//
// Appearance never throws: getColorScheme/setColorScheme/addChangeListener all
// degrade to a documented no-op (null read, dropped write) when no module is
// linked. So there is no Negative (toThrow) group -- every scenario is Positive.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface IDeviceHub {
  emit: (eventType: string, ...args: unknown[]) => void;
}

let Appearance: typeof import('./index').Appearance;

let appearanceAdded: number;
let appearanceRemoved: number;
let currentNativeScheme: 'light' | 'dark';
let deviceHub: IDeviceHub | undefined;
let moduleLinked = true;

beforeEach(async () => {
  appearanceAdded = 0;
  appearanceRemoved = 0;
  currentNativeScheme = 'light';
  deviceHub = undefined;
  moduleLinked = true;

  const fakeAppearance = {
    getColorScheme: (): 'light' | 'dark' => currentNativeScheme,
    setColorScheme: (scheme: 'light' | 'dark' | 'unspecified'): void => {
      if (scheme !== 'unspecified') currentNativeScheme = scheme;
    },
    addListener: (): void => {
      appearanceAdded += 1;
    },
    removeListeners: (count: number): void => {
      appearanceRemoved += count;
    },
  };

  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module: unknown =
      name === 'Appearance' && moduleLinked ? fakeAppearance : undefined;
    return isPresent<T>(module) ? module : null;
  };
  globalThis.RN$registerCallableModule = (
    name: string,
    factory: () => IDeviceHub,
  ): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  };

  vi.resetModules();
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

async function loadAppearance(): Promise<void> {
  ({ Appearance } = await import('./index'));
}

describe('Appearance', () => {
  describe('getColorScheme', () => {
    // why: a fresh read (nothing cached yet) must go to the native module, proving
    // the module's answer -- not some default -- is what surfaces to callers.
    it('reads the initial color scheme from native', async () => {
      await loadAppearance();
      expect(Appearance.getColorScheme()).toBe('light');
    });

    // why: an unlinked module must not crash a caller that just wants "what's the
    // theme" -- it degrades to null, the documented "unknown" sentinel.
    it('returns null when no module is linked', async () => {
      moduleLinked = false;
      await loadAppearance();
      expect(Appearance.getColorScheme()).toBeNull();
    });
  });

  describe('setColorScheme', () => {
    // why: overriding the scheme must both push to native AND update the local
    // cache immediately, so a getColorScheme() right after doesn't race the next
    // native change event to reflect the override.
    it('pushes an explicit scheme to native and updates the cache immediately', async () => {
      await loadAppearance();
      Appearance.setColorScheme('dark');
      expect(Appearance.getColorScheme()).toBe('dark');
      expect(currentNativeScheme).toBe('dark');
    });

    // why: 'unspecified' means "follow the system" -- the cache must be re-derived
    // from native's own getColorScheme() after the reset, not hold the sentinel itself.
    it("resets to the system scheme on 'unspecified' by re-reading native", async () => {
      await loadAppearance();
      Appearance.setColorScheme('dark');
      currentNativeScheme = 'light'; // simulate the system's own current scheme
      Appearance.setColorScheme('unspecified');
      expect(Appearance.getColorScheme()).toBe('light');
    });

    // why: without a linked module there is nothing to write to -- the call must
    // no-op rather than throw, matching getColorScheme's degrade policy.
    it('is a no-op when no module is linked', async () => {
      moduleLinked = false;
      await loadAppearance();
      expect(() => Appearance.setColorScheme('dark')).not.toThrow();
    });
  });

  describe('addChangeListener', () => {
    // why: the public change event is how callers react to a system theme switch;
    // it must deliver `{ colorScheme }` and keep the cached getColorScheme() in sync.
    it('fires on a native appearanceChanged and keeps the cache in sync', async () => {
      await loadAppearance();
      let received: unknown;
      const sub = Appearance.addChangeListener(preferences => {
        received = preferences.colorScheme;
      });
      expect(deviceHub).toBeDefined();
      expect(appearanceAdded).toBeGreaterThanOrEqual(1);

      deviceHub?.emit('appearanceChanged', { colorScheme: 'dark' });
      expect(received).toBe('dark');
      expect(Appearance.getColorScheme()).toBe('dark');
      sub.remove();
    });

    // why: remove() must actually stop delivery and ping the native
    // observe-counter, so the module can release resources with nobody listening.
    it('remove() unsubscribes and decrements the native observe-counter', async () => {
      await loadAppearance();
      let received: unknown;
      const sub = Appearance.addChangeListener(preferences => {
        received = preferences.colorScheme;
      });
      const removedBefore = appearanceRemoved;
      sub.remove();
      expect(appearanceRemoved).toBe(removedBefore + 1);

      deviceHub?.emit('appearanceChanged', { colorScheme: 'light' });
      expect(received).toBeUndefined();
    });

    // why: isAppearancePreferences guards a malformed native payload (missing
    // colorScheme) -- the listener must not fire on garbage.
    it('ignores a malformed payload missing colorScheme', async () => {
      await loadAppearance();
      let calls = 0;
      Appearance.addChangeListener(() => {
        calls += 1;
      });
      deviceHub?.emit('appearanceChanged', { unrelated: true });
      expect(calls).toBe(0);
    });
  });
});
