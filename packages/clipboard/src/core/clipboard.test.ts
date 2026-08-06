import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_CLIPBOARD = {
  getStringAsync: vi.fn(async () => 'text'),
  setStringAsync: vi.fn(async () => true),
  hasStringAsync: vi.fn(async () => true),
  getUrlAsync: vi.fn(async () => 'https://example.com'),
  setUrlAsync: vi.fn(async () => undefined),
  hasUrlAsync: vi.fn(async () => true),
  getImageAsync: vi.fn(async () => ({
    data: 'data:image/png;base64,abc',
    size: { width: 1, height: 1 },
  })),
  setImageAsync: vi.fn(async () => undefined),
  hasImageAsync: vi.fn(async () => true),
  addListener: vi.fn(() => ({ remove: vi.fn() })),
};

// The real ExpoClipboard native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of expo-modules-core's runtime resolution, the same
// pattern @symbiote-native/local-auth's local-authentication.test.ts uses for native-module.
vi.mock('./native-module', () => ({
  expoClipboard: FAKE_NATIVE_CLIPBOARD,
  CLIPBOARD_CHANGED_EVENT_NAME: 'onClipboardChanged',
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse — same fake
// @symbiote-native/local-auth's local-authentication.test.ts uses.
vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  getStringAsync,
  setStringAsync,
  hasStringAsync,
  getUrlAsync,
  setUrlAsync,
  hasUrlAsync,
  getImageAsync,
  setImageAsync,
  hasImageAsync,
  addClipboardListener,
  removeClipboardListener,
} = await import('./clipboard');

afterEach(() => {
  vi.clearAllMocks();
});

describe('getStringAsync', () => {
  it('delegates to the native module', async () => {
    await expect(getStringAsync()).resolves.toBe('text');
    expect(FAKE_NATIVE_CLIPBOARD.getStringAsync).toHaveBeenCalledWith({});
  });

  it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
    const { getStringAsync: native } = FAKE_NATIVE_CLIPBOARD;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_CLIPBOARD.getStringAsync = undefined;

    await expect(getStringAsync()).rejects.toThrow('getStringAsync is not available on Clipboard');

    FAKE_NATIVE_CLIPBOARD.getStringAsync = native;
  });
});

describe('setStringAsync', () => {
  it('delegates to the native module', async () => {
    await expect(setStringAsync('hello')).resolves.toBe(true);
    expect(FAKE_NATIVE_CLIPBOARD.setStringAsync).toHaveBeenCalledWith('hello', {});
  });
});

describe('hasStringAsync', () => {
  it('delegates to the native module', async () => {
    await expect(hasStringAsync()).resolves.toBe(true);
  });
});

describe('getUrlAsync', () => {
  it('delegates to the native module', async () => {
    await expect(getUrlAsync()).resolves.toBe('https://example.com');
  });

  it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
    const { getUrlAsync: native } = FAKE_NATIVE_CLIPBOARD;
    // @ts-expect-error -- simulating Android, where getUrlAsync has no native implementation
    FAKE_NATIVE_CLIPBOARD.getUrlAsync = undefined;

    await expect(getUrlAsync()).rejects.toThrow('getUrlAsync is not available on Clipboard');

    FAKE_NATIVE_CLIPBOARD.getUrlAsync = native;
  });
});

describe('setUrlAsync', () => {
  it('delegates to the native module', async () => {
    await setUrlAsync('https://example.com');
    expect(FAKE_NATIVE_CLIPBOARD.setUrlAsync).toHaveBeenCalledWith('https://example.com');
  });
});

describe('hasUrlAsync', () => {
  it('delegates to the native module', async () => {
    await expect(hasUrlAsync()).resolves.toBe(true);
  });
});

describe('getImageAsync', () => {
  it('delegates to the native module', async () => {
    await expect(getImageAsync({ format: 'png' })).resolves.toEqual({
      data: 'data:image/png;base64,abc',
      size: { width: 1, height: 1 },
    });
    expect(FAKE_NATIVE_CLIPBOARD.getImageAsync).toHaveBeenCalledWith({ format: 'png' });
  });
});

describe('setImageAsync', () => {
  it('delegates to the native module', async () => {
    await setImageAsync('base64==');
    expect(FAKE_NATIVE_CLIPBOARD.setImageAsync).toHaveBeenCalledWith('base64==');
  });
});

describe('hasImageAsync', () => {
  it('delegates to the native module', async () => {
    await expect(hasImageAsync()).resolves.toBe(true);
  });
});

describe('addClipboardListener', () => {
  it('subscribes through the native module with the clipboard-change event name', () => {
    const listener = vi.fn();
    addClipboardListener(listener);

    expect(FAKE_NATIVE_CLIPBOARD.addListener).toHaveBeenCalledWith('onClipboardChanged', listener);
  });
});

describe('removeClipboardListener', () => {
  it('calls remove() on the given subscription', () => {
    const remove = vi.fn();
    removeClipboardListener({ remove });

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
