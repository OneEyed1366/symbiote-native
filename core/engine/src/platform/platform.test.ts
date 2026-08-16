// Exercises the Platform API without a simulator. A fake PlatformConstants
// native module sits behind BOTH bridge paths getNativeModule reads (__turboModuleProxy the
// function, and nativeModuleProxy[name] the HostObject); Platform must mirror RN's iOS/Android
// shapes: OS is the static literal, select follows the platform's documented precedence, and
// every derived getter reflects the faked getConstants() payload. `./index` (the base,
// tsc/tsx/web target) resolves to the iOS build, so the main describe below exercises iOS;
// Android's divergent branches are exercised directly against `./index.android`.
//
// Platform never throws — every getter degrades to a neutral default when the native module or
// its constants shape is unresolvable (documented explicitly: "a Platform read must never
// crash a render") — so there is no Negative group; "unresolvable constants" is its own
// describe instead.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Platform, type IPlatformConstantsIOS } from './index';

const FAKE_OS_VERSION = '17.4';
const FAKE_IDIOM = 'pad';

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

const fakeConstants: IPlatformConstantsIOS = {
  forceTouchAvailable: false,
  interfaceIdiom: FAKE_IDIOM,
  isTesting: false,
  osVersion: FAKE_OS_VERSION,
  systemName: 'iOS',
  reactNativeVersion: { major: 0, minor: 0, patch: 0, prerelease: null },
};

const fakePlatformConstants = {
  getConstants: (): IPlatformConstantsIOS => fakeConstants,
};

const registeredModules: Record<string, unknown> = { PlatformConstants: fakePlatformConstants };

function installFakeProxy(modules: Record<string, unknown>): void {
  Object.assign(globalThis, {
    // Non-bridgeless: the function proxy.
    __turboModuleProxy: <T>(name: string): T | null => {
      const module = modules[name];
      return isType<T>(module) ? module : null;
    },
    // Bridgeless fallback: the HostObject keyed by module name. Both faked so the test
    // exercises whichever getNativeModule resolves first.
    nativeModuleProxy: modules,
  });
}

beforeAll(() => {
  installFakeProxy(registeredModules);
});

describe('Platform (iOS)', () => {
  it("OS is the static 'ios'", () => {
    expect(Platform.OS).toBe('ios');
  });

  describe('select', () => {
    it('picks the ios branch', () => {
      expect(Platform.select({ ios: 'A', android: 'B' })).toBe('A');
    });

    it('falls back to default when no platform branch matches', () => {
      expect(Platform.select({ android: 'B', default: 'D' })).toBe('D');
    });

    it('prefers native over default', () => {
      expect(Platform.select({ native: 'N', default: 'D' })).toBe('N');
    });

    // why: RN's exact iOS precedence is ios -> native -> default; a spec with none of the
    // three keys must resolve to undefined, not throw or silently pick android's value.
    it('resolves to undefined when nothing matches and there is no default', () => {
      expect(Platform.select({ android: 'B' })).toBeUndefined();
    });
  });

  it('Version reflects the faked osVersion', () => {
    expect(Platform.Version).toBe(FAKE_OS_VERSION);
  });

  it('constants exposes the whole resolved getConstants() payload', () => {
    expect(Platform.constants).toEqual(fakeConstants);
  });

  it("isPad is true for interfaceIdiom 'pad'", () => {
    expect(Platform.isPad).toBe(true);
  });

  it("isTV is false for interfaceIdiom 'pad'", () => {
    expect(Platform.isTV).toBe(false);
  });
});

// Isolated-instance tests below use vi.resetModules() + a fresh dynamic import so each test
// gets its OWN uncached createConstantsResolver — the shared `Platform` above resolves and
// caches its constants on first read, so varying the fake payload per-scenario needs a fresh
// module, not a global mutation that would leak across tests.
describe('Platform (iOS) — derived getters, each proven against its own fresh module instance', () => {
  afterEach(() => {
    // Restore the shared fake module the main describe above depends on.
    installFakeProxy(registeredModules);
  });

  async function loadPlatformWith(constants: IPlatformConstantsIOS): Promise<typeof Platform> {
    vi.resetModules();
    installFakeProxy({ PlatformConstants: { getConstants: (): IPlatformConstantsIOS => constants } });
    const imported = await import('./index');
    return imported.Platform;
  }

  it("isVision is true for interfaceIdiom 'vision'", async () => {
    const fresh = await loadPlatformWith({ ...fakeConstants, interfaceIdiom: 'vision' });
    expect(fresh.isVision).toBe(true);
    expect(fresh.isPad).toBe(false);
  });

  it('isTesting tracks the native isTesting flag', async () => {
    const fresh = await loadPlatformWith({ ...fakeConstants, isTesting: true });
    expect(fresh.isTesting).toBe(true);
  });

  // why: RN's rule is isDisableAnimations ?? isTesting — the native flag, when PRESENT,
  // wins over isTesting even when they disagree.
  it('isDisableAnimations: the native flag wins over isTesting when both are present', async () => {
    const fresh = await loadPlatformWith({
      ...fakeConstants,
      isTesting: false,
      isDisableAnimations: true,
    });
    expect(fresh.isDisableAnimations).toBe(true);
  });

  it('isDisableAnimations: falls back to isTesting when the native flag is absent', async () => {
    const fresh = await loadPlatformWith({ ...fakeConstants, isTesting: true });
    expect(fresh.isDisableAnimations).toBe(true);
  });

  it('isMacCatalyst tracks the native isMacCatalyst flag', async () => {
    const fresh = await loadPlatformWith({ ...fakeConstants, isMacCatalyst: true });
    expect(fresh.isMacCatalyst).toBe(true);
  });

  // why: "a Platform read must never crash a render" (the module's own comment) — proving
  // this for the actually-unresolvable case, not just trusting the comment.
  it('falls back to neutral defaults (never throws) when PlatformConstants is not registered', async () => {
    vi.resetModules();
    globalThis.__turboModuleProxy = undefined;
    globalThis.nativeModuleProxy = undefined;
    const { Platform: fresh } = await import('./index');

    expect(fresh.Version).toBe('');
    expect(fresh.constants).toBeUndefined();
    expect(fresh.isPad).toBe(false);
    expect(fresh.isTV).toBe(false);
    expect(fresh.isVision).toBe(false);
    expect(fresh.isTesting).toBe(false);
    expect(fresh.isDisableAnimations).toBe(false);
    expect(fresh.isMacCatalyst).toBe(false);
  });

  // why: the guard (isPlatformConstantsIOS) checks for 'osVersion'/'interfaceIdiom' — a
  // native payload with an unexpected shape must be treated exactly like "module absent",
  // not partially trusted.
  it('falls back to neutral defaults when getConstants() returns an unexpected shape', async () => {
    vi.resetModules();
    installFakeProxy({ PlatformConstants: { getConstants: (): unknown => ({ nonsense: true }) } });
    const { Platform: fresh } = await import('./index');

    expect(fresh.Version).toBe('');
    expect(fresh.constants).toBeUndefined();
  });
});

