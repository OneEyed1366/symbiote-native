// Тесты `handlePersistedRegistrationInfoAsync` из upstream и установка слушателя токена

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDevicePushToken } from './types';

const {
  hasDeviceTokenChangedAsync,
  updateDevicePushTokenAsync,
  getDevicePushTokenAsync,
  addPushTokenListener,
  serverRegistrationModule,
} = vi.hoisted(() => ({
  hasDeviceTokenChangedAsync: vi.fn(),
  updateDevicePushTokenAsync: vi.fn(async () => undefined),
  getDevicePushTokenAsync: vi.fn(),
  addPushTokenListener: vi.fn(
    (
      _listener: (token: { data: string; type: 'ios' | 'android' }) => unknown,
    ) => ({
      remove: vi.fn(),
    }),
  ),
  serverRegistrationModule: {
    getRegistrationInfoAsync: vi.fn(async () => null as string | null),
  } as { getRegistrationInfoAsync?: () => Promise<string | null> },
}));

vi.mock('./update-device-push-token', () => ({
  hasDeviceTokenChangedAsync,
  updateDevicePushTokenAsync,
}));
vi.mock('./device-token', () => ({
  getDevicePushTokenAsync,
  addPushTokenListener,
}));
vi.mock('./native-modules', () => ({ serverRegistrationModule }));
vi.mock('expo-modules-core', () => ({
  UnavailabilityError: class UnavailabilityError extends Error {},
}));

const {
  handlePersistedRegistrationInfoAsync,
  installPushTokenAutoRegistration,
} = await import('./auto-registration');

const ENABLED = JSON.stringify({ isEnabled: true });
const DISABLED = JSON.stringify({ isEnabled: false });

describe('handlePersistedRegistrationInfoAsync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasDeviceTokenChangedAsync.mockResolvedValue(true);
  });

  it("doesn't fail if persisted value is empty", async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(
      handlePersistedRegistrationInfoAsync(null),
    ).resolves.toBeUndefined();
    await expect(
      handlePersistedRegistrationInfoAsync(undefined),
    ).resolves.toBeUndefined();
    await expect(
      handlePersistedRegistrationInfoAsync('{i-am-invalid-json'),
    ).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it("doesn't try to update registration if it's not enabled", async () => {
    await handlePersistedRegistrationInfoAsync(DISABLED);
    expect(getDevicePushTokenAsync).not.toHaveBeenCalled();
    expect(updateDevicePushTokenAsync).not.toHaveBeenCalled();
  });

  it("does try to update registration if it's enabled and token has changed", async () => {
    const token: IDevicePushToken = {
      data: 'i-want-to-be-sent-to-server',
      type: 'ios',
    };
    getDevicePushTokenAsync.mockResolvedValue(token);
    await handlePersistedRegistrationInfoAsync(ENABLED);
    expect(hasDeviceTokenChangedAsync).toHaveBeenCalledWith(token);
    expect(updateDevicePushTokenAsync).toHaveBeenCalledWith(
      expect.anything(),
      token,
    );
  });

  it('skips registration if enabled but token has not changed', async () => {
    const token: IDevicePushToken = {
      data: 'unchanged-token',
      type: 'android',
    };
    getDevicePushTokenAsync.mockResolvedValue(token);
    hasDeviceTokenChangedAsync.mockResolvedValue(false);
    await handlePersistedRegistrationInfoAsync(ENABLED);
    expect(hasDeviceTokenChangedAsync).toHaveBeenCalledWith(token);
    expect(updateDevicePushTokenAsync).not.toHaveBeenCalled();
  });

  it('handles errors during registration gracefully', async () => {
    getDevicePushTokenAsync.mockResolvedValue({
      data: 'some-token',
      type: 'ios',
    });
    hasDeviceTokenChangedAsync.mockRejectedValue(new Error('storage error'));
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await handlePersistedRegistrationInfoAsync(ENABLED);
    expect(updateDevicePushTokenAsync).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('installPushTokenAutoRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasDeviceTokenChangedAsync.mockResolvedValue(true);
    serverRegistrationModule.getRegistrationInfoAsync = vi.fn(
      async () => null as string | null,
    );
  });

  it('subscribes to token changes once, however many times it is installed', () => {
    const removeFirst = installPushTokenAutoRegistration();
    installPushTokenAutoRegistration();

    expect(addPushTokenListener).toHaveBeenCalledTimes(1);
    removeFirst();
  });

  it('re-subscribes after the previous installation was removed', () => {
    installPushTokenAutoRegistration()();
    installPushTokenAutoRegistration()();

    expect(addPushTokenListener).toHaveBeenCalledTimes(2);
  });

  it('pushes a rolled token to the server when registration is enabled', async () => {
    serverRegistrationModule.getRegistrationInfoAsync = vi.fn(
      async () => ENABLED,
    );
    const remove = installPushTokenAutoRegistration();
    const rolled: IDevicePushToken = { data: 'rolled', type: 'android' };

    const [listener] = addPushTokenListener.mock.calls[0] ?? [];
    await listener?.(rolled);

    expect(updateDevicePushTokenAsync).toHaveBeenCalledWith(
      expect.anything(),
      rolled,
    );
    remove();
  });

  it('ignores a rolled token when registration is not enabled', async () => {
    serverRegistrationModule.getRegistrationInfoAsync = vi.fn(
      async () => DISABLED,
    );
    const remove = installPushTokenAutoRegistration();

    const [listener] = addPushTokenListener.mock.calls[0] ?? [];
    await listener?.({ data: 'rolled', type: 'android' });

    expect(updateDevicePushTokenAsync).not.toHaveBeenCalled();
    remove();
  });

  it('does nothing when the native module cannot read registration info', () => {
    delete serverRegistrationModule.getRegistrationInfoAsync;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    installPushTokenAutoRegistration()();

    expect(addPushTokenListener).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
