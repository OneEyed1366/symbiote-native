// Hand-ported from .vendors/expo/packages/expo-web-browser/src/WebBrowser.ts (sdk-57). Two
// deliberate departures from upstream, both because SymbioteNative has no web target:
// `maybeCompleteAuthSession` is not ported (it exists only to close a `window.open` popup; on a
// native platform it can do nothing but return `{ type: 'failed' }`), and the web-only open
// options are gone from IWebBrowserOpenOptions.
import { Platform, UnavailabilityError } from 'expo-modules-core';
import type { AppStateStatus, EmitterSubscription } from 'react-native';
import { AppState, Linking, processColor } from 'react-native';

import { expoWebBrowser } from './native-module';
import {
  WebBrowserResultType,
  type IAuthSessionOpenOptions,
  type IProcessedOpenOptions,
  type IRedirectEvent,
  type IWebBrowserAuthSessionResult,
  type IWebBrowserCoolDownResult,
  type IWebBrowserCustomTabsResults,
  type IWebBrowserDismissResult,
  type IWebBrowserMayInitWithUrlResult,
  type IWebBrowserOpenOptions,
  type IWebBrowserRedirectResult,
  type IWebBrowserResult,
  type IWebBrowserWarmUpResult,
} from './types';

const NATIVE_MODULE_NAME = 'expo-web-browser';

const EMPTY_CUSTOM_TABS_PACKAGES: IWebBrowserCustomTabsResults = {
  defaultBrowserPackage: undefined,
  preferredBrowserPackage: undefined,
  browserPackages: [],
  servicePackages: [],
};

/**
 * The packages that support Custom Tabs, the Custom Tabs service, and the user's chosen and
 * preferred browser. Only as reliable as `PackageManager.getResolvingActivities` underneath — a
 * browser can be missing from `browserPackages` once another one is set as default.
 *
 * @platform android
 */
export async function getCustomTabsSupportingBrowsersAsync(): Promise<IWebBrowserCustomTabsResults> {
  // iOS registers its no-op stub as `getCustomTabsSupportingBrowsers`, without the `Async`
  // suffix, so this guard — kept in upstream's order deliberately — fires there before the
  // non-Android early return below can be reached.
  if (!expoWebBrowser.getCustomTabsSupportingBrowsersAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getCustomTabsSupportingBrowsersAsync');
  }
  if (Platform.OS !== 'android') {
    return EMPTY_CUSTOM_TABS_PACKAGES;
  }
  return expoWebBrowser.getCustomTabsSupportingBrowsersAsync();
}

/**
 * Calls `warmUp` on the [`CustomTabsClient`](https://developer.android.com/reference/androidx/browser/customtabs/CustomTabsClient#warmup(long))
 * for the given package.
 *
 * @param browserPackage Browser to warm up. Defaults to the preferred one.
 * @platform android
 */
export async function warmUpAsync(browserPackage?: string): Promise<IWebBrowserWarmUpResult> {
  if (!expoWebBrowser.warmUpAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'warmUpAsync');
  }
  if (Platform.OS !== 'android') {
    return {};
  }
  return expoWebBrowser.warmUpAsync(browserPackage);
}

/**
 * Starts a [`CustomTabsSession`](https://developer.android.com/reference/androidx/browser/customtabs/CustomTabsSession#mayLaunchUrl(android.net.Uri,android.os.Bundle,java.util.List%3Candroid.os.Bundle%3E))
 * if needed and calls its `mayLaunchUrl`, so the browser can prefetch the page.
 *
 * @param url The page most likely to be opened first.
 * @param browserPackage Browser to inform. Defaults to the preferred one.
 * @platform android
 */
export async function mayInitWithUrlAsync(
  url: string,
  browserPackage?: string,
): Promise<IWebBrowserMayInitWithUrlResult> {
  if (!expoWebBrowser.mayInitWithUrlAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'mayInitWithUrlAsync');
  }
  if (Platform.OS !== 'android') {
    return {};
  }
  return expoWebBrowser.mayInitWithUrlAsync(url, browserPackage);
}

