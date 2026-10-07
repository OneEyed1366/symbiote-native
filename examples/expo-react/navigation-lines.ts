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
  Location: 'location',
  MediaLibrary: 'media-library',
  FileSystem: 'file-system',
  TrackingTransparency: 'tracking-transparency',
  SecureStore: 'secure-store',
  Sharing: 'sharing',
  WebBrowser: 'web-browser',
  Sms: 'sms',
  Audio: 'audio',
  Notifications: 'notifications',
  BackgroundTasks: 'background-tasks',
  Sqlite: 'sqlite',
  MailComposer: 'mail-composer',
  Print: 'print',
  Speech: 'speech',
  VideoThumbnails: 'video-thumbnails',
  DocumentPicker: 'document-picker',
  ImagePicker: 'image-picker',
  ImageManipulator: 'image-manipulator',
  Blob: 'blob',
  ScreenCapture: 'screen-capture',
  Contacts: 'contacts',
  Calendar: 'calendar',
  AgeRange: 'age-range',
  AppIntegrity: 'app-integrity',
  IntentLauncher: 'intent-launcher',
  NavigationBar: 'navigation-bar',
  Font: 'font',
  Asset: 'asset',
  AppMetrics: 'app-metrics',
  AuthSession: 'auth-session',
  Gl: 'gl',
  LivePhoto: 'live-photo',
  Camera: 'camera',
  Video: 'video',
  Image: 'expo-image',
  AppleAuthentication: 'apple-authentication',
  Symbols: 'symbols',
  GlassEffect: 'glass-effect',
  Blur: 'blur',
  LinearGradient: 'linear-gradient',
  Checkbox: 'checkbox',
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
  // Royal blue — @symbiote-native/location. A map-pin blue distinct from Cellular's brighter
  // blue and WebBrowser's sky-toned blue.
  [NAV_LINE.Location]: '#1d4ed8',
  // Deep pink/magenta — @symbiote-native/media-library. Distinct from Application's pink
  // (#ec4899) and Sharing's fuchsia (#d946ef).
  [NAV_LINE.MediaLibrary]: '#db2777',
  // Deep pine/teal — @symbiote-native/file-system. Distinct from Clipboard's teal (#14b8a6,
  // much lighter and more saturated).
  [NAV_LINE.FileSystem]: '#134e4a',
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
  // Spring green — @symbiote-native/audio. Fills the hue gap between StoreReview's lime
  // (#84cc16) and Battery's green (#22c55e).
  [NAV_LINE.Audio]: '#3fc123',
  // Orchid/magenta — @symbiote-native/notifications. Sits between Sharing's fuchsia (#d946ef)
  // and Application/MediaLibrary's pink.
  [NAV_LINE.Notifications]: '#e236c8',
  // Light periwinkle — @symbiote-native/task-manager + background-fetch + background-task.
  // Same hue neighborhood as Crypto's indigo and Haptics' violet, distinguished by being
  // notably lighter/less saturated — same strategy FileSystem's dark teal uses against
  // Clipboard's teal.
  [NAV_LINE.BackgroundTasks]: '#8a78e2',
  // Goldenrod — @symbiote-native/sqlite. Sits in the one real hue gap left in this palette
  // (Brightness' yellow at hue 48 to StoreReview/Sms's lime-olive at hue 84-85, ~36deg wide) and
  // is muted/darker than both — measured minimum RGB distance to every other line here is 45.2,
  // above the tightest pair already in this palette (LocalAuth/ScreenOrientation at 26.9).
  [NAV_LINE.Sqlite]: '#a6af1d',
  // @symbiote-native/mail-composer.
  [NAV_LINE.MailComposer]: '#c2410c',
  // @symbiote-native/print.
  [NAV_LINE.Print]: '#9d174d',
  // @symbiote-native/speech.
  [NAV_LINE.Speech]: '#0e7490',
  // @symbiote-native/video-thumbnails.
  [NAV_LINE.VideoThumbnails]: '#6d28d9',
  // @symbiote-native/document-picker.
  [NAV_LINE.DocumentPicker]: '#15803d',
  // @symbiote-native/image-picker.
  [NAV_LINE.ImagePicker]: '#be185d',
  // @symbiote-native/image-manipulator.
  [NAV_LINE.ImageManipulator]: '#b91c1c',
  // @symbiote-native/blob.
  [NAV_LINE.Blob]: '#0f766e',
  // @symbiote-native/screen-capture.
  [NAV_LINE.ScreenCapture]: '#7e22ce',
  // @symbiote-native/contacts.
  [NAV_LINE.Contacts]: '#0891b2',
  // @symbiote-native/calendar.
  [NAV_LINE.Calendar]: '#ca8a04',
  // @symbiote-native/age-range.
  [NAV_LINE.AgeRange]: '#ea580c',
  // @symbiote-native/app-integrity.
  [NAV_LINE.AppIntegrity]: '#4f46e5',
  // @symbiote-native/intent-launcher.
  [NAV_LINE.IntentLauncher]: '#16a34a',
  // @symbiote-native/navigation-bar.
  [NAV_LINE.NavigationBar]: '#2563eb',
  // @symbiote-native/font.
  [NAV_LINE.Font]: '#c026d3',
  // @symbiote-native/asset.
  [NAV_LINE.Asset]: '#0d9488',
  // @symbiote-native/app-metrics.
  [NAV_LINE.AppMetrics]: '#e11d48',
  // @symbiote-native/auth-session.
  [NAV_LINE.AuthSession]: '#65a30d',
  // @symbiote-native/gl.
  [NAV_LINE.Gl]: '#3b82f6',
  // @symbiote-native/live-photo.
  [NAV_LINE.LivePhoto]: '#facc15',
  // @symbiote-native/camera.
  [NAV_LINE.Camera]: '#a855f7',
  // @symbiote-native/video.
  [NAV_LINE.Video]: '#ef4444',
  // @symbiote-native/image.
  [NAV_LINE.Image]: '#22c55e',
  // @symbiote-native/apple-authentication.
  [NAV_LINE.AppleAuthentication]: '#64748b',
  // @symbiote-native/symbols.
  [NAV_LINE.Symbols]: '#ec4899',
  // @symbiote-native/glass-effect.
  [NAV_LINE.GlassEffect]: '#14b8a6',
  // @symbiote-native/blur.
  [NAV_LINE.Blur]: '#6366f1',
  // @symbiote-native/linear-gradient.
  [NAV_LINE.LinearGradient]: '#f97316',
  // checkbox primitive.
  [NAV_LINE.Checkbox]: '#0ea5e9',
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
  [ROUTE_NAME.Audio]: { line: NAV_LINE.Audio, code: 'AU', label: 'AUDIO LINE' },
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
  [ROUTE_NAME.MailComposer]: {
    line: NAV_LINE.MailComposer,
    code: 'MC',
    label: 'MAIL COMPOSER LINE',
  },
  [ROUTE_NAME.Print]: {
    line: NAV_LINE.Print,
    code: 'PR',
    label: 'PRINT LINE',
  },
  [ROUTE_NAME.Speech]: {
    line: NAV_LINE.Speech,
    code: 'SP',
    label: 'SPEECH LINE',
  },
  [ROUTE_NAME.VideoThumbnails]: {
    line: NAV_LINE.VideoThumbnails,
    code: 'VT',
    label: 'VIDEO THUMBNAILS LINE',
  },
  [ROUTE_NAME.DocumentPicker]: {
    line: NAV_LINE.DocumentPicker,
    code: 'DP',
    label: 'DOCUMENT PICKER LINE',
  },
  [ROUTE_NAME.ImagePicker]: {
    line: NAV_LINE.ImagePicker,
    code: 'IP',
    label: 'IMAGE PICKER LINE',
  },
  [ROUTE_NAME.ImageManipulator]: {
    line: NAV_LINE.ImageManipulator,
    code: 'IM',
    label: 'IMAGE MANIPULATOR LINE',
  },
  [ROUTE_NAME.Blob]: {
    line: NAV_LINE.Blob,
    code: 'BL',
    label: 'BLOB LINE',
  },
  [ROUTE_NAME.ScreenCapture]: {
    line: NAV_LINE.ScreenCapture,
    code: 'SC',
    label: 'SCREEN CAPTURE LINE',
  },
  [ROUTE_NAME.Contacts]: {
    line: NAV_LINE.Contacts,
    code: 'CT',
    label: 'CONTACTS LINE',
  },
  [ROUTE_NAME.Calendar]: {
    line: NAV_LINE.Calendar,
    code: 'CA',
    label: 'CALENDAR LINE',
  },
  [ROUTE_NAME.AgeRange]: {
    line: NAV_LINE.AgeRange,
    code: 'AR',
    label: 'AGE RANGE LINE',
  },
  [ROUTE_NAME.AppIntegrity]: {
    line: NAV_LINE.AppIntegrity,
    code: 'AI',
    label: 'APP INTEGRITY LINE',
  },
  [ROUTE_NAME.IntentLauncher]: {
    line: NAV_LINE.IntentLauncher,
    code: 'IL',
    label: 'INTENT LAUNCHER LINE',
  },
  [ROUTE_NAME.NavigationBar]: {
    line: NAV_LINE.NavigationBar,
    code: 'NB',
    label: 'NAVIGATION BAR LINE',
  },
  [ROUTE_NAME.Font]: {
    line: NAV_LINE.Font,
    code: 'FN',
    label: 'FONT LINE',
  },
  [ROUTE_NAME.Asset]: {
    line: NAV_LINE.Asset,
    code: 'AS',
    label: 'ASSET LINE',
  },
  [ROUTE_NAME.AppMetrics]: {
    line: NAV_LINE.AppMetrics,
    code: 'AM',
    label: 'APP METRICS LINE',
  },
  [ROUTE_NAME.AuthSession]: {
    line: NAV_LINE.AuthSession,
    code: 'AU',
    label: 'AUTH SESSION LINE',
  },
  [ROUTE_NAME.Gl]: {
    line: NAV_LINE.Gl,
    code: 'GL',
    label: 'GL LINE',
  },
  [ROUTE_NAME.LivePhoto]: {
    line: NAV_LINE.LivePhoto,
    code: 'LP',
    label: 'LIVE PHOTO LINE',
  },
  [ROUTE_NAME.Camera]: {
    line: NAV_LINE.Camera,
    code: 'CM',
    label: 'CAMERA LINE',
  },
  [ROUTE_NAME.Video]: {
    line: NAV_LINE.Video,
    code: 'VD',
    label: 'VIDEO LINE',
  },
  [ROUTE_NAME.Image]: {
    line: NAV_LINE.Image,
    code: 'EI',
    label: 'IMAGE LINE',
  },
  [ROUTE_NAME.AppleAuthentication]: {
    line: NAV_LINE.AppleAuthentication,
    code: 'AA',
    label: 'APPLE AUTHENTICATION LINE',
  },
  [ROUTE_NAME.Symbols]: {
    line: NAV_LINE.Symbols,
    code: 'SY',
    label: 'SYMBOLS LINE',
  },
  [ROUTE_NAME.GlassEffect]: {
    line: NAV_LINE.GlassEffect,
    code: 'GE',
    label: 'GLASS EFFECT LINE',
  },
  [ROUTE_NAME.Blur]: {
    line: NAV_LINE.Blur,
    code: 'BU',
    label: 'BLUR LINE',
  },
  [ROUTE_NAME.LinearGradient]: {
    line: NAV_LINE.LinearGradient,
    code: 'LG',
    label: 'LINEAR GRADIENT LINE',
  },
  [ROUTE_NAME.Checkbox]: {
    line: NAV_LINE.Checkbox,
    code: 'CX',
    label: 'CHECKBOX LINE',
  },
};
