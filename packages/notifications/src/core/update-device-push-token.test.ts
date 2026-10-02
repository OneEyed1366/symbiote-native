// Тесты `updateDevicePushTokenAsync`/`hasDeviceTokenChangedAsync` из upstream

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { IDevicePushToken } from './types';

const { getRegistrationInfoAsync, setRegistrationInfoAsync } = vi.hoisted(
  () => ({
    getRegistrationInfoAsync: vi.fn(),
    setRegistrationInfoAsync: vi.fn(),
  }),
);

vi.mock('./native-modules', () => ({
  serverRegistrationModule: {
    getInstallationIdAsync: () => 'abcdefg',
    getRegistrationInfoAsync,
    setRegistrationInfoAsync,
  },
}));

vi.mock('@symbiote-native/application', () => ({
  applicationId: 'com.symbiote.canary',
  getIosPushNotificationServiceEnvironmentAsync: vi.fn(
    async () => 'production',
  ),
}));

vi.mock('@symbiote-native/engine', () => ({ dlog: vi.fn() }));

vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  CodedError: class CodedError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  UnavailabilityError: class UnavailabilityError extends Error {},
}));

const { updateDevicePushTokenAsync, hasDeviceTokenChangedAsync } =
  await import('./update-device-push-token');

const TOKEN: IDevicePushToken = { type: 'ios', data: 'i-am-token' };
const expoEndpointUrl = 'https://exp.host/--/api/v2/push/updateDeviceToken';
const APP_ID = 'com.symbiote.canary';

function storedRegistration(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    lastRegisteredDeviceToken: {
      deviceToken: TOKEN.data,
      appId: APP_ID,
      development: false,
      type: 'apns',
      registeredAt: Date.now(),
      ...overrides,
    },
  });
}

describe('updateDevicePushTokenAsync (given valid registration info)', () => {
  const successResponse = { status: 200, ok: true };
  const failureResponse = {
    status: 500,
    ok: false,
    text: async () => 'Server error',
  };
  const fetchMock = vi.fn();
  let originalFetch: typeof fetch | undefined;

  beforeAll(() => {
    originalFetch = globalThis.fetch;
    Object.assign(globalThis, { fetch: fetchMock });
  });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterAll(() => {
    Object.assign(globalThis, { fetch: originalFetch });
    vi.restoreAllMocks();
  });

  it('submits the request to proper URL', async () => {
    fetchMock.mockResolvedValue(successResponse);
    await updateDevicePushTokenAsync(new AbortController().signal, TOKEN);
    expect(fetchMock).toHaveBeenCalledWith(expoEndpointUrl, expect.anything());
  });

  it('submits the request only once when the server responds ok', async () => {
    fetchMock.mockResolvedValue(successResponse);
    await updateDevicePushTokenAsync(new AbortController().signal, TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries until it succeeds whilst server responds with an error status', async () => {
    fetchMock
      .mockResolvedValueOnce(failureResponse)
      .mockResolvedValueOnce(failureResponse)
      .mockResolvedValueOnce(successResponse);
    await updateDevicePushTokenAsync(new AbortController().signal, TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries until it succeeds if fetch throws', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError())
      .mockResolvedValueOnce(successResponse);
    await updateDevicePushTokenAsync(new AbortController().signal, TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry if signal has been aborted', async () => {
    fetchMock.mockRejectedValue(new TypeError());
    const abortController = new AbortController();
    setTimeout(() => abortController.abort(), 1000);
    await updateDevicePushTokenAsync(abortController.signal, TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not warn if fetch rejects after the signal has been aborted', async () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    warnSpy.mockClear();
    const abortController = new AbortController();
    fetchMock.mockImplementationOnce(() => {
      abortController.abort();
      return Promise.reject(new Error('FetchRequestCanceledException'));
    });

    await updateDevicePushTokenAsync(abortController.signal, TOKEN);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('hasDeviceTokenChangedAsync', () => {
  beforeEach(() => {
    getRegistrationInfoAsync.mockReset();
  });

  it('returns true when no stored data exists', async () => {
    getRegistrationInfoAsync.mockResolvedValue(null);
    expect(await hasDeviceTokenChangedAsync(TOKEN)).toBe(true);
  });

  it('returns true when stored data has no lastRegisteredDeviceToken key', async () => {
    getRegistrationInfoAsync.mockResolvedValue(
      JSON.stringify({ isEnabled: true }),
    );
    expect(await hasDeviceTokenChangedAsync(TOKEN)).toBe(true);
  });

  it('returns false when all fields match and TTL is valid', async () => {
    getRegistrationInfoAsync.mockResolvedValue(storedRegistration());
    expect(await hasDeviceTokenChangedAsync(TOKEN)).toBe(false);
  });

  it('returns true when deviceToken differs', async () => {
    getRegistrationInfoAsync.mockResolvedValue(
      storedRegistration({ deviceToken: 'different-token' }),
    );
    expect(await hasDeviceTokenChangedAsync(TOKEN)).toBe(true);
  });

  it('returns true when TTL has expired', async () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    getRegistrationInfoAsync.mockResolvedValue(
      storedRegistration({ registeredAt: eightDaysAgo }),
    );
    expect(await hasDeviceTokenChangedAsync(TOKEN)).toBe(true);
  });

  it('returns true when registeredAt is in the future (clock skew)', async () => {
    const oneHourInFuture = Date.now() + 60 * 60 * 1000;
    getRegistrationInfoAsync.mockResolvedValue(
      storedRegistration({ registeredAt: oneHourInFuture }),
    );
    expect(await hasDeviceTokenChangedAsync(TOKEN)).toBe(true);
  });

  it('returns true when storage throws (fail-open)', async () => {
    getRegistrationInfoAsync.mockRejectedValue(new Error('keychain error'));
    expect(await hasDeviceTokenChangedAsync(TOKEN)).toBe(true);
  });
});
