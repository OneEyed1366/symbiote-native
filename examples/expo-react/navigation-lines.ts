import { ROUTE_NAME } from './routes';
import type { IRouteName } from './routes';

// This app demos Expo-modules-core-based package ports only (no @symbiote-native/navigation
// feature tour — that lives in the pure examples/react canary). One "line" per package, carried
// through MenuScreen's row badges and each demo screen's own line tag. Kept in sync by hand with
// App.css's `:root` `--line-*` tokens — CSS custom properties and this module are different
// runtimes with no shared import path.
export const NAV_LINE = {
  Sensors: 'sensors',
  LocalAuth: 'local-auth',
  Haptics: 'haptics',
  Clipboard: 'clipboard',
  Battery: 'battery',
  Brightness: 'brightness',
  Cellular: 'cellular',
  Network: 'network',
  Device: 'device',
  Application: 'application',
  Crypto: 'crypto',
  StandardWebCrypto: 'standard-web-crypto',
  SystemUi: 'system-ui',
  StoreReview: 'store-review',
  KeepAwake: 'keep-awake',
  ScreenOrientation: 'screen-orientation',
  Localization: 'localization',
  TrackingTransparency: 'tracking-transparency',
  SecureStore: 'secure-store',
  Sharing: 'sharing',
  WebBrowser: 'web-browser',
  Sms: 'sms',
} as const;

export type INavLine = (typeof NAV_LINE)[keyof typeof NAV_LINE];

export const LINE_COLOR: Record<INavLine, string> = {
  // Warm amber — @symbiote-native/sensors.
  [NAV_LINE.Sensors]: '#f5a623',
  // Crimson red — @symbiote-native/local-auth. Distinct from Sensors' amber and, deliberately,
  // the color security/lock iconography already reads as at a glance.
  [NAV_LINE.LocalAuth]: '#ef4444',
  // Violet — @symbiote-native/haptics.
  [NAV_LINE.Haptics]: '#8b5cf6',
  // Teal — @symbiote-native/clipboard.
  [NAV_LINE.Clipboard]: '#14b8a6',
  // Green — @symbiote-native/battery.
  [NAV_LINE.Battery]: '#22c55e',
  // Gold — @symbiote-native/brightness.
  [NAV_LINE.Brightness]: '#facc15',
  // Blue — @symbiote-native/cellular.
  [NAV_LINE.Cellular]: '#3b82f6',
  // Cyan — @symbiote-native/network.
  [NAV_LINE.Network]: '#06b6d4',
  // Slate — @symbiote-native/device.
  [NAV_LINE.Device]: '#64748b',
  // Pink — @symbiote-native/application.
  [NAV_LINE.Application]: '#ec4899',
  // Indigo — @symbiote-native/crypto.
  [NAV_LINE.Crypto]: '#6366f1',
  // Orange — @symbiote-native/standard-web-crypto. Distinct from Crypto's indigo despite the
  // shared name — this is the polyfill, not the native package it wraps.
  [NAV_LINE.StandardWebCrypto]: '#f97316',
  // Purple — @symbiote-native/system-ui.
  [NAV_LINE.SystemUi]: '#a855f7',
  // Lime — @symbiote-native/store-review.
  [NAV_LINE.StoreReview]: '#84cc16',
  // Sky — @symbiote-native/keep-awake.
  [NAV_LINE.KeepAwake]: '#0ea5e9',
  // Rose — @symbiote-native/screen-orientation.
  [NAV_LINE.ScreenOrientation]: '#f43f5e',
  // Emerald — @symbiote-native/localization.
  [NAV_LINE.Localization]: '#10b981',
  // Stone — @symbiote-native/tracking-transparency.
  [NAV_LINE.TrackingTransparency]: '#78716c',
  // Bronze — @symbiote-native/secure-store. Reads as a vault next to LocalAuth's crimson,
  // and stays clear of Brightness' gold and StandardWebCrypto's orange.
  [NAV_LINE.SecureStore]: '#a16207',
  // Fuchsia — @symbiote-native/sharing.
  [NAV_LINE.Sharing]: '#d946ef',
  // Deep sky blue — @symbiote-native/web-browser.
  [NAV_LINE.WebBrowser]: '#0369a1',
  // Olive green — @symbiote-native/sms. Darker than StoreReview's lime so the two read apart.
  [NAV_LINE.Sms]: '#65a30d',
};

