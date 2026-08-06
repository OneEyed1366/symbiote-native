import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_WEB_BROWSER = {
  openBrowserAsync: vi.fn(async () => ({ type: 'opened' })),
  dismissBrowser: vi.fn(async () => ({ type: 'dismiss' })),
  openAuthSessionAsync: vi.fn(async () => ({ type: 'success', url: 'myapp://callback' })),
  dismissAuthSession: vi.fn(() => undefined),
  warmUpAsync: vi.fn(async () => ({ servicePackage: 'com.android.chrome' })),
  coolDownAsync: vi.fn(async () => ({ servicePackage: 'com.android.chrome' })),
  mayInitWithUrlAsync: vi.fn(async () => ({ servicePackage: 'com.android.chrome' })),
  getCustomTabsSupportingBrowsersAsync: vi.fn(async () => ({
    defaultBrowserPackage: 'com.android.chrome',
    preferredBrowserPackage: 'com.android.chrome',
    browserPackages: ['com.android.chrome'],
    servicePackages: ['com.android.chrome'],
  })),
};

const fakePlatform = { OS: 'ios' as 'ios' | 'android' };

// The real ExpoWebBrowser native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless run, so the module-lookup file
// is faked in place of expo-modules-core's runtime resolution, the same pattern
// packages/secure-store/src/core/secure-store.test.ts uses.
vi.mock('./native-module', () => ({
  expoWebBrowser: FAKE_NATIVE_WEB_BROWSER,
}));

// expo-modules-core's real entry transitively imports 'react-native', whose Flow-typed source
// Vitest's Oxc transform can't parse — so only the members used as values are faked.
vi.mock('expo-modules-core', () => ({
  Platform: fakePlatform,
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const appStateListeners = new Set<(state: string) => void>();
const urlListeners = new Set<(event: { url: string }) => void>();

// Same reason as the expo-modules-core fake above: react-native's own source can't be parsed here.
// AppState and Linking are faked as real, drivable event sources because the Android auth-session
// polyfill's whole behavior is the race between them.
vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_type: string, handler: (state: string) => void) => {
      appStateListeners.add(handler);
      return { remove: () => appStateListeners.delete(handler) };
    },
  },
  Linking: {
    addEventListener: (_type: string, handler: (event: { url: string }) => void) => {
      urlListeners.add(handler);
      return { remove: () => urlListeners.delete(handler) };
    },
  },
  processColor: (value?: string) => (value === undefined ? undefined : `processed:${value}`),
}));

const {
  getCustomTabsSupportingBrowsersAsync,
  warmUpAsync,
  mayInitWithUrlAsync,
  coolDownAsync,
  openBrowserAsync,
  dismissBrowser,
  openAuthSessionAsync,
  dismissAuthSession,
} = await import('./web-browser');

function emitAppState(state: string): void {
  for (const listener of [...appStateListeners]) listener(state);
}

function emitUrl(url: string): void {
  for (const listener of [...urlListeners]) listener({ url });
}

// Lets every already-queued microtask and the polyfill's own promise chain settle.
function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

afterEach(() => {
  fakePlatform.OS = 'ios';
  vi.clearAllMocks();
});

describe('openBrowserAsync', () => {
  it('passes the url and options through to the native module', async () => {
    await expect(openBrowserAsync('https://example.com', { showTitle: true })).resolves.toEqual({
      type: 'opened',
    });
    expect(FAKE_NATIVE_WEB_BROWSER.openBrowserAsync).toHaveBeenCalledWith('https://example.com', {
      showTitle: true,
    });
  });

  // A color reaches native as a platform integer, never as the CSS string the caller wrote.
  it('runs the three color options through processColor', async () => {
    await openBrowserAsync('https://example.com', {
      toolbarColor: '#ffffff',
      secondaryToolbarColor: 'blue',
      controlsColor: 'red',
    });
    expect(FAKE_NATIVE_WEB_BROWSER.openBrowserAsync).toHaveBeenCalledWith('https://example.com', {
      toolbarColor: 'processed:#ffffff',
      secondaryToolbarColor: 'processed:blue',
      controlsColor: 'processed:red',
    });
  });

  it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
    const { openBrowserAsync: native } = FAKE_NATIVE_WEB_BROWSER;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_WEB_BROWSER.openBrowserAsync = undefined;

    await expect(openBrowserAsync('https://example.com')).rejects.toThrow(
      'openBrowserAsync is not available on expo-web-browser',
    );

    FAKE_NATIVE_WEB_BROWSER.openBrowserAsync = native;
  });
});

