import { afterEach, describe, expect, it, vi } from 'vitest';

class FakeSession {
  readonly id = 'session-1';
  readonly type = 'main' as const;
  readonly startDate = '2026-01-01T00:00:00.000Z';
}

class FakeNetworkRequestObserver {
  setFilter = vi.fn();
}

const FAKE_NATIVE_APP_METRICS = {
  markFirstRender: vi.fn(),
  markInteractive: vi.fn(),
  logEvent: vi.fn(),
  setGlobalAttributes: vi.fn(),
  clearStoredEntries: vi.fn(async () => undefined),
  getInactiveSessions: vi.fn(async () => []),
  getAllCrashReports: vi.fn(async () => []),
  reportError: vi.fn(),
  getMainSession: vi.fn(() => new FakeSession()),
  getForegroundSession: vi.fn(async () => new FakeSession()),
  NetworkRequestObserver: FakeNetworkRequestObserver,
  Session: FakeSession,
};

const fakePlatform = { OS: 'ios' as 'ios' | 'android' };

// The real ExpoAppMetrics native module only exists on device, so the module-lookup file is
// faked in place of expo-modules-core's runtime resolution, same pattern as
// packages/application/src/core/application.test.ts
vi.mock('./native-module', () => ({
  get expoAppMetrics() {
    return FAKE_NATIVE_APP_METRICS;
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

const {
  markFirstRender,
  markInteractive,
  logEvent,
  setGlobalAttributes,
  clearStoredEntries,
  getInactiveSessions,
  getAllCrashReports,
  reportError,
  getMainSession,
  getForegroundSession,
  NetworkRequestObserver,
  Session,
} = await import('./app-metrics');

afterEach(() => {
  fakePlatform.OS = 'ios';
  vi.clearAllMocks();
});

describe('markFirstRender / markInteractive / logEvent / setGlobalAttributes', () => {
  it('delegate straight through to the native module', () => {
    markFirstRender();
    markInteractive({ routeName: 'home' });
    logEvent('app_opened', { severity: 'info' });
    setGlobalAttributes({ tier: 'pro' });

    expect(FAKE_NATIVE_APP_METRICS.markFirstRender).toHaveBeenCalledTimes(1);
    expect(FAKE_NATIVE_APP_METRICS.markInteractive).toHaveBeenCalledWith({
      routeName: 'home',
    });
    expect(FAKE_NATIVE_APP_METRICS.logEvent).toHaveBeenCalledWith(
      'app_opened',
      { severity: 'info' },
    );
    expect(FAKE_NATIVE_APP_METRICS.setGlobalAttributes).toHaveBeenCalledWith({
      tier: 'pro',
    });
  });
});

describe('clearStoredEntries / getInactiveSessions / reportError', () => {
  it('delegate straight through to the native module', async () => {
    await clearStoredEntries();
    await getInactiveSessions();
    reportError({ source: 'reportedByUser', message: 'boom', isFatal: false });

    expect(FAKE_NATIVE_APP_METRICS.clearStoredEntries).toHaveBeenCalledTimes(1);
    expect(FAKE_NATIVE_APP_METRICS.getInactiveSessions).toHaveBeenCalledTimes(
      1,
    );
    expect(FAKE_NATIVE_APP_METRICS.reportError).toHaveBeenCalledWith({
      source: 'reportedByUser',
      message: 'boom',
      isFatal: false,
    });
  });
});

describe('getAllCrashReports', () => {
  describe('Positive', () => {
    it('delegates to the native module on android', async () => {
      fakePlatform.OS = 'android';
      await expect(getAllCrashReports()).resolves.toEqual([]);
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error off android', async () => {
      await expect(getAllCrashReports()).rejects.toThrow(
        'getAllCrashReports is not available on expo-app-metrics',
      );
    });
  });
});

describe('getMainSession / getForegroundSession', () => {
  it('delegate straight through to the native module on both platforms', async () => {
    expect(getMainSession()).toBeInstanceOf(FakeSession);

    fakePlatform.OS = 'android';
    await expect(getForegroundSession()).resolves.toBeInstanceOf(FakeSession);
  });
});

describe('Session / NetworkRequestObserver', () => {
  it('re-export the native module classes verbatim', () => {
    expect(Session).toBe(FakeSession);
    expect(NetworkRequestObserver).toBe(FakeNetworkRequestObserver);
  });
});
