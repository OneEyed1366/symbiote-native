import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_INTENT_LAUNCHER = {
  startActivity: vi.fn(async () => ({ resultCode: -1 })),
  openApplication: vi.fn(() => undefined),
  getApplicationIcon: vi.fn(async () => 'data:image/png;base64,x'),
};

// `requireNativeModule` only resolves on-device, faked in place of expo-modules-core's runtime
// resolution, same pattern as packages/print/src/core/print.test.ts
vi.mock('./native-module', () => ({
  expoIntentLauncher: FAKE_NATIVE_INTENT_LAUNCHER,
}));

vi.mock('expo-modules-core', () => ({
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const { startActivityAsync, openApplication, getApplicationIconAsync } =
  await import('./intent-launcher');
const { ActivityAction } = await import('./types');

afterEach(() => {
  vi.clearAllMocks();
});

describe('startActivityAsync', () => {
  it('delegates to the native module', async () => {
    await expect(
      startActivityAsync(ActivityAction.WIFI_SETTINGS, { data: 'x' }),
    ).resolves.toEqual({ resultCode: -1 });
    expect(FAKE_NATIVE_INTENT_LAUNCHER.startActivity).toHaveBeenCalledWith(
      ActivityAction.WIFI_SETTINGS,
      { data: 'x' },
    );
  });

  it('defaults to an empty params object', async () => {
    await startActivityAsync(ActivityAction.WIFI_SETTINGS);
    expect(FAKE_NATIVE_INTENT_LAUNCHER.startActivity).toHaveBeenCalledWith(
      ActivityAction.WIFI_SETTINGS,
      {},
    );
  });

  it('rejects an empty activityAction', async () => {
    await expect(startActivityAsync('')).rejects.toThrow(
      "'activityAction' argument must be a non-empty string!",
    );
  });

  it('throws UnavailabilityError when the native module has no startActivity', async () => {
    FAKE_NATIVE_INTENT_LAUNCHER.startActivity = undefined as never;
    await expect(
      startActivityAsync(ActivityAction.WIFI_SETTINGS),
    ).rejects.toThrow(/startActivityAsync/);
    FAKE_NATIVE_INTENT_LAUNCHER.startActivity = vi.fn(async () => ({
      resultCode: -1,
    }));
  });
});

describe('openApplication', () => {
  it('delegates to the native module', () => {
    openApplication('com.google.android.gm');
    expect(FAKE_NATIVE_INTENT_LAUNCHER.openApplication).toHaveBeenCalledWith(
      'com.google.android.gm',
    );
  });

  it('throws UnavailabilityError when the native module has no openApplication', () => {
    FAKE_NATIVE_INTENT_LAUNCHER.openApplication = undefined as never;
    expect(() => openApplication('com.google.android.gm')).toThrow(
      /openApplication/,
    );
    FAKE_NATIVE_INTENT_LAUNCHER.openApplication = vi.fn(() => undefined);
  });
});

describe('getApplicationIconAsync', () => {
  it('delegates to the native module', async () => {
    await expect(
      getApplicationIconAsync('com.google.android.gm'),
    ).resolves.toBe('data:image/png;base64,x');
    expect(FAKE_NATIVE_INTENT_LAUNCHER.getApplicationIcon).toHaveBeenCalledWith(
      'com.google.android.gm',
    );
  });

  it('throws UnavailabilityError when the native module has no getApplicationIcon', async () => {
    FAKE_NATIVE_INTENT_LAUNCHER.getApplicationIcon = undefined as never;
    await expect(
      getApplicationIconAsync('com.google.android.gm'),
    ).rejects.toThrow(/getApplicationIconAsync/);
    FAKE_NATIVE_INTENT_LAUNCHER.getApplicationIcon = vi.fn(
      async () => 'data:image/png;base64,x',
    );
  });
});
