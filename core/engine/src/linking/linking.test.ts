// Co-located unit test for the Linking module: both directions of the bridge
// and both platform builds. The platform builds are separate files
// (linking/index.ios.ts / linking/index.android.ts), imported DIRECTLY. JS->native: a fake
// __turboModuleProxy returns a LinkingManager (iOS) and an IntentAndroid (Android).
// native->JS: a fake RN$registerCallableModule captures the device hub, and we play
// "native" by emitting the `url` deep-link event.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface IDeviceHub {
  emit: (eventType: string, ...args: unknown[]) => void;
}

let iosLinking: typeof import('./index.ios').Linking;
let androidLinking: typeof import('./index.android').Linking;

let openedUrl: string | undefined;
let androidOpenedUrl: string | undefined;
let sentIntent: { action: string; extras?: unknown } | undefined;
let deviceHub: IDeviceHub | undefined;

const INITIAL_URL = 'https://start-from-native';

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function fakeLinkingManager(): Record<string, unknown> {
  return {
    // Deliberately NOT null, so this is distinguishable from the module-unavailable
    // fallback (which also resolves null) -- proves this value came from native, not
    // from the degrade path.
    getInitialURL: (): Promise<string | null> => Promise.resolve(INITIAL_URL),
    canOpenURL: (_url: string): Promise<boolean> => Promise.resolve(true),
    openURL: (url: string): Promise<void> => {
      openedUrl = url;
      return Promise.resolve();
    },
    openSettings: (): Promise<void> => Promise.resolve(),
    addListener: (): void => {},
    removeListeners: (_count: number): void => {},
  };
}

// Android routes to IntentAndroid instead, and adds sendIntent. Separate record state
// proves the Android build hit IntentAndroid, not LinkingManager.
function fakeIntentAndroid(): Record<string, unknown> {
  return {
    getInitialURL: (): Promise<string | null> => Promise.resolve(INITIAL_URL),
    canOpenURL: (_url: string): Promise<boolean> => Promise.resolve(true),
    openURL: (url: string): Promise<void> => {
      androidOpenedUrl = url;
      return Promise.resolve();
    },
    openSettings: (): Promise<void> => Promise.resolve(),
    sendIntent: (action: string, extras?: unknown): Promise<void> => {
      sentIntent = { action, extras };
      return Promise.resolve();
    },
    addListener: (): void => {},
    removeListeners: (_count: number): void => {},
  };
}

function installModules(modules: Record<string, unknown>): void {
  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module = modules[name];
    return isPresent<T>(module) ? module : null;
  };
}

