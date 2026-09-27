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
  // Royal blue — @symbiote-native/location. A map-pin blue distinct from Cellular's brighter
  // blue and WebBrowser's sky-toned blue.
  [NAV_LINE.Location]: '#1d4ed8',
  // Deep pink/magenta — @symbiote-native/media-library. Distinct from Application's pink
  // (#ec4899) and Sharing's fuchsia (#d946ef).
  [NAV_LINE.MediaLibrary]: '#db2777',
  // Deep brown — @symbiote-native/file-system, a folder-brown distinct from Stone's grey
  // (#78716c) and SecureStore's bronze (#a16207).
  [NAV_LINE.FileSystem]: '#78350f',
  // Grass green — @symbiote-native/audio. Sits in the widest open hue gap on the wheel
  // (between Sms's olive and Battery's green), distinct from both.
  [NAV_LINE.Audio]: '#30d51a',
  // Raspberry magenta — @symbiote-native/notifications. Between Sharing's fuchsia and
  // Application's pink, far enough from each to read apart.
  [NAV_LINE.Notifications]: '#ea2ec8',
  // Chartreuse/mustard — @symbiote-native/background-fetch + @symbiote-native/background-task
  // + @symbiote-native/task-manager. Between Brightness's gold and StoreReview's lime.
  [NAV_LINE.BackgroundTasks]: '#b4c610',
  // Muted sage-teal — @symbiote-native/sqlite. Desaturated (25% vs its neighbors' 71-94%) like
  // Device/Tracking Transparency's own escape hatch from the wheel's saturated majority, so
  // despite sitting near Battery/Localization's green in raw hue it reads as a distinct muted
  // tone rather than a fourth green. Measured RGB distance to the nearest existing line
  // (Device) is 55 — double the tightest already-accepted pair on this wheel (Local Auth vs
  // Screen Orientation, both reds, at 27 — see navigation-lines color-distance check).
  [NAV_LINE.Sqlite]: '#70a98c',
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
