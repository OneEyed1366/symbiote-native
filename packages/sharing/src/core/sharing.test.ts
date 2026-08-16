import { afterEach, describe, expect, it, vi } from 'vitest';

import type { INativeSharingModule } from './native-module';

const FAKE_NATIVE_SHARING: INativeSharingModule = {
  shareAsync: vi.fn(async () => undefined),
};

// The real ExpoSharing native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless run, so the module-lookup
// file is faked in place of expo-modules-core's runtime resolution, the same pattern
// packages/secure-store/src/core/secure-store.test.ts uses.
vi.mock('./native-module', () => ({
  expoSharing: FAKE_NATIVE_SHARING,
}));

// expo-modules-core's real entry transitively imports 'react-native', whose Flow-typed source
// Vitest's Oxc transform can't parse — so only the members used as values are faked.
vi.mock('expo-modules-core', () => ({
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const { isAvailableAsync, shareAsync } = await import('./sharing');

const LOCAL_FILE_URL = 'file:///tmp/report.pdf';

afterEach(() => {
  vi.clearAllMocks();
  Reflect.deleteProperty(FAKE_NATIVE_SHARING, 'isAvailableAsync');
  FAKE_NATIVE_SHARING.shareAsync = vi.fn(async () => undefined);
});

// why: isAvailableAsync has no guard clause and never rejects — every scenario resolves a
// boolean, so there is no Negative group for it (see the package-level Negative group below,
// which covers shareAsync's actual throwing paths).
describe('positive — isAvailableAsync always resolves a boolean, never throws', () => {
  // why: neither native module implements isAvailableAsync in expo-sharing@57.0.8 (see
  // native-module.ts), so on-device availability is read from whether shareAsync itself exists.
  it('resolves true from the presence of the native share method when no native check exists', async () => {
    await expect(isAvailableAsync()).resolves.toBe(true);
  });

  it('resolves false when neither a native check nor the native share method exists', async () => {
    FAKE_NATIVE_SHARING.shareAsync = undefined;

    await expect(isAvailableAsync()).resolves.toBe(false);
  });

  // why: if the native module ever DOES implement isAvailableAsync (the web module already
  // does), that check must win over the shareAsync-presence fallback rather than being ignored.
  it('defers to the native check when the module implements one, even if it disagrees with presence', async () => {
    const nativeCheck = vi.fn(async () => false);
    Object.assign(FAKE_NATIVE_SHARING, { isAvailableAsync: nativeCheck });

    // shareAsync is still present (would report true via the fallback), but the native check
    // says false and must be the one that decides.
    await expect(isAvailableAsync()).resolves.toBe(false);
    expect(nativeCheck).toHaveBeenCalled();
  });
});

describe('positive — shareAsync delegates a valid call to the native module', () => {
  it('passes the url and options straight through', async () => {
    await shareAsync(LOCAL_FILE_URL, { mimeType: 'application/pdf', dialogTitle: 'Send report' });
    expect(FAKE_NATIVE_SHARING.shareAsync).toHaveBeenCalledWith(LOCAL_FILE_URL, {
      mimeType: 'application/pdf',
      dialogTitle: 'Send report',
    });
  });

  // why: options is an optional param — omitting it must not reach the native module as
  // `undefined`, which several native SDKs reject outright.
  it('defaults the options to an empty object when omitted', async () => {
    await shareAsync(LOCAL_FILE_URL);
    expect(FAKE_NATIVE_SHARING.shareAsync).toHaveBeenCalledWith(LOCAL_FILE_URL, {});
  });

  // why: anchor is a nested rectangle for the iPad popover — a flattening refactor (spreading
  // its fields onto the top-level options) would silently break the iPad presentation.
  it('forwards the iPad anchor rectangle unflattened', async () => {
    const anchor = { x: 10, y: 20, width: 1, height: 1 };
    await shareAsync(LOCAL_FILE_URL, { anchor });
    expect(FAKE_NATIVE_SHARING.shareAsync).toHaveBeenCalledWith(LOCAL_FILE_URL, { anchor });
  });
});

describe('negative — shareAsync rejects before or instead of a native call', () => {
  // why: an empty or non-string url surfaces on-device as an opaque argument-conversion failure
  // (iOS) or a generic "Failed to share the file" (Android) — both far from the call site. The
  // guard fails early with the caller's own argument named instead.
  describe('invalid url rejected before any native call', () => {
    it('rejects an empty url', async () => {
      await expect(shareAsync('')).rejects.toThrow(/Invalid url provided to Sharing/);
      expect(FAKE_NATIVE_SHARING.shareAsync).not.toHaveBeenCalled();
    });

    it('rejects a non-string url', async () => {
      // @ts-expect-error -- the guard exists precisely for callers without type checking
      await expect(shareAsync(undefined)).rejects.toThrow(/Invalid url provided to Sharing/);
      expect(FAKE_NATIVE_SHARING.shareAsync).not.toHaveBeenCalled();
    });
  });

  // why: throwing a named UnavailabilityError instead of letting `undefined(...)` blow up with a
  // raw TypeError lets a caller distinguish "platform doesn't support sharing" from a real
  // share-sheet failure.
  it('throws an UnavailabilityError naming itself and the native module when shareAsync is absent', async () => {
    FAKE_NATIVE_SHARING.shareAsync = undefined;

    await expect(shareAsync(LOCAL_FILE_URL)).rejects.toThrow(
      'shareAsync is not available on expo-sharing',
    );
  });
});