/**
 * Drops every binding `warmUpAsync` and `mayInitWithUrlAsync` created. Call it once the bindings
 * are no longer needed to avoid leaking them — though they are also released when the app is
 * destroyed, which is often good enough.
 *
 * @param browserPackage Browser to cool down. Defaults to the preferred one.
 * @returns The cooled service, or an empty object when there was no connection to dismiss.
 * @platform android
 */
export async function coolDownAsync(browserPackage?: string): Promise<IWebBrowserCoolDownResult> {
  if (!expoWebBrowser.coolDownAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'coolDownAsync');
  }
  if (Platform.OS !== 'android') {
    return {};
  }
  return expoWebBrowser.coolDownAsync(browserPackage);
}

/**
 * Opens the url in a modal [`SFSafariViewController`](https://developer.apple.com/documentation/safariservices/sfsafariviewcontroller)
 * on iOS and a [Custom Tab](https://developer.chrome.com/docs/android/custom-tabs) on Android. The
 * modal Safari does not share cookies with the system Safari — for a login flow that needs them,
 * use `openAuthSessionAsync`.
 *
 * @returns Android resolves with `{ type: 'opened' }` as soon as the tab launches, without waiting
 * for the user to close it. iOS resolves with `{ type: 'cancel' }` when the user dismissed the
 * browser and `{ type: 'dismiss' }` when `dismissBrowser` closed it.
 */
export async function openBrowserAsync(
  url: string,
  browserParams: IWebBrowserOpenOptions = {},
): Promise<IWebBrowserResult> {
  if (!expoWebBrowser.openBrowserAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'openBrowserAsync');
  }
  return expoWebBrowser.openBrowserAsync(url, processOptions(browserParams));
}

/**
 * Dismisses the presented browser. Throws where dismissing isn't available — Android's Custom Tabs
 * offer no way to close a tab programmatically, so there the user has to press the tab's own close
 * button.
 *
 * @platform ios
 */
export function dismissBrowser(): Promise<IWebBrowserDismissResult> {
  if (!expoWebBrowser.dismissBrowser) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'dismissBrowser');
  }
  return expoWebBrowser.dismissBrowser();
}

/**
 * Opens a login page and resolves once the authentication provider redirects back to the app.
 *
 * On iOS this is `ASWebAuthenticationSession`, which asks the user whether the app may
 * authenticate with the given url; the redirect URI registered with the authentication server has
 * to use the app's own scheme (`demo://…`, not `https://…`). Adding a `Linking` listener of your
 * own is unnecessary there and can have side effects.
 *
 * Android has no equivalent native API, so it is polyfilled: a Custom Tab plus `AppState` and
 * `Linking`, racing "the deep link came back" against "the app returned to the foreground". Only
 * one such session can be open at a time.
 *
 * @param url The login page to open.
 * @param redirectUrl The url that deep-links back into the app. Without it the session can only
 * end by the user closing the browser.
 * @returns `{ type: 'success', url }` with the redirect url on a completed login,
 * `{ type: 'cancel' }` when the user declined or closed the browser, and `{ type: 'dismiss' }` when
 * `dismissBrowser` closed it.
 */
export async function openAuthSessionAsync(
  url: string,
  redirectUrl?: string | null,
  options: IAuthSessionOpenOptions = {},
): Promise<IWebBrowserAuthSessionResult> {
  if (!isAuthSessionNativelySupported()) {
    return openAuthSessionPolyfillAsync(url, redirectUrl, options);
  }
  if (!expoWebBrowser.openAuthSessionAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'openAuthSessionAsync');
  }
  return expoWebBrowser.openAuthSessionAsync(url, redirectUrl, processOptions(options));
}

/**
 * Dismisses the current authentication session. Falls back to dismissing the plain browser where
 * there is no native auth session, which on Android throws for the same reason `dismissBrowser`
 * does.
 *
 * @platform ios
 */
export function dismissAuthSession(): void {
  if (isAuthSessionNativelySupported()) {
    if (!expoWebBrowser.dismissAuthSession) {
      throw new UnavailabilityError(NATIVE_MODULE_NAME, 'dismissAuthSession');
    }
    expoWebBrowser.dismissAuthSession();
    return;
  }
  if (!expoWebBrowser.dismissBrowser) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'dismissBrowser');
  }
  void expoWebBrowser.dismissBrowser();
}