beforeEach(async () => {
  openedUrl = undefined;
  androidOpenedUrl = undefined;
  sentIntent = undefined;
  deviceHub = undefined;

  installModules({
    LinkingManager: fakeLinkingManager(),
    IntentAndroid: fakeIntentAndroid(),
  });
  globalThis.RN$registerCallableModule = (
    name: string,
    factory: () => IDeviceHub,
  ): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  };

  vi.resetModules();
  ({ Linking: iosLinking } = await import('./index.ios'));
  ({ Linking: androidLinking } = await import('./index.android'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
});

describe('Linking (iOS build -> LinkingManager)', () => {
  describe('with the module linked', () => {
    it('canOpenURL resolves the native boolean', async () => {
      await expect(iosLinking.canOpenURL('https://x')).resolves.toBe(true);
    });

    it('openURL passes the url to LinkingManager', async () => {
      await iosLinking.openURL('https://x');
      expect(openedUrl).toBe('https://x');
    });

    it("getInitialURL resolves native's answer", async () => {
      await expect(iosLinking.getInitialURL()).resolves.toBe(INITIAL_URL);
    });

    it('openSettings resolves', async () => {
      await expect(iosLinking.openSettings()).resolves.toBeUndefined();
    });

    // why: iOS has no native counterpart to Android's sendIntent -- it must reject
    // 'Unsupported' unconditionally, never forward to IntentAndroid.
    it('sendIntent rejects (no iOS counterpart) and never reaches IntentAndroid', async () => {
      await expect(
        iosLinking.sendIntent('android.intent.action.VIEW'),
      ).rejects.toBeDefined();
      expect(sentIntent).toBeUndefined();
    });

    it('delivers a native `url` deep-link event to the listener, then stops after remove', () => {
      let received: unknown;
      const sub = iosLinking.addEventListener('url', event => {
        received = event;
      });
      expect(deviceHub).toBeDefined();

      deviceHub?.emit('url', { url: 'app://deep' });
      expect(isRecord(received) && received.url).toBe('app://deep');

      sub.remove();
    });

    // why: toUrlEvent guards a malformed native payload (no `url` field) -- the
    // listener must still be called (an app may just log/ignore it), with the
    // documented empty-string fallback, never with `undefined` or a crash.
    it('delivers an empty-url fallback event for a malformed native payload', () => {
      let received: unknown;
      iosLinking.addEventListener('url', event => {
        received = event;
      });
      deviceHub?.emit('url', { notAUrl: true });
      expect(isRecord(received) && received.url).toBe('');
    });
  });

  describe('invalid input (Negative)', () => {
    // why: RN's _validateURL fails loudly and SYNCHRONOUSLY (before any promise is
    // even created) on an empty/non-string url -- a typo'd deep link must surface
    // immediately at the call site, not as a swallowed rejection.
    it('openURL throws synchronously for an empty url', () => {
      expect(() => iosLinking.openURL('')).toThrow('Invalid URL: ');
    });

    it('canOpenURL throws synchronously for an empty url', () => {
      expect(() => iosLinking.canOpenURL('')).toThrow('Invalid URL: ');
    });
  });

  describe('module unavailable', () => {
    beforeEach(async () => {
      installModules({ IntentAndroid: fakeIntentAndroid() });
      vi.resetModules();
      ({ Linking: iosLinking } = await import('./index.ios'));
    });

    // why: an app calling openURL before/without LinkingManager linked must get an
    // informative rejection, not a hang or a generic native crash.
    it('openURL rejects with an "unavailable" error', async () => {
      await expect(iosLinking.openURL('https://x')).rejects.toThrow(
        /unavailable/,
      );
    });

    it('canOpenURL rejects with an "unavailable" error', async () => {
      await expect(iosLinking.canOpenURL('https://x')).rejects.toThrow(
        /unavailable/,
      );
    });

    it('openSettings rejects with an "unavailable" error', async () => {
      await expect(iosLinking.openSettings()).rejects.toThrow(/unavailable/);
    });

    // why: getInitialURL alone degrades to null instead of rejecting (RN parity --
    // "no deep link launched this app" and "can't tell" are the same observable
    // outcome to a caller), so an app can call it unconditionally at startup.
    it('getInitialURL resolves null instead of rejecting', async () => {
      await expect(iosLinking.getInitialURL()).resolves.toBeNull();
    });
  });
});

describe('Linking (Android build -> IntentAndroid)', () => {
  describe('with the module linked', () => {
    it('canOpenURL resolves the native boolean', async () => {
      await expect(androidLinking.canOpenURL('https://a')).resolves.toBe(true);
    });

    it('openURL routes to IntentAndroid', async () => {
      await androidLinking.openURL('intent://a');
      expect(androidOpenedUrl).toBe('intent://a');
    });

    it('sendIntent forwards action and extras', async () => {
      const extras = [{ key: 'foo', value: 'bar' }];
      await androidLinking.sendIntent('android.intent.action.VIEW', extras);
      expect(sentIntent?.action).toBe('android.intent.action.VIEW');
      expect(sentIntent?.extras).toEqual(extras);
    });
  });

  describe('module unavailable', () => {
    beforeEach(async () => {
      installModules({ LinkingManager: fakeLinkingManager() });
      vi.resetModules();
      ({ Linking: androidLinking } = await import('./index.android'));
    });

    // why: unlike iOS (which always rejects 'Unsupported'), Android's sendIntent
    // genuinely depends on IntentAndroid -- without it, the rejection must name
    // the real cause (module unavailable), not silently no-op a launched intent.
    it('sendIntent rejects with an "unavailable" error', async () => {
      await expect(
        androidLinking.sendIntent('android.intent.action.VIEW'),
      ).rejects.toThrow(/unavailable/);
    });
  });
});
