import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_PERMISSIONS_MODULE = {
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
};

// The real ExpoNotificationPermissionsModule only exists on device — fake the module-lookup
// file in place of expo-modules-core's runtime resolution, same pattern
// packages/local-auth/src/core/local-authentication.test.ts uses.
vi.mock('./native-modules', () => ({
  notificationPermissionsModule: FAKE_PERMISSIONS_MODULE,
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse.
vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

vi.mock('@symbiote-native/engine', () => ({ dlog: vi.fn() }));

const { getPermissionsAsync, requestPermissionsAsync } =
  await import('./permissions');

afterEach(() => {
  vi.clearAllMocks();
});

describe('getPermissionsAsync', () => {
  it('resolves granted', async () => {
    FAKE_PERMISSIONS_MODULE.getPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: false,
      expires: 'never',
    });

    const result = await getPermissionsAsync();

    expect(result.granted).toBe(true);
  });

  it('resolves denied', async () => {
    FAKE_PERMISSIONS_MODULE.getPermissionsAsync.mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: false,
      expires: 'never',
    });

    const result = await getPermissionsAsync();

    expect(result.granted).toBe(false);
    expect(result.status).toBe('denied');
  });

  it('throws UnavailabilityError when native lacks the method', async () => {
    const original = FAKE_PERMISSIONS_MODULE.getPermissionsAsync;
    // @ts-expect-error — simulate a platform where the native module omits this method
    FAKE_PERMISSIONS_MODULE.getPermissionsAsync = undefined;

    await expect(getPermissionsAsync()).rejects.toThrow(/not available/);

    FAKE_PERMISSIONS_MODULE.getPermissionsAsync = original;
  });
});

describe('requestPermissionsAsync', () => {
  it('defaults to alert/badge/sound on iOS when no request is given', async () => {
    FAKE_PERMISSIONS_MODULE.requestPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: false,
      expires: 'never',
    });

    await requestPermissionsAsync();

    expect(
      FAKE_PERMISSIONS_MODULE.requestPermissionsAsync,
    ).toHaveBeenCalledWith({
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    });
  });

  it('passes through an explicit request for the current platform', async () => {
    FAKE_PERMISSIONS_MODULE.requestPermissionsAsync.mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: false,
      expires: 'never',
    });

    const result = await requestPermissionsAsync({
      ios: { allowSound: false },
    });

    expect(
      FAKE_PERMISSIONS_MODULE.requestPermissionsAsync,
    ).toHaveBeenCalledWith({ allowSound: false });
    expect(result.granted).toBe(false);
  });
});
