import { ROUTE_NAME } from './routes';
import type { IRouteName } from './routes';

// This app demos Expo-modules-core-based package ports only (no @symbiote-native/navigation
// feature tour — that lives in the pure examples/vue-tsx canary). One "line" per package, carried
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
} as const;

export type INavLine = (typeof NAV_LINE)[keyof typeof NAV_LINE];

export const LINE_COLOR: Record<INavLine, string> = {
  // @symbiote-native/sensors demo — its own warm amber.
  [NAV_LINE.Sensors]: '#f6ad55',
  // @symbiote-native/local-auth demo — its own tour stop, distinct from the amber above.
  [NAV_LINE.LocalAuth]: '#ef4444',
  // @symbiote-native/haptics demo — violet, shared across every expo-* app for consistency.
  [NAV_LINE.Haptics]: '#8b5cf6',
  // @symbiote-native/clipboard demo — teal, shared across every expo-* app for consistency.
  [NAV_LINE.Clipboard]: '#14b8a6',
  // @symbiote-native/battery demo — green, shared across every expo-* app for consistency.
  [NAV_LINE.Battery]: '#22c55e',
  // @symbiote-native/brightness demo — gold, shared across every expo-* app for consistency.
  [NAV_LINE.Brightness]: '#facc15',
  // @symbiote-native/cellular demo — blue, shared across every expo-* app for consistency.
  [NAV_LINE.Cellular]: '#3b82f6',
  // @symbiote-native/network demo — cyan, shared across every expo-* app for consistency.
  [NAV_LINE.Network]: '#06b6d4',
  // @symbiote-native/device demo — slate, shared across every expo-* app for consistency.
  [NAV_LINE.Device]: '#64748b',
  // @symbiote-native/application demo — pink, shared across every expo-* app for consistency.
  [NAV_LINE.Application]: '#ec4899',
  // @symbiote-native/crypto demo — indigo, shared across every expo-* app for consistency.
  [NAV_LINE.Crypto]: '#6366f1',
  // @symbiote-native/standard-web-crypto demo — orange, its own tour stop distinct from crypto's indigo.
  [NAV_LINE.StandardWebCrypto]: '#f97316',
  // @symbiote-native/system-ui demo — purple, shared across every expo-* app for consistency.
  [NAV_LINE.SystemUi]: '#a855f7',
  // @symbiote-native/store-review demo — lime, shared across every expo-* app for consistency.
  [NAV_LINE.StoreReview]: '#84cc16',
  // @symbiote-native/keep-awake demo — sky, shared across every expo-* app for consistency.
  [NAV_LINE.KeepAwake]: '#0ea5e9',
  // @symbiote-native/screen-orientation demo — rose, shared across every expo-* app for consistency.
  [NAV_LINE.ScreenOrientation]: '#f43f5e',
  // @symbiote-native/localization demo — emerald, shared across every expo-* app for consistency.
  [NAV_LINE.Localization]: '#10b981',
  // @symbiote-native/tracking-transparency demo — stone, shared across every expo-* app for consistency.
  [NAV_LINE.TrackingTransparency]: '#78716c',
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
  [ROUTE_NAME.StandardWebCrypto]: { line: NAV_LINE.StandardWebCrypto, code: 'WC', label: 'WEB CRYPTO LINE' },
  [ROUTE_NAME.SystemUi]: { line: NAV_LINE.SystemUi, code: 'SU', label: 'SYSTEM UI LINE' },
  [ROUTE_NAME.StoreReview]: { line: NAV_LINE.StoreReview, code: 'SR', label: 'STORE REVIEW LINE' },
  [ROUTE_NAME.KeepAwake]: { line: NAV_LINE.KeepAwake, code: 'KA', label: 'KEEP AWAKE LINE' },
  [ROUTE_NAME.ScreenOrientation]: { line: NAV_LINE.ScreenOrientation, code: 'SO', label: 'SCREEN ORIENTATION LINE' },
  [ROUTE_NAME.Localization]: { line: NAV_LINE.Localization, code: 'LO', label: 'LOCALIZATION LINE' },
  [ROUTE_NAME.TrackingTransparency]: { line: NAV_LINE.TrackingTransparency, code: 'TT', label: 'TRACKING TRANSPARENCY LINE' },
};
