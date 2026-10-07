import type { ISymbioteExpoLinkOptionalBundle } from '@symbiote-native/expo-modules-link';
import {
  AUDIO_BUNDLES,
  LOCATION_BUNDLES,
  VIDEO_BUNDLES,
} from './expo-package-manifest-bundles';

// The individually-selectable @symbiote-native/* packages that are thin wrappers over an Expo
// module (expo-modules-core + one expo-<x> package — see each package's own package.json). Every
// one of them is a dependency-only layer, same shape as `slider` (templates/layers/<id>/
// package.json.fragment.json, no native files to overlay — Expo's own autolinking, wired by the
// `expo-modules` layer, does the rest). Kept OUT of `IAddLayerName`'s hand-named layers
// (navigation/testing/splash-screen/slider/expo-modules), which each carry native-file logic this
// list's members don't need.
//
// This table is the single source of truth: cli.ts derives a `--<id>` flag per entry, prompts.ts
// derives a multiselect option per entry, and add-layers.ts's generic dependency-only branch
// already handles any id in here with no per-package code.
export type IExpoPackageLayerName =
  | 'age-range'
  | 'app-integrity'
  | 'app-metrics'
  | 'apple-authentication'
  | 'application'
  | 'asset'
  | 'audio'
  | 'auth-session'
  | 'background-fetch'
  | 'background-task'
  | 'battery'
  | 'blob'
  | 'blur'
  | 'brightness'
  | 'calendar'
  | 'camera'
  | 'cellular'
  | 'clipboard'
  | 'constants'
  | 'contacts'
  | 'crypto'
  | 'device'
  | 'document-picker'
  | 'file-system'
  | 'font'
  | 'gl'
  | 'glass-effect'
  | 'haptics'
  | 'image'
  | 'image-manipulator'
  | 'image-picker'
  | 'intent-launcher'
  | 'keep-awake'
  | 'linear-gradient'
  | 'live-photo'
  | 'local-auth'
  | 'localization'
  | 'location'
  | 'mail-composer'
  | 'media-library'
  | 'navigation-bar'
  | 'network'
  | 'notifications'
  | 'print'
  | 'screen-capture'
  | 'screen-orientation'
  | 'secure-store'
  | 'sensors'
  | 'sharing'
  | 'sms'
  | 'speech'
  | 'sqlite'
  | 'standard-web-crypto'
  | 'store-review'
  | 'symbols'
  | 'system-ui'
  | 'task-manager'
  | 'tracking-transparency'
  | 'video'
  | 'video-thumbnails'
  | 'web-browser';

export type IExpoPackageLayer = {
  readonly id: IExpoPackageLayerName;
  readonly label: string;
  readonly symbiotePackage: string;
  // Mirrors the wrapped package's own native-link.json `android.optionalManifestBundles` —
  // policy-sensitive permissions/services the developer opts into, never applied automatically.
  // Duplicated here (not read from node_modules) because `add`/`new` offer to grant it BEFORE the
  // package is even installed — `applyBundle` only needs the bundle data and the app's own
  // AndroidManifest.xml, neither of which requires node_modules to exist yet. Cross-checked
  // byte-for-byte against the real file in expo-package-layers.test.ts, so this can't silently
  // drift once a package's own bundle changes.
  readonly optionalManifestBundles?: readonly ISymbioteExpoLinkOptionalBundle[];
};