describe('dismissBrowser', () => {
  it('delegates to the native module', async () => {
    await expect(dismissBrowser()).resolves.toEqual({ type: 'dismiss' });
    expect(FAKE_NATIVE_WEB_BROWSER.dismissBrowser).toHaveBeenCalled();
  });

  // Android's Custom Tabs offer no way to close a tab programmatically, so the native module
  // registers no dismissBrowser there at all.
  it('throws where dismissing is not available', () => {
    const { dismissBrowser: native } = FAKE_NATIVE_WEB_BROWSER;
    // @ts-expect-error -- simulating Android, where the native module has no such method
    FAKE_NATIVE_WEB_BROWSER.dismissBrowser = undefined;

    expect(() => dismissBrowser()).toThrow('dismissBrowser is not available on expo-web-browser');

    FAKE_NATIVE_WEB_BROWSER.dismissBrowser = native;
  });
});

describe('the Custom Tabs service functions', () => {
  it('delegate to the native module on Android', async () => {
    fakePlatform.OS = 'android';

    await expect(warmUpAsync('com.android.chrome')).resolves.toEqual({
      servicePackage: 'com.android.chrome',
    });
    expect(FAKE_NATIVE_WEB_BROWSER.warmUpAsync).toHaveBeenCalledWith('com.android.chrome');

    await coolDownAsync('com.android.chrome');
    expect(FAKE_NATIVE_WEB_BROWSER.coolDownAsync).toHaveBeenCalledWith('com.android.chrome');

    await mayInitWithUrlAsync('https://example.com', 'com.android.chrome');
    expect(FAKE_NATIVE_WEB_BROWSER.mayInitWithUrlAsync).toHaveBeenCalledWith(
      'https://example.com',
      'com.android.chrome',
    );

    await expect(getCustomTabsSupportingBrowsersAsync()).resolves.toMatchObject({
      browserPackages: ['com.android.chrome'],
    });
  });

  it('resolve empty off Android without touching the native module', async () => {
    await expect(warmUpAsync()).resolves.toEqual({});
    await expect(coolDownAsync()).resolves.toEqual({});
    await expect(mayInitWithUrlAsync('https://example.com')).resolves.toEqual({});
    expect(FAKE_NATIVE_WEB_BROWSER.warmUpAsync).not.toHaveBeenCalled();
    expect(FAKE_NATIVE_WEB_BROWSER.coolDownAsync).not.toHaveBeenCalled();
    expect(FAKE_NATIVE_WEB_BROWSER.mayInitWithUrlAsync).not.toHaveBeenCalled();
  });

  it('report the browser list as unavailable when the native module has no such method', async () => {
    fakePlatform.OS = 'android';
    const { getCustomTabsSupportingBrowsersAsync: native } = FAKE_NATIVE_WEB_BROWSER;
    // @ts-expect-error -- simulating iOS, which registers the stub without the `Async` suffix
    FAKE_NATIVE_WEB_BROWSER.getCustomTabsSupportingBrowsersAsync = undefined;

    await expect(getCustomTabsSupportingBrowsersAsync()).rejects.toThrow(
      'getCustomTabsSupportingBrowsersAsync is not available on expo-web-browser',
    );

    FAKE_NATIVE_WEB_BROWSER.getCustomTabsSupportingBrowsersAsync = native;
  });
});

