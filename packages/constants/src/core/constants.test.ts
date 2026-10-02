import { describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_CONSTANTS = vi.hoisted(() => ({
  name: 'ExponentConstants',
  appOwnership: undefined as string | undefined,
  debugMode: true,
  deviceName: 'Test Phone',
  deviceYearClass: 2021,
  executionEnvironment: 'bare',
  experienceUrl: 'exp://localhost',
  expoRuntimeVersion: null,
  expoVersion: null,
  isHeadless: false,
  linkingUri: 'myapp://',
  sessionId: 'session-1',
  statusBarHeight: 47,
  systemFonts: ['Helvetica'],
  platform: { ios: { buildNumber: '1', platform: 'iPhone1,1', model: null } },
  manifest: '{"slug":"leaked"}',
  manifest2: { id: 'leaked' },
  expoConfig: { slug: 'leaked' },
  expoGoConfig: { leaked: true },
  easConfig: { projectId: 'leaked' },
  getWebViewUserAgentAsync: vi.fn(async () => 'Mozilla/5.0'),
}));

// The real ExponentConstants module only exists on device, so its lookup file is faked, the
// same pattern packages/application/src/core/application.test.ts uses
vi.mock('./native-module', () => ({ expoConstants: FAKE_NATIVE_CONSTANTS }));

// expo-modules-core's real entry pulls in react-native, which Vitest cannot parse
vi.mock('expo-modules-core', () => ({
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const { Constants, createConstants } = await import('./constants');

describe('Constants', () => {
  it('carries the native fields through', () => {
    expect(Constants).toMatchObject({
      debugMode: true,
      deviceName: 'Test Phone',
      deviceYearClass: 2021,
      executionEnvironment: 'bare',
      isHeadless: false,
      sessionId: 'session-1',
      statusBarHeight: 47,
      systemFonts: ['Helvetica'],
    });
  });

  it('defines a linking URI string', () => {
    expect(typeof Constants.linkingUri).toBe('string');
  });

  it('reads the platform block', () => {
    expect(Constants.platform?.ios?.buildNumber).toBe('1');
  });

  it('never exposes the module name or the manifest family', () => {
    for (const key of [
      'name',
      'manifest',
      'manifest2',
      'expoConfig',
      'expoGoConfig',
      'easConfig',
    ]) {
      expect(Constants).not.toHaveProperty(key);
    }
  });
});

describe('createConstants', () => {
  it('turns a missing appOwnership into null like bare workflow does', () => {
    expect(
      createConstants({ ...FAKE_NATIVE_CONSTANTS, appOwnership: undefined })
        .appOwnership,
    ).toBeNull();
  });

  it('keeps an appOwnership the native side reports', () => {
    expect(
      createConstants({ ...FAKE_NATIVE_CONSTANTS, appOwnership: 'expo' })
        .appOwnership,
    ).toBe('expo');
  });

  it('delegates getWebViewUserAgentAsync to the native module', async () => {
    await expect(Constants.getWebViewUserAgentAsync()).resolves.toBe(
      'Mozilla/5.0',
    );
  });

  it('throws UnavailabilityError where the native module has no user-agent lookup', async () => {
    const withoutLookup = createConstants({
      ...FAKE_NATIVE_CONSTANTS,
      getWebViewUserAgentAsync: undefined,
    });

    await expect(withoutLookup.getWebViewUserAgentAsync()).rejects.toThrow(
      'getWebViewUserAgentAsync is not available on expo-constants',
    );
  });
});
