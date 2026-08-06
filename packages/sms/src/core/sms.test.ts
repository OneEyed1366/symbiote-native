import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_SMS = {
  isAvailableAsync: vi.fn(async () => true),
  sendSMSAsync: vi.fn(async () => ({ result: 'sent' })),
};

// Mutated per test — `Platform.OS` is read at call time, so flipping this between cases is how
// the Android attachment limit gets exercised without a second import of the module under test.
const FAKE_PLATFORM = { OS: 'ios' };

// The real ExpoSMS native module only exists on device — resolving it via requireNativeModule()
// at import time would throw in this headless run, so the module-lookup file is faked in place
// of expo-modules-core's runtime resolution, the same pattern
// packages/secure-store/src/core/secure-store.test.ts uses.
vi.mock('./native-module', () => ({
  expoSms: FAKE_NATIVE_SMS,
}));

// expo-modules-core's real entry transitively imports 'react-native', whose Flow-typed source
// Vitest's Oxc transform can't parse — so only the members used as values are faked.
vi.mock('expo-modules-core', () => ({
  Platform: FAKE_PLATFORM,
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const { isAvailableAsync, sendSMSAsync } = await import('./sms');

const IMAGE_ATTACHMENT = {
  uri: 'content://media/external/images/media/1',
  mimeType: 'image/png',
  filename: 'myfile.png',
};
const AUDIO_ATTACHMENT = {
  uri: 'content://media/external/audio/media/2',
  mimeType: 'audio/mpeg',
  filename: 'myfile.mp3',
};

beforeEach(() => {
  FAKE_PLATFORM.OS = 'ios';
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('isAvailableAsync', () => {
  it('delegates to the native module', async () => {
    await expect(isAvailableAsync()).resolves.toBe(true);
    expect(FAKE_NATIVE_SMS.isAvailableAsync).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable rather than throwing when the native method is absent', async () => {
    const { isAvailableAsync: native } = FAKE_NATIVE_SMS;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_SMS.isAvailableAsync = undefined;

    await expect(isAvailableAsync()).resolves.toBe(false);

    FAKE_NATIVE_SMS.isAvailableAsync = native;
  });
});

describe('sendSMSAsync recipients', () => {
  it('normalizes a single address into an array', async () => {
    await sendSMSAsync('0123456789', 'test');
    expect(FAKE_NATIVE_SMS.sendSMSAsync).toHaveBeenLastCalledWith(['0123456789'], 'test', {});
  });

  it('passes an array of addresses through unchanged', async () => {
    await sendSMSAsync(['0123456789', '9876543210'], 'test');
    expect(FAKE_NATIVE_SMS.sendSMSAsync).toHaveBeenLastCalledWith(
      ['0123456789', '9876543210'],
      'test',
      {},
    );
  });

  it('resolves with the native result', async () => {
    await expect(sendSMSAsync('0123456789', 'test')).resolves.toEqual({ result: 'sent' });
  });

  it('rejects a non-string recipient before reaching the native module', async () => {
    // @ts-expect-error -- the guard exists precisely for callers without type checking
    await expect(sendSMSAsync(['0123456789', null], 'test')).rejects.toThrow(TypeError);
    expect(FAKE_NATIVE_SMS.sendSMSAsync).not.toHaveBeenCalled();
  });
});

describe('sendSMSAsync attachments', () => {
  it('omits the attachments key entirely when none are given', async () => {
    await sendSMSAsync('0123456789', 'test', {});
    expect(FAKE_NATIVE_SMS.sendSMSAsync).toHaveBeenLastCalledWith(['0123456789'], 'test', {});
  });

  it('normalizes a single attachment into an array', async () => {
    await sendSMSAsync('0123456789', 'test', { attachments: IMAGE_ATTACHMENT });
    expect(FAKE_NATIVE_SMS.sendSMSAsync).toHaveBeenLastCalledWith(['0123456789'], 'test', {
      attachments: [IMAGE_ATTACHMENT],
    });
  });

  it('keeps every attachment on iOS', async () => {
    await sendSMSAsync('0123456789', 'test', {
      attachments: [IMAGE_ATTACHMENT, AUDIO_ATTACHMENT],
    });
    expect(FAKE_NATIVE_SMS.sendSMSAsync).toHaveBeenLastCalledWith(['0123456789'], 'test', {
      attachments: [IMAGE_ATTACHMENT, AUDIO_ATTACHMENT],
    });
  });

  it('keeps only the first attachment on Android', async () => {
    FAKE_PLATFORM.OS = 'android';

    await sendSMSAsync('0123456789', 'test', {
      attachments: [IMAGE_ATTACHMENT, AUDIO_ATTACHMENT],
    });
    expect(FAKE_NATIVE_SMS.sendSMSAsync).toHaveBeenLastCalledWith(['0123456789'], 'test', {
      attachments: [IMAGE_ATTACHMENT],
    });
  });
});

describe('sendSMSAsync without the native method', () => {
  it('throws an UnavailabilityError-shaped error', async () => {
    const { sendSMSAsync: native } = FAKE_NATIVE_SMS;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_SMS.sendSMSAsync = undefined;

    await expect(sendSMSAsync('0123456789', 'test')).rejects.toThrow(
      'sendSMSAsync is not available on expo-sms',
    );

    FAKE_NATIVE_SMS.sendSMSAsync = native;
  });
});