export const EXPO_PACKAGE_LAYERS: readonly IExpoPackageLayer[] = [
  {
    id: 'age-range',
    label: 'Age range',
    symbiotePackage: '@symbiote-native/age-range',
  },
  {
    id: 'app-integrity',
    label: 'App integrity',
    symbiotePackage: '@symbiote-native/app-integrity',
  },
  {
    id: 'app-metrics',
    label: 'App metrics',
    symbiotePackage: '@symbiote-native/app-metrics',
  },
  {
    id: 'apple-authentication',
    label: 'Sign in with Apple',
    symbiotePackage: '@symbiote-native/apple-authentication',
  },
  {
    id: 'application',
    label: 'Application info',
    symbiotePackage: '@symbiote-native/application',
  },
  { id: 'asset', label: 'Asset', symbiotePackage: '@symbiote-native/asset' },
  {
    id: 'audio',
    label: 'Audio',
    symbiotePackage: '@symbiote-native/audio',
    optionalManifestBundles: AUDIO_BUNDLES,
  },
  {
    id: 'auth-session',
    label: 'Auth session (OAuth2/OIDC)',
    symbiotePackage: '@symbiote-native/auth-session',
  },
  {
    id: 'background-fetch',
    label: 'Background fetch',
    symbiotePackage: '@symbiote-native/background-fetch',
  },
  {
    id: 'background-task',
    label: 'Background task',
    symbiotePackage: '@symbiote-native/background-task',
  },
  {
    id: 'battery',
    label: 'Battery',
    symbiotePackage: '@symbiote-native/battery',
  },
  {
    id: 'blob',
    label: 'Blob',
    symbiotePackage: '@symbiote-native/blob',
  },
  {
    id: 'blur',
    label: 'Blur',
    symbiotePackage: '@symbiote-native/blur',
  },
  {
    id: 'brightness',
    label: 'Brightness',
    symbiotePackage: '@symbiote-native/brightness',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    symbiotePackage: '@symbiote-native/calendar',
  },
  {
    id: 'camera',
    label: 'Camera',
    symbiotePackage: '@symbiote-native/camera',
  },
  {
    id: 'cellular',
    label: 'Cellular info',
    symbiotePackage: '@symbiote-native/cellular',
  },
  {
    id: 'clipboard',
    label: 'Clipboard',
    symbiotePackage: '@symbiote-native/clipboard',
  },
  {
    id: 'constants',
    label: 'Constants',
    symbiotePackage: '@symbiote-native/constants',
  },
  {
    id: 'contacts',
    label: 'Contacts',
    symbiotePackage: '@symbiote-native/contacts',
  },
  { id: 'crypto', label: 'Crypto', symbiotePackage: '@symbiote-native/crypto' },
  {
    id: 'device',
    label: 'Device info',
    symbiotePackage: '@symbiote-native/device',
  },
  {
    id: 'document-picker',
    label: 'Document picker',
    symbiotePackage: '@symbiote-native/document-picker',
  },
  {
    id: 'file-system',
    label: 'File system',
    symbiotePackage: '@symbiote-native/file-system',
  },
  { id: 'font', label: 'Font', symbiotePackage: '@symbiote-native/font' },
  { id: 'gl', label: 'GL', symbiotePackage: '@symbiote-native/gl' },
  {
    id: 'glass-effect',
    label: 'Glass effect',
    symbiotePackage: '@symbiote-native/glass-effect',
  },
  {
    id: 'haptics',
    label: 'Haptics',
    symbiotePackage: '@symbiote-native/haptics',
  },
  {
    id: 'image',
    label: 'Image',
    symbiotePackage: '@symbiote-native/image',
  },
  {
    id: 'image-manipulator',
    label: 'Image manipulator',
    symbiotePackage: '@symbiote-native/image-manipulator',
  },
  {
    id: 'image-picker',
    label: 'Image picker',
    symbiotePackage: '@symbiote-native/image-picker',
  },
  {
    id: 'intent-launcher',
    label: 'Intent launcher',
    symbiotePackage: '@symbiote-native/intent-launcher',
  },
  {
    id: 'keep-awake',
    label: 'Keep awake',
    symbiotePackage: '@symbiote-native/keep-awake',
  },
  {
    id: 'linear-gradient',
    label: 'Linear gradient',
    symbiotePackage: '@symbiote-native/linear-gradient',
  },
  {
    id: 'live-photo',
    label: 'Live Photo',
    symbiotePackage: '@symbiote-native/live-photo',
  },
  {
    id: 'local-auth',
    label: 'Local authentication',
    symbiotePackage: '@symbiote-native/local-auth',
  },
  {
    id: 'localization',
    label: 'Localization',
    symbiotePackage: '@symbiote-native/localization',
  },
  {
    id: 'location',
    label: 'Location',
    symbiotePackage: '@symbiote-native/location',
    optionalManifestBundles: LOCATION_BUNDLES,
  },
  {
    id: 'mail-composer',
    label: 'Mail composer',
    symbiotePackage: '@symbiote-native/mail-composer',
  },
  {
    id: 'media-library',
    label: 'Media library',
    symbiotePackage: '@symbiote-native/media-library',
  },
  {
    id: 'navigation-bar',
    label: 'Navigation bar',
    symbiotePackage: '@symbiote-native/navigation-bar',
  },
  {
    id: 'network',
    label: 'Network info',
    symbiotePackage: '@symbiote-native/network',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    symbiotePackage: '@symbiote-native/notifications',
  },
  {
    id: 'print',
    label: 'Print',
    symbiotePackage: '@symbiote-native/print',
  },
  {
    id: 'screen-capture',
    label: 'Screen capture',
    symbiotePackage: '@symbiote-native/screen-capture',
  },
  {
    id: 'screen-orientation',
    label: 'Screen orientation',
    symbiotePackage: '@symbiote-native/screen-orientation',
  },
  {
    id: 'secure-store',
    label: 'Secure store',
    symbiotePackage: '@symbiote-native/secure-store',
  },
  {
    id: 'sensors',
    label: 'Sensors',
    symbiotePackage: '@symbiote-native/sensors',
  },
  {
    id: 'sharing',
    label: 'Sharing',
    symbiotePackage: '@symbiote-native/sharing',
  },
  { id: 'sms', label: 'SMS', symbiotePackage: '@symbiote-native/sms' },
  { id: 'speech', label: 'Speech', symbiotePackage: '@symbiote-native/speech' },
  { id: 'sqlite', label: 'SQLite', symbiotePackage: '@symbiote-native/sqlite' },
  {
    id: 'standard-web-crypto',
    label: 'Web Crypto polyfill',
    symbiotePackage: '@symbiote-native/standard-web-crypto',
  },
  {
    id: 'store-review',
    label: 'Store review prompt',
    symbiotePackage: '@symbiote-native/store-review',
  },
  {
    id: 'symbols',
    label: 'Symbols',
    symbiotePackage: '@symbiote-native/symbols',
  },
  {
    id: 'system-ui',
    label: 'System UI',
    symbiotePackage: '@symbiote-native/system-ui',
  },
  {
    id: 'task-manager',
    label: 'Task manager',
    symbiotePackage: '@symbiote-native/task-manager',
  },
  {
    id: 'tracking-transparency',
    label: 'Tracking transparency',
    symbiotePackage: '@symbiote-native/tracking-transparency',
  },
  {
    id: 'video',
    label: 'Video',
    symbiotePackage: '@symbiote-native/video',
    optionalManifestBundles: VIDEO_BUNDLES,
  },
  {
    id: 'video-thumbnails',
    label: 'Video thumbnails',
    symbiotePackage: '@symbiote-native/video-thumbnails',
  },
  {
    id: 'web-browser',
    label: 'Web browser',
    symbiotePackage: '@symbiote-native/web-browser',
  },
];

const EXPO_PACKAGE_LAYER_IDS: ReadonlySet<string> = new Set(
  EXPO_PACKAGE_LAYERS.map(layer => layer.id),
);

export function isExpoPackageLayerName(
  value: string,
): value is IExpoPackageLayerName {
  return EXPO_PACKAGE_LAYER_IDS.has(value);
}

// `new`/`add`'s post-install hint: of the packages just installed, which ones have something to
// `grant` — so the developer hears about it right there instead of having to already know the
// command exists.
export function expoPackagesWithOptionalManifestBundles(
  selected: ReadonlySet<IExpoPackageLayerName> | Iterable<string>,
): IExpoPackageLayer[] {
  const ids = selected instanceof Set ? selected : new Set(selected);
  return EXPO_PACKAGE_LAYERS.filter(
    layer =>
      (layer.optionalManifestBundles?.length ?? 0) > 0 && ids.has(layer.id),
  );
}
