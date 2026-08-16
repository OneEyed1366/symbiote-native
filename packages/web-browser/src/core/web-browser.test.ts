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
  describe('Positive', () => {
    it('passes the url and options through to the native module', async () => {
      await expect(openBrowserAsync('https://example.com', { showTitle: true })).resolves.toEqual({
        type: 'opened',
      });
      expect(FAKE_NATIVE_WEB_BROWSER.openBrowserAsync).toHaveBeenCalledWith('https://example.com', {
        showTitle: true,
      });
    });

    it('runs the three color options through processColor', async () => {
      // why: a color reaches the native side as a platform color number, never as the raw CSS
      // string the caller wrote — the native decoder does not parse CSS color syntax itself.
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
  });

  describe('Negative', () => {
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
});

describe('dismissBrowser', () => {
  describe('Positive', () => {
    it('delegates to the native module', async () => {
      await expect(dismissBrowser()).resolves.toEqual({ type: 'dismiss' });
      expect(FAKE_NATIVE_WEB_BROWSER.dismissBrowser).toHaveBeenCalled();
    });
  });

  describe('Negative', () => {
    it('throws where dismissing is not available', () => {
      // why: Android's Custom Tabs offer no way to close a tab programmatically, so the native
      // module registers no dismissBrowser there at all — the caller needs a clear signal that
      // this platform requires the user to close it themselves, not a silent no-op.
      const { dismissBrowser: native } = FAKE_NATIVE_WEB_BROWSER;
      // @ts-expect-error -- simulating Android, where the native module has no such method
      FAKE_NATIVE_WEB_BROWSER.dismissBrowser = undefined;

      expect(() => dismissBrowser()).toThrow('dismissBrowser is not available on expo-web-browser');

      FAKE_NATIVE_WEB_BROWSER.dismissBrowser = native;
    });
  });
});

describe('the Custom Tabs service functions', () => {
  describe('Positive', () => {
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
      // why: these are Custom Tabs APIs with no iOS equivalent — calling them off Android must be
      // a harmless no-op rather than reach for a native method the platform never registers.
      await expect(warmUpAsync()).resolves.toEqual({});
      await expect(coolDownAsync()).resolves.toEqual({});
      await expect(mayInitWithUrlAsync('https://example.com')).resolves.toEqual({});
      await expect(getCustomTabsSupportingBrowsersAsync()).resolves.toEqual({
        defaultBrowserPackage: undefined,
        preferredBrowserPackage: undefined,
        browserPackages: [],
        servicePackages: [],
      });
      expect(FAKE_NATIVE_WEB_BROWSER.warmUpAsync).not.toHaveBeenCalled();
      expect(FAKE_NATIVE_WEB_BROWSER.coolDownAsync).not.toHaveBeenCalled();
      expect(FAKE_NATIVE_WEB_BROWSER.mayInitWithUrlAsync).not.toHaveBeenCalled();
      expect(FAKE_NATIVE_WEB_BROWSER.getCustomTabsSupportingBrowsersAsync).not.toHaveBeenCalled();
    });
  });

  describe('Negative', () => {
    it('throws when warmUpAsync is not available', async () => {
      const { warmUpAsync: native } = FAKE_NATIVE_WEB_BROWSER;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_WEB_BROWSER.warmUpAsync = undefined;

      await expect(warmUpAsync()).rejects.toThrow(
        'warmUpAsync is not available on expo-web-browser',
      );

      FAKE_NATIVE_WEB_BROWSER.warmUpAsync = native;
    });

    it('throws when coolDownAsync is not available', async () => {
      const { coolDownAsync: native } = FAKE_NATIVE_WEB_BROWSER;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_WEB_BROWSER.coolDownAsync = undefined;

      await expect(coolDownAsync()).rejects.toThrow(
        'coolDownAsync is not available on expo-web-browser',
      );

      FAKE_NATIVE_WEB_BROWSER.coolDownAsync = native;
    });

    it('throws when mayInitWithUrlAsync is not available', async () => {
      const { mayInitWithUrlAsync: native } = FAKE_NATIVE_WEB_BROWSER;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_WEB_BROWSER.mayInitWithUrlAsync = undefined;

      await expect(mayInitWithUrlAsync('https://example.com')).rejects.toThrow(
        'mayInitWithUrlAsync is not available on expo-web-browser',
      );

      FAKE_NATIVE_WEB_BROWSER.mayInitWithUrlAsync = native;
    });

    it('report the browser list as unavailable when the native module has no such method', async () => {
      // why: iOS registers its no-op stub as `getCustomTabsSupportingBrowsers` (without the
      // `Async` suffix), so this guard has to fire on iOS BEFORE the "off Android" early return —
      // an iOS caller who mistakenly calls this must see a clear error, not a silently-empty result.
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
});

describe('openAuthSessionAsync on a platform with a native auth session', () => {
  describe('Positive', () => {
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
  });

  describe('Negative', () => {
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
});

// Android has no native auth session: a Custom Tab is opened and the result is whichever comes
// first, the deep link back into the app or the app returning to the foreground.
describe('openAuthSessionAsync on Android', () => {
  describe('Positive', () => {
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

    it('resolves as cancelled immediately when the Custom Tab never actually launches', async () => {
      // why: openBrowserAndWaitAndroidAsync only waits for the foreground-return race when the
      // tab actually opened — a launch that reports anything other than OPENED (e.g. the native
      // side couldn't even present the tab) must resolve right away, not hang waiting for an
      // AppState transition that will never mean what it thinks it means.
      fakePlatform.OS = 'android';
      const { openAuthSessionAsync: nativeAuth, dismissBrowser: nativeDismiss } =
        FAKE_NATIVE_WEB_BROWSER;
      // @ts-expect-error -- simulating Android's native surface
      FAKE_NATIVE_WEB_BROWSER.openAuthSessionAsync = undefined;
      // @ts-expect-error -- simulating Android's native surface
      FAKE_NATIVE_WEB_BROWSER.dismissBrowser = undefined;
      FAKE_NATIVE_WEB_BROWSER.openBrowserAsync.mockResolvedValueOnce({ type: 'cancel' });

      await expect(
        openAuthSessionAsync('https://login.example', 'myapp://callback'),
      ).resolves.toEqual({ type: 'cancel' });
      expect(appStateListeners.size).toBe(0);

      FAKE_NATIVE_WEB_BROWSER.openAuthSessionAsync = nativeAuth;
      FAKE_NATIVE_WEB_BROWSER.dismissBrowser = nativeDismiss;
    });
  });

  describe('Negative', () => {
    it('propagates a native openBrowserAsync failure and releases its AppState listener', async () => {
      // why: a launch failure must not leave a dangling AppState subscription behind — that would
      // leak a listener that fires forever on every future foreground/background transition.
      fakePlatform.OS = 'android';
      const { openAuthSessionAsync: nativeAuth, dismissBrowser: nativeDismiss } =
        FAKE_NATIVE_WEB_BROWSER;
      // @ts-expect-error -- simulating Android's native surface
      FAKE_NATIVE_WEB_BROWSER.openAuthSessionAsync = undefined;
      // @ts-expect-error -- simulating Android's native surface
      FAKE_NATIVE_WEB_BROWSER.dismissBrowser = undefined;
      FAKE_NATIVE_WEB_BROWSER.openBrowserAsync.mockRejectedValueOnce(
        new Error('native launch failed'),
      );

      await expect(
        openAuthSessionAsync('https://login.example', 'myapp://callback'),
      ).rejects.toThrow('native launch failed');
      expect(appStateListeners.size).toBe(0);

      FAKE_NATIVE_WEB_BROWSER.openAuthSessionAsync = nativeAuth;
      FAKE_NATIVE_WEB_BROWSER.dismissBrowser = nativeDismiss;
    });

    it(// characterization: the reentrancy guard fires — a second concurrent session IS rejected —
    // but through the "invalid state with a redirect handler set" branch, not the more clearly
    // worded "already open, only one can be open at a time" branch below it in source. Both
    // internal flags (redirectSubscription, onWebBrowserCloseAndroid) are set together at the
    // top of openAuthSessionPolyfillAsync's Promise.race, and redirectSubscription's check runs
    // first, so the second check reads as dead code under every path reachable from the public
    // API. [characterization — behavior not confirmed as intentional]
    'rejects a second concurrent Android auth session while one is in flight', async () => {
      // QUESTION: is the "already open, only one can be open at a time" guard meant to ever be
      // the one that actually fires, or is it intentionally a defensive belt-and-suspenders
      // check behind the redirectSubscription guard? The message reaching real callers today
      // ("...invalid state with a redirect handler set...") reads like an internal-invariant
      // violation, not a normal "you already have a session open" user-facing error — worth
      // confirming with whoever owns this port before relying on the message text anywhere.
      fakePlatform.OS = 'android';
      const { openAuthSessionAsync: nativeAuth, dismissBrowser: nativeDismiss } =
        FAKE_NATIVE_WEB_BROWSER;
      // @ts-expect-error -- simulating Android's native surface
      FAKE_NATIVE_WEB_BROWSER.openAuthSessionAsync = undefined;
      // @ts-expect-error -- simulating Android's native surface
      FAKE_NATIVE_WEB_BROWSER.dismissBrowser = undefined;

      const firstSession = openAuthSessionAsync('https://login.example', 'myapp://callback');
      await flush();

      await expect(openAuthSessionAsync('https://other.example')).rejects.toThrow(
        'invalid state with a redirect handler set',
      );

      // Let the first session settle so its subscriptions are released before the next test.
      emitAppState('active');
      await flush();
      await firstSession;

      FAKE_NATIVE_WEB_BROWSER.openAuthSessionAsync = nativeAuth;
      FAKE_NATIVE_WEB_BROWSER.dismissBrowser = nativeDismiss;
    });
  });
});

describe('dismissAuthSession', () => {
  describe('Positive', () => {
    it('dismisses the native auth session where one exists', () => {
      dismissAuthSession();
      expect(FAKE_NATIVE_WEB_BROWSER.dismissAuthSession).toHaveBeenCalled();
      expect(FAKE_NATIVE_WEB_BROWSER.dismissBrowser).not.toHaveBeenCalled();
    });

    it('falls back to dismissing the browser where there is no native auth session', () => {
      // why: Android has no ASWebAuthenticationSession equivalent — dismissing "the auth session"
      // there can only mean closing the Custom Tab the polyfill opened.
      fakePlatform.OS = 'android';

      dismissAuthSession();

      expect(FAKE_NATIVE_WEB_BROWSER.dismissBrowser).toHaveBeenCalled();
      expect(FAKE_NATIVE_WEB_BROWSER.dismissAuthSession).not.toHaveBeenCalled();
    });
  });

  describe('Negative', () => {
    it('throws where a native auth session exists but has no dismiss method', () => {
      const { dismissAuthSession: native } = FAKE_NATIVE_WEB_BROWSER;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_WEB_BROWSER.dismissAuthSession = undefined;

      expect(() => dismissAuthSession()).toThrow(
        'dismissAuthSession is not available on expo-web-browser',
      );

      FAKE_NATIVE_WEB_BROWSER.dismissAuthSession = native;
    });

    it('throws on the Android fallback where dismissBrowser is also unavailable', () => {
      // why: on Android this is the ONLY dismiss path — if it's missing there is no other way to
      // close the tab, so silently doing nothing would leave the caller with no signal at all.
      fakePlatform.OS = 'android';
      const { dismissBrowser: native } = FAKE_NATIVE_WEB_BROWSER;
      // @ts-expect-error -- simulating Android, where the native module has no such method
      FAKE_NATIVE_WEB_BROWSER.dismissBrowser = undefined;

      expect(() => dismissAuthSession()).toThrow(
        'dismissBrowser is not available on expo-web-browser',
      );

      FAKE_NATIVE_WEB_BROWSER.dismissBrowser = native;
    });
  });
});
