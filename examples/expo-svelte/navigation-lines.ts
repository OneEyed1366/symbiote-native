import { ROUTE_NAME } from './routes';
import type { IRouteName } from './routes';

// The Expo-package demo suite groups its tour screens into thematic "lines" — which package each
// screen exercises — carried through MenuScreen's row badges and each demo screen's own line tag.
// Kept in sync by hand with App.css's `:root` `--line-*` tokens — CSS custom properties and this
// module are different runtimes with no shared import path.
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
  Location: 'location',
  MediaLibrary: 'media-library',
  FileSystem: 'file-system',
  Audio: 'audio',
  Notifications: 'notifications',
  BackgroundTasks: 'background-tasks',
  Sqlite: 'sqlite',
} as const;

export type INavLine = (typeof NAV_LINE)[keyof typeof NAV_LINE];

// Byte-identical to examples/expo-vue-sfc/navigation-lines.ts, deliberately. In examples/svelte
// the Primitives line wears the framework's own brand color (Svelte's flame #ff3e00 where React's
// port uses #149eca and Vue's #42b883) because that line IS the "every @symbiote-native/<fw>
// primitive" showcase. This suite has no such line: every entry below is one Expo-SDK-ported
// package's own color, so there is no framework-brand slot to re-theme, and a screen must read the
// same color here as it does in the Vue/React/Angular twin.
export const LINE_COLOR: Record<INavLine, string> = {
  // Amber — Accelerometer/Gyroscope/Magnetometer/DeviceMotion/Pedometer over expo-modules-core.
  [NAV_LINE.Sensors]: '#f6ad55',
  // Red — @symbiote-native/local-auth.
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
  // Orange — @symbiote-native/standard-web-crypto.
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
  // Deep blue — @symbiote-native/web-browser, darker than Cellular's blue so the two read apart.
  [NAV_LINE.WebBrowser]: '#0369a1',
  // Olive — @symbiote-native/sms, deeper than StoreReview's lime.
  [NAV_LINE.Sms]: '#65a30d',
  // Royal blue — @symbiote-native/location. A map-pin blue distinct from Cellular's brighter blue
  // and WebBrowser's sky-toned blue.
  [NAV_LINE.Location]: '#1d4ed8',
  // Deep pink/magenta — @symbiote-native/media-library. Distinct from Application's pink
  // (#ec4899) and Sharing's fuchsia (#d946ef).
  [NAV_LINE.MediaLibrary]: '#db2777',
  // Forest green — @symbiote-native/file-system. Distinct from Battery's bright green
  // (#22c55e) and Localization's emerald (#10b981).
  [NAV_LINE.FileSystem]: '#15803d',
  // Fresh grass green — @symbiote-native/audio. Sits in the H~90-140 gap between StoreReview's
  // lime (#84cc16) and Battery's green (#22c55e); no other line lands there.
  [NAV_LINE.Audio]: '#3aa824',
  // Hot magenta — @symbiote-native/notifications. Sits in the H~292-330 gap between Sharing's
  // fuchsia (#d946ef) and Application's pink (#ec4899).
  [NAV_LINE.Notifications]: '#e236c6',
  // Olive-gold — @symbiote-native/background-fetch + @symbiote-native/background-task +
  // @symbiote-native/task-manager. Sits in the H~48-84 gap between Brightness' gold (#facc15)
  // and StoreReview's lime (#84cc16).
  [NAV_LINE.BackgroundTasks]: '#9fad1f',
  // Deep plum — @symbiote-native/sqlite. Redmean-distance-checked against every line above
  // (min ~175, next-nearest is Sharing's fuchsia at H~292 but far lighter/more saturated) —
  // the largest separation of any candidate tried, well clear of the crowded green/blue band.
  [NAV_LINE.Sqlite]: '#701a75',
};

export type INavLineInfo = {
  line: INavLine;
  code: string;
  label: string;
};

// Every route reachable from MenuScreen, minus Menu itself.
export type ITourRouteName = Exclude<IRouteName, typeof ROUTE_NAME.Menu>;

