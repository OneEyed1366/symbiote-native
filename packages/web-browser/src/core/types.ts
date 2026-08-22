import type { ProcessedColorValue } from 'react-native';

/** Payload of the deep-link event the Android auth-session polyfill listens for. */
export type IRedirectEvent = {
  url: string;
};

/**
 * Options for [`openBrowserAsync`](#openbrowserasync).
 *
 * Upstream's two `@platform web` fields (`windowName`, `windowFeatures`) are not part of this
 * type — SymbioteNative has no web target, so they could never be read.
 */
export type IWebBrowserOpenOptions = {
  /** Color of the toolbar. Accepts any React Native color format. */
  toolbarColor?: string;
  /**
   * Package name of the browser that should handle the Custom Tab. Pick one from
   * `getCustomTabsSupportingBrowsersAsync`.
   * @platform android
   */
  browserPackage?: string;
  /** Whether the toolbar hides as the user scrolls the page. */
  enableBarCollapsing?: boolean;
  /**
   * Color of the secondary toolbar. Accepts any React Native color format.
   * @platform android
   */
  secondaryToolbarColor?: string;
  /**
   * Whether the toolbar shows the website's title.
   * @platform android
   */
  showTitle?: boolean;
  /**
   * Whether a default share item is added to the browser's menu.
   * @platform android
   */
  enableDefaultShareMenuItem?: boolean;
  /**
   * Whether the browsed website appears as its own entry in the recents/multitasking view.
   * Requires `createTask` to stay `true`.
   * @default false
   * @platform android
   */
  showInRecents?: boolean;
  /**
   * Whether the browser opens in its own task rather than the app's.
   * @default true
   * @platform android
   */
  createTask?: boolean;
  /**
   * Whether to launch the browser through a transparent proxy activity with a different task
   * affinity, which keeps the browser alive while the app is backgrounded. Only read when
   * `createTask` is `true`, and forces `showInRecents` on. Set `false` for the legacy direct
   * launch.
   * @default true
   * @platform android
   */
  useProxyActivity?: boolean;
  /**
   * Tint color for the controls in `SFSafariViewController`. Accepts any React Native color
   * format.
   * @platform ios
   */
  controlsColor?: string;
  /**
   * Style of the dismiss button.
   * @platform ios
   */
  dismissButtonStyle?: 'done' | 'close' | 'cancel';
  /**
   * Whether Safari should enter Reader mode when the page supports it.
   * @platform ios
   */
  readerMode?: boolean;
  /**
   * [Presentation style](https://developer.apple.com/documentation/uikit/uiviewcontroller/1621355-modalpresentationstyle)
   * of the browser window.
   * @default WebBrowserPresentationStyle.OVER_FULL_SCREEN
   * @platform ios
   */
  presentationStyle?: WebBrowserPresentationStyle;
};

/**
 * Options for [`openAuthSessionAsync`](#openauthsessionasync). Android has no native auth-session
 * API, so there the inherited `IWebBrowserOpenOptions` fields are passed to the Custom Tab the
 * polyfill opens; on iOS `ASWebAuthenticationSession` ignores them and reads only the two fields
 * below.
 */
export type IAuthSessionOpenOptions = IWebBrowserOpenOptions & {
  /**
   * Ask the browser for a private authentication session, so it shares no cookies or browsing
   * data with the user's normal session. Whether the request is honored is up to the user's
   * default browser.
   * @default false
   * @platform ios
   */
  preferEphemeralSession?: boolean;
  /**
   * Use HTTPS universal-link callbacks instead of custom-URL-scheme callbacks. Needs the
   * Associated Domains entitlement configured for the redirect URL's host, and iOS 17.4+. Left
   * `false`, the legacy `callbackURLScheme` API is used, which needs no entitlement.
   * @default false
   * @platform ios
   */
  preferUniversalLinks?: boolean;
};

/**
 * The open options after the three color fields have been run through `processColor`. This is the
 * shape the native module actually receives — a color reaches native as a platform integer, never
 * as the CSS string the caller wrote.
 */
export type IProcessedOpenOptions = Omit<
  IAuthSessionOpenOptions,
  'toolbarColor' | 'secondaryToolbarColor' | 'controlsColor'
> & {
  toolbarColor?: ProcessedColorValue | null;
  secondaryToolbarColor?: ProcessedColorValue | null;
  controlsColor?: ProcessedColorValue | null;
};

export type IWebBrowserCustomTabsResults = {
  /**
   * The browser the user picked as their device default, or `undefined` when there is none — which
   * usually means the user will be prompted to choose.
   */
  defaultBrowserPackage?: string;
  /**
   * The browser `CustomTabsClient` prefers for Custom Tabs. Favors the user's default as long as
   * it appears in both `browserPackages` and `servicePackages`; only such browsers fully support
   * Custom Tabs. `undefined` when no installed browser qualifies.
   */
  preferredBrowserPackage?: string;
  /**
   * Every package `PackageManager` recognizes as able to handle Custom Tabs. Empty when the device
   * has no supporting browser.
   */
  browserPackages: string[];
  /**
   * Every package `PackageManager` recognizes as able to handle the Custom Tabs *Service* — the
   * one `warmUpAsync`, `mayInitWithUrlAsync` and `coolDownAsync` talk to.
   */
  servicePackages: string[];
};

/** How a browser session ended. */
export enum WebBrowserResultType {
  /** The user dismissed the browser themselves. @platform ios */
  CANCEL = 'cancel',
  /** The browser was closed by a `dismissBrowser` call. @platform ios */
  DISMISS = 'dismiss',
  /** The browser was launched. Android resolves here without waiting for it to close. @platform android */
  OPENED = 'opened',
  /** Another browser session is already in progress. */
  LOCKED = 'locked',
}

/**
 * A browser presentation style, mapped directly onto
 * [`UIModalPresentationStyle`](https://developer.apple.com/documentation/uikit/uiviewcontroller/1621355-modalpresentationstyle).
 *
 * @platform ios
 */
export enum WebBrowserPresentationStyle {
  /** The browser covers the screen. */
  FULL_SCREEN = 'fullScreen',
  /** The browser partially covers the underlying content. */
  PAGE_SHEET = 'pageSheet',
  /** The browser is centered on the screen. */
  FORM_SHEET = 'formSheet',
  /** The browser is displayed over the app's content. */
  CURRENT_CONTEXT = 'currentContext',
  /** The browser view covers the screen. */
  OVER_FULL_SCREEN = 'overFullScreen',
  /** The browser is displayed over the app's content. */
  OVER_CURRENT_CONTEXT = 'overCurrentContext',
  /** The browser is displayed in a popover view. */
  POPOVER = 'popover',
  /** The system picks the style. Older iOS versions fall back to `FULL_SCREEN`. */
  AUTOMATIC = 'automatic',
}

export type IWebBrowserResult = {
  type: WebBrowserResultType;
};

/** What `dismissBrowser` resolves with once the presented browser has been torn down. */
export type IWebBrowserDismissResult = {
  type: WebBrowserResultType.DISMISS;
};

export type IWebBrowserRedirectResult = {
  type: 'success';
  url: string;
};

export type IServiceActionResult = {
  servicePackage?: string;
};

export type IWebBrowserAuthSessionResult =
  IWebBrowserRedirectResult | IWebBrowserResult;
export type IWebBrowserMayInitWithUrlResult = IServiceActionResult;
export type IWebBrowserWarmUpResult = IServiceActionResult;
export type IWebBrowserCoolDownResult = IServiceActionResult;
