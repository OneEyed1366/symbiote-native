import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_CELLULAR = {
  getCellularGenerationAsync: vi.fn(async () => 3),
  allowsVoipAsync: vi.fn(async () => true),
  getIsoCountryCodeAsync: vi.fn(async () => 'us'),
  getCarrierNameAsync: vi.fn(async () => 'Fake Carrier'),
  getMobileCountryCodeAsync: vi.fn(async () => '310'),
  getMobileNetworkCodeAsync: vi.fn(async () => '260'),
  getPermissionsAsync: vi.fn(async () => ({
    status: 'granted',
    expires: 'never',
    granted: true,
    canAskAgain: true,
  })),
  requestPermissionsAsync: vi.fn(async () => ({
    status: 'granted',
    expires: 'never',
    granted: true,
    canAskAgain: true,
  })),
};

// The real ExpoCellular native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of expo-modules-core's runtime resolution, same pattern
// packages/haptics/src/core/haptics.test.ts uses.
vi.mock('./native-module', () => ({
  expoCellular: FAKE_NATIVE_CELLULAR,
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse — same fake
// packages/haptics/src/core/haptics.test.ts uses. PermissionStatus/UnavailabilityError are faked
// alongside it for the same reason.
const fakePlatform = { OS: 'android' as 'ios' | 'android' };

vi.mock('expo-modules-core', () => ({
  Platform: fakePlatform,
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  getCellularGenerationAsync,
  allowsVoipAsync,
  getIsoCountryCodeAsync,
  getCarrierNameAsync,
  getMobileCountryCodeAsync,
  getMobileNetworkCodeAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
} = await import('./cellular');

afterEach(() => {
  fakePlatform.OS = 'android';
  vi.clearAllMocks();
});

describe('getCellularGenerationAsync', () => {
  describe('Positive', () => {
    it('delegates to the native module unconditionally on Android', async () => {
      await expect(getCellularGenerationAsync()).resolves.toBe(3);
    });

    it('still delegates on iOS', async () => {
      // why: unlike the carrier/SIM fields below, connection generation isn't an Android-only
      // upstream concept — the source has no `Platform.OS === 'ios'` short-circuit for it, so the
      // same native call must fire on both platforms.
      fakePlatform.OS = 'ios';
      await expect(getCellularGenerationAsync()).resolves.toBe(3);
      expect(FAKE_NATIVE_CELLULAR.getCellularGenerationAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
      // why: an unconditional native call has nowhere else to fail — if the method is missing the
      // wrapper must reject explicitly rather than let the call site await forever on `undefined`.
      const { getCellularGenerationAsync: native } = FAKE_NATIVE_CELLULAR;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_CELLULAR.getCellularGenerationAsync = undefined;

      await expect(getCellularGenerationAsync()).rejects.toThrow(
        'getCellularGenerationAsync is not available on expo-cellular',
      );

      FAKE_NATIVE_CELLULAR.getCellularGenerationAsync = native;
    });
  });
});

describe('allowsVoipAsync', () => {
  describe('Positive', () => {
    it('resolves null on iOS without calling the native module', async () => {
      // why: iOS doesn't expose VoIP-allowed info at all — the wrapper must short-circuit before
      // ever touching a native method that doesn't exist there.
      fakePlatform.OS = 'ios';
      await expect(allowsVoipAsync()).resolves.toBeNull();
      expect(FAKE_NATIVE_CELLULAR.allowsVoipAsync).not.toHaveBeenCalled();
    });

    it('delegates to the native module on Android', async () => {
      await expect(allowsVoipAsync()).resolves.toBe(true);
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error when the native method is absent on Android', async () => {
      // why: an Android build missing this method must fail loudly, not silently resolve
      // `undefined` a caller could mistake for a real `false`.
      const { allowsVoipAsync: native } = FAKE_NATIVE_CELLULAR;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_CELLULAR.allowsVoipAsync = undefined;

      await expect(allowsVoipAsync()).rejects.toThrow(
        'allowsVoipAsync is not available on expo-cellular',
      );

      FAKE_NATIVE_CELLULAR.allowsVoipAsync = native;
    });
  });
});

describe('getIsoCountryCodeAsync', () => {
  describe('Positive', () => {
    it('resolves null on iOS without calling the native module', async () => {
      fakePlatform.OS = 'ios';
      await expect(getIsoCountryCodeAsync()).resolves.toBeNull();
      expect(FAKE_NATIVE_CELLULAR.getIsoCountryCodeAsync).not.toHaveBeenCalled();
    });

    it('delegates to the native module on Android', async () => {
      await expect(getIsoCountryCodeAsync()).resolves.toBe('us');
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error when the native method is absent on Android', async () => {
      const { getIsoCountryCodeAsync: native } = FAKE_NATIVE_CELLULAR;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_CELLULAR.getIsoCountryCodeAsync = undefined;

      await expect(getIsoCountryCodeAsync()).rejects.toThrow(
        'getIsoCountryCodeAsync is not available on expo-cellular',
      );

      FAKE_NATIVE_CELLULAR.getIsoCountryCodeAsync = native;
    });
  });
});

describe('getCarrierNameAsync', () => {
  describe('Positive', () => {
    it('resolves null on iOS without calling the native module', async () => {
      fakePlatform.OS = 'ios';
      await expect(getCarrierNameAsync()).resolves.toBeNull();
      expect(FAKE_NATIVE_CELLULAR.getCarrierNameAsync).not.toHaveBeenCalled();
    });

    it('delegates to the native module on Android', async () => {
      await expect(getCarrierNameAsync()).resolves.toBe('Fake Carrier');
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error when the native method is absent on Android', async () => {
      const { getCarrierNameAsync: native } = FAKE_NATIVE_CELLULAR;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_CELLULAR.getCarrierNameAsync = undefined;

      await expect(getCarrierNameAsync()).rejects.toThrow(
        'getCarrierNameAsync is not available on expo-cellular',
      );

      FAKE_NATIVE_CELLULAR.getCarrierNameAsync = native;
    });
  });
});

describe('getMobileCountryCodeAsync', () => {
  describe('Positive', () => {
    it('resolves null on iOS without calling the native module', async () => {
      fakePlatform.OS = 'ios';
      await expect(getMobileCountryCodeAsync()).resolves.toBeNull();
      expect(FAKE_NATIVE_CELLULAR.getMobileCountryCodeAsync).not.toHaveBeenCalled();
    });

    it('delegates to the native module on Android', async () => {
      await expect(getMobileCountryCodeAsync()).resolves.toBe('310');
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error when the native method is absent on Android', async () => {
      const { getMobileCountryCodeAsync: native } = FAKE_NATIVE_CELLULAR;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_CELLULAR.getMobileCountryCodeAsync = undefined;

      await expect(getMobileCountryCodeAsync()).rejects.toThrow(
        'getMobileCountryCodeAsync is not available on expo-cellular',
      );

      FAKE_NATIVE_CELLULAR.getMobileCountryCodeAsync = native;
    });
  });
});

describe('getMobileNetworkCodeAsync', () => {
  describe('Positive', () => {
    it('resolves null on iOS without calling the native module', async () => {
      fakePlatform.OS = 'ios';
      await expect(getMobileNetworkCodeAsync()).resolves.toBeNull();
      expect(FAKE_NATIVE_CELLULAR.getMobileNetworkCodeAsync).not.toHaveBeenCalled();
    });

    it('delegates to the native module on Android', async () => {
      await expect(getMobileNetworkCodeAsync()).resolves.toBe('260');
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error when the native method is absent on Android', async () => {
      const { getMobileNetworkCodeAsync: native } = FAKE_NATIVE_CELLULAR;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_CELLULAR.getMobileNetworkCodeAsync = undefined;

      await expect(getMobileNetworkCodeAsync()).rejects.toThrow(
        'getMobileNetworkCodeAsync is not available on expo-cellular',
      );

      FAKE_NATIVE_CELLULAR.getMobileNetworkCodeAsync = native;
    });
  });
});

describe('getPermissionsAsync', () => {
  describe('Positive', () => {
    it('delegates to the native module on Android and resolves its response verbatim', async () => {
      // why: Android is the only platform where reading cellular info is actually gated by a
      // permission — the resolved value must be the native module's real answer, not just proof
      // it was called.
      await expect(getPermissionsAsync()).resolves.toEqual({
        status: 'granted',
        expires: 'never',
        granted: true,
        canAskAgain: true,
      });
      expect(FAKE_NATIVE_CELLULAR.getPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('resolves a plain GRANTED literal on iOS without calling the native module', async () => {
      // why: iOS/other platforms need no permission to read cellular info at all — the wrapper
      // must fabricate a granted response rather than making a pointless native round-trip.
      fakePlatform.OS = 'ios';
      await expect(getPermissionsAsync()).resolves.toEqual({
        status: 'granted',
        expires: 'never',
        granted: true,
        canAskAgain: true,
      });
      expect(FAKE_NATIVE_CELLULAR.getPermissionsAsync).not.toHaveBeenCalled();
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error when the native method is absent on Android', async () => {
      const { getPermissionsAsync: native } = FAKE_NATIVE_CELLULAR;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_CELLULAR.getPermissionsAsync = undefined;

      await expect(getPermissionsAsync()).rejects.toThrow(
        'getPermissionsAsync is not available on expo-cellular',
      );

      FAKE_NATIVE_CELLULAR.getPermissionsAsync = native;
    });
  });
});

describe('requestPermissionsAsync', () => {
  describe('Positive', () => {
    it('delegates to the native module on Android and resolves its response verbatim', async () => {
      await expect(requestPermissionsAsync()).resolves.toEqual({
        status: 'granted',
        expires: 'never',
        granted: true,
        canAskAgain: true,
      });
      expect(FAKE_NATIVE_CELLULAR.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('resolves a plain GRANTED literal on iOS without calling the native module', async () => {
      fakePlatform.OS = 'ios';
      await expect(requestPermissionsAsync()).resolves.toEqual({
        status: 'granted',
        expires: 'never',
        granted: true,
        canAskAgain: true,
      });
      expect(FAKE_NATIVE_CELLULAR.requestPermissionsAsync).not.toHaveBeenCalled();
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error when the native method is absent on Android', async () => {
      const { requestPermissionsAsync: native } = FAKE_NATIVE_CELLULAR;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_CELLULAR.requestPermissionsAsync = undefined;

      await expect(requestPermissionsAsync()).rejects.toThrow(
        'requestPermissionsAsync is not available on expo-cellular',
      );

      FAKE_NATIVE_CELLULAR.requestPermissionsAsync = native;
    });
  });
});
