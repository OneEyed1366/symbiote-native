import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_APP_INTEGRITY = {
  isSupported: true,
  generateKeyAsync: vi.fn(async () => 'key-id'),
  attestKeyAsync: vi.fn(async () => 'attestation'),
  generateAssertionAsync: vi.fn(async () => 'assertion'),
  prepareIntegrityTokenProviderAsync: vi.fn(async () => undefined),
  requestIntegrityCheckAsync: vi.fn(async () => 'verdict'),
  isHardwareAttestationSupportedAsync: vi.fn(async () => true),
  generateHardwareAttestedKeyAsync: vi.fn(async () => undefined),
  getAttestationCertificateChainAsync: vi.fn(async () => ['cert-a', 'cert-b']),
};

const fakePlatform = { OS: 'ios' as 'ios' | 'android' };

// The real ExpoAppIntegrity native module only exists on device, so the module-lookup file is
// faked in place of expo-modules-core's runtime resolution, same pattern as
// packages/application/src/core/application.test.ts
vi.mock('./native-module', () => ({
  get expoAppIntegrity() {
    return FAKE_NATIVE_APP_INTEGRITY;
  },
}));

// expo-modules-core's real entry transitively imports react-native for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse, same fake
// packages/application/src/core/application.test.ts uses
vi.mock('expo-modules-core', () => ({
  Platform: fakePlatform,
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

let generateKeyAsync: typeof import('./app-integrity').generateKeyAsync;
let attestKeyAsync: typeof import('./app-integrity').attestKeyAsync;
let generateAssertionAsync: typeof import('./app-integrity').generateAssertionAsync;
let prepareIntegrityTokenProviderAsync: typeof import('./app-integrity').prepareIntegrityTokenProviderAsync;
let requestIntegrityCheckAsync: typeof import('./app-integrity').requestIntegrityCheckAsync;
let isHardwareAttestationSupportedAsync: typeof import('./app-integrity').isHardwareAttestationSupportedAsync;
let generateHardwareAttestedKeyAsync: typeof import('./app-integrity').generateHardwareAttestedKeyAsync;
let getAttestationCertificateChainAsync: typeof import('./app-integrity').getAttestationCertificateChainAsync;

// `isSupported` reads the native constant eagerly at module load, so each test flipping
// Platform.OS beforehand needs a fresh module instance to see the effect
async function importFresh() {
  vi.resetModules();
  const mod = await import('./app-integrity');
  ({
    generateKeyAsync,
    attestKeyAsync,
    generateAssertionAsync,
    prepareIntegrityTokenProviderAsync,
    requestIntegrityCheckAsync,
    isHardwareAttestationSupportedAsync,
    generateHardwareAttestedKeyAsync,
    getAttestationCertificateChainAsync,
  } = mod);
  return mod;
}

afterEach(() => {
  fakePlatform.OS = 'ios';
  vi.clearAllMocks();
});

describe('isSupported', () => {
  it('reads the native constant on ios', async () => {
    const mod = await importFresh();
    expect(mod.isSupported).toBe(true);
  });

  it('is true off ios, regardless of the native constant', async () => {
    fakePlatform.OS = 'android';
    const mod = await importFresh();
    expect(mod.isSupported).toBe(true);
  });
});

describe('generateKeyAsync', () => {
  describe('Positive', () => {
    it('delegates to the native module on ios', async () => {
      await importFresh();
      await expect(generateKeyAsync()).resolves.toBe('key-id');
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error off ios', async () => {
      fakePlatform.OS = 'android';
      await importFresh();
      await expect(generateKeyAsync()).rejects.toThrow(
        'generateKeyAsync is not available on expo-app-integrity',
      );
    });
  });
});

describe('attestKeyAsync', () => {
  describe('Positive', () => {
    it('forwards keyId and challenge to the native module on ios', async () => {
      await importFresh();
      await expect(attestKeyAsync('key-id', 'challenge')).resolves.toBe(
        'attestation',
      );
      expect(FAKE_NATIVE_APP_INTEGRITY.attestKeyAsync).toHaveBeenCalledWith(
        'key-id',
        'challenge',
      );
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error off ios', async () => {
      fakePlatform.OS = 'android';
      await importFresh();
      await expect(attestKeyAsync('key-id', 'challenge')).rejects.toThrow(
        'attestKeyAsync is not available on expo-app-integrity',
      );
    });
  });
});

describe('generateAssertionAsync', () => {
  describe('Positive', () => {
    it('forwards keyId and challenge to the native module on ios', async () => {
      await importFresh();
      await expect(generateAssertionAsync('key-id', 'challenge')).resolves.toBe(
        'assertion',
      );
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error off ios', async () => {
      fakePlatform.OS = 'android';
      await importFresh();
      await expect(
        generateAssertionAsync('key-id', 'challenge'),
      ).rejects.toThrow(
        'generateAssertionAsync is not available on expo-app-integrity',
      );
    });
  });
});

describe('prepareIntegrityTokenProviderAsync', () => {
  describe('Positive', () => {
    it('delegates to the native module on android', async () => {
      fakePlatform.OS = 'android';
      await importFresh();
      await expect(
        prepareIntegrityTokenProviderAsync('cloud-project'),
      ).resolves.toBeUndefined();
      expect(
        FAKE_NATIVE_APP_INTEGRITY.prepareIntegrityTokenProviderAsync,
      ).toHaveBeenCalledWith('cloud-project');
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error off android', async () => {
      await importFresh();
      await expect(
        prepareIntegrityTokenProviderAsync('cloud-project'),
      ).rejects.toThrow(
        'prepareIntegrityTokenProviderAsync is not available on expo-app-integrity',
      );
    });
  });
});

describe('requestIntegrityCheckAsync', () => {
  describe('Positive', () => {
    it('delegates to the native module on android', async () => {
      fakePlatform.OS = 'android';
      await importFresh();
      await expect(requestIntegrityCheckAsync('hash')).resolves.toBe('verdict');
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error off android', async () => {
      await importFresh();
      await expect(requestIntegrityCheckAsync('hash')).rejects.toThrow(
        'requestIntegrityCheckAsync is not available on expo-app-integrity',
      );
    });
  });
});

// `isHardwareAttestationSupportedAsync` has no throwing path (upstream falls back to `false`
// off android instead of rejecting), so it gets its own group rather than Positive/Negative
describe('isHardwareAttestationSupportedAsync', () => {
  it('delegates to the native module on android', async () => {
    fakePlatform.OS = 'android';
    await importFresh();
    await expect(isHardwareAttestationSupportedAsync()).resolves.toBe(true);
  });

  it('resolves false off android without calling the native module', async () => {
    await importFresh();
    await expect(isHardwareAttestationSupportedAsync()).resolves.toBe(false);
    expect(
      FAKE_NATIVE_APP_INTEGRITY.isHardwareAttestationSupportedAsync,
    ).not.toHaveBeenCalled();
  });
});

describe('generateHardwareAttestedKeyAsync', () => {
  describe('Positive', () => {
    it('forwards keyAlias and challenge to the native module on android', async () => {
      fakePlatform.OS = 'android';
      await importFresh();
      await expect(
        generateHardwareAttestedKeyAsync('key-alias', 'challenge'),
      ).resolves.toBeUndefined();
      expect(
        FAKE_NATIVE_APP_INTEGRITY.generateHardwareAttestedKeyAsync,
      ).toHaveBeenCalledWith('key-alias', 'challenge');
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error off android', async () => {
      await importFresh();
      await expect(
        generateHardwareAttestedKeyAsync('key-alias', 'challenge'),
      ).rejects.toThrow(
        'generateHardwareAttestedKeyAsync is not available on expo-app-integrity',
      );
    });
  });
});

describe('getAttestationCertificateChainAsync', () => {
  describe('Positive', () => {
    it('delegates to the native module on android', async () => {
      fakePlatform.OS = 'android';
      await importFresh();
      await expect(
        getAttestationCertificateChainAsync('key-alias'),
      ).resolves.toEqual(['cert-a', 'cert-b']);
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error off android', async () => {
      await importFresh();
      await expect(
        getAttestationCertificateChainAsync('key-alias'),
      ).rejects.toThrow(
        'getAttestationCertificateChainAsync is not available on expo-app-integrity',
      );
    });
  });
});