export const ROUTE_LINE_INFO: Record<ITourRouteName, INavLineInfo> = {
  [ROUTE_NAME.Sensors]: {
    line: NAV_LINE.Sensors,
    code: 'SN',
    label: 'SENSORS LINE',
  },
  [ROUTE_NAME.LocalAuth]: {
    line: NAV_LINE.LocalAuth,
    code: 'LA',
    label: 'LOCAL AUTH LINE',
  },
  [ROUTE_NAME.Haptics]: {
    line: NAV_LINE.Haptics,
    code: 'HP',
    label: 'HAPTICS LINE',
  },
  [ROUTE_NAME.Clipboard]: {
    line: NAV_LINE.Clipboard,
    code: 'CB',
    label: 'CLIPBOARD LINE',
  },
  [ROUTE_NAME.Battery]: {
    line: NAV_LINE.Battery,
    code: 'BT',
    label: 'BATTERY LINE',
  },
  [ROUTE_NAME.Brightness]: {
    line: NAV_LINE.Brightness,
    code: 'BR',
    label: 'BRIGHTNESS LINE',
  },
  [ROUTE_NAME.Cellular]: {
    line: NAV_LINE.Cellular,
    code: 'CL',
    label: 'CELLULAR LINE',
  },
  [ROUTE_NAME.Network]: {
    line: NAV_LINE.Network,
    code: 'NW',
    label: 'NETWORK LINE',
  },
  [ROUTE_NAME.Device]: {
    line: NAV_LINE.Device,
    code: 'DV',
    label: 'DEVICE LINE',
  },
  [ROUTE_NAME.Application]: {
    line: NAV_LINE.Application,
    code: 'AP',
    label: 'APPLICATION LINE',
  },
  [ROUTE_NAME.Crypto]: {
    line: NAV_LINE.Crypto,
    code: 'CR',
    label: 'CRYPTO LINE',
  },
  [ROUTE_NAME.StandardWebCrypto]: {
    line: NAV_LINE.StandardWebCrypto,
    code: 'WC',
    label: 'WEB CRYPTO LINE',
  },
  [ROUTE_NAME.SystemUi]: {
    line: NAV_LINE.SystemUi,
    code: 'SU',
    label: 'SYSTEM UI LINE',
  },
  [ROUTE_NAME.StoreReview]: {
    line: NAV_LINE.StoreReview,
    code: 'SR',
    label: 'STORE REVIEW LINE',
  },
  [ROUTE_NAME.KeepAwake]: {
    line: NAV_LINE.KeepAwake,
    code: 'KA',
    label: 'KEEP AWAKE LINE',
  },
  [ROUTE_NAME.ScreenOrientation]: {
    line: NAV_LINE.ScreenOrientation,
    code: 'SO',
    label: 'SCREEN ORIENTATION LINE',
  },
  [ROUTE_NAME.Localization]: {
    line: NAV_LINE.Localization,
    code: 'LO',
    label: 'LOCALIZATION LINE',
  },
  [ROUTE_NAME.TrackingTransparency]: {
    line: NAV_LINE.TrackingTransparency,
    code: 'TT',
    label: 'TRACKING TRANSPARENCY LINE',
  },
  [ROUTE_NAME.SecureStore]: {
    line: NAV_LINE.SecureStore,
    code: 'SS',
    label: 'SECURE STORE LINE',
  },
  [ROUTE_NAME.Sharing]: {
    line: NAV_LINE.Sharing,
    code: 'SH',
    label: 'SHARING LINE',
  },
  [ROUTE_NAME.WebBrowser]: {
    line: NAV_LINE.WebBrowser,
    code: 'WB',
    label: 'WEB BROWSER LINE',
  },
  [ROUTE_NAME.Sms]: { line: NAV_LINE.Sms, code: 'SM', label: 'SMS LINE' },
  [ROUTE_NAME.Location]: {
    line: NAV_LINE.Location,
    code: 'LC',
    label: 'LOCATION LINE',
  },
  [ROUTE_NAME.MediaLibrary]: {
    line: NAV_LINE.MediaLibrary,
    code: 'ML',
    label: 'MEDIA LIBRARY LINE',
  },
  [ROUTE_NAME.FileSystem]: {
    line: NAV_LINE.FileSystem,
    code: 'FS',
    label: 'FILE SYSTEM LINE',
  },
  [ROUTE_NAME.Audio]: {
    line: NAV_LINE.Audio,
    code: 'AU',
    label: 'AUDIO LINE',
  },
  [ROUTE_NAME.Notifications]: {
    line: NAV_LINE.Notifications,
    code: 'NT',
    label: 'NOTIFICATIONS LINE',
  },
  [ROUTE_NAME.BackgroundTasks]: {
    line: NAV_LINE.BackgroundTasks,
    code: 'BG',
    label: 'BACKGROUND TASKS LINE',
  },
  [ROUTE_NAME.Sqlite]: {
    line: NAV_LINE.Sqlite,
    code: 'SQ',
    label: 'SQLITE LINE',
  },
};