function processOptions(options: IAuthSessionOpenOptions): IProcessedOpenOptions {
  return {
    ...options,
    controlsColor: processColor(options.controlsColor),
    toolbarColor: processColor(options.toolbarColor),
    secondaryToolbarColor: processColor(options.secondaryToolbarColor),
  };
}

/* Android polyfill for the ASWebAuthenticationSession flow */

function isAuthSessionNativelySupported(): boolean {
  return Platform.OS !== 'android';
}

let redirectSubscription: EmitterSubscription | null = null;

// `openBrowserAsync` on Android resolves the moment the Custom Tab launches, not when the user
// closes it, so the polyfill has to watch AppState instead. This holds the `resolve` of the
// promise that waits for the app to come back to the foreground.
let onWebBrowserCloseAndroid: (() => void) | null = null;

// A null initial `AppState.currentState` means the first `change` event is the bridge reporting
// the state it captured, not a real transition — that one has to be ignored, or the session would
// end the instant it started. See https://reactnative.dev/docs/appstate#basic-usage.
let isAppStateAvailable: boolean = AppState.currentState !== null;

function onAppStateChangeAndroid(state: AppStateStatus): void {
  if (!isAppStateAvailable) {
    isAppStateAvailable = true;
    return;
  }
  if (state === 'active' && onWebBrowserCloseAndroid) {
    onWebBrowserCloseAndroid();
  }
}

async function openBrowserAndWaitAndroidAsync(
  startUrl: string,
  browserParams: IWebBrowserOpenOptions = {},
): Promise<IWebBrowserResult> {
  const appStateChangedToActive = new Promise<void>(resolve => {
    onWebBrowserCloseAndroid = resolve;
  });
  const stateChangeSubscription = AppState.addEventListener('change', onAppStateChangeAndroid);

  let launched: IWebBrowserResult;
  try {
    launched = await openBrowserAsync(startUrl, browserParams);
  } catch (error) {
    stateChangeSubscription.remove();
    onWebBrowserCloseAndroid = null;
    throw error;
  }

  let result: IWebBrowserResult = { type: WebBrowserResultType.CANCEL };
  if (launched.type === WebBrowserResultType.OPENED) {
    await appStateChangedToActive;
    result = { type: WebBrowserResultType.DISMISS };
  }

  stateChangeSubscription.remove();
  onWebBrowserCloseAndroid = null;
  return result;
}

async function openAuthSessionPolyfillAsync(
  startUrl: string,
  returnUrl?: string | null,
  browserParams: IWebBrowserOpenOptions = {},
): Promise<IWebBrowserAuthSessionResult> {
  if (redirectSubscription) {
    throw new Error(
      "The WebBrowser's auth session is in an invalid state with a redirect handler set when it should not be",
    );
  }
  if (onWebBrowserCloseAndroid) {
    throw new Error('WebBrowser is already open, only one can be open at a time');
  }

  try {
    return await Promise.race([
      openBrowserAndWaitAndroidAsync(startUrl, browserParams),
      waitForRedirectAsync(returnUrl),
    ]);
  } finally {
    // Only reachable on a platform that can dismiss a browser at all — Android users have to
    // close the Custom Tab themselves.
    if (expoWebBrowser.dismissBrowser) {
      void expoWebBrowser.dismissBrowser();
    }
    stopWaitingForRedirect();
  }
}

function stopWaitingForRedirect(): void {
  if (!redirectSubscription) {
    throw new Error(
      'The WebBrowser auth session is in an invalid state with no redirect handler when one should be set',
    );
  }
  redirectSubscription.remove();
  redirectSubscription = null;
}

function waitForRedirectAsync(returnUrl?: string | null): Promise<IWebBrowserRedirectResult> {
  // Deliberately never resolves when `returnUrl` is nullish: the browser promise it is raced
  // against is then the only thing that can settle the session.
  return new Promise(resolve => {
    redirectSubscription = Linking.addEventListener('url', (event: IRedirectEvent) => {
      if (returnUrl && event.url.startsWith(returnUrl)) {
        resolve({ url: event.url, type: 'success' });
      }
    });
  });
}