describe('Platform (Android)', () => {
  async function loadAndroidPlatformWith(
    constants: Record<string, unknown>,
  ): Promise<typeof import('./index.android').Platform> {
    vi.resetModules();
    installFakeProxy({ PlatformConstants: { getConstants: (): Record<string, unknown> => constants } });
    const imported = await import('./index.android');
    return imported.Platform;
  }

  const fakeAndroidConstants = {
    isTesting: false,
    reactNativeVersion: { major: 0, minor: 0, patch: 0, prerelease: null },
    Version: 34,
    Release: '14',
    Serial: 'unknown',
    Fingerprint: 'fake',
    Model: 'Pixel',
    uiMode: 'normal',
    Brand: 'Google',
    Manufacturer: 'Google',
  };

  it("OS is the static 'android'", async () => {
    const fresh = await loadAndroidPlatformWith(fakeAndroidConstants);
    expect(fresh.OS).toBe('android');
  });

  describe('select', () => {
    it('picks the android branch', async () => {
      const fresh = await loadAndroidPlatformWith(fakeAndroidConstants);
      expect(fresh.select({ android: 'A', ios: 'I' })).toBe('A');
    });

    it('falls back to default, preferring native over default when both present', async () => {
      const fresh = await loadAndroidPlatformWith(fakeAndroidConstants);
      expect(fresh.select({ ios: 'I', default: 'D' })).toBe('D');
      expect(fresh.select({ native: 'N', default: 'D' })).toBe('N');
    });
  });

  it('Version reflects the faked numeric API level (not a string, unlike iOS)', async () => {
    const fresh = await loadAndroidPlatformWith(fakeAndroidConstants);
    expect(fresh.Version).toBe(34);
  });

  // why: RN Android's Platform has no iOS device-class concept — isPad/isMacCatalyst/
  // isVision must be a hard `false`, never derived from any native field, on every payload.
  it('isPad, isVision, and isMacCatalyst are hard false (no iOS device-class concept on Android)', async () => {
    const fresh = await loadAndroidPlatformWith(fakeAndroidConstants);
    expect(fresh.isPad).toBe(false);
    expect(fresh.isVision).toBe(false);
    expect(fresh.isMacCatalyst).toBe(false);
  });

  it("isTV reflects uiMode === 'tv'", async () => {
    const fresh = await loadAndroidPlatformWith({ ...fakeAndroidConstants, uiMode: 'tv' });
    expect(fresh.isTV).toBe(true);

    const notTv = await loadAndroidPlatformWith(fakeAndroidConstants);
    expect(notTv.isTV).toBe(false);
  });

  it('isDisableAnimations falls back to isTesting when the native flag is absent, same rule as iOS', async () => {
    const fresh = await loadAndroidPlatformWith({ ...fakeAndroidConstants, isTesting: true });
    expect(fresh.isDisableAnimations).toBe(true);
  });

  it('constants exposes the whole resolved Android payload', async () => {
    const fresh = await loadAndroidPlatformWith(fakeAndroidConstants);
    expect(fresh.constants).toEqual(fakeAndroidConstants);
  });

  // why: the Android guard checks for 'Version'/'uiMode' (a DIFFERENT pair of keys than
  // iOS's 'osVersion'/'interfaceIdiom') — must be proven with its own malformed payload, not
  // assumed identical to iOS's guard.
  it('falls back to neutral defaults (Version 0) when getConstants() returns an unexpected shape', async () => {
    vi.resetModules();
    installFakeProxy({ PlatformConstants: { getConstants: (): unknown => ({ nonsense: true }) } });
    const { Platform: fresh } = await import('./index.android');

    expect(fresh.Version).toBe(0);
    expect(fresh.constants).toBeUndefined();
  });
});
