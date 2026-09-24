import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_MAIL_COMPOSER = {
  isAvailableAsync: vi.fn(async () => true),
  composeAsync: vi.fn(async () => ({ status: 'sent' })),
  getClients: vi.fn(() => [{ label: 'Mail', url: 'message://' }]),
};

// requireNativeModule() only resolves on-device — faked in place of expo-modules-core's runtime
// resolution, same pattern as packages/sms/src/core/sms.test.ts.
vi.mock('./native-module', () => ({
  expoMailComposer: FAKE_NATIVE_MAIL_COMPOSER,
}));

const { composeAsync, getClients, isAvailableAsync } =
  await import('./mail-composer');

afterEach(() => {
  vi.clearAllMocks();
});

describe('getClients', () => {
  it('delegates to the native module', () => {
    expect(getClients()).toEqual([{ label: 'Mail', url: 'message://' }]);
    expect(FAKE_NATIVE_MAIL_COMPOSER.getClients).toHaveBeenCalledTimes(1);
  });
});

describe('isAvailableAsync', () => {
  it('delegates to the native module', async () => {
    await expect(isAvailableAsync()).resolves.toBe(true);
    expect(FAKE_NATIVE_MAIL_COMPOSER.isAvailableAsync).toHaveBeenCalledTimes(1);
  });
});

describe('composeAsync', () => {
  it('forwards the options object unchanged', async () => {
    const options = { recipients: ['a@b.com'], subject: 'Hi' };
    await composeAsync(options);
    expect(FAKE_NATIVE_MAIL_COMPOSER.composeAsync).toHaveBeenLastCalledWith(
      options,
    );
  });

  it('resolves with the native result', async () => {
    await expect(composeAsync({})).resolves.toEqual({ status: 'sent' });
  });
});