describe('openAuthSessionAsync on a platform with a native auth session', () => {
  it('hands the url, redirect url and processed options to the native module', async () => {
    await expect(
      openAuthSessionAsync('https://login.example', 'myapp://callback', {
        preferEphemeralSession: true,
        controlsColor: 'red',
      }),
    ).resolves.toEqual({ type: 'success', url: 'myapp://callback' });

    expect(FAKE_NATIVE_WEB_BROWSER.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://login.example',
      'myapp://callback',
      { preferEphemeralSession: true, controlsColor: 'processed:red' },
    );
  });

  it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
    const { openAuthSessionAsync: native } = FAKE_NATIVE_WEB_BROWSER;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_WEB_BROWSER.openAuthSessionAsync = undefined;

    await expect(openAuthSessionAsync('https://login.example')).rejects.toThrow(
      'openAuthSessionAsync is not available on expo-web-browser',
    );

    FAKE_NATIVE_WEB_BROWSER.openAuthSessionAsync = native;
  });
});

// Android has no native auth session: a Custom Tab is opened and the result is whichever comes
// first, the deep link back into the app or the app returning to the foreground.
describe('openAuthSessionAsync on Android', () => {
  it('resolves with the redirect once the deep link arrives', async () => {
    fakePlatform.OS = 'android';
    // Android's native module has neither of these; without removing them the polyfill would never
    // be reached and the `finally` would dismiss a browser that cannot be dismissed.
    const { openAuthSessionAsync: nativeAuth, dismissBrowser: nativeDismiss } =
      FAKE_NATIVE_WEB_BROWSER;
    // @ts-expect-error -- simulating Android's native surface
    FAKE_NATIVE_WEB_BROWSER.openAuthSessionAsync = undefined;
    // @ts-expect-error -- simulating Android's native surface
    FAKE_NATIVE_WEB_BROWSER.dismissBrowser = undefined;

    const session = openAuthSessionAsync('https://login.example', 'myapp://callback');
    await flush();
    emitUrl('myapp://callback?code=abc');

    await expect(session).resolves.toEqual({
      type: 'success',
      url: 'myapp://callback?code=abc',
    });
    expect(FAKE_NATIVE_WEB_BROWSER.openBrowserAsync).toHaveBeenCalledWith(
      'https://login.example',
      {},
    );

    // Release the browser-wait promise the race left pending, so the next session can start.
    emitAppState('active');
    await flush();

    FAKE_NATIVE_WEB_BROWSER.openAuthSessionAsync = nativeAuth;
    FAKE_NATIVE_WEB_BROWSER.dismissBrowser = nativeDismiss;
  });

  it('resolves as dismissed when the app returns to the foreground without a redirect', async () => {
    fakePlatform.OS = 'android';
    const { openAuthSessionAsync: nativeAuth, dismissBrowser: nativeDismiss } =
      FAKE_NATIVE_WEB_BROWSER;
    // @ts-expect-error -- simulating Android's native surface
    FAKE_NATIVE_WEB_BROWSER.openAuthSessionAsync = undefined;
    // @ts-expect-error -- simulating Android's native surface
    FAKE_NATIVE_WEB_BROWSER.dismissBrowser = undefined;

    const session = openAuthSessionAsync('https://login.example', 'myapp://callback');
    await flush();
    emitAppState('active');

    await expect(session).resolves.toEqual({ type: 'dismiss' });
    // The redirect listener is torn down again, so a second session is allowed to start.
    expect(urlListeners.size).toBe(0);

    FAKE_NATIVE_WEB_BROWSER.openAuthSessionAsync = nativeAuth;
    FAKE_NATIVE_WEB_BROWSER.dismissBrowser = nativeDismiss;
  });
});

describe('dismissAuthSession', () => {
  it('dismisses the native auth session where one exists', () => {
    dismissAuthSession();
    expect(FAKE_NATIVE_WEB_BROWSER.dismissAuthSession).toHaveBeenCalled();
    expect(FAKE_NATIVE_WEB_BROWSER.dismissBrowser).not.toHaveBeenCalled();
  });

  it('falls back to dismissing the browser where there is no native auth session', () => {
    fakePlatform.OS = 'android';

    dismissAuthSession();

    expect(FAKE_NATIVE_WEB_BROWSER.dismissBrowser).toHaveBeenCalled();
    expect(FAKE_NATIVE_WEB_BROWSER.dismissAuthSession).not.toHaveBeenCalled();
  });
});