export type INavLineInfo = {
  line: INavLine;
  code: string;
  label: string;
};

// Every route reachable from MenuScreen, minus Menu itself.
export type ITourRouteName = Exclude<IRouteName, typeof ROUTE_NAME.Menu>;

export const ROUTE_LINE_INFO: Record<ITourRouteName, INavLineInfo> = {
  [ROUTE_NAME.Sensors]: { line: NAV_LINE.Sensors, code: 'SN', label: 'SENSORS LINE' },
  [ROUTE_NAME.LocalAuth]: { line: NAV_LINE.LocalAuth, code: 'LA', label: 'LOCAL AUTH LINE' },
  [ROUTE_NAME.Haptics]: { line: NAV_LINE.Haptics, code: 'HP', label: 'HAPTICS LINE' },
  [ROUTE_NAME.Clipboard]: { line: NAV_LINE.Clipboard, code: 'CB', label: 'CLIPBOARD LINE' },
  [ROUTE_NAME.Battery]: { line: NAV_LINE.Battery, code: 'BT', label: 'BATTERY LINE' },
  [ROUTE_NAME.Brightness]: { line: NAV_LINE.Brightness, code: 'BR', label: 'BRIGHTNESS LINE' },
  [ROUTE_NAME.Cellular]: { line: NAV_LINE.Cellular, code: 'CL', label: 'CELLULAR LINE' },
  [ROUTE_NAME.Network]: { line: NAV_LINE.Network, code: 'NW', label: 'NETWORK LINE' },
  [ROUTE_NAME.Device]: { line: NAV_LINE.Device, code: 'DV', label: 'DEVICE LINE' },
  [ROUTE_NAME.Application]: { line: NAV_LINE.Application, code: 'AP', label: 'APPLICATION LINE' },
  [ROUTE_NAME.Crypto]: { line: NAV_LINE.Crypto, code: 'CR', label: 'CRYPTO LINE' },
  [ROUTE_NAME.StandardWebCrypto]: {
    line: NAV_LINE.StandardWebCrypto,
    code: 'WC',
    label: 'WEB CRYPTO LINE',
  },
  [ROUTE_NAME.SystemUi]: { line: NAV_LINE.SystemUi, code: 'SU', label: 'SYSTEM UI LINE' },
  [ROUTE_NAME.StoreReview]: { line: NAV_LINE.StoreReview, code: 'SR', label: 'STORE REVIEW LINE' },
  [ROUTE_NAME.KeepAwake]: { line: NAV_LINE.KeepAwake, code: 'KA', label: 'KEEP AWAKE LINE' },
  [ROUTE_NAME.ScreenOrientation]: {
    line: NAV_LINE.ScreenOrientation,
    code: 'SO',
    label: 'SCREEN ORIENTATION LINE',
  },
  [ROUTE_NAME.Localization]: { line: NAV_LINE.Localization, code: 'LO', label: 'LOCALIZATION LINE' },
  [ROUTE_NAME.TrackingTransparency]: {
    line: NAV_LINE.TrackingTransparency,
    code: 'TT',
    label: 'TRACKING TRANSPARENCY LINE',
  },
  [ROUTE_NAME.SecureStore]: { line: NAV_LINE.SecureStore, code: 'SS', label: 'SECURE STORE LINE' },
  [ROUTE_NAME.Sharing]: { line: NAV_LINE.Sharing, code: 'SH', label: 'SHARING LINE' },
  [ROUTE_NAME.WebBrowser]: { line: NAV_LINE.WebBrowser, code: 'WB', label: 'WEB BROWSER LINE' },
  [ROUTE_NAME.Sms]: { line: NAV_LINE.Sms, code: 'SM', label: 'SMS LINE' },
};
